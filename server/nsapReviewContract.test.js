const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const databasePath = path.join(os.tmpdir(), `nsap-review-contract-${process.pid}.sqlite`);
process.env.SQLITE_PATH = databasePath;
process.env.NODE_ENV = "development";

const { DECISION: NSAP_REVIEW_DECISION } = require("../shared/nsapReviewContract");
const { createApp } = require("./app");
const { sessionSecret } = require("./config");
const {
  closeDatabase,
  createSession,
  getAuditLog,
  getCreators,
  updateCreatorYouTubeSync,
  upsertUser,
} = require("./db");

const CHANNEL_ID = "UC1234567890123456789012";
const PRIMARY_URL = "https://www.youtube.com/watch?v=contract-primary";
const FEED = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><entry><yt:videoId>contract-primary</yt:videoId><title>Night Shift at Paul's contract candidate</title><published>2026-07-12T10:00:00+00:00</published><link rel="alternate" href="${PRIMARY_URL}"/></entry><entry><yt:videoId>contract-older</yt:videoId><title>NSAP Roblox older match</title><published>2026-07-01T10:00:00+00:00</published><link rel="alternate" href="https://www.youtube.com/watch?v=contract-older"/></entry></feed>`;

async function run() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response(FEED);
  let server;

  try {
    const app = await createApp();
    const user = await upsertUser({ discord_id: "contract-owner", username: "Contract Owner", avatar: "" });
    const sessionToken = "contract-session-token";
    const tokenHash = crypto.createHmac("sha256", sessionSecret).update(sessionToken).digest("hex");
    await createSession(user.discord_id, tokenHash, new Date(Date.now() + 60000).toISOString());

    const creator = (await getCreators()).find((item) => item.platform === "YouTube");
    assert.ok(creator, "seed data must contain a YouTube creator");
    creator.youtubeUrl = `https://www.youtube.com/channel/${CHANNEL_ID}`;
    const synced = await updateCreatorYouTubeSync({
      creatorId: creator.id,
      user,
      ip: "127.0.0.1",
      result: {
        latestChannelVideoTitle: "Night Shift at Paul's contract candidate",
        latestChannelVideoUrl: PRIMARY_URL,
        latestChannelUploadDate: "2026-07-12",
        latestNsapVideoTitle: "Night Shift at Paul's contract candidate",
        latestNsapVideoUrl: PRIMARY_URL,
        latestNsapUploadDate: "2026-07-12",
        nsapMatchStatus: "matched",
        nsapMatchReason: "Contract candidate",
        nsapMatchedKeyword: "night shift at paul's",
        syncStatus: "synced",
      },
    });
    await require("./db").updateCreatorProfile({
      creatorId: creator.id,
      updates: { youtubeUrl: creator.youtubeUrl },
      user,
      ip: "127.0.0.1",
    });

    server = await listen(app);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const csrfResponse = await originalFetch(`${baseUrl}/api/session`, {
      headers: { Cookie: `nsap_session=${sessionToken}` },
    });
    const csrfToken = readCookie(csrfResponse.headers.get("set-cookie"), "nsap_csrf");
    assert.ok(csrfToken, "CSRF cookie must be issued");
    const headers = {
      "Content-Type": "application/json",
      Cookie: `nsap_session=${sessionToken}; nsap_csrf=${csrfToken}`,
      "x-csrf-token": csrfToken,
    };
    const endpoint = `${baseUrl}/api/creators/${encodeURIComponent(synced.id)}/youtube/nsap-decision`;
    const candidate = {
      videoTitle: synced.latestNsapVideoTitle,
      videoUrl: synced.latestNsapVideoUrl,
      videoUploadDate: synced.latestNsapUploadDate,
    };

    await assertReviewStatus(originalFetch, endpoint, headers, { decision: NSAP_REVIEW_DECISION.CONFIRM, ...candidate }, 200, "Mark as NSAP Content");
    await assertReviewStatus(originalFetch, endpoint, headers, { decision: NSAP_REVIEW_DECISION.REJECT, ...candidate }, 200, "Mark as Unrelated");
    await assertReviewStatus(originalFetch, endpoint, headers, { decision: NSAP_REVIEW_DECISION.CLEAR }, 200, "Clear Review");
    await assertReviewStatus(originalFetch, endpoint, headers, { decision: NSAP_REVIEW_DECISION.CONFIRM, ...candidate }, 200, "Prepare Review Undo");
    await assertReviewStatus(originalFetch, endpoint, headers, { decision: NSAP_REVIEW_DECISION.UNDO }, 200, "Review Undo");
    await assertReviewStatus(originalFetch, endpoint, headers, { decision: "rejected" }, 400, "legacy rejected value");

    const auditActions = (await getAuditLog()).map((entry) => entry.action);
    assert.ok(auditActions.includes(`creator.youtube.nsap.${NSAP_REVIEW_DECISION.CONFIRM}`));
    assert.ok(auditActions.includes(`creator.youtube.nsap.${NSAP_REVIEW_DECISION.REJECT}`));
    assert.ok(auditActions.includes(`creator.youtube.nsap.${NSAP_REVIEW_DECISION.CLEAR}`));
    console.log("NSAP review HTTP contract tests passed");
  } finally {
    globalThis.fetch = originalFetch;
    if (server) await new Promise((resolve) => server.close(resolve));
    await closeDatabase().catch(() => {});
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function assertReviewStatus(fetchImpl, endpoint, headers, payload, expected, label) {
  const result = await fetchImpl(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
  assert.equal(result.status, expected, `${label} returned ${result.status}: ${await result.text()}`);
}

function readCookie(header, name) {
  const match = String(header || "").match(new RegExp(`(?:^|,\\s*)${name}=([^;]+)`));
  return match?.[1] || "";
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => String(body.length) }, text: async () => body };
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
