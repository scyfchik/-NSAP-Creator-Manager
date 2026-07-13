import { getLanguage, t } from "../i18n/index.js";

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
    return t("common.unknown");
  }

  if (days === 0) return t("date.today");
  if (days === 1) return t("date.yesterday");
  return t("date.uploadDaysAgo", { count: days });
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
  if (days === null) return t("common.unknown");
  if (days <= 14) return t("health.healthy");
  if (days <= 30) return t("health.warning");
  return t("health.inactive");
}

export function relativeSyncLabel(value, now = new Date()) {
  if (!value) return t("date.neverSynced");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("date.neverSynced");
  const minutes = Math.max(0, Math.floor((now - date) / 60000));
  if (minutes < 1) return t("date.justNow");
  if (minutes < 60) return t("date.minutesAgo", { count: minutes, suffix: minutes === 1 ? "" : "s" });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("date.hoursAgo", { count: hours, suffix: hours === 1 ? "" : "s" });
  const days = Math.floor(hours / 24);
  return t("date.daysAgo", { count: days, suffix: days === 1 ? "" : "s" });
}

export function formatLocalizedDate(value) {
  if (!value) return t("common.unknown");
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return t("common.unknown");
  return new Intl.DateTimeFormat(getLanguage() === "ru" ? "ru-RU" : "en-US", { dateStyle: "medium" }).format(date);
}

export function formatLocalizedDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("common.unknown");
  return new Intl.DateTimeFormat(getLanguage() === "ru" ? "ru-RU" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
