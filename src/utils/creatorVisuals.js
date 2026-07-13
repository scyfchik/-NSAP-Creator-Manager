import { daysSinceUpload, uploadAgeLabel, uploadAgeTone } from "./dates.js";
import { t } from "../i18n/index.js";
import { escapeHtml, safeUrl, toKebab } from "./format.js";
import { NSAP_REVIEW_DECISION } from "../constants/nsapReview.js";

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
  const translated = t(`value.${label}`);
  return `<span class="badge badge-${toKebab(type)} badge-tone-${tone}"><span class="badge-dot"></span>${escapeHtml(translated === `value.${label}` ? label : translated)}</span>`;
}

export function getNsapHealth(creator) {
  const status = creator.nsapMatchStatus;
  if (status === "sync_failed") return healthResult("bad", "health.syncFailed");
  if (status === NSAP_REVIEW_DECISION.REJECT || !status) return healthResult("watch", "health.manualReview");
  if (["no_match", "unsupported"].includes(status)) return healthResult("unknown", "health.noContent");
  if (!["matched", NSAP_REVIEW_DECISION.CONFIRM].includes(status)) return healthResult("watch", "health.manualReview");

  const days = daysSinceUpload(creator.latestNsapUploadDate);
  if (days === null) return healthResult("unknown", "health.noContent");
  const tone = uploadAgeTone(days);
  const labelKey = tone === "good" ? "health.healthy" : tone === "watch" ? "health.warning" : "health.inactive";

  return {
    days,
    tone,
    labelKey,
    label: t(labelKey),
    date: creator.latestNsapUploadDate || "Unknown",
    age: uploadAgeLabel(days),
    verified: true,
  };
}

export function renderUploadHealth(creator) {
  const health = getNsapHealth(creator);
  return `
    <span class="upload-health">
      <strong>${escapeHtml(health.date)}</strong>
      <small>${escapeHtml(health.age)}</small>
      <b class="age age-${health.tone}">${escapeHtml(health.label)}</b>
    </span>
  `;
}

function healthResult(tone, labelKey) {
  return { days: null, tone, labelKey, label: t(labelKey), date: t("common.unknown"), age: t("common.unknown"), verified: false };
}
