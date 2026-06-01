import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import jwt from "jsonwebtoken";
import { insertUserSchema, insertStudioSchema, insertStreamSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";

const JWT_SECRET = process.env.JWT_SECRET || "obtv-studio-secret-key";

// OIDC discovery: Authentik's authorize/token/userinfo endpoints do NOT include
// the application slug, so we must read them from the well-known configuration
// instead of concatenating paths onto the issuer URL.
type OidcConfig = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
};

let cachedOidcConfig: { issuer: string; config: OidcConfig } | null = null;

async function getOidcConfig(issuerUrl: string): Promise<OidcConfig> {
  const issuer = issuerUrl.replace(/\/+$/, "");
  if (cachedOidcConfig && cachedOidcConfig.issuer === issuer) {
    return cachedOidcConfig.config;
  }

  const wellKnownUrl = `${issuer}/.well-known/openid-configuration`;
  const response = await fetch(wellKnownUrl);
  if (!response.ok) {
    throw new Error(`OIDC discovery failed (${response.status}) at ${wellKnownUrl}`);
  }

  const config = (await response.json()) as OidcConfig;
  if (!config.authorization_endpoint || !config.token_endpoint || !config.userinfo_endpoint) {
    throw new Error("OIDC discovery document is missing required endpoints");
  }

  cachedOidcConfig = { issuer, config };
  return config;
}

// Build the SSO callback URL from the actual incoming request so the scheme
// (http vs https) matches reality. Honors X-Forwarded-Proto when behind a
// reverse proxy (e.g. openresty); falls back to the connection protocol.
function getSsoRedirectUri(req: { headers: Record<string, any>; protocol: string }): string {
  const host = req.headers.host || process.env.REPLIT_DEV_DOMAIN || "localhost:5000";
  const forwardedProto = req.headers["x-forwarded-proto"] as string | undefined;
  const protocol = forwardedProto ? forwardedProto.split(",")[0].trim() : req.protocol;
  return `${protocol}://${host}/api/auth/sso/callback`;
}

