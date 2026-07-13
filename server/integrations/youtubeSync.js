const crypto = require("node:crypto");
const db = require("../db");
const { createYouTubeClient, RequestThrottle, selectYouTubeFeed, YouTubeSyncError } = require("./youtube");
const { matchNsapContent } = require("./nsapContentMatcher");
const { DECISION: NSAP_REVIEW_DECISION } = require("../../shared/nsapReviewContract");

class TaskQueue {
  constructor() { this.pending = Promise.resolve(); }
  add(task) {
    const result = this.pending.then(task, task);
    this.pending = result.catch(() => {});
    return result;
  }
}

function createYouTubeSyncManager({ dbApi = db, fetchImpl = globalThis.fetch, minRequestIntervalMs = 2000 } = {}) {
  const queue = new TaskQueue();
  const jobs = new Map();
  const reviewStates = new Map();
  const client = createYouTubeClient({
    fetchImpl,
    throttle: new RequestThrottle(minRequestIntervalMs),
    mappingStore: {
      get: (key) => dbApi.getYouTubeChannelMapping(key),
      set: (key, channelId) => dbApi.setYouTubeChannelMapping(key, channelId),
    },
  });

  async function syncCreator(creatorId, user, ip) {
    return queue.add(() => performSync(creatorId, user, ip));
  }

  async function performSync(creatorId, user, ip) {
    const creator = await dbApi.getCreator(creatorId);
    if (!creator || creator.deleted) return null;
    const lastSync = new Date().toISOString();
    try {
      const reviews = await dbApi.getCreatorNsapReviews(creatorId);
      const excludedVideoUrls = reviews.filter((review) => review.decision === NSAP_REVIEW_DECISION.REJECT).map((review) => review.video_url);
      const upload = await client.syncCreator(creator, { excludedVideoUrls });
      const result = reconcileNsapResult(creator, upload);
      const updated = await dbApi.updateCreatorYouTubeSync({ creatorId, user, ip, result: { ...result, lastSync, syncStatus: "synced", syncError: "" } });
      const state = createReviewState(upload.entries, excludedVideoUrls);
      reviewStates.set(creatorId, state);
      return { creator: updated, review: toPublicReviewState(state) };
    } catch (error) {
      const normalized = normalizeSyncError(error);
      const manualStatus = isManualDecision(creator.nsapMatchStatus) ? creator.nsapMatchStatus : "";
      reviewStates.delete(creatorId);
      const updated = await dbApi.updateCreatorYouTubeSync({
        creatorId,
        user,
        ip,
        result: {
          lastSync,
          syncStatus: normalized.status,
          syncError: normalized.message,
          nsapMatchStatus: manualStatus || (normalized.status === "manual" ? "unsupported" : "sync_failed"),
          nsapMatchReason: manualStatus ? creator.nsapMatchReason : normalized.message,
        },
      });
      return { creator: updated, review: emptyReviewState("unavailable") };
    }
  }

  async function reviewCreator(creatorId, review, user, ip) {
    const creator = await dbApi.getCreator(creatorId);
    if (!creator || creator.deleted) return null;
    if (review.decision === NSAP_REVIEW_DECISION.CLEAR) {
      const upload = await client.syncCreator(creator);
      const updated = await dbApi.updateCreatorNsapDecision({ creatorId, review, automaticResult: upload, expectedCandidate: null, user, ip });
      const state = createReviewState(upload.entries);
      reviewStates.set(creatorId, state);
      return { creator: updated, review: toPublicReviewState(state) };
    }

    const state = reviewStates.get(creatorId);
    const expectedCandidate = getCurrentCandidate(state);
    if (!expectedCandidate) throwHttpError("Sync YouTube to load a review candidate.", 409);

    let automaticResult = null;
    if (review.decision === NSAP_REVIEW_DECISION.REJECT) {
      const rejected = new Set(state.rejectedUrls);
      rejected.add(expectedCandidate.url);
      automaticResult = selectYouTubeFeed(state.sourceEntries, [...rejected]);
    }

    const updated = await dbApi.updateCreatorNsapDecision({ creatorId, review, automaticResult, expectedCandidate, user, ip });
    if (review.decision === NSAP_REVIEW_DECISION.CONFIRM) {
      state.status = "confirmed";
      state.cursor = state.entries.length;
    } else {
      state.rejectedUrls.add(expectedCandidate.url);
      state.checkedUrls.add(expectedCandidate.url);
      advanceReviewState(state);
    }
    return { creator: updated, review: toPublicReviewState(state) };
  }

  function getReviewState(creatorId) {
    return reviewStates.has(creatorId) ? toPublicReviewState(reviewStates.get(creatorId)) : emptyReviewState("not_loaded");
  }

  async function showNextCandidate(creatorId) {
    const creator = await dbApi.getCreator(creatorId);
    if (!creator || creator.deleted) return null;
    const state = reviewStates.get(creatorId);
    const candidate = getCurrentCandidate(state);
    if (!candidate) throwHttpError("Sync YouTube to load a review candidate.", 409);
    state.skippedUrls.add(candidate.url);
    state.checkedUrls.add(candidate.url);
    advanceReviewState(state);
    return { creator, review: toPublicReviewState(state) };
  }

  async function startSyncAll(user, ip) {
    const creators = await dbApi.getCreators();
    const job = { id: crypto.randomUUID(), status: "queued", total: creators.length, completed: 0, failed: 0, currentCreator: "", startedAt: new Date().toISOString(), finishedAt: "" };
    jobs.set(job.id, job);
    void runAll(job, creators, user, ip);
    pruneJobs();
    return { ...job };
  }

  async function runAll(job, creators, user, ip) {
    job.status = "running";
    for (const creator of creators) {
      job.currentCreator = creator.name;
      try {
        const updated = await syncCreator(creator.id, user, ip);
        if (!updated || !["synced", "manual"].includes(updated.creator.syncStatus)) job.failed += 1;
      } catch { job.failed += 1; }
      job.completed += 1;
    }
    job.currentCreator = "";
    job.status = "completed";
    job.finishedAt = new Date().toISOString();
  }

  function getJob(id) { const job = jobs.get(id); return job ? { ...job } : null; }
  function pruneJobs() { while (jobs.size > 50) jobs.delete(jobs.keys().next().value); }
  return { getJob, getReviewState, reviewCreator, showNextCandidate, startSyncAll, syncCreator };
}

