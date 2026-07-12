const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { matchNsapContent } = require("./nsapContentMatcher");
const { RequestThrottle, YouTubeSyncError, createYouTubeClient, extractChannelIdFromHtml, parseYouTubeChannelUrl, parseYouTubeFeed } = require("./youtube");
const { TaskQueue, createYouTubeSyncManager, reconcileNsapResult } = require("./youtubeSync");

const CHANNEL_ID = "UC1234567890123456789012";
const FEED = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/"><entry><yt:videoId>newest</yt:videoId><title>Minecraft survival episode 4</title><published>2026-07-12T10:00:00+00:00</published><link rel="alternate" href="https://www.youtube.com/watch?v=newest"/></entry><entry><yt:videoId>older</yt:videoId><title>Night Shift at Paulie's is TERRIFYING</title><published>2026-07-01T10:00:00+00:00</published><media:group><media:description>Roblox gameplay</media:description></media:group><link rel="alternate" href="https://www.youtube.com/watch?v=older"/></entry></feed>`;

async function run() {
  assert.equal(parseYouTubeChannelUrl(`https://youtube.com/channel/${CHANNEL_ID}`).channelId, CHANNEL_ID);
  assert.equal(parseYouTubeChannelUrl("https://www.youtube.com/@Creator").cacheKey, "handle:@creator");
  assert.throws(() => parseYouTubeChannelUrl("https://example.com/@Creator"), (error) => error.code === "invalid_url");
  assert.equal(extractChannelIdFromHtml(`{"channelId":"${CHANNEL_ID}"}`), CHANNEL_ID);
  assert.equal(extractChannelIdFromHtml(`<link rel="alternate" href="https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}">`), CHANNEL_ID);

  assert.equal(matchNsapContent({ title: "Night Shift at Paulie's is TERRIFYING" }).status, "matched");
  assert.equal(matchNsapContent({ title: "Night Shift at Paul’s gameplay" }).status, "matched");
  assert.equal(matchNsapContent({ title: "Night Shift at Paul's gameplay" }).status, "matched");
  assert.equal(matchNsapContent({ description: "#NightShiftAtPaulies" }).status, "matched");
  assert.equal(matchNsapContent({ title: "Paulies Roblox gameplay" }).status, "matched");
  assert.equal(matchNsapContent({ title: "NSAP update" }).status, "no_match");
  assert.equal(matchNsapContent({ title: "Minecraft survival episode 4" }).status, "no_match");
  assert.equal(matchNsapContent({ title: "NSAP Roblox update" }).status, "matched");

  const upload = parseYouTubeFeed(FEED);
  assert.equal(upload.latestChannelVideoTitle, "Minecraft survival episode 4");
  assert.equal(upload.latestChannelUploadDate, "2026-07-12");
  assert.equal(upload.latestNsapVideoTitle, "Night Shift at Paulie's is TERRIFYING");
  assert.equal(upload.latestNsapUploadDate, "2026-07-01");
  assert.equal(upload.nsapMatchStatus, "matched");
  const descriptionMatch = parseYouTubeFeed(FEED.replace("Night Shift at Paulie's is TERRIFYING", "Cooking tutorial").replace("Roblox gameplay", "#NightShiftAtPaulies"));
  assert.equal(descriptionMatch.nsapMatchStatus, "matched");
  assert.match(descriptionMatch.nsapMatchReason, /description hashtag/);
  assert.throws(() => parseYouTubeFeed("<feed></feed>"), (error) => error.code === "no_uploads");

  const noMatch = parseYouTubeFeed(FEED.replace("Night Shift at Paulie's is TERRIFYING", "Cooking tutorial").replace("Roblox gameplay", "Easy dinner"));
  const preserved = reconcileNsapResult({ latestNsapVideoTitle: "Previous NSAP", latestNsapVideoUrl: "https://youtube.com/watch?v=previous", latestNsapUploadDate: "2026-06-01" }, noMatch);
  assert.equal(preserved.nsapMatchStatus, "no_match");
  assert.equal(preserved.latestNsapUploadDate, "2026-06-01", "no_match must preserve previous NSAP activity");
  ["status", "priority", "notes", "quickNote", "followUpDate", "dmSent", "collabPosted"]
    .forEach((field) => assert.equal(Object.hasOwn(preserved, field), false, `${field} must remain outside the sync result`));

  const manual = { nsapMatchStatus: "manual_rejected", nsapMatchReason: "Marked as unrelated", nsapDecisionVideoUploadDate: "2026-07-12", latestNsapUploadDate: "2026-06-01" };
  assert.equal(reconcileNsapResult(manual, upload).nsapMatchStatus, "manual_rejected", "older matches must not replace manual decisions");
  const newerMatch = { ...upload, latestNsapUploadDate: "2026-07-13" };
  assert.equal(reconcileNsapResult(manual, newerMatch).nsapMatchStatus, "matched", "a newer match must replace the manual decision");

  const mappings = new Map();
  let fetchCount = 0;
  const client = createYouTubeClient({
    throttle: new RequestThrottle(0),
    mappingStore: { get: async (key) => mappings.get(key), set: async (key, channelId) => mappings.set(key, { channel_id: channelId, resolved_at: new Date().toISOString() }) },
    fetchImpl: async (url) => {
      fetchCount += 1;
      return response(url.includes("feeds/videos.xml") ? FEED : `{"channelId":"${CHANNEL_ID}"}`);
    },
  });
  await client.syncCreator({ platform: "YouTube", youtubeUrl: "https://youtube.com/@Creator" });
  await client.syncCreator({ platform: "YouTube", youtubeUrl: "https://youtube.com/@Creator" });
  assert.equal(fetchCount, 2, "handle and RSS should each fetch once because both caches apply");

  const deleted = createYouTubeClient({ throttle: new RequestThrottle(0), fetchImpl: async () => response("", 404) });
  await assert.rejects(deleted.syncCreator({ platform: "YouTube", youtubeUrl: `https://youtube.com/channel/${CHANNEL_ID}` }), (error) => error.code === "channel_not_found");

  const timeout = createYouTubeClient({ timeoutMs: 5, throttle: new RequestThrottle(0), fetchImpl: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))) });
  await assert.rejects(timeout.syncCreator({ platform: "YouTube", youtubeUrl: `https://youtube.com/channel/${CHANNEL_ID}` }), (error) => error.code === "timeout");

  const stamps = [];
  const throttle = new RequestThrottle(20);
  await Promise.all([1, 2, 3].map(() => throttle.schedule(async () => stamps.push(Date.now()))));
  assert.ok(stamps[1] - stamps[0] >= 15 && stamps[2] - stamps[1] >= 15, "requests must be throttled");

  const order = [];
  const queue = new TaskQueue();
  await Promise.all([queue.add(async () => order.push(1)), queue.add(async () => order.push(2))]);
  assert.deepEqual(order, [1, 2]);

  await testProgress();
  assertFrontendUsesNsapDate();
  console.log("YouTube sync tests passed");
}

