import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import jwt from "jsonwebtoken";
import { insertUserSchema, insertStudioSchema, insertStreamSchema } from "@shared/schema";

const JWT_SECRET = process.env.JWT_SECRET || "obtv-studio-secret-key";

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
