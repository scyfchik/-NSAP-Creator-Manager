const crypto = require("node:crypto");
const { allowedOrigins, isProduction } = require("./config");

const CSRF_COOKIE = "nsap_csrf";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function createCsrfToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function csrfCookieOptions() {
  return {
    httpOnly: false,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
  };
}

function ensureCsrfToken(req, res, next) {
  const existingToken = req.cookies?.[CSRF_COOKIE];
  if (existingToken) {
    req.csrfToken = existingToken;
  } else {
    req.csrfToken = createCsrfToken();
    res.cookie(CSRF_COOKIE, req.csrfToken, csrfCookieOptions());
  }

  next();
}

function getCsrfToken(req) {
  return req.csrfToken || req.cookies?.[CSRF_COOKIE] || "";
}

function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const cookieToken = getCsrfToken(req);
  const headerToken = req.get("x-csrf-token") || "";
  const origin = req.get("origin");

  if (origin && !isAllowedUnsafeOrigin(req, origin)) {
    res.status(403).json({ error: "Invalid request origin" });
    return;
  }

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ error: "Invalid CSRF token" });
    return;
  }

  next();
}

function isAllowedUnsafeOrigin(req, origin) {
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  const host = req.get("host");
  if (!host) {
    return false;
  }

  return origin === `${req.protocol}://${host}`;
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = {
  CSRF_COOKIE,
  asyncHandler,
  csrfCookieOptions,
  ensureCsrfToken,
  getCsrfToken,
  requireCsrf,
};
