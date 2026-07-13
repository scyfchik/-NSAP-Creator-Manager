const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { matchNsapContent } = require("./nsapContentMatcher");
const { validateNsapDecision } = require("../validation");
const { RequestThrottle, createYouTubeClient, extractChannelIdFromHtml, parseYouTubeChannelUrl, parseYouTubeFeed, selectYouTubeFeed } = require("./youtube");
const { TaskQueue, createYouTubeSyncManager, reconcileNsapResult } = require("./youtubeSync");
const { DECISION: NSAP_REVIEW_DECISION } = require("../../shared/nsapReviewContract");

const CHANNEL_ID = "UC1234567890123456789012";
const FEED = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/"><entry><yt:videoId>newest</yt:videoId><title>Minecraft survival episode 4</title><published>2026-07-12T10:00:00+00:00</published><link rel="alternate" href="https://www.youtube.com/watch?v=newest"/></entry><entry><yt:videoId>older</yt:videoId><title>Night Shift at Paulie's is TERRIFYING</title><published>2026-07-01T10:00:00+00:00</published><media:group><media:description>Roblox gameplay</media:description></media:group><link rel="alternate" href="https://www.youtube.com/watch?v=older"/></entry></feed>`;
const REVIEW_TITLES = [
  "Night Shift at Paulie's review",
  "NSAP channel update",
  "Paulies creator vlog",
  "Minecraft survival episode 4",
  "Anime edit compilation",
  "Roblox obby challenge",
  "Random short one",
  "Fortnite highlights",
  "Cooking tutorial",
  "Reaction video",
  "Speedrun attempt",
  "Music edit",
  "Daily vlog",
  "Random short two",
  "Unrelated gameplay",
];
const REVIEW_FEED = makeFeed(REVIEW_TITLES);

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
  assert.equal(matchNsapContent({ title: "NSAP update" }).status, "manual_review_required");
  assert.equal(matchNsapContent({ title: "Paulies creator vlog" }).classification, "ambiguous");
  assert.equal(matchNsapContent({ title: "Minecraft survival episode 4" }).status, "no_match");
  assert.equal(matchNsapContent({ title: "Roblox obby challenge" }).classification, "unrelated", "Roblox alone must not become a candidate");
  assert.equal(matchNsapContent({ title: "NSAP Roblox update" }).status, "matched");

  const upload = parseYouTubeFeed(FEED);
  assert.equal(upload.latestChannelVideoTitle, "Minecraft survival episode 4");
  assert.equal(upload.latestChannelUploadDate, "2026-07-12");
  assert.equal(upload.latestNsapVideoTitle, "Night Shift at Paulie's is TERRIFYING");
  assert.equal(upload.latestNsapUploadDate, "2026-07-01");
  assert.equal(upload.nsapMatchStatus, "matched");
  const filtered = selectYouTubeFeed(upload.entries, ["https://www.youtube.com/watch?v=older"]);
  assert.equal(filtered.nsapMatchStatus, "no_match");
  assert.equal(filtered.latestNsapVideoUrl, "", "a rejected exact URL must not reappear as the NSAP match");
  const withOlderFallback = selectYouTubeFeed([
    ...upload.entries,
    {
      title: "NSAP Roblox update",
      description: "",
      published: "2026-06-15T10:00:00+00:00",
      url: "https://www.youtube.com/watch?v=oldest",
    },
  ], ["https://www.youtube.com/watch?v=older"]);
  assert.equal(withOlderFallback.latestNsapVideoUrl, "https://www.youtube.com/watch?v=oldest");
  assert.equal(withOlderFallback.latestNsapUploadDate, "2026-06-15");
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

  const manual = { nsapMatchStatus: NSAP_REVIEW_DECISION.REJECT, nsapMatchReason: "Marked as unrelated", nsapDecisionVideoUploadDate: "2026-07-12", latestNsapUploadDate: "2026-06-01" };
  assert.equal(reconcileNsapResult(manual, upload).nsapMatchStatus, NSAP_REVIEW_DECISION.REJECT, "older matches must not replace manual decisions");
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

  assert.deepEqual(validateNsapDecision({
    decision: NSAP_REVIEW_DECISION.CONFIRM,
    videoTitle: "Exact NSAP candidate",
    videoUrl: "https://www.youtube.com/watch?v=exact",
    videoUploadDate: "2026-07-12",
  }), {
    decision: NSAP_REVIEW_DECISION.CONFIRM,
    videoTitle: "Exact NSAP candidate",
    videoUrl: "https://www.youtube.com/watch?v=exact",
    videoUploadDate: "2026-07-12",
  });
  assert.throws(() => validateNsapDecision({ decision: NSAP_REVIEW_DECISION.REJECT, videoTitle: "Bad", videoUrl: "javascript:alert(1)", videoUploadDate: "2026-07-12" }), /valid YouTube/);
  assert.throws(() => validateNsapDecision({ decision: NSAP_REVIEW_DECISION.REJECT, videoTitle: "Bad date", videoUrl: "https://youtu.be/exact", videoUploadDate: "2026-02-31" }), /valid YouTube/);
  assert.deepEqual(validateNsapDecision({ decision: NSAP_REVIEW_DECISION.CLEAR }), { decision: NSAP_REVIEW_DECISION.CLEAR, videoTitle: "", videoUrl: "", videoUploadDate: "" });
  assert.throws(() => validateNsapDecision({ decision: "rejected" }), /Invalid NSAP review decision/);
  assert.equal(NSAP_REVIEW_DECISION.UNDO, NSAP_REVIEW_DECISION.CLEAR);

  await testProgress();
  await testExactReviewFlow();
  await testFilteredSequentialReview();
  assertFrontendUsesNsapDate();
  assertFrontendReviewContract();
  assertReviewLocalization();
  console.log("YouTube sync tests passed");
}

