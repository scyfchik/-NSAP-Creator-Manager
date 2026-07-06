export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatOptional(value, fallback = "Not tracked") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

export function formatNumber(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Not tracked";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

export function toKebab(value) {
  return String(value ?? "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";
}

export function safeUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
