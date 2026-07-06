import { daysSinceUpload, uploadAgeLabel, uploadAgeTone } from "./dates.js";
import { escapeHtml, safeUrl, toKebab } from "./format.js";

const labelTone = {
  Active: "good",
  Inactive: "bad",
  "On Break": "watch",
  High: "bad",
  Medium: "watch",
  Low: "good",
  Yes: "good",
  No: "muted",
};

export function getInitials(name) {
  const compactParts = String(name ?? "")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (compactParts.length > 1) {
    return compactParts.map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  }

  return String(name ?? "N").replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "N";
}

export function renderAvatar(creator, size = "") {
  const className = size ? `avatar avatar-${size}` : "avatar";
  const avatarUrl = safeUrl(creator.avatar);

  if (avatarUrl) {
    return `<img class="${className}" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(creator.name)} avatar" loading="lazy" />`;
  }

  return `<span class="${className}">${escapeHtml(getInitials(creator.name))}</span>`;
}

export function renderBadge(label, type = label) {
  const tone = labelTone[label] ?? toKebab(type);
  return `<span class="badge badge-${toKebab(type)} badge-tone-${tone}"><span class="badge-dot"></span>${escapeHtml(label)}</span>`;
}

export function getUploadHealth(creator) {
  const days = daysSinceUpload(creator.lastUploadDate);
  const tone = uploadAgeTone(days);
  const label = tone === "good" ? "Healthy" : tone === "watch" ? "Watch" : tone === "bad" ? "Needs Follow-up" : "Unknown";

  return {
    days,
    tone,
    label,
    date: creator.lastUploadDate || "Unknown",
    age: uploadAgeLabel(days),
  };
}

export function renderUploadHealth(creator) {
  const health = getUploadHealth(creator);
  return `
    <span class="upload-health">
      <strong>${escapeHtml(health.date)}</strong>
      <small>${escapeHtml(health.age)}</small>
      <b class="age age-${health.tone}">${escapeHtml(health.label)}</b>
    </span>
  `;
}
