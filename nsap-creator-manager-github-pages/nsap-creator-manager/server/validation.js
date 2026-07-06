const editableFields = require("./permissions").editableFields;

const MAX_CREATORS_IMPORT = 5000;
const MAX_HISTORY_ITEMS = 50;

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
    lastContent: sanitizeText(creator.lastContent || "", 240),
    lastUploadDate: sanitizeText(creator.lastUploadDate || "", 32),
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
    riskLevel: creator.riskLevel ? sanitizeText(creator.riskLevel, 80) : null,
    estimatedReach: nullableNumber(creator.estimatedReach),
    history: normalizeHistory(creator.history),
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
  };

  return typeof value === "string" ? sanitizeText(value, limits[field] || 80) : value;
}

function isDateLike(value) {
  return typeof value === "string" && (value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value));
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

function createStableId(creator, index) {
  return `${creator.channel || creator.name || "creator"}-${index}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `creator-${index}`;
}

module.exports = {
  MAX_CREATORS_IMPORT,
  normalizeCreator,
  sanitizeText,
  sanitizeUrl,
  validateCreatorPayload,
  validateEdit,
};