function assertFrontendReviewContract() {
  const root = path.resolve(__dirname, "../..");
  ["src/ui/modal.js", "src/app.js", "src/data/apiClient.js"].forEach((file) => {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /NSAP_REVIEW_DECISION|isNsapReviewDecision/, `${file} must use the shared decision contract`);
    assert.doesNotMatch(source, /data-nsap-review="rejected"|decision:\s*"rejected"/, `${file} must not send the legacy rejected value`);
  });
  const appSource = fs.readFileSync(path.join(root, "src/app.js"), "utf8");
  assert.match(appSource, /api\.undoNsapReview/, "Review Undo must call the server-side clear action");
}

function assertReviewLocalization() {
  const root = path.resolve(__dirname, "../..");
  const en = fs.readFileSync(path.join(root, "src/i18n/en.js"), "utf8");
  const ru = fs.readFileSync(path.join(root, "src/i18n/ru.js"), "utf8");
  assert.match(en, /Potential NSAP video/);
  assert.match(en, /Candidate \{current\} of \{total\}/);
  assert.match(en, /No more potential NSAP videos require review/);
  assert.match(en, /Show Next Candidate/);
  assert.match(ru, /Потенциальное видео по NSAP/);
  assert.match(ru, /Кандидат \{current\} из \{total\}/);
  assert.match(ru, /Больше нет потенциальных видео по NSAP для проверки/);
  assert.match(ru, /Показать следующего кандидата/);
}

function assertFrontendUsesNsapDate() {
  const root = path.resolve(__dirname, "../..");
  ["src/ui/dashboard.js", "src/utils/creatorVisuals.js", "src/utils/calculations.js", "src/state/filters.js"].forEach((file) => {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /latestNsapUploadDate/, `${file} must use latestNsapUploadDate`);
    assert.doesNotMatch(source, /creator\.lastUploadDate|[ab]\.lastUploadDate/, `${file} must not use general lastUploadDate for activity`);
  });
  ["src/ui/dashboard.js", "src/ui/creatorsTable.js", "src/ui/modal.js"].forEach((file) => {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /getNsapHealth|renderUploadHealth/, `${file} must use the shared verified NSAP health calculation`);
  });
}