// Configure multer for file uploads
const storage_multer = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/studios';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage_multer,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Authentication middleware
async function requireAuth(req: any, res: any, next: any) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await storage.getUserWithPermissions(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

// Admin-only middleware
function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.status(200).json({ 
      status: "OK", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime() 
    });
  });
  
  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }

      const user = await storage.verifyUserPassword(username, password);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "24h" });
      
      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/auth/user", requireAuth, async (req: any, res) => {
    res.json(req.user);
  });

  // Change password endpoint
  app.put("/api/auth/change-password", requireAuth, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters long" });
      }

      // Verify current password
      const user = await storage.verifyUserPassword(req.user.username, currentPassword);
      if (!user) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Update password
      await storage.updateUserPassword(req.user.id, newPassword);
      
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  // Authentik SSO routes
  app.get("/api/auth/sso", async (req, res) => {
    const clientId = process.env.AUTHENTIK_CLIENT_ID;
    const issuerUrl = process.env.AUTHENTIK_ISSUER_URL;

    if (!clientId || !issuerUrl) {
      return res.status(503).json({ message: "SSO is not configured. Please set AUTHENTIK_CLIENT_ID, AUTHENTIK_CLIENT_SECRET, and AUTHENTIK_ISSUER_URL." });
    }

    try {
      const { authorization_endpoint } = await getOidcConfig(issuerUrl);

      const redirectUri = getSsoRedirectUri(req);

      const state = Math.random().toString(36).substring(2);
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
      });

      res.redirect(`${authorization_endpoint}?${params.toString()}`);
    } catch (error) {
      console.error("SSO authorize error:", error);
      res.redirect("/?sso_error=discovery_failed");
    }
  });

  app.get("/api/auth/sso/callback", async (req, res) => {
    const { code } = req.query;
    const clientId = process.env.AUTHENTIK_CLIENT_ID;
    const clientSecret = process.env.AUTHENTIK_CLIENT_SECRET;
    const issuerUrl = process.env.AUTHENTIK_ISSUER_URL;

    if (!code || !clientId || !clientSecret || !issuerUrl) {
      return res.redirect("/?sso_error=missing_config");
    }

    try {
      const { token_endpoint, userinfo_endpoint } = await getOidcConfig(issuerUrl);

      const redirectUri = getSsoRedirectUri(req);

      // Exchange code for tokens
      const tokenResponse = await fetch(token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code: code as string,
        }),
      });

      if (!tokenResponse.ok) {
        console.error("SSO token exchange failed:", await tokenResponse.text());
        return res.redirect("/?sso_error=token_exchange_failed");
      }

      const tokens = await tokenResponse.json() as { access_token: string };

      // Get user info from Authentik
      const userInfoResponse = await fetch(userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!userInfoResponse.ok) {
        console.error("SSO userinfo failed:", await userInfoResponse.text());
        return res.redirect("/?sso_error=userinfo_failed");
      }

      const userInfo = await userInfoResponse.json() as {
        email: string;
        preferred_username?: string;
        given_name?: string;
        family_name?: string;
        name?: string;
      };

      if (!userInfo.email) {
        return res.redirect("/?sso_error=no_email");
      }

      // Find or create the user
      let user = await storage.getUserByEmail(userInfo.email);

      if (!user) {
        const baseUsername = (userInfo.preferred_username || userInfo.email.split("@")[0]).replace(/[^a-zA-Z0-9_]/g, "_");
        const nameParts = (userInfo.name || "").split(" ");
        user = await storage.createUser({
          username: baseUsername,
          email: userInfo.email,
          password: Math.random().toString(36) + Math.random().toString(36),
          firstName: userInfo.given_name || nameParts[0] || "",
          lastName: userInfo.family_name || nameParts.slice(1).join(" ") || "",
          role: "viewer",
          isActive: true,
        });
      }

      if (!user.isActive) {
        return res.redirect("/?sso_error=account_disabled");
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "24h" });
      res.redirect(`/?sso_token=${token}`);
    } catch (error) {
      console.error("SSO callback error:", error);
      res.redirect("/?sso_error=server_error");
    }
  });

  // Static file serving for uploads
  app.use("/uploads", (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
  });
  app.use("/uploads", express.static("uploads"));

  // Image upload endpoint for studio images
  app.post("/api/admin/upload-studio-image", requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      const imageUrl = `/uploads/studios/${req.file.filename}`;
      res.json({ imageUrl });
    } catch (error) {
      console.error("Image upload error:", error);
      res.status(500).json({ message: "Failed to upload image" });
    }
  });

  // Update studio endpoint
  app.patch("/api/admin/studios/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      const studio = await storage.updateStudio(id, updateData);
      res.json(studio);
    } catch (error) {
      console.error("Error updating studio:", error);
      res.status(500).json({ message: "Failed to update studio" });
    }
  });

  // Studio routes
  app.get("/api/studios", requireAuth, async (req: any, res) => {
    try {
      const studios = await storage.getUserStudios(req.user.id);
      res.json(studios);
    } catch (error) {
      console.error("Error fetching studios:", error);
      res.status(500).json({ message: "Failed to fetch studios" });
    }
  });

  app.get("/api/studios/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Check user permission for this studio
      const permission = await storage.getUserStudioPermission(req.user.id, id);
      if (!permission?.canView) {
        return res.status(403).json({ message: "No access to this studio" });
      }

      const studio = await storage.getStudioWithStreams(id);
      if (!studio) {
        return res.status(404).json({ message: "Studio not found" });
      }

      res.json(studio);
    } catch (error) {
      console.error("Error fetching studio:", error);
      res.status(500).json({ message: "Failed to fetch studio" });
    }
  });

  // Stream routes
  app.get("/api/streams/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const stream = await storage.getStream(id);
      
      if (!stream) {
        return res.status(404).json({ message: "Stream not found" });
      }

      // Check user permission for the studio this stream belongs to
      const permission = await storage.getUserStudioPermission(req.user.id, stream.studioId);
      if (!permission?.canView) {
        return res.status(403).json({ message: "No access to this stream" });
      }

      res.json(stream);
    } catch (error) {
      console.error("Error fetching stream:", error);
      res.status(500).json({ message: "Failed to fetch stream" });
    }
  });

  app.patch("/api/streams/:id/status", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      const stream = await storage.getStream(id);
      if (!stream) {
        return res.status(404).json({ message: "Stream not found" });
      }

      // Check user permission for control
      const permission = await storage.getUserStudioPermission(req.user.id, stream.studioId);
      if (!permission?.canControl && req.user.role !== "admin") {
        return res.status(403).json({ message: "No control access to this stream" });
      }

      await storage.updateStreamStatus(id, status);
      res.json({ message: "Stream status updated" });
    } catch (error) {
      console.error("Error updating stream status:", error);
      res.status(500).json({ message: "Failed to update stream status" });
    }
  });

  // Admin routes
  app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);
      
      // Remove password from response
      const { password, ...userResponse } = user;
      res.status(201).json(userResponse);
    } catch (error: any) {
      console.error("Error creating user:", error);
      if (error.code === "23505") { // Unique constraint violation
        res.status(400).json({ message: "Username or email already exists" });
      } else {
        res.status(500).json({ message: "Failed to create user" });
      }
    }
  });

  app.patch("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      // Handle password separately if provided
      if (updateData.newPassword) {
        if (updateData.newPassword.length < 6) {
          return res.status(400).json({ message: "Password must be at least 6 characters long" });
        }
        await storage.updateUserPassword(id, updateData.newPassword);
        delete updateData.newPassword; // Remove from regular update data
      }
      
      const user = await storage.updateUser(id, updateData);
      const { password, ...userResponse } = user;
      res.json(userResponse);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteUser(id);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  app.get("/api/admin/studios", requireAuth, requireAdmin, async (req, res) => {
    try {
      const studios = await storage.getAllStudios();
      const studiosWithPrimaryColor = studios.map(studio => ({
        ...studio,
        primaryColor: studio.colorCode || '#4A5568' // Provide primaryColor alias
      }));
      res.json(studiosWithPrimaryColor);
    } catch (error) {
      console.error("Error fetching all studios:", error);
      res.status(500).json({ message: "Failed to fetch studios" });
    }
  });

  app.get("/api/admin/studios-with-streams", requireAuth, requireAdmin, async (req, res) => {
    try {
      const studios = await storage.getAllStudios();
      const studiosWithStreams = await Promise.all(
        studios.map(async (studio) => {
          const streams = await storage.getStreamsByStudio(studio.id);
          return { 
            ...studio, 
            streams, 
            primaryColor: studio.colorCode || '#4A5568' // Provide primaryColor alias
          };
        })
      );
      res.json(studiosWithStreams);
    } catch (error) {
      console.error("Error fetching studios with streams:", error);
      res.status(500).json({ message: "Failed to fetch studios with streams" });
    }
  });

  app.post("/api/admin/studios", requireAuth, requireAdmin, async (req, res) => {
    try {
      const studioData = insertStudioSchema.parse(req.body);
      const studio = await storage.createStudio(studioData);
      res.status(201).json(studio);
    } catch (error) {
      console.error("Error creating studio:", error);
      res.status(500).json({ message: "Failed to create studio" });
    }
  });

  app.post("/api/admin/streams", requireAuth, requireAdmin, async (req, res) => {
    try {
      const streamData = insertStreamSchema.parse(req.body);
      const stream = await storage.createStream(streamData);
      res.status(201).json(stream);
    } catch (error) {
      console.error("Error creating stream:", error);
      res.status(500).json({ message: "Failed to create stream" });
    }
  });

  app.patch("/api/admin/streams/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const stream = await storage.updateStream(id, updateData);
      res.json(stream);
    } catch (error) {
      console.error("Error updating stream:", error);
      res.status(500).json({ message: "Failed to update stream" });
    }
  });

  app.delete("/api/admin/streams/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      // Instead of hard delete, deactivate the stream
      await storage.updateStream(id, { isActive: false });
      res.json({ message: "Stream deleted successfully" });
    } catch (error) {
      console.error("Error deleting stream:", error);
      res.status(500).json({ message: "Failed to delete stream" });
    }
  });

  app.post("/api/admin/permissions", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId, studioId, canView = true, canControl = false } = req.body;
      
      const permission = await storage.setUserStudioPermission({
        userId,
        studioId,
        canView,
        canControl,
      });
      
      res.status(201).json(permission);
    } catch (error) {
      console.error("Error setting permission:", error);
      res.status(500).json({ message: "Failed to set permission" });
    }
  });

  app.delete("/api/admin/permissions/:userId/:studioId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId, studioId } = req.params;
      await storage.removeUserStudioPermission(userId, studioId);
      res.json({ message: "Permission removed successfully" });
    } catch (error) {
      console.error("Error removing permission:", error);
      res.status(500).json({ message: "Failed to remove permission" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
