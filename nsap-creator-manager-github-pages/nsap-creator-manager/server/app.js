const compression = require("compression");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("node:path");
const { allowedOrigins, discord, isProduction, publicDir, sessionSecret, trustProxy } = require("./config");
const { clearSession, getRequestUser, handleDiscordCallback, redirectToDiscord } = require("./auth");
const {
  getAuditLog,
  getBackups,
  getCreators,
  getUsers,
  initDatabase,
  insertAudit,
  insertBackup,
  replaceCreators,
  restoreBackup,
  updateCreatorField,
  updateUserRole,
} = require("./db");
const { canAdmin, canEditCreator, canOwn, getClientPermissions, roleRank, validRoles } = require("./permissions");
const { asyncHandler, ensureCsrfToken, requireCsrf } = require("./security");
const { validateCreatorPayload, validateEdit } = require("./validation");

function createApp() {
  assertProductionConfig();
  initDatabase();

  const app = express();
  app.set("trust proxy", trustProxy);
  app.disable("x-powered-by");

  app.use(morgan(isProduction ? "combined" : "dev"));
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "https://cdn.discordapp.com"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (!allowedOrigins.length) {
        callback(null, false);
        return;
      }

      callback(null, allowedOrigins.includes(origin));
    },
  }));
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }));
  app.use("/auth", rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(rejectUnsafeJsonKeys);
  app.use(ensureCsrfToken);
  app.use(asyncHandler(attachUser));

  app.get("/auth/discord", redirectToDiscord);
  app.get("/auth/discord/callback", asyncHandler(handleDiscordCallback));
  app.post("/auth/logout", requireCsrf, (req, res) => {
    clearSession(req, res);
    res.json({ ok: true });
  });

  app.get("/api/session", (req, res) => {
    res.json({
      authenticated: Boolean(req.user),
      user: req.user ? publicUser(req.user) : null,
      permissions: getClientPermissions(req.user),
    });
  });

  app.get("/api/creators", (req, res) => {
    res.json({ creators: getCreators() });
  });

  app.patch("/api/creators/:id", requireCsrf, requireCreatorEditor, (req, res) => {
    const { field, value } = req.body || {};
    const validation = validateEdit(field, value);
    if (!validation.ok) {
      res.status(400).json({ error: validation.message });
      return;
    }

    const creator = updateCreatorField({
      creatorId: req.params.id,
      field,
      value: validation.value,
      user: req.user,
      ip: req.ip,
    });

    if (!creator) {
      res.status(404).json({ error: "Creator not found" });
      return;
    }

    res.json({ creator });
  });

  app.get("/api/export", requireAdministrator, (req, res) => {
    insertAudit({
      user: req.user,
      action: "creators.export",
      creatorId: null,
      field: null,
      oldValue: null,
      newValue: "json",
      ip: req.ip,
    });
    res.json({
      schemaVersion: 2,
      metadata: {
        exportedAt: new Date().toISOString(),
        app: "NSAP Creator Manager",
      },
      creators: getCreators(),
    });
  });

  app.post("/api/import", requireCsrf, requireAdministrator, (req, res) => {
    const creators = validateCreatorPayload(req.body);
    replaceCreators(creators, req.user, "Import JSON", {
      audit: true,
      backup: true,
      backupType: "manual",
      ip: req.ip,
    });
    res.json({ ok: true, creators: getCreators() });
  });

  app.get("/api/users", requireAdministrator, (req, res) => {
    res.json({ users: getUsers().map(publicUser) });
  });

  app.patch("/api/users/:discordId/role", requireCsrf, requireAdministrator, (req, res) => {
    const discordId = String(req.params.discordId || "");
    const role = String(req.body?.role || "");

    if (!/^\d{5,32}$/.test(discordId)) {
      res.status(400).json({ error: "Invalid Discord ID" });
      return;
    }

    if (!validRoles.has(role)) {
      res.status(400).json({ error: "Invalid role" });
      return;
    }

    if (role === "owner" && !canOwn(req.user)) {
      res.status(403).json({ error: "Only Owner can assign Owner role" });
      return;
    }

    const target = getUsers().find((item) => item.discord_id === discordId);
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (target.role === "owner" && !canOwn(req.user)) {
      res.status(403).json({ error: "Only Owner can change Owner role" });
      return;
    }

    if (!canOwn(req.user) && roleRank[target.role] >= roleRank[req.user.role]) {
      res.status(403).json({ error: "Cannot change a peer or higher role" });
      return;
    }

    if (roleRank[role] > roleRank[req.user.role] && !canOwn(req.user)) {
      res.status(403).json({ error: "Cannot assign a role above your own role" });
      return;
    }

    if (roleRank[role] >= roleRank[req.user.role] && !canOwn(req.user)) {
      res.status(403).json({ error: "Cannot assign a peer or higher role" });
      return;
    }

    const updated = updateUserRole(discordId, role, req.user, req.ip);
    res.json({ user: publicUser(updated) });
  });

  app.get("/api/audit", requireAdministrator, (req, res) => {
    res.json({ audit: getAuditLog() });
  });

  app.get("/api/backups", requireAdministrator, (req, res) => {
    res.json({ backups: getBackups() });
  });

  app.post("/api/backups", requireCsrf, requireAdministrator, (req, res) => {
    insertBackup(req.user, "Manual backup", "manual");
    insertAudit({
      user: req.user,
      action: "backup.create",
      creatorId: null,
      field: null,
      oldValue: null,
      newValue: "manual",
      ip: req.ip,
    });
    res.status(201).json({ backups: getBackups() });
  });

  app.post("/api/backups/:id/restore", requireCsrf, requireAdministrator, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid backup ID" });
      return;
    }

    const restored = restoreBackup(id, req.user, req.ip);
    if (!restored) {
      res.status(404).json({ error: "Backup not found" });
      return;
    }

    res.json({ ok: true, creators: getCreators() });
  });

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  app.use(blockPrivateStaticPaths);
  app.use(express.static(publicDir, {
    dotfiles: "deny",
    etag: true,
    extensions: false,
    index: false,
    maxAge: isProduction ? "1h" : 0,
  }));
  app.get("*", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const status = error.status || error.statusCode || (error.type === "entity.parse.failed" ? 400 : 500);
    if (status >= 500) {
      console.error(error);
    }

    res.status(status).json({
      error: status >= 500 ? "Internal server error" : error.message,
    });
  });

  return app;
}

