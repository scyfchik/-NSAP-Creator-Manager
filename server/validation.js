const editableFields = require("./permissions").editableFields;

const MAX_CREATORS_IMPORT = 5000;
const MAX_HISTORY_ITEMS = 50;
const MAX_TIMELINE_ITEMS = 500;
const timelineTypes = new Set([
  "created",
  "note",
  "reminder_sent",
  "status_changed",
  "priority_changed",
  "followup_set",
  "reply_received",
  "collab_posted",
  "custom",
]);
const profileFields = new Set([
  "name",
  "discordUsername",
  "discordId",
  "youtubeUrl",
  "tiktokUrl",
  "twitchUrl",
  "twitterUrl",
  "robloxUsername",
  "status",
  "priority",
  "category",
  "notes",
  "quickNote",
  "followUpDate",
  "lastUploadDate",
  "collabPosted",
  "dmSent",
]);

const fieldValidators = {
  status(value) {
    return ["Active", "Inactive", "On Break"].includes(value);
  },
  priority(value) {
    return ["High", "Medium", "Low"].includes(value);
  },
  dmSent(value) {
    return ["Yes", "No"].includes(value);
  },
  collabPosted(value) {
    return ["Yes", "No"].includes(value);
  },
  notes(value) {
    return typeof value === "string" && sanitizeText(value, 2000).length <= 2000;
  },
  quickNote(value) {
    return typeof value === "string" && sanitizeText(value, 240).length <= 240;
  },
  followUpDate(value) {
    return value === "" || isDateLike(value);
  },
  lastContent(value) {
    return typeof value === "string" && sanitizeText(value, 240).length <= 240;
  },
  lastUploadDate(value) {
    return isDateLike(value);
  },
  followUp(value) {
    return ["Yes", "No"].includes(value);
  },
  deadline(value) {
    return value === "" || isDateLike(value);
  },
  response(value) {
    return typeof value === "string" && sanitizeText(value, 1000).length <= 1000;
  },
  category(value) {
    return typeof value === "string" && sanitizeText(value, 80).length <= 80;
  },
};

function validateEdit(field, value) {
  if (!editableFields.has(field)) {
    return {
      ok: false,
      message: "This field cannot be edited through the API.",
    };
  }

  if (!fieldValidators[field]?.(value)) {
    return {
      ok: false,
      message: `Invalid value for ${field}.`,
    };
  }

  return {
    ok: true,
    value: sanitizeEditValue(field, value),
  };
}

function normalizeCreator(creator, index) {
  if (!creator || typeof creator !== "object") {
    throw new Error(`Creator ${index + 1} must be an object.`);
  }

  if (!creator.name || !creator.platform) {
    throw new Error(`Creator ${index + 1} needs name and platform.`);
  }

  return {
    id: sanitizeId(creator.id || createStableId(creator, index), index),
    name: sanitizeText(creator.name, 160),
    platform: sanitizeText(creator.platform, 80),
    channel: sanitizeText(creator.channel || "", 160),
    url: sanitizeUrl(creator.url || ""),
    avatar: sanitizeUrl(creator.avatar || ""),
    status: validOption(creator.status, ["Active", "Inactive", "On Break"], "Inactive"),
    priority: validOption(creator.priority, ["High", "Medium", "Low"], "Medium"),
    category: sanitizeText(creator.category || "Content Creator", 80),
    quickNote: sanitizeText(creator.quickNote || creator.quick_note || "", 240),
    followUpDate: sanitizeText(creator.followUpDate || creator.follow_up_date || "", 32),
    discordUsername: sanitizeText(creator.discordUsername || creator.discord_username || "", 80),
    discordId: sanitizeDiscordId(creator.discordId || creator.discord_id || ""),
    robloxUsername: sanitizeText(creator.robloxUsername || creator.roblox_username || "", 80),
    youtubeUrl: sanitizeUrl(creator.youtubeUrl || creator.youtube_url || ""),
    tiktokUrl: sanitizeUrl(creator.tiktokUrl || creator.tiktok_url || ""),
    twitchUrl: sanitizeUrl(creator.twitchUrl || creator.twitch_url || ""),
    twitterUrl: sanitizeUrl(creator.twitterUrl || creator.twitter_url || ""),
    lastContent: sanitizeText(creator.lastContent || "", 240),
    lastUploadDate: sanitizeText(creator.lastUploadDate || creator.lastUpload || creator.last_upload || "", 32),
    collabPosted: validOption(creator.collabPosted, ["Yes", "No"], "No"),
    dmSent: validOption(creator.dmSent, ["Yes", "No"], "No"),
    response: sanitizeText(creator.response || "", 1000),
    deadline: sanitizeText(creator.deadline || "", 32),
    followUp: validOption(creator.followUp, ["Yes", "No"], "No"),
    notes: sanitizeText(creator.notes || "", 2000),
    subscriberCount: nullableNumber(creator.subscriberCount),
    views: nullableNumber(creator.views),
    averageViews: nullableNumber(creator.averageViews),
    latestVideo: creator.latestVideo ? sanitizeText(creator.latestVideo, 500) : null,
    latestVideoTitle: sanitizeText(creator.latestVideoTitle || creator.latest_video_title || "", 500),
    latestVideoUrl: sanitizeUrl(creator.latestVideoUrl || creator.latest_video_url || ""),
    lastSync: sanitizeText(creator.lastSync || creator.last_sync || "", 40),
    syncStatus: sanitizeText(creator.syncStatus || creator.sync_status || "", 40),
    syncError: sanitizeText(creator.syncError || creator.sync_error || "", 500),
    riskLevel: creator.riskLevel ? sanitizeText(creator.riskLevel, 80) : null,
    estimatedReach: nullableNumber(creator.estimatedReach),
    deleted: Boolean(creator.deleted),
    deletedAt: sanitizeText(creator.deletedAt || creator.deleted_at || "", 32),
    createdAt: sanitizeText(creator.createdAt || creator.created_at || "", 32),
    updatedAt: sanitizeText(creator.updatedAt || creator.updated_at || "", 32),
    history: normalizeHistory(creator.history),
    timeline: normalizeTimeline(creator.timeline),
  };
}

