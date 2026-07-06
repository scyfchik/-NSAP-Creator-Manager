const DAY_MS = 86400000;

export function daysSinceUpload(dateValue, now = new Date()) {
  if (!dateValue) {
    return null;
  }

  const uploadDate = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(uploadDate.getTime())) {
    return null;
  }

  return Math.max(0, Math.floor((now - uploadDate) / DAY_MS));
}

export function uploadAgeLabel(days) {
  if (days === null) {
    return "Unknown";
  }

  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function uploadAgeTone(days) {
  if (days === null) {
    return "unknown";
  }

  if (days <= 7) {
    return "good";
  }

  if (days <= 14) {
    return "watch";
  }

  return "bad";
}
