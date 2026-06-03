import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Invite and share links carry tokens in the URL/response. Never write
      // those to logs, or anyone with log access could hijack the link.
      const loggedPath = path.startsWith("/api/invite")
        ? "/api/invite/[redacted]"
        : path.startsWith("/api/share")
          ? "/api/share/[redacted]"
          : path.startsWith("/api/mv-share")
            ? "/api/mv-share/[redacted]"
            : path;
      let logLine = `${req.method} ${loggedPath} ${res.statusCode} in ${duration}ms`;
      // Skip the response body if the path was redacted, or if the body itself
      // carries a token / share url / invite url (covers create + list shapes).
      const serialized = capturedJsonResponse
        ? JSON.stringify(capturedJsonResponse)
        : "";
      const bodyHasSecret = /"(token|shareUrl|inviteUrl)"\s*:/.test(serialized);
      if (capturedJsonResponse && loggedPath === path && !bodyHasSecret) {
        logLine += ` :: ${serialized}`;
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
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
