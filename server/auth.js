const crypto = require("node:crypto");
const { discord, isProduction, sessionDays, sessionSecret } = require("./config");
const { createSession, deleteSession, getSessionUser, insertAudit, upsertUser } = require("./db");

const SESSION_COOKIE = "nsap_session";
const STATE_COOKIE = "nsap_oauth_state";

function hashToken(token) {
  return crypto.createHmac("sha256", sessionSecret).update(token).digest("hex");
}

function createToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function cookieOptions(options = {}) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    ...options,
  };
}

async function getRequestUser(req) {
  const token = req.cookies?.[SESSION_COOKIE] || "";
  return getSessionUser(hashToken(token));
}

function clearSession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE] || "";
  if (req.user) {
    insertAudit({
      user: req.user,
      action: "session.logout",
      creatorId: null,
      field: null,
      oldValue: null,
      newValue: "logout",
      ip: req.ip,
    });
  }
  deleteSession(hashToken(token));
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

function redirectToDiscord(req, res, next) {
  assertDiscordConfigured();

  const state = createToken();
  const params = new URLSearchParams({
    client_id: discord.clientId,
    redirect_uri: discord.redirectUri,
    response_type: "code",
    scope: "identify",
    state,
  });

  res.cookie(STATE_COOKIE, state, cookieOptions({ maxAge: 600000 }));
  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
}

async function handleDiscordCallback(req, res, url) {
  assertDiscordConfigured();

  const code = req.query.code;
  const state = req.query.state;
  const expectedState = req.cookies?.[STATE_COOKIE] || "";

  if (!code || !state || state !== expectedState) {
    redirectWithError(res, "oauth_state");
    return;
  }

  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: discord.clientId,
      client_secret: discord.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: discord.redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    redirectWithError(res, "oauth_token");
    return;
  }

  const token = await tokenResponse.json();
  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
    },
  });

  if (!userResponse.ok) {
    redirectWithError(res, "discord_profile");
    return;
  }

  const profile = await userResponse.json();
  const user = upsertUser({
    discord_id: profile.id,
    username: profile.global_name || profile.username,
    avatar: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : "",
  });

  const sessionToken = createToken();
  const expiresAt = new Date(Date.now() + sessionDays * 86400000).toISOString();
  createSession(user.discord_id, hashToken(sessionToken), expiresAt);
  insertAudit({
    user,
    action: "session.login",
    creatorId: null,
    field: null,
    oldValue: null,
    newValue: "discord",
    ip: req.ip,
  });

  res.cookie(SESSION_COOKIE, sessionToken, cookieOptions({ maxAge: sessionDays * 86400000 }));
  res.clearCookie(STATE_COOKIE, cookieOptions());
  res.redirect("/");
}

function assertDiscordConfigured() {
  if (!discord.clientId || !discord.clientSecret || !discord.redirectUri) {
    throw new Error("Discord OAuth is not configured.");
  }
}

function redirectWithError(res, error) {
  res.redirect(`/?auth_error=${encodeURIComponent(error)}`);
}

module.exports = {
  clearSession,
  cookieOptions,
  getRequestUser,
  handleDiscordCallback,
  redirectToDiscord,
  SESSION_COOKIE,
};
