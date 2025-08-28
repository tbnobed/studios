import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import fs from "fs";
import path from "path";
import { db } from "./db";
import { sql } from "drizzle-orm";

// Simple log function for production (avoiding vite.ts import)
function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Function to ensure database schema compatibility
async function ensureSchemaCompatibility() {
  try {
    log("Checking database schema compatibility...");
    
    // Check if studios table has updated_at column
    const result = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'studios' 
      AND column_name = 'updated_at'
    `);
    
    if (result.rows.length === 0) {
      log("Adding missing updated_at column to studios table...");
      await db.execute(sql`
        ALTER TABLE studios ADD COLUMN updated_at TIMESTAMP DEFAULT NOW()
      `);
      
      // Update existing rows
      await db.execute(sql`
        UPDATE studios SET updated_at = created_at WHERE updated_at IS NULL
      `);
      
      log("Database schema updated successfully");
    } else {
      log("Database schema is compatible");
    }
  } catch (error) {
    log(`Database schema check failed: ${error}`);
    // Continue anyway - the app might still work
  }
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Ensure database schema compatibility before starting server
  await ensureSchemaCompatibility();
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Serve static files in production
  const distPath = path.resolve(process.cwd(), "dist", "public");
  
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.use("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  } else {
    log(`Warning: Could not find build directory: ${distPath}`);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();