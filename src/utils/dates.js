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

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export function uploadAgeTone(days) {
  if (days === null) {
    return "unknown";
  }

  if (days <= 14) {
    return "good";
  }

  if (days <= 30) {
    return "watch";
  }

  return "bad";
}

export function uploadHealthLabel(days) {
  if (days === null) return "Unknown";
  if (days <= 14) return "Healthy";
  if (days <= 30) return "Warning";
  return "Inactive";
}

export function relativeSyncLabel(value, now = new Date()) {
  if (!value) return "Never synced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never synced";
  const minutes = Math.max(0, Math.floor((now - date) / 60000));
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