function validateCreatorPayload(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.creators;
  if (!Array.isArray(rows)) {
    throw new Error("JSON must contain a creators array.");
  }

  if (rows.length > MAX_CREATORS_IMPORT) {
    throw new Error(`JSON cannot contain more than ${MAX_CREATORS_IMPORT} creators.`);
  }

  return rows.map(normalizeCreator);
}

function validateNewCreator(payload) {
  const now = new Date().toISOString();
  const name = sanitizeText(payload?.name || "", 160);
  if (!name) {
    throwRequestError("Creator Name is required.", 400);
  }

  validateUrlInput(payload?.youtubeUrl, "YouTube URL");
  validateUrlInput(payload?.tiktokUrl, "TikTok URL");
  validateUrlInput(payload?.twitchUrl, "Twitch URL");
  validateUrlInput(payload?.twitterUrl, "X/Twitter URL");

  if (payload?.followUpDate && !isDateLike(payload.followUpDate)) {
    throwRequestError("Follow-up date must use YYYY-MM-DD.", 400);
  }

  const creator = normalizeCreator({
    ...payload,
    name,
    platform: detectPrimaryPlatform(payload),
    channel: payload?.discordUsername || payload?.robloxUsername || name,
    status: payload?.status || "Active",
    priority: payload?.priority || "Medium",
    category: payload?.category || "Content Creator",
    collabPosted: "No",
    dmSent: "No",
    followUp: payload?.followUpDate ? "Yes" : "No",
    createdAt: now,
    updatedAt: now,
    history: [],
  }, 0);

  creator.id = createStableId({ channel: creator.name, name: creator.name }, 0);
  creator.timeline = [
    normalizeTimelineEntry({
      type: "created",
      message: "Creator added.",
      timestamp: now,
    }),
  ];

  return creator;
}

function validateProfileUpdate(payload) {
  if (!payload || typeof payload !== "object") {
    throwRequestError("Profile payload must be an object.", 400);
  }

  const updates = {};
  Object.entries(payload).forEach(([field, value]) => {
    if (!profileFields.has(field)) {
      return;
    }

    updates[field] = sanitizeProfileValue(field, value);
  });

  if (Object.prototype.hasOwnProperty.call(updates, "name") && !updates.name) {
    throwRequestError("Creator Name is required.", 400);
  }

  return updates;
}