function createReviewState(sourceEntries = [], rejectedVideoUrls = []) {
  const rejectedUrls = new Set(rejectedVideoUrls || []);
  const entries = sourceEntries.map(normalizeReviewEntry).filter((entry) => entry.url && entry.uploadDate);
  const preferred = entries.find((entry) => !rejectedUrls.has(entry.url) && entry.match.matched);
  const ordered = preferred ? [preferred, ...entries.filter((entry) => entry.url !== preferred.url)] : entries;
  const state = {
    sourceEntries,
    entries: ordered,
    cursor: 0,
    rejectedUrls,
    skippedUrls: new Set(),
    checkedUrls: new Set(ordered.filter((entry) => rejectedUrls.has(entry.url)).map((entry) => entry.url)),
    status: "ready",
  };
  moveToAvailableCandidate(state);
  return state;
}

function normalizeReviewEntry(entry) {
  return {
    title: String(entry.title || "Untitled video"),
    url: getSafeYouTubeVideoUrl(entry.url),
    uploadDate: String(entry.published || "").slice(0, 10),
    match: matchNsapContent(entry),
  };
}

function getSafeYouTubeVideoUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && ["youtube.com", "www.youtube.com", "youtu.be"].includes(host) ? url.href : "";
  } catch {
    return "";
  }
}

function getCurrentCandidate(state) {
  if (!state || state.status !== "ready") return null;
  return state.entries[state.cursor] || null;
}

function advanceReviewState(state) {
  state.cursor += 1;
  moveToAvailableCandidate(state);
}

function moveToAvailableCandidate(state) {
  while (state.cursor < state.entries.length) {
    const url = state.entries[state.cursor].url;
    if (!state.rejectedUrls.has(url) && !state.skippedUrls.has(url)) break;
    state.cursor += 1;
  }
  state.status = state.cursor < state.entries.length ? "ready" : "exhausted";
}

