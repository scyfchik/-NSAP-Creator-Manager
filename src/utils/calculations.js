import { daysSinceUpload } from "./dates.js";

export function isFollowUpDue(dateValue, now = new Date()) {
  const followUpDate = parseLocalDate(dateValue);
  if (!followUpDate) {
    return false;
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return followUpDate <= today;
}

export function getCreatorStats(creators) {
  const uploadAges = creators
    .filter((creator) => ["matched", "manual_confirmed"].includes(creator.nsapMatchStatus))
    .map((creator) => daysSinceUpload(creator.latestNsapUploadDate))
    .filter((days) => days !== null);

  const totalUploadAge = uploadAges.reduce((sum, days) => sum + days, 0);
  const averageUploadAge = uploadAges.length
    ? Math.round(totalUploadAge / uploadAges.length)
    : null;

  return {
    total: creators.length,
    active: creators.filter((creator) => ["matched", "manual_confirmed"].includes(creator.nsapMatchStatus) && (daysSinceUpload(creator.latestNsapUploadDate) ?? Infinity) <= 14).length,
    followUp: creators.filter((creator) => creator.followUp === "Yes").length,
    collabMissing: creators.filter((creator) => creator.collabPosted !== "Yes").length,
    averageUploadAge,
  };
}

export function getPlatformDistribution(creators) {
  const counts = creators.reduce((acc, creator) => {
    acc[creator.platform] = (acc[creator.platform] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([platform, count]) => ({
      platform,
      count,
      percent: creators.length ? Math.round((count / creators.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.platform.localeCompare(b.platform));
}

export function getOptions(creators, field) {
  return [...new Set(creators.map((creator) => creator[field]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function parseLocalDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const dateText = String(value).trim();
  if (!dateText) {
    return null;
  }

  const dateOnly = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly.map(Number);
    const localDate = new Date(year, month - 1, day);

    if (
      localDate.getFullYear() !== year ||
      localDate.getMonth() !== month - 1 ||
      localDate.getDate() !== day
    ) {
      return null;
    }

    return localDate;
  }

  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}
