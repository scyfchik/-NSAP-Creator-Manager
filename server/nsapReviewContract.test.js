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
    const synced = await require("./db").updateCreatorProfile({
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
    const creatorPath = `${baseUrl}/api/creators/${encodeURIComponent(synced.id)}`;
    const endpoint = `${creatorPath}/youtube/nsap-decision`;
    const syncResult = await postJson(originalFetch, `${creatorPath}/sync/youtube`, headers, {});
    assert.equal(syncResult.status, 200);
    assert.equal(syncResult.body.review.candidate.url, PRIMARY_URL, "sync must start at the best automatic match");
    const candidatePayload = (candidate) => ({ videoTitle: candidate.title, videoUrl: candidate.url, videoUploadDate: candidate.uploadDate });

    const rejected = await postJson(originalFetch, endpoint, headers, { decision: NSAP_REVIEW_DECISION.REJECT, ...candidatePayload(syncResult.body.review.candidate) });
    assert.equal(rejected.status, 200, `Mark as Unrelated returned ${rejected.status}`);
    assert.equal(rejected.body.review.candidate.url, "https://www.youtube.com/watch?v=contract-older", "reject must advance in the same response");
    assert.equal(rejected.body.review.checkedCount, 1);

    const resynced = await postJson(originalFetch, `${creatorPath}/sync/youtube`, headers, {});
    assert.equal(resynced.status, 200);
    assert.equal(resynced.body.review.candidate.url, "https://www.youtube.com/watch?v=contract-older", "a permanently rejected video must not reappear after sync");

    const auditCountBeforeSkip = (await getAuditLog()).length;
    const skipped = await postJson(originalFetch, `${creatorPath}/youtube/review-next`, headers, {});
    assert.equal(skipped.status, 200);
    assert.equal(skipped.body.review.status, "exhausted");
    assert.equal((await getAuditLog()).length, auditCountBeforeSkip, "temporary Show Next must not create an audit record");

    const reloaded = await originalFetch(`${creatorPath}/youtube/review-candidate`, { headers });
    const reloadedBody = await reloaded.json();
    assert.equal(reloadedBody.review.status, "exhausted", "F5-style GET must keep current in-process navigation");

    const cleared = await postJson(originalFetch, endpoint, headers, { decision: NSAP_REVIEW_DECISION.CLEAR });
    assert.equal(cleared.status, 200, "Clear Review must return 200");
    assert.equal(cleared.body.review.candidate.url, PRIMARY_URL, "Clear must restore the first candidate");
    const confirmed = await postJson(originalFetch, endpoint, headers, { decision: NSAP_REVIEW_DECISION.CONFIRM, ...candidatePayload(cleared.body.review.candidate) });
    assert.equal(confirmed.status, 200, "Mark as NSAP Content must return 200");
    assert.equal(confirmed.body.review.status, "confirmed");
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

async function postJson(fetchImpl, endpoint, headers, payload) {
  const response = await fetchImpl(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
  return { status: response.status, body: await response.json() };
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
