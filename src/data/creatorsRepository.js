import { api } from "./apiClient.js";

const SOURCE_URL = "data/creators.json";

export async function loadCreators() {
  const payload = await api.getCreators();
  return {
    creators: payload.creators.map(normalizeCreator),
    metadata: {},
    sourceUrl: "SQLite API",
  };
}

export async function loadSeedCreators() {
  const response = await fetch(SOURCE_URL);

  if (!response.ok) {
    throw new Error(`Unable to load ${SOURCE_URL}`);
  }

  const payload = await response.json();
  const creators = normalizePayload(payload);

  return {
    creators,
    metadata: Array.isArray(payload) ? {} : payload.metadata ?? {},
    sourceUrl: SOURCE_URL,
  };
}

export function normalizePayload(payload) {
  const rows = Array.isArray(payload) ? payload : payload.creators ?? [];
  return rows.map(normalizeCreator);
}

export function normalizeCreator(creator, index) {
  const id = creator.id || createStableId(creator, index);

  return {
    id,
    name: creator.name ?? "Unnamed Creator",
    platform: creator.platform ?? "Unknown",
    channel: creator.channel ?? "",
    url: creator.url ?? "",
    avatar: creator.avatar ?? "",
    status: creator.status ?? "Inactive",
    priority: creator.priority ?? "Medium",
    lastContent: creator.lastContent ?? "",
    lastUploadDate: creator.lastUploadDate ?? "",
    collabPosted: creator.collabPosted ?? "No",
    dmSent: creator.dmSent ?? "No",
    response: creator.response ?? "",
    deadline: creator.deadline ?? "",
    followUp: creator.followUp ?? "No",
    notes: creator.notes ?? "",
    quickNote: creator.quickNote ?? "",
    subscriberCount: creator.subscriberCount ?? null,
    views: creator.views ?? null,
    averageViews: creator.averageViews ?? null,
    latestVideo: creator.latestVideo ?? null,
    riskLevel: creator.riskLevel ?? null,
    estimatedReach: creator.estimatedReach ?? null,
    history: Array.isArray(creator.history) ? creator.history : [],
  };
}

export function validateCreatorPayload(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.creators;

  if (!Array.isArray(rows)) {
    return {
      ok: false,
      message: "JSON must contain a creators array.",
    };
  }

  const invalidIndex = rows.findIndex((creator) => !creator || typeof creator !== "object" || !creator.name || !creator.platform);
  if (invalidIndex !== -1) {
    return {
      ok: false,
      message: `Creator at row ${invalidIndex + 1} needs at least name and platform.`,
    };
  }

  return {
    ok: true,
    creators: normalizePayload(payload),
  };
}

function createStableId(creator, index = 0) {
  const source = `${creator.channel || creator.name || "creator"}-${index}`;
  return source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `creator-${index}`;
}
