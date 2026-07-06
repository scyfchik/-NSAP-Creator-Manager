import { daysSinceUpload } from "./dates.js";

export function getCreatorStats(creators) {
  const uploadAges = creators
    .map((creator) => daysSinceUpload(creator.lastUploadDate))
    .filter((days) => days !== null);

  const totalUploadAge = uploadAges.reduce((sum, days) => sum + days, 0);
  const averageUploadAge = uploadAges.length
    ? Math.round(totalUploadAge / uploadAges.length)
    : null;

  return {
    total: creators.length,
    active: creators.filter((creator) => creator.status === "Active").length,
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