function assertFrontendUsesNsapDate() {
  const root = path.resolve(__dirname, "../..");
  ["src/ui/dashboard.js", "src/utils/creatorVisuals.js", "src/utils/calculations.js", "src/state/filters.js"].forEach((file) => {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /latestNsapUploadDate/, `${file} must use latestNsapUploadDate`);
    assert.doesNotMatch(source, /creator\.lastUploadDate|[ab]\.lastUploadDate/, `${file} must not use general lastUploadDate for activity`);
  });
}

async function testProgress() {
  const creators = [{ id: "one", name: "One", platform: "YouTube", youtubeUrl: `https://youtube.com/channel/${CHANNEL_ID}` }, { id: "manual", name: "Manual", platform: "TikTok" }];
  const dbApi = {
    getCreators: async () => creators,
    getCreator: async (id) => creators.find((creator) => creator.id === id),
    getYouTubeChannelMapping: async () => null,
    setYouTubeChannelMapping: async () => {},
    updateCreatorYouTubeSync: async ({ creatorId, result }) => Object.assign(creators.find((creator) => creator.id === creatorId), result),
  };
  const manager = createYouTubeSyncManager({ dbApi, minRequestIntervalMs: 0, fetchImpl: async () => response(FEED) });
  const started = await manager.startSyncAll({ role: "owner" }, "127.0.0.1");
  let job;
  for (let index = 0; index < 20; index += 1) {
    job = manager.getJob(started.id);
    if (job.status === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(job.status, "completed");
  assert.equal(job.completed, 2);
  assert.equal(creators[0].syncStatus, "synced");
  assert.equal(creators[1].syncStatus, "manual");
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => String(body.length) }, text: async () => body };
}

run().catch((error) => { console.error(error); process.exit(1); });
