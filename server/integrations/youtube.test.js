const assert = require("node:assert/strict");
const { RequestThrottle, YouTubeSyncError, createYouTubeClient, extractChannelIdFromHtml, parseYouTubeChannelUrl, parseYouTubeFeed } = require("./youtube");
const { TaskQueue, createYouTubeSyncManager } = require("./youtubeSync");

const CHANNEL_ID = "UC1234567890123456789012";
const FEED = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><entry><yt:videoId>newest</yt:videoId><title>Newest Upload</title><published>2026-07-12T10:00:00+00:00</published><link rel="alternate" href="https://www.youtube.com/watch?v=newest"/></entry><entry><yt:videoId>older</yt:videoId><title>Older</title><published>2026-07-01T10:00:00+00:00</published></entry></feed>`;

async function run() {
  assert.equal(parseYouTubeChannelUrl(`https://youtube.com/channel/${CHANNEL_ID}`).channelId, CHANNEL_ID);
  assert.equal(parseYouTubeChannelUrl("https://www.youtube.com/@Creator").cacheKey, "handle:@creator");
  assert.throws(() => parseYouTubeChannelUrl("https://example.com/@Creator"), (error) => error.code === "invalid_url");
  assert.equal(extractChannelIdFromHtml(`{"channelId":"${CHANNEL_ID}"}`), CHANNEL_ID);
  assert.equal(extractChannelIdFromHtml(`<link rel="alternate" href="https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}">`), CHANNEL_ID);

  const upload = parseYouTubeFeed(FEED);
  assert.deepEqual(upload, { lastUploadDate: "2026-07-12", latestVideoTitle: "Newest Upload", latestVideoUrl: "https://www.youtube.com/watch?v=newest" });
  assert.throws(() => parseYouTubeFeed("<feed></feed>"), (error) => error.code === "no_uploads");

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
  console.log("YouTube sync tests passed");
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
