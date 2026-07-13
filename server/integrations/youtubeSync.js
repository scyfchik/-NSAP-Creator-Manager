const crypto = require("node:crypto");
const db = require("../db");
const { createYouTubeClient, RequestThrottle, YouTubeSyncError } = require("./youtube");
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
      return dbApi.updateCreatorYouTubeSync({ creatorId, user, ip, result: { ...result, lastSync, syncStatus: "synced", syncError: "" } });
    } catch (error) {
      const normalized = normalizeSyncError(error);
      const manualStatus = isManualDecision(creator.nsapMatchStatus) ? creator.nsapMatchStatus : "";
      return dbApi.updateCreatorYouTubeSync({
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
    }
  }

  async function reviewCreator(creatorId, review, user, ip) {
    const creator = await dbApi.getCreator(creatorId);
    if (!creator || creator.deleted) return null;
    let automaticResult = null;
    if (review.decision !== NSAP_REVIEW_DECISION.CONFIRM) {
      const reviews = review.decision === NSAP_REVIEW_DECISION.CLEAR ? [] : await dbApi.getCreatorNsapReviews(creatorId);
      const excludedVideoUrls = review.decision === NSAP_REVIEW_DECISION.REJECT
        ? [...reviews.filter((item) => item.decision === NSAP_REVIEW_DECISION.REJECT).map((item) => item.video_url), review.videoUrl]
        : [];
      try {
        automaticResult = await client.syncCreator(creator, { excludedVideoUrls });
      } catch (error) {
        error.status = error.status || 502;
        throw error;
      }
    }
    return dbApi.updateCreatorNsapDecision({ creatorId, review, automaticResult, user, ip });
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
        if (!updated || !["synced", "manual"].includes(updated.syncStatus)) job.failed += 1;
      } catch { job.failed += 1; }
      job.completed += 1;
    }
    job.currentCreator = "";
    job.status = "completed";
    job.finishedAt = new Date().toISOString();
  }

  function getJob(id) { const job = jobs.get(id); return job ? { ...job } : null; }
  function pruneJobs() { while (jobs.size > 50) jobs.delete(jobs.keys().next().value); }
  return { getJob, reviewCreator, startSyncAll, syncCreator };
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

module.exports = { TaskQueue, createYouTubeSyncManager, normalizeSyncError, reconcileNsapResult };