function toPublicReviewState(state) {
  const current = getCurrentCandidate(state);
  const candidate = current ? {
    title: current.title,
    url: current.url,
    uploadDate: current.uploadDate,
    matchReason: current.match.reason,
    index: state.cursor + 1,
    total: state.entries.length,
  } : null;
  return {
    status: state?.status || "not_loaded",
    candidate,
    hasNextCandidate: Boolean(current && state.entries.slice(state.cursor + 1).some((entry) => !state.rejectedUrls.has(entry.url) && !state.skippedUrls.has(entry.url))),
    checkedCount: state?.checkedUrls?.size || 0,
  };
}

function emptyReviewState(status) {
  return { status, candidate: null, hasNextCandidate: false, checkedCount: 0 };
}

function throwHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function reconcileNsapResult(creator, upload) {
  const general = {
    latestChannelUploadDate: upload.latestChannelUploadDate,
    latestChannelVideoTitle: upload.latestChannelVideoTitle,
    latestChannelVideoUrl: upload.latestChannelVideoUrl,
  };
  const manualDecision = isManualDecision(creator.nsapMatchStatus);
  const decisionDate = creator.nsapDecisionVideoUploadDate || "";
  const hasNewerMatch = upload.nsapMatchStatus === "matched"
    && (!manualDecision || !decisionDate || upload.latestNsapUploadDate > decisionDate);

  if (hasNewerMatch) {
    return {
      ...general,
      latestNsapUploadDate: upload.latestNsapUploadDate,
      latestNsapVideoTitle: upload.latestNsapVideoTitle,
      latestNsapVideoUrl: upload.latestNsapVideoUrl,
      nsapMatchStatus: "matched",
      nsapMatchReason: upload.nsapMatchReason,
      nsapMatchedKeyword: upload.nsapMatchedKeyword,
      nsapDecisionVideoTitle: "",
      nsapDecisionVideoUrl: "",
      nsapDecisionVideoUploadDate: "",
      nsapDecisionActor: "",
      nsapDecisionAt: "",
    };
  }

  if (manualDecision) {
    return {
      ...general,
      latestNsapUploadDate: creator.latestNsapUploadDate || "",
      latestNsapVideoTitle: creator.latestNsapVideoTitle || "",
      latestNsapVideoUrl: creator.latestNsapVideoUrl || "",
      nsapMatchStatus: creator.nsapMatchStatus,
      nsapMatchReason: creator.nsapMatchReason,
      nsapMatchedKeyword: creator.nsapMatchedKeyword || "",
      nsapDecisionVideoTitle: creator.nsapDecisionVideoTitle || "",
      nsapDecisionVideoUrl: creator.nsapDecisionVideoUrl || "",
      nsapDecisionVideoUploadDate: decisionDate,
      nsapDecisionActor: creator.nsapDecisionActor || "",
      nsapDecisionAt: creator.nsapDecisionAt || "",
    };
  }

  return {
    ...general,
    latestNsapUploadDate: upload.nsapMatchStatus === "matched" ? upload.latestNsapUploadDate : creator.latestNsapUploadDate || "",
    latestNsapVideoTitle: upload.nsapMatchStatus === "matched" ? upload.latestNsapVideoTitle : creator.latestNsapVideoTitle || "",
    latestNsapVideoUrl: upload.nsapMatchStatus === "matched" ? upload.latestNsapVideoUrl : creator.latestNsapVideoUrl || "",
    nsapMatchStatus: upload.nsapMatchStatus,
    nsapMatchReason: upload.nsapMatchReason,
    nsapMatchedKeyword: upload.nsapMatchedKeyword,
  };
}

function isManualDecision(status) {
  return status === NSAP_REVIEW_DECISION.CONFIRM || status === NSAP_REVIEW_DECISION.REJECT;
}

function normalizeSyncError(error) {
  if (!(error instanceof YouTubeSyncError)) return { status: "failed", message: "YouTube sync failed." };
  if (error.code === "manual") return { status: "manual", message: error.message };
  if (error.code === "channel_not_found") return { status: "channel_not_found", message: error.message };
  return { status: "failed", message: error.message };
}

module.exports = { TaskQueue, createYouTubeSyncManager, normalizeSyncError, reconcileNsapResult, __testing: { createReviewState, toPublicReviewState } };