async function attachUser(req, res, next) {
  req.user = await getRequestUser(req);
  next();
}

function requireCreatorEditor(req, res, next) {
  if (!canEditCreator(req.user)) {
    res.status(403).json({ error: "Manager role required" });
    return;
  }

  next();
}

function requireAdministrator(req, res, next) {
  if (!canAdmin(req.user)) {
    res.status(403).json({ error: "Administrator role required" });
    return;
  }

  next();
}

function rejectUnsafeJsonKeys(req, res, next) {
  if (containsUnsafeKey(req.body)) {
    res.status(400).json({ error: "Unsafe JSON payload" });
    return;
  }

  next();
}

function containsUnsafeKey(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(containsUnsafeKey);
  }

  return Object.keys(value).some((key) => (
    key === "__proto__"
    || key === "constructor"
    || key === "prototype"
    || containsUnsafeKey(value[key])
  ));
}

function blockPrivateStaticPaths(req, res, next) {
  const blocked = [
    "/.env",
    "/package.json",
    "/package-lock.json",
    "/render.yaml",
    "/server/",
    "/data/",
  ];

  if (blocked.some((prefix) => req.path === prefix.replace(/\/$/, "") || req.path.startsWith(prefix))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  next();
}

function publicUser(user) {
  return {
    discord_id: user.discord_id,
    username: user.username,
    avatar: user.avatar,
    role: user.role,
    created_at: user.created_at,
    last_login: user.last_login,
  };
}

function assertProductionConfig() {
  if (!isProduction) {
    return;
  }

  if (!process.env.SESSION_SECRET || sessionSecret === "development-only-change-me" || sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters in production.");
  }

  if (!discord.clientId || !discord.clientSecret || !discord.redirectUri) {
    throw new Error("Discord OAuth environment variables must be set in production.");
  }

  if (!discord.redirectUri.startsWith("https://")) {
    throw new Error("DISCORD_REDIRECT_URI must use HTTPS in production.");
  }

  if (!allowedOrigins.length) {
    throw new Error("ALLOWED_ORIGINS or APP_ORIGIN must be set in production.");
  }
}

module.exports = {
  createApp,
};
