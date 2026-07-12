const crypto = require("node:crypto");
const db = require("../db");
const { createYouTubeClient, RequestThrottle, YouTubeSyncError } = require("./youtube");

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
      const upload = await client.syncCreator(creator);
      return dbApi.updateCreatorYouTubeSync({ creatorId, user, ip, result: { ...upload, lastSync, syncStatus: "synced", syncError: "" } });
    } catch (error) {
      const normalized = normalizeSyncError(error);
      return dbApi.updateCreatorYouTubeSync({ creatorId, user, ip, result: { lastSync, syncStatus: normalized.status, syncError: normalized.message } });
    }
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
  return { getJob, startSyncAll, syncCreator };
}

function normalizeSyncError(error) {
  if (!(error instanceof YouTubeSyncError)) return { status: "failed", message: "YouTube sync failed." };
  if (error.code === "manual") return { status: "manual", message: error.message };
  if (error.code === "channel_not_found") return { status: "channel_not_found", message: error.message };
  return { status: "failed", message: error.message };
}

module.exports = { TaskQueue, createYouTubeSyncManager, normalizeSyncError };