async function testProgress() {
  const creators = [{ id: "one", name: "One", platform: "YouTube", youtubeUrl: `https://youtube.com/channel/${CHANNEL_ID}` }, { id: "manual", name: "Manual", platform: "TikTok" }];
  const dbApi = {
    getCreators: async () => creators,
    getCreator: async (id) => creators.find((creator) => creator.id === id),
    getCreatorNsapReviews: async () => [],
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

async function testExactReviewFlow() {
  const creator = {
    id: "reviewed",
    name: "Reviewed Creator",
    platform: "YouTube",
    youtubeUrl: `https://youtube.com/channel/${CHANNEL_ID}`,
    latestChannelVideoTitle: "Minecraft survival episode 4",
    latestChannelVideoUrl: "https://www.youtube.com/watch?v=newest",
    latestChannelUploadDate: "2026-07-12",
    latestNsapVideoTitle: "Night Shift at Paulie's is TERRIFYING",
    latestNsapVideoUrl: "https://www.youtube.com/watch?v=older",
    latestNsapUploadDate: "2026-07-01",
    nsapMatchStatus: "matched",
  };
  const persistedReviews = [];
  let updateArgs;
  const dbApi = {
    getCreator: async () => creator,
    getCreatorNsapReviews: async () => persistedReviews,
    getYouTubeChannelMapping: async () => null,
    setYouTubeChannelMapping: async () => {},
    updateCreatorYouTubeSync: async ({ result }) => Object.assign(creator, result),
    updateCreatorNsapDecision: async (args) => {
      updateArgs = args;
      return { ...creator, ...args.automaticResult };
    },
  };
  const manager = createYouTubeSyncManager({ dbApi, minRequestIntervalMs: 0, fetchImpl: async () => response(FEED) });
  const synced = await manager.syncCreator(creator.id, { username: "Manager" }, "127.0.0.1");
  const candidate = synced.review.candidate;
  const review = {
    decision: NSAP_REVIEW_DECISION.REJECT,
    videoTitle: candidate.title,
    videoUrl: candidate.url,
    videoUploadDate: candidate.uploadDate,
  };
  const result = await manager.reviewCreator(creator.id, review, { username: "Manager" }, "127.0.0.1");
  assert.equal(updateArgs.review.videoUrl, candidate.url);
  assert.equal(updateArgs.expectedCandidate.url, candidate.url);
  assert.equal(updateArgs.automaticResult.nsapMatchStatus, "no_match");
  assert.equal(updateArgs.automaticResult.latestNsapVideoUrl, "");
  assert.equal(result.creator.nsapMatchStatus, "no_match");
  assert.equal(result.review.status, "exhausted");
  assert.equal(result.review.candidate, null, "an unrelated upload must not follow a rejected candidate");
}

async function testFilteredSequentialReview() {
  const creator = { id: "filtered", name: "Filtered Creator", platform: "YouTube", youtubeUrl: `https://youtube.com/channel/${CHANNEL_ID}` };
  const persistedReviews = [];
  let lastExpectedCandidate = null;
  const dbApi = {
    getCreator: async () => creator,
    getCreatorNsapReviews: async () => persistedReviews,
    getYouTubeChannelMapping: async () => null,
    setYouTubeChannelMapping: async () => {},
    updateCreatorYouTubeSync: async ({ result }) => Object.assign(creator, result),
    updateCreatorNsapDecision: async (args) => {
      lastExpectedCandidate = args.expectedCandidate;
      if (args.review.decision === NSAP_REVIEW_DECISION.REJECT) {
        persistedReviews.push({ decision: NSAP_REVIEW_DECISION.REJECT, video_url: args.review.videoUrl });
      }
      return Object.assign(creator, args.automaticResult || {});
    },
  };
  const manager = createYouTubeSyncManager({ dbApi, minRequestIntervalMs: 0, fetchImpl: async () => response(REVIEW_FEED) });
  let result = await manager.syncCreator(creator.id, { username: "Manager" }, "127.0.0.1");
  assert.equal(result.review.candidate.index, 1);
  assert.equal(result.review.candidate.total, 3, "15 uploads with three relevant matches must show Candidate 1 of 3");

  const reviewedTitles = [];
  for (let index = 0; index < 3; index += 1) {
    const candidate = result.review.candidate;
    reviewedTitles.push(candidate.title);
    result = await manager.reviewCreator(creator.id, {
      decision: NSAP_REVIEW_DECISION.REJECT,
      videoTitle: candidate.title,
      videoUrl: candidate.url,
      videoUploadDate: candidate.uploadDate,
    }, { username: "Manager" }, "127.0.0.1");
    assert.equal(lastExpectedCandidate.url, candidate.url, "reject must apply to the exact current candidate");
  }
  assert.deepEqual(reviewedTitles, REVIEW_TITLES.slice(0, 3));
  assert.equal(result.review.status, "exhausted");
  assert.equal(result.review.candidate, null);
  assert.equal(REVIEW_TITLES.slice(3).some((title) => reviewedTitles.includes(title)), false, "unrelated uploads must never enter review");

  const resynced = await manager.syncCreator(creator.id, { username: "Manager" }, "127.0.0.1");
  assert.equal(resynced.review.candidate, null, "rejected candidate URLs must stay excluded after sync");
  assert.equal(resynced.review.status, "exhausted");
}

function makeFeed(titles) {
  const entries = titles.map((title, index) => {
    const day = String(28 - index).padStart(2, "0");
    return `<entry><yt:videoId>review-${index}</yt:videoId><title>${title}</title><published>2026-06-${day}T10:00:00+00:00</published><link rel="alternate" href="https://www.youtube.com/watch?v=review-${index}"/></entry>`;
  }).join("");
  return `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">${entries}</feed>`;
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => String(body.length) }, text: async () => body };
}

run().catch((error) => { console.error(error); process.exit(1); });
