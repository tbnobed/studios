import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import jwt from "jsonwebtoken";
import { insertUserSchema, insertStudioSchema, insertStreamSchema, insertMultiviewerLayoutSchema, insertGroupSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import express from "express";
import { isEmailConfigured, sendInviteEmail } from "./email";

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

// Base URL for building user-facing links (e.g. invite links). Honors an
// explicit APP_BASE_URL override (useful behind proxies / in Docker), otherwise
// derives it from the request, respecting x-forwarded-proto.
function getAppBaseUrl(req: { headers: Record<string, any>; protocol: string }): string {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/+$/, "");
  }
  const host = req.headers.host || process.env.REPLIT_DEV_DOMAIN || "localhost:5000";
  const forwardedProto = req.headers["x-forwarded-proto"] as string | undefined;
  const protocol = forwardedProto ? forwardedProto.split(",")[0].trim() : req.protocol;
  return `${protocol}://${host}`;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Generates a single-use invite token. The raw token goes in the emailed link;
// only its SHA-256 hash is persisted.
function generateInviteToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
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

      const studio = await storage.getStudioWithStreams(id);
      if (!studio) {
        return res.status(404).json({ message: "Studio not found" });
      }

      // Per-stream access: admins see all; everyone else only sees the streams
      // they have access to. A studio with no viewable streams is forbidden.
      if (req.user.role === "admin") {
        return res.json(studio);
      }
      const accessible = await storage.getUserAccessibleStreamIds(req.user.id);
      const visibleStreams = studio.streams.filter((s) => accessible.has(s.id));
      if (visibleStreams.length === 0) {
        return res.status(403).json({ message: "No access to this studio" });
      }
      res.json({ ...studio, streams: visibleStreams });
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

      // Per-stream access check.
      const canView = await storage.canUserViewStream(req.user.id, stream.id);
      if (!canView) {
        return res.status(403).json({ message: "No access to this stream" });
      }

      res.json(stream);
    } catch (error) {
      console.error("Error fetching stream:", error);
      res.status(500).json({ message: "Failed to fetch stream" });
    }
  });

  // Favorites routes (per-user, scoped to the authenticated user)
  app.get("/api/favorites", requireAuth, async (req: any, res) => {
    try {
      const favorites = await storage.getUserFavorites(req.user.id);
      res.json(favorites);
    } catch (error) {
      console.error("Error fetching favorites:", error);
      res.status(500).json({ message: "Failed to fetch favorites" });
    }
  });

  app.post("/api/favorites", requireAuth, async (req: any, res) => {
    try {
      const { streamId } = req.body;
      if (!streamId || typeof streamId !== "string") {
        return res.status(400).json({ message: "streamId is required" });
      }

      // Ensure the stream exists and the user can access its studio.
      const stream = await storage.getStream(streamId);
      if (!stream) {
        return res.status(404).json({ message: "Stream not found" });
      }
      const canView = await storage.canUserViewStream(req.user.id, stream.id);
      if (!canView) {
        return res.status(403).json({ message: "No access to this stream" });
      }

      const favorite = await storage.addFavorite(req.user.id, streamId);
      res.status(201).json(favorite);
    } catch (error: any) {
      if (error?.message === "FAVORITES_FULL") {
        return res.status(400).json({ message: "Favorites are full (maximum 40)" });
      }
      console.error("Error adding favorite:", error);
      res.status(500).json({ message: "Failed to add favorite" });
    }
  });

  app.delete("/api/favorites/:streamId", requireAuth, async (req: any, res) => {
    try {
      const { streamId } = req.params;
      await storage.removeFavorite(req.user.id, streamId);
      res.status(204).end();
    } catch (error) {
      console.error("Error removing favorite:", error);
      res.status(500).json({ message: "Failed to remove favorite" });
    }
  });

  app.put("/api/favorites/reorder", requireAuth, async (req: any, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ message: "items must be an array" });
      }

      // We only need the order of streamIds; page/position are derived
      // canonically server-side from that order.
      const orderedStreamIds: string[] = [];
      for (const item of items) {
        const streamId = typeof item === "string" ? item : item?.streamId;
        if (typeof streamId !== "string") {
          return res.status(400).json({ message: "Invalid items payload" });
        }
        orderedStreamIds.push(streamId);
      }

      await storage.reorderFavorites(req.user.id, orderedStreamIds);
      const favorites = await storage.getUserFavorites(req.user.id);
      res.json(favorites);
    } catch (error) {
      console.error("Error reordering favorites:", error);
      res.status(500).json({ message: "Failed to reorder favorites" });
    }
  });

  // Multiviewer layout routes -------------------------------------------------
  app.get("/api/multiviewer-layouts", requireAuth, async (req: any, res) => {
    try {
      const layouts = await storage.getUserMultiviewerLayouts(req.user.id);
      res.json(layouts);
    } catch (error) {
      console.error("Error fetching multiviewer layouts:", error);
      res.status(500).json({ message: "Failed to fetch multiviewer layouts" });
    }
  });

  // Reject any slot stream ids the user can't actually view, so a layout can't
  // be used to reference streams outside the user's studio permissions.
  const validateSlotAccess = async (
    userId: string,
    slots: (string | null)[] | undefined
  ): Promise<string | null> => {
    if (!slots || slots.length === 0) return null;
    const ids = slots.filter((s): s is string => Boolean(s));
    if (ids.length === 0) return null;
    const studios = await storage.getUserStudios(userId);
    const viewable = new Set<string>();
    for (const studio of studios) {
      for (const stream of studio.streams) viewable.add(stream.id);
    }
    const invalid = ids.find((id) => !viewable.has(id));
    return invalid ? `Stream not accessible: ${invalid}` : null;
  };

  app.post("/api/multiviewer-layouts", requireAuth, async (req: any, res) => {
    try {
      const parsed = insertMultiviewerLayoutSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid layout", errors: parsed.error.flatten() });
      }
      const slotError = await validateSlotAccess(req.user.id, parsed.data.slots);
      if (slotError) {
        return res.status(403).json({ message: slotError });
      }
      const layout = await storage.createMultiviewerLayout(req.user.id, parsed.data);
      res.status(201).json(layout);
    } catch (error) {
      console.error("Error creating multiviewer layout:", error);
      res.status(500).json({ message: "Failed to create multiviewer layout" });
    }
  });

  app.patch("/api/multiviewer-layouts/:id", requireAuth, async (req: any, res) => {
    try {
      const parsed = insertMultiviewerLayoutSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid layout", errors: parsed.error.flatten() });
      }
      const slotError = await validateSlotAccess(req.user.id, parsed.data.slots);
      if (slotError) {
        return res.status(403).json({ message: slotError });
      }
      const layout = await storage.updateMultiviewerLayout(req.user.id, req.params.id, parsed.data);
      if (!layout) {
        return res.status(404).json({ message: "Layout not found" });
      }
      res.json(layout);
    } catch (error) {
      console.error("Error updating multiviewer layout:", error);
      res.status(500).json({ message: "Failed to update multiviewer layout" });
    }
  });

  app.delete("/api/multiviewer-layouts/:id", requireAuth, async (req: any, res) => {
    try {
      await storage.deleteMultiviewerLayout(req.user.id, req.params.id);
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting multiviewer layout:", error);
      res.status(500).json({ message: "Failed to delete multiviewer layout" });
    }
  });

  app.post("/api/multiviewer-layouts/:id/default", requireAuth, async (req: any, res) => {
    try {
      const layout = await storage.setDefaultMultiviewerLayout(req.user.id, req.params.id);
      if (!layout) {
        return res.status(404).json({ message: "Layout not found" });
      }
      res.json(layout);
    } catch (error) {
      console.error("Error setting default multiviewer layout:", error);
      res.status(500).json({ message: "Failed to set default multiviewer layout" });
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

  // Invite a new user by email. Creates an inactive account with a random
  // (unusable) password plus any pre-assigned groups/streams, then emails a
  // single-use link the user exchanges for setting their own password. The
  // invite link is always returned to the admin so it works even when email
  // isn't configured (e.g. local dev) — no silent failures.
  const inviteUserSchema = z.object({
    username: z.string().min(1, "Username is required"),
    email: z.string().email("A valid email is required"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    role: z.enum(["admin", "viewer"]).default("viewer"),
    groupIds: z.array(z.string()).optional(),
    streamIds: z.array(z.string()).optional(),
  });

  app.post("/api/admin/users/invite", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const data = inviteUserSchema.parse(req.body);

      const randomPassword = crypto.randomBytes(24).toString("hex");
      const user = await storage.createUser({
        username: data.username,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        password: randomPassword,
        isActive: false,
      });

      if (data.role !== "admin") {
        if (data.groupIds) await storage.setUserGroups(user.id, data.groupIds);
        if (data.streamIds) await storage.setUserStreamPermissions(user.id, data.streamIds);
      }

      const { token, tokenHash } = generateInviteToken();
      await storage.createInvite(user.id, tokenHash, new Date(Date.now() + INVITE_TTL_MS));
      const inviteUrl = `${getAppBaseUrl(req)}/invite/${token}`;

      let emailSent = false;
      let emailError: string | undefined;
      if (isEmailConfigured()) {
        try {
          await sendInviteEmail({
            to: data.email,
            username: data.username,
            inviteUrl,
            inviterName: req.user?.username,
          });
          emailSent = true;
        } catch (e: any) {
          emailError = e?.message || "Failed to send email";
          console.error("Failed to send invite email:", e);
        }
      }

      const { password, ...userResponse } = user;
      res.status(201).json({ user: userResponse, inviteUrl, emailSent, emailError });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0]?.message || "Invalid request" });
      }
      console.error("Error inviting user:", error);
      if (error.code === "23505") {
        return res.status(400).json({ message: "Username or email already exists" });
      }
      res.status(500).json({ message: "Failed to invite user" });
    }
  });

  // Regenerate and (re)send an invite for an existing (typically pending) user.
  app.post("/api/admin/users/:id/resend-invite", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      if (!user.email) {
        return res.status(400).json({ message: "User has no email address" });
      }
      if (user.isActive) {
        return res.status(400).json({ message: "This user has already activated their account." });
      }

      const { token, tokenHash } = generateInviteToken();
      await storage.createInvite(user.id, tokenHash, new Date(Date.now() + INVITE_TTL_MS));
      const inviteUrl = `${getAppBaseUrl(req)}/invite/${token}`;

      let emailSent = false;
      let emailError: string | undefined;
      if (isEmailConfigured()) {
        try {
          await sendInviteEmail({
            to: user.email,
            username: user.username,
            inviteUrl,
            inviterName: req.user?.username,
          });
          emailSent = true;
        } catch (e: any) {
          emailError = e?.message || "Failed to send email";
          console.error("Failed to resend invite email:", e);
        }
      }

      res.json({ inviteUrl, emailSent, emailError });
    } catch (error) {
      console.error("Error resending invite:", error);
      res.status(500).json({ message: "Failed to resend invite" });
    }
  });

  // Public: validate an invite token and return basic info for the set-password
  // page. Does not reveal anything beyond username/email for a valid token.
  app.get("/api/invite/:token", async (req, res) => {
    try {
      const invite = await storage.getInviteByTokenHash(hashInviteToken(req.params.token));
      if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
        return res.status(404).json({ valid: false, message: "This invite link is invalid or has expired." });
      }
      const user = await storage.getUser(invite.userId);
      if (!user) {
        return res.status(404).json({ valid: false, message: "This invite link is invalid or has expired." });
      }
      res.json({ valid: true, username: user.username, email: user.email });
    } catch (error) {
      console.error("Error validating invite:", error);
      res.status(500).json({ valid: false, message: "Failed to validate invite" });
    }
  });

  // Public: accept an invite by setting a password. Activates the account, marks
  // the invite used, and returns a JWT so the user is logged in immediately.
  app.post("/api/invite/:token/accept", async (req, res) => {
    try {
      const { password } = req.body || {};
      if (!password || typeof password !== "string" || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters long" });
      }

      const invite = await storage.getInviteByTokenHash(hashInviteToken(req.params.token));
      if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
        return res.status(400).json({ message: "This invite link is invalid or has expired." });
      }

      // Claim the invite atomically first so concurrent requests can't both
      // consume the same single-use token.
      const claimed = await storage.markInviteAccepted(invite.id);
      if (!claimed) {
        return res.status(400).json({ message: "This invite link is invalid or has expired." });
      }

      await storage.updateUserPassword(invite.userId, password);
      await storage.updateUser(invite.userId, { isActive: true });

      const token = jwt.sign({ userId: invite.userId }, JWT_SECRET, { expiresIn: "24h" });
      res.json({ token });
    } catch (error) {
      console.error("Error accepting invite:", error);
      res.status(500).json({ message: "Failed to accept invite" });
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
          const streams = await storage.getAllStreamsByStudio(studio.id);
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

  app.post("/api/admin/streams/bulk", requireAuth, requireAdmin, async (req, res) => {
    try {
      const bulkSchema = z.object({
        streams: z.array(insertStreamSchema).min(1).max(200),
      });
      const { streams: streamList } = bulkSchema.parse(req.body);
      const created = await storage.createStreamsBulk(streamList);
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid stream data", errors: error.errors });
      }
      console.error("Error creating streams in bulk:", error);
      res.status(500).json({ message: "Failed to create streams" });
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
      await storage.deleteStream(id);
      res.json({ message: "Stream deleted successfully" });
    } catch (error) {
      console.error("Error deleting stream:", error);
      res.status(500).json({ message: "Failed to delete stream" });
    }
  });

  // Group management ------------------------------------------------------

  app.get("/api/admin/groups", requireAuth, requireAdmin, async (req, res) => {
    try {
      const groups = await storage.getAllGroups();
      res.json(groups);
    } catch (error) {
      console.error("Error fetching groups:", error);
      res.status(500).json({ message: "Failed to fetch groups" });
    }
  });

  app.post("/api/admin/groups", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { streamIds = [], ...groupData } = req.body;
      const parsed = insertGroupSchema.parse(groupData);
      if (!Array.isArray(streamIds)) {
        return res.status(400).json({ message: "streamIds must be an array" });
      }
      const group = await storage.createGroup(parsed, streamIds);
      res.status(201).json(group);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid group data", errors: error.errors });
      }
      if (error?.code === "23505") {
        return res.status(400).json({ message: "A group with that name already exists" });
      }
      console.error("Error creating group:", error);
      res.status(500).json({ message: "Failed to create group" });
    }
  });

  app.put("/api/admin/groups/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { streamIds, ...groupData } = req.body;
      const parsed = insertGroupSchema.partial().parse(groupData);
      if (streamIds !== undefined && !Array.isArray(streamIds)) {
        return res.status(400).json({ message: "streamIds must be an array" });
      }
      const group = await storage.updateGroup(id, parsed, streamIds);
      res.json(group);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid group data", errors: error.errors });
      }
      if (error?.code === "23505") {
        return res.status(400).json({ message: "A group with that name already exists" });
      }
      console.error("Error updating group:", error);
      res.status(500).json({ message: "Failed to update group" });
    }
  });

  app.delete("/api/admin/groups/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deleteGroup(req.params.id);
      res.json({ message: "Group deleted successfully" });
    } catch (error) {
      console.error("Error deleting group:", error);
      res.status(500).json({ message: "Failed to delete group" });
    }
  });

  // Per-user group membership + individual stream grants -------------------

  app.put("/api/admin/users/:id/groups", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { groupIds } = req.body;
      if (!Array.isArray(groupIds)) {
        return res.status(400).json({ message: "groupIds must be an array" });
      }
      await storage.setUserGroups(req.params.id, groupIds);
      res.json({ message: "Group membership updated" });
    } catch (error) {
      console.error("Error setting user groups:", error);
      res.status(500).json({ message: "Failed to update group membership" });
    }
  });

  app.put("/api/admin/users/:id/stream-permissions", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { streamIds } = req.body;
      if (!Array.isArray(streamIds)) {
        return res.status(400).json({ message: "streamIds must be an array" });
      }
      await storage.setUserStreamPermissions(req.params.id, streamIds);
      res.json({ message: "Stream permissions updated" });
    } catch (error) {
      console.error("Error setting user stream permissions:", error);
      res.status(500).json({ message: "Failed to update stream permissions" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
