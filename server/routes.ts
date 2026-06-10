import type { Express } from "express";
import { createServer, type Server } from "http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { storage } from "./storage";
import jwt from "jsonwebtoken";
import { insertUserSchema, insertStudioSchema, insertStreamSchema, insertMultiviewerLayoutSchema, insertGroupSchema, insertStreamShareSchema, insertMultiviewerShareSchema } from "@shared/schema";
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

// srtSourceUrl is the external SRT source SRS pulls from for a PULL stream and
// can carry credentials in its streamid. Viewers only ever need the WebRTC
// playback URL (streamUrl), so strip the pull source from non-admin responses.
function sanitizeStreamForViewer<T extends { srtSourceUrl?: string | null }>(stream: T): Omit<T, "srtSourceUrl"> {
  const { srtSourceUrl, ...rest } = stream;
  return rest;
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

  // TV / OTT device pairing (the "scan a QR with your phone" login).
  //
  // Flow:
  //   1. TV calls /start -> gets { deviceCode, userCode } and shows a QR + code.
  //   2. TV polls /status?deviceCode=... every few seconds.
  //   3. The user's phone (already logged in) opens /tv/pair?code=USERCODE and
  //      calls /approve, which links the pairing to their account.
  //   4. The TV's next /status poll mints a JWT for that account.
  const TV_PAIRING_TTL_MS = 10 * 60 * 1000; // 10 minutes

  // Short, human-friendly code using an unambiguous alphabet (no 0/O/1/I).
  function generateUserCode(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.randomBytes(8);
    let raw = "";
    for (let i = 0; i < 8; i++) raw += alphabet[bytes[i] % alphabet.length];
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  }

  app.post("/api/tv/pair/start", async (_req, res) => {
    try {
      const deviceCode = crypto.randomBytes(32).toString("hex");
      // Retry a couple times in the (astronomically unlikely) event of a userCode collision.
      let userCode = generateUserCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const existing = await storage.getTvPairingByUserCode(userCode);
        if (!existing) break;
        userCode = generateUserCode();
      }
      const expiresAt = new Date(Date.now() + TV_PAIRING_TTL_MS);
      await storage.createTvPairing(deviceCode, userCode, expiresAt);
      res.json({
        deviceCode,
        userCode,
        expiresInSeconds: Math.floor(TV_PAIRING_TTL_MS / 1000),
      });
    } catch (error) {
      console.error("TV pair start error:", error);
      res.status(500).json({ message: "Failed to start pairing" });
    }
  });

  app.get("/api/tv/pair/status", async (req, res) => {
    try {
      const deviceCode = String(req.query.deviceCode || "");
      if (!deviceCode) {
        return res.status(400).json({ message: "deviceCode required" });
      }
      const pairing = await storage.getTvPairingByDeviceCode(deviceCode);
      if (!pairing) {
        return res.json({ status: "expired" });
      }
      if (pairing.expiresAt.getTime() < Date.now()) {
        await storage.deleteTvPairing(pairing.id);
        return res.json({ status: "expired" });
      }
      if (pairing.approved && pairing.userId) {
        // Atomically claim the approved pairing so only one poll can ever mint a
        // token (single-use). If another concurrent poll already consumed it,
        // `consumed` is undefined and we fall through to "expired".
        const consumed = await storage.consumeApprovedTvPairing(deviceCode);
        if (!consumed || !consumed.userId) {
          return res.json({ status: "expired" });
        }
        const user = await storage.getUser(consumed.userId);
        if (!user || !user.isActive) {
          return res.json({ status: "expired" });
        }
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "24h" });
        return res.json({ status: "approved", token });
      }
      res.json({ status: "pending" });
    } catch (error) {
      console.error("TV pair status error:", error);
      res.status(500).json({ message: "Failed to check pairing status" });
    }
  });

  app.post("/api/tv/pair/approve", requireAuth, async (req: any, res) => {
    try {
      const rawCode = String(req.body?.userCode || "").trim().toUpperCase();
      const userCode = rawCode.includes("-")
        ? rawCode
        : rawCode.length === 8
          ? `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`
          : rawCode;
      if (!userCode) {
        return res.status(400).json({ message: "userCode required" });
      }
      const pairing = await storage.getTvPairingByUserCode(userCode);
      if (!pairing || pairing.expiresAt.getTime() < Date.now()) {
        return res.status(404).json({ message: "This code is invalid or has expired." });
      }
      // Conditional false -> true approval; returns undefined if the pairing was
      // already approved by someone else (prevents approval takeover).
      const approved = await storage.approveTvPairing(userCode, req.user.id);
      if (!approved) {
        return res.status(409).json({ message: "This code has already been used." });
      }
      res.json({ status: "approved" });
    } catch (error) {
      console.error("TV pair approve error:", error);
      res.status(500).json({ message: "Failed to approve pairing" });
    }
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

      // Carry an optional post-login destination through the OAuth round-trip by
      // packing it into `state` (echoed back verbatim by the IdP). Used by the
      // TV pairing flow so the phone returns to /tv/pair?code=XXXX after SSO
      // instead of landing on / and forcing the user to rescan the QR code.
      const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "";
      const state = Buffer.from(
        JSON.stringify({ n: Math.random().toString(36).substring(2), r: returnTo }),
      ).toString("base64url");
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
    const { code, state } = req.query;
    // Recover the post-login destination packed into `state` at authorize time.
    // Only honor safe, app-relative paths to avoid an open-redirect.
    let returnTo = "/";
    try {
      if (typeof state === "string") {
        const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
        if (parsed && typeof parsed.r === "string" && parsed.r.startsWith("/") && !parsed.r.startsWith("//")) {
          returnTo = parsed.r;
        }
      }
    } catch {
      // Malformed state — fall back to the default destination.
    }
    const withToken = (token: string) => {
      const sep = returnTo.includes("?") ? "&" : "?";
      return `${returnTo}${sep}sso_token=${token}`;
    };
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
      res.redirect(withToken(token));
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
      const sanitized = req.user.role === "admin"
        ? studios
        : studios.map((studio) => ({
            ...studio,
            streams: studio.streams.map(sanitizeStreamForViewer),
          }));
      res.json(sanitized);
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
      res.json({ ...studio, streams: visibleStreams.map(sanitizeStreamForViewer) });
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

      res.json(req.user.role === "admin" ? stream : sanitizeStreamForViewer(stream));
    } catch (error) {
      console.error("Error fetching stream:", error);
      res.status(500).json({ message: "Failed to fetch stream" });
    }
  });

  // WHEP signaling proxy.
  //
  // The streaming origins (cdn*.obedtv.live) serve WebRTC WHEP over plain HTTP.
  // When the app itself is served over HTTPS, the browser blocks that HTTP
  // signaling request as mixed content. This endpoint relays the one-time SDP
  // offer/answer handshake through the app's own (HTTPS) origin so the browser
  // only ever talks HTTPS. The actual video media still flows peer-to-peer over
  // UDP directly from the CDN to the viewer — it does NOT pass through here — so
  // the added server load is just a few KB per stream-open.
  //
  // The path intentionally contains "/whep/" because the SRS SDK validates that
  // substring before sending. `express.text` captures the raw application/sdp
  // body. Targets are restricted to known streaming hosts to prevent SSRF.
  //
  // Neither this relay nor the HLS proxy below is behind requireAuth: the SRS
  // SDK / hls.js issue requests that can't attach our Bearer token, and the
  // upstream endpoints are already publicly reachable over HTTP. The allowlist
  // (not auth) is the security boundary, and only WHEP/HLS traffic to the
  // streaming domain can be relayed — no arbitrary URLs.
  //
  // Allow any host on the streaming domain (cdn1/cdn2/cdn3/cdn4.obedtv.live, etc.)
  // so new CDN nodes work without a code change, while still blocking arbitrary
  // hosts. Override the suffix with STREAM_ALLOWED_DOMAIN if the domain changes.
  const STREAM_ALLOWED_DOMAIN =
    process.env.STREAM_ALLOWED_DOMAIN || "obedtv.live";
  const isAllowedStreamHost = (hostname: string) =>
    hostname === STREAM_ALLOWED_DOMAIN ||
    hostname.endsWith(`.${STREAM_ALLOWED_DOMAIN}`);
  app.post(
    "/api/whep/relay",
    express.text({ type: () => true, limit: "1mb" }),
    async (req: any, res) => {
      try {
        const target = String(req.query.target || "");
        let parsed: URL;
        try {
          parsed = new URL(target);
        } catch {
          return res.status(400).json({ message: "Invalid target URL" });
        }
        // The CDN serves WHEP over plain HTTP; reject anything else.
        if (parsed.protocol !== "http:") {
          return res.status(400).json({ message: "Unsupported protocol" });
        }
        if (!isAllowedStreamHost(parsed.hostname)) {
          return res.status(403).json({ message: "Target host not allowed" });
        }
        if (
          parsed.pathname.indexOf("/whep/") === -1 &&
          parsed.pathname.indexOf("/whip-play/") === -1
        ) {
          return res.status(400).json({ message: "Not a WHEP endpoint" });
        }

        const offerSdp = typeof req.body === "string" ? req.body : "";
        // redirect: "error" prevents an allowlisted host from bouncing the
        // server to an off-allowlist destination (SSRF). Forward the normalized
        // URL rather than the raw query string.
        const upstream = await fetch(parsed.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: offerSdp,
          redirect: "error",
        });
        const answer = await upstream.text();
        res
          .status(upstream.status)
          .set("Content-Type", "application/sdp")
          .send(answer);
      } catch (error) {
        console.error("WHEP proxy error:", error);
        res.status(502).json({ message: "Failed to reach streaming server" });
      }
    },
  );

  // HLS proxy.
  //
  // HLS playlists (.m3u8) and their video segments are fetched over plain HTTP
  // from the CDN, so on an HTTPS page every one of those requests is blocked as
  // mixed content. Unlike WebRTC there is no peer-to-peer path, so ALL bytes are
  // relayed: this endpoint fetches the playlist, rewrites every segment / sub-
  // playlist / key URL to point back at itself (resolving relative URLs against
  // the playlist), and streams binary segments straight through. Load therefore
  // scales with viewers × bitrate — all video flows through the app server.
  const proxifyHlsUri = (uri: string, baseUrl: string): string => {
    let abs: URL;
    try {
      abs = new URL(uri, baseUrl);
    } catch {
      return uri;
    }
    // Only relay plain-HTTP URIs — those are the mixed-content ones. Absolute
    // https/data/etc. URIs load directly in the browser, and the proxy only
    // accepts http: targets anyway, so leave them untouched.
    if (abs.protocol !== "http:") return uri;
    return `/api/hls?target=${encodeURIComponent(abs.toString())}`;
  };
  const rewriteHlsPlaylist = (text: string, baseUrl: string): string =>
    text
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();
        if (trimmed === "") return line;
        if (trimmed.startsWith("#")) {
          // Rewrite URI="..." attributes (EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA, …).
          return line.replace(
            /URI="([^"]+)"/g,
            (_m, uri) => `URI="${proxifyHlsUri(uri, baseUrl)}"`,
          );
        }
        // A bare, non-tag line is a segment or sub-playlist URI.
        return proxifyHlsUri(trimmed, baseUrl);
      })
      .join("\n");
  app.get("/api/hls", async (req, res) => {
    try {
      const target = String(req.query.target || "");
      let parsed: URL;
      try {
        parsed = new URL(target);
      } catch {
        return res.status(400).json({ message: "Invalid target URL" });
      }
      if (parsed.protocol !== "http:") {
        return res.status(400).json({ message: "Unsupported protocol" });
      }
      if (!isAllowedStreamHost(parsed.hostname)) {
        return res.status(403).json({ message: "Target host not allowed" });
      }

      // redirect:"error" keeps an allowlisted host from bouncing us off-allowlist.
      // Forward Range so byte-range segments / fMP4 seeking keep working.
      const rangeHeader = req.headers.range;
      const upstream = await fetch(parsed.toString(), {
        redirect: "error",
        headers: rangeHeader ? { Range: rangeHeader } : undefined,
      });
      const contentType = upstream.headers.get("content-type") || "";
      const isPlaylist =
        parsed.pathname.toLowerCase().endsWith(".m3u8") ||
        contentType.includes("mpegurl");

      res.set("Cache-Control", "no-store");

      if (isPlaylist) {
        const text = await upstream.text();
        res
          .status(upstream.status)
          .set("Content-Type", "application/vnd.apple.mpegurl")
          .send(rewriteHlsPlaylist(text, parsed.toString()));
        return;
      }

      // Binary segment / key / init: stream it straight through, preserving
      // range-related headers and the upstream status (e.g. 206 Partial Content).
      if (contentType) res.set("Content-Type", contentType);
      const contentLength = upstream.headers.get("content-length");
      if (contentLength) res.set("Content-Length", contentLength);
      const acceptRanges = upstream.headers.get("accept-ranges");
      if (acceptRanges) res.set("Accept-Ranges", acceptRanges);
      const contentRange = upstream.headers.get("content-range");
      if (contentRange) res.set("Content-Range", contentRange);
      res.status(upstream.status);
      if (!upstream.body) {
        res.end();
        return;
      }
      try {
        await pipeline(Readable.fromWeb(upstream.body as any), res);
      } catch (streamErr) {
        console.error("HLS segment stream error:", streamErr);
        if (!res.headersSent) {
          res.status(502).json({ message: "Failed to stream segment" });
        } else {
          res.destroy();
        }
      }
    } catch (error) {
      console.error("HLS proxy error:", error);
      res.status(502).json({ message: "Failed to reach streaming server" });
    }
  });

  // ----- Stream share links -------------------------------------------------
  // Public: anyone holding the link can watch the one shared stream, with no
  // account, until the link expires or is deleted. Missing/expired both return
  // 404 so the page can't distinguish "never existed" from "revoked".
  app.get("/api/share/:token", async (req, res) => {
    try {
      const share = await storage.getStreamShareByToken(req.params.token);
      const expired = !!share?.expiresAt && share.expiresAt.getTime() <= Date.now();
      if (!share || expired) {
        return res
          .status(404)
          .json({ message: "This share link is invalid or has expired." });
      }
      // If a non-admin created this link and has since lost access to the
      // stream, stop serving it (same 404 so it can't be distinguished from a
      // revoked link). Admin-created or creator-deleted links keep working.
      if (share.createdBy) {
        const creator = await storage.getUser(share.createdBy);
        if (creator && creator.role !== "admin") {
          const accessible = await storage.getUserAccessibleStreamIds(
            share.createdBy,
          );
          if (!accessible.has(share.streamId)) {
            return res
              .status(404)
              .json({ message: "This share link is invalid or has expired." });
          }
        }
      }
      res.json({
        stream: sanitizeStreamForViewer(share.stream),
        label: share.label,
        expiresAt: share.expiresAt,
      });
    } catch (error) {
      console.error("Error fetching shared stream:", error);
      res.status(500).json({ message: "Failed to load shared stream" });
    }
  });

  // Admin-only: every stream share link created by any user, with the creator.
  app.get("/api/admin/shares", requireAuth, requireAdmin, async (req, res) => {
    try {
      const shares = await storage.getStreamShares();
      const baseUrl = getAppBaseUrl(req as any);
      res.json(
        shares.map((s) => ({ ...s, shareUrl: `${baseUrl}/share/${s.token}` })),
      );
    } catch (error) {
      console.error("Error listing shares:", error);
      res.status(500).json({ message: "Failed to list share links" });
    }
  });

  // Any logged-in user can create/list/delete their OWN stream share links,
  // but only for streams they currently have access to.
  app.get("/api/shares", requireAuth, async (req: any, res) => {
    try {
      const shares = await storage.getStreamSharesByUser(req.user.id);
      const baseUrl = getAppBaseUrl(req);
      res.json(
        shares.map((s) => ({ ...s, shareUrl: `${baseUrl}/share/${s.token}` })),
      );
    } catch (error) {
      console.error("Error listing user shares:", error);
      res.status(500).json({ message: "Failed to list share links" });
    }
  });

  app.post("/api/shares", requireAuth, async (req: any, res) => {
    try {
      const data = insertStreamShareSchema.parse(req.body);
      const stream = await storage.getStream(data.streamId);
      if (!stream) {
        return res.status(400).json({ message: "Stream not found" });
      }
      // Non-admins may only share streams they can currently access, so a share
      // link can't be used to expose a stream the creator isn't allowed to see.
      if (req.user.role !== "admin") {
        const accessible = await storage.getUserAccessibleStreamIds(req.user.id);
        if (!accessible.has(data.streamId)) {
          return res
            .status(403)
            .json({ message: "You don't have access to this stream." });
        }
      }
      const token = crypto.randomBytes(24).toString("hex");
      const share = await storage.createStreamShare({
        streamId: data.streamId,
        token,
        label: data.label ?? null,
        expiresAt: data.expiresAt ?? null,
        createdBy: req.user.id,
      });
      const shareUrl = `${getAppBaseUrl(req)}/share/${token}`;
      res.status(201).json({ ...share, shareUrl });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Invalid share data", errors: error.errors });
      }
      console.error("Error creating share:", error);
      res.status(500).json({ message: "Failed to create share link" });
    }
  });

  // Delete a stream share. Admins can delete anyone's; users only their own.
  app.delete("/api/shares/:id", requireAuth, async (req: any, res) => {
    try {
      const share = await storage.getStreamShareById(req.params.id);
      if (!share) {
        return res.status(404).json({ message: "Share link not found" });
      }
      if (req.user.role !== "admin" && share.createdBy !== req.user.id) {
        return res
          .status(403)
          .json({ message: "You can only delete your own share links." });
      }
      await storage.deleteStreamShare(req.params.id);
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting share:", error);
      res.status(500).json({ message: "Failed to delete share link" });
    }
  });

  // --- Multiview sharing -------------------------------------------------

  // Public (no account): watch a shared multiview layout by token. Resolves the
  // layout's streams directly, bypassing per-user permissions, since this is an
  // intentional public share gated only by the unguessable token + expiry.
  app.get("/api/mv-share/:token", async (req, res) => {
    try {
      const share = await storage.getMultiviewerShareByToken(req.params.token);
      const expired = !!share?.expiresAt && share.expiresAt.getTime() <= Date.now();
      if (!share || expired) {
        return res
          .status(404)
          .json({ message: "This share link is invalid or has expired." });
      }
      const layout = await storage.getMultiviewerLayoutById(share.layoutId);
      if (!layout) {
        return res
          .status(404)
          .json({ message: "This share link is invalid or has expired." });
      }
      const slotIds = (layout.slots ?? []).filter(
        (s): s is string => Boolean(s)
      );
      // Scope to what the layout owner can CURRENTLY access so a revoked
      // permission can't keep leaking a stream through an old share link.
      const streams = await storage.getAccessibleStreamsByIds(
        layout.userId,
        slotIds
      );
      res.json({
        label: share.label,
        expiresAt: share.expiresAt,
        layout: {
          id: layout.id,
          name: layout.name,
          layoutType: layout.layoutType,
          slots: layout.slots,
        },
        streams: streams.map(sanitizeStreamForViewer),
      });
    } catch (error) {
      console.error("Error fetching shared multiview:", error);
      res.status(500).json({ message: "Failed to load shared multiview" });
    }
  });

  // Directory of users/groups a layout owner can share to (minimal fields).
  app.get("/api/share-targets", requireAuth, async (_req: any, res) => {
    try {
      const [users, groups] = await Promise.all([
        storage.getAllUsers(),
        storage.getAllGroups(),
      ]);
      res.json({
        users: users.map((u) => ({ id: u.id, username: u.username })),
        groups: groups.map((g) => ({ id: g.id, name: g.name })),
      });
    } catch (error) {
      console.error("Error fetching share targets:", error);
      res.status(500).json({ message: "Failed to load share targets" });
    }
  });

  // List external links for a layout the caller owns.
  app.get("/api/multiviewer-layouts/:id/shares", requireAuth, async (req: any, res) => {
    try {
      const layout = await storage.getMultiviewerLayout(req.user.id, req.params.id);
      if (!layout) {
        return res.status(404).json({ message: "Layout not found" });
      }
      const shares = await storage.getMultiviewerSharesByLayout(layout.id);
      const baseUrl = getAppBaseUrl(req);
      res.json(shares.map((s) => ({ ...s, shareUrl: `${baseUrl}/mv/${s.token}` })));
    } catch (error) {
      console.error("Error listing multiview shares:", error);
      res.status(500).json({ message: "Failed to list share links" });
    }
  });

  // Create an external link for a layout the caller owns.
  app.post("/api/multiviewer-layouts/:id/shares", requireAuth, async (req: any, res) => {
    try {
      const layout = await storage.getMultiviewerLayout(req.user.id, req.params.id);
      if (!layout) {
        return res.status(404).json({ message: "Layout not found" });
      }
      const data = insertMultiviewerShareSchema.omit({ layoutId: true }).parse(req.body);
      const token = crypto.randomBytes(24).toString("hex");
      const share = await storage.createMultiviewerShare({
        layoutId: layout.id,
        token,
        label: data.label ?? null,
        expiresAt: data.expiresAt ?? null,
        createdBy: req.user?.id ?? null,
      });
      const shareUrl = `${getAppBaseUrl(req)}/mv/${token}`;
      res.status(201).json({ ...share, shareUrl });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Invalid share data", errors: error.errors });
      }
      console.error("Error creating multiview share:", error);
      res.status(500).json({ message: "Failed to create share link" });
    }
  });

  // Delete an external link (verified to belong to a layout the caller owns).
  app.delete("/api/multiviewer-layouts/:id/shares/:shareId", requireAuth, async (req: any, res) => {
    try {
      const layout = await storage.getMultiviewerLayout(req.user.id, req.params.id);
      if (!layout) {
        return res.status(404).json({ message: "Layout not found" });
      }
      const shares = await storage.getMultiviewerSharesByLayout(layout.id);
      if (!shares.some((s) => s.id === req.params.shareId)) {
        return res.status(404).json({ message: "Share link not found" });
      }
      await storage.deleteMultiviewerShare(req.params.shareId);
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting multiview share:", error);
      res.status(500).json({ message: "Failed to delete share link" });
    }
  });

  // Read the internal (users/groups) share grants for an owned layout.
  app.get("/api/multiviewer-layouts/:id/internal-shares", requireAuth, async (req: any, res) => {
    try {
      const layout = await storage.getMultiviewerLayout(req.user.id, req.params.id);
      if (!layout) {
        return res.status(404).json({ message: "Layout not found" });
      }
      const grants = await storage.getLayoutInternalShares(layout.id);
      res.json(grants);
    } catch (error) {
      console.error("Error fetching internal shares:", error);
      res.status(500).json({ message: "Failed to load internal shares" });
    }
  });

  // Replace the internal share grants for an owned layout.
  app.put("/api/multiviewer-layouts/:id/internal-shares", requireAuth, async (req: any, res) => {
    try {
      const layout = await storage.getMultiviewerLayout(req.user.id, req.params.id);
      if (!layout) {
        return res.status(404).json({ message: "Layout not found" });
      }
      const schema = z.object({
        userIds: z.array(z.string()).default([]),
        groupIds: z.array(z.string()).default([]),
      });
      const { userIds, groupIds } = schema.parse(req.body);
      await storage.setLayoutInternalShares(layout.id, userIds, groupIds);
      res.json({ userIds, groupIds });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Invalid share data", errors: error.errors });
      }
      console.error("Error updating internal shares:", error);
      res.status(500).json({ message: "Failed to update internal shares" });
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
    // Use the same access resolution as the display path so any stream the user
    // can see in a layout can also be saved (this includes streams that are
    // currently inactive, which getUserStudios would otherwise filter out).
    const accessible = await storage.getAccessibleStreamsByIds(userId, ids);
    const viewable = new Set(accessible.map((s) => s.id));
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
      // streamKey is server-generated and opaque; never let a client set or
      // change it (it would break the SRT ingest/playback pairing). Strip it
      // along with other server-managed fields before updating.
      const { streamKey, streamNumber, createdAt, updatedAt, id: _ignoredId, ...updateData } = req.body ?? {};
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