function normalizeTimelineEntry(entry, actor = null) {
  const type = timelineTypes.has(entry?.type) ? entry.type : "custom";
  const message = sanitizeText(entry?.message || "", 1000);
  if (!message) {
    throwRequestError("Timeline message is required.", 400);
  }

  return {
    timestamp: sanitizeText(entry?.timestamp || new Date().toISOString(), 40),
    actorDiscordId: sanitizeDiscordId(actor?.discord_id || entry?.actorDiscordId || ""),
    actorUsername: sanitizeText(actor?.username || entry?.actorUsername || "System", 120),
    actorRole: sanitizeText(actor?.role || entry?.actorRole || "system", 40),
    type,
    message,
  };
}

function validOption(value, options, fallback) {
  return options.includes(value) ? value : fallback;
}

function nullableNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeEditValue(field, value) {
  const limits = {
    lastContent: 240,
    response: 1000,
    notes: 2000,
    quickNote: 240,
    category: 80,
  };

  return typeof value === "string" ? sanitizeText(value, limits[field] || 80) : value;
}

function sanitizeProfileValue(field, value) {
  if (["youtubeUrl", "tiktokUrl", "twitchUrl", "twitterUrl"].includes(field)) {
    validateUrlInput(value, field);
    return sanitizeUrl(value || "");
  }

  if (field === "discordId") {
    return sanitizeDiscordId(value || "");
  }

  if (field === "status") {
    if (!["Active", "Inactive", "On Break"].includes(value)) {
      throwRequestError("Invalid value for status.", 400);
    }
    return value;
  }

  if (field === "priority") {
    if (!["High", "Medium", "Low"].includes(value)) {
      throwRequestError("Invalid value for priority.", 400);
    }
    return value;
  }

  if (field === "collabPosted" || field === "dmSent") {
    if (!["Yes", "No"].includes(value)) {
      throwRequestError(`Invalid value for ${field}.`, 400);
    }
    return value;
  }

  if (field === "followUpDate" || field === "lastUploadDate") {
    const date = sanitizeText(value || "", 32);
    if (date && !isDateLike(date)) {
      throwRequestError(`${field === "followUpDate" ? "Follow-up" : "Last upload"} date must be a valid YYYY-MM-DD date.`, 400);
    }
    return date;
  }

  const limits = {
    name: 160,
    discordUsername: 80,
    robloxUsername: 80,
    category: 80,
    quickNote: 240,
    notes: 2000,
  };

  return sanitizeText(value || "", limits[field] || 160);
}

function sanitizeDiscordId(value) {
  const text = sanitizeText(value || "", 32);
  return text && /^\d{5,32}$/.test(text) ? text : "";
}

function isDateLike(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function sanitizeText(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, maxLength)
    .trim();
}

function sanitizeUrl(value) {
  const text = sanitizeText(value, 2048);
  if (!text) {
    return "";
  }

  try {
    const parsed = new URL(text);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function validateUrlInput(value, label) {
  const text = sanitizeText(value || "", 2048);
  if (text && !sanitizeUrl(text)) {
    throwRequestError(`${label} must be a valid http or https URL.`, 400);
  }
}

function detectPrimaryPlatform(payload = {}) {
  if (payload.youtubeUrl) {
    return "YouTube";
  }
  if (payload.tiktokUrl) {
    return "TikTok";
  }
  if (payload.twitchUrl) {
    return "Twitch";
  }
  if (payload.twitterUrl) {
    return "X/Twitter";
  }
  return "Unknown";
}

function sanitizeId(value, index) {
  const id = sanitizeText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-|-$/g, "");

  return id || `creator-${index}`;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history.slice(0, MAX_HISTORY_ITEMS).map((item) => ({
    type: sanitizeText(item?.type || "Activity", 80),
    date: sanitizeText(item?.date || "", 32),
    note: sanitizeText(item?.note || "", 500),
  }));
}

function normalizeTimeline(timeline) {
  if (!Array.isArray(timeline)) {
    return [];
  }

  return timeline.slice(0, MAX_TIMELINE_ITEMS).map((entry) => normalizeTimelineEntry(entry));
}

function createStableId(creator, index) {
  return `${creator.channel || creator.name || "creator"}-${index}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `creator-${index}`;
}

function throwRequestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

module.exports = {
  MAX_CREATORS_IMPORT,
  normalizeCreator,
  normalizeTimelineEntry,
  sanitizeText,
  sanitizeUrl,
  validateCreatorPayload,
  validateEdit,
  validateNewCreator,
  validateProfileUpdate,
};
