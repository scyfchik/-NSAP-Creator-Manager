const path = require("node:path");
const fs = require("node:fs");

const rootDir = path.resolve(__dirname, "..");
loadDotEnv(path.join(rootDir, ".env"));

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function isPostgresUrl(value) {
  return /^postgres(?:ql)?:\/\//i.test(String(value || ""));
}

function getDatabasePath() {
  const databaseUrl = process.env.DATABASE_URL || "";
  const raw = process.env.SQLITE_PATH || (isPostgresUrl(databaseUrl) ? "./server/data/nsap.sqlite" : databaseUrl) || "./server/data/nsap.sqlite";
  if (raw.startsWith("sqlite://")) {
    return raw.replace("sqlite://", "");
  }

  return path.isAbsolute(raw) ? raw : path.resolve(rootDir, raw);
}

function getAllowedOrigins() {
  const configured = process.env.ALLOWED_ORIGINS || process.env.APP_ORIGIN || "";
  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

module.exports = {
  rootDir,
  publicDir: rootDir,
  port: Number(process.env.PORT || 4173),
  databasePath: getDatabasePath(),
  databaseUrl: process.env.DATABASE_URL || "",
  databaseSsl: process.env.DATABASE_SSL === "true",
  databaseType: isPostgresUrl(process.env.DATABASE_URL) ? "postgres" : "sqlite",
  allowedOrigins: getAllowedOrigins(),
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID || "",
    clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
    redirectUri: process.env.DISCORD_REDIRECT_URI || "http://127.0.0.1:4173/auth/discord/callback",
  },
  sessionSecret: process.env.SESSION_SECRET || "development-only-change-me",
  sessionDays: Number(process.env.SESSION_DAYS || 14),
  trustProxy: process.env.TRUST_PROXY === "true" ? 1 : false,
  isProduction: process.env.NODE_ENV === "production",
  requireEnv,
  isPostgresUrl,
};

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      return;
    }

    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").replace(/^['"]|['"]$/g, "");
    }
  });
}
