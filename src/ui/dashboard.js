import { getCreatorStats } from "../utils/calculations.js";
import { getNsapHealth, renderAvatar, renderBadge } from "../utils/creatorVisuals.js";
import { getLanguage, t } from "../i18n/index.js";
import { escapeHtml } from "../utils/format.js";

const ICONS = {
  creators: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  active: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  health: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z"/>',
  review: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  followup: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 8h8M8 12h5"/>',
  activity: '<path d="M4 19V9M10 19V5M16 19v-7M22 19V3"/>',
  sync: '<path d="M20 7h-4V3M4 17h4v4M20 7a8 8 0 0 0-14-3M4 17a8 8 0 0 0 14 3"/>',
  note: '<path d="M4 4h16v16H4zM8 9h8M8 13h6"/>',
};

export function renderDashboard(creators) {
  const models = creators.map((creator) => ({ creator, health: getNsapHealth(creator) }));
  renderStats(creators, models);
  renderCreatorActivity(creators);
  renderHealthDistribution(models);
  renderRecentActivity(creators);
  renderRecentCreators(models);
  renderTopCreators(models);
}

function renderStats(creators, models) {
  const stats = getCreatorStats(creators);
  const verifiedHealth = models.filter((item) => item.health.verified);
  const healthyVerified = verifiedHealth.filter((item) => item.health.tone === "good").length;
  const averageHealth = verifiedHealth.length
    ? `${healthyVerified} / ${verifiedHealth.length}`
    : t("common.unknown");
  const reviewCount = creators.filter(needsReview).length;
  const cards = [
    { label: t("dashboard.totalCreators"), value: stats.total, description: t("dashboard.totalCreatorsDescription"), icon: "creators", tone: "purple" },
    { label: t("dashboard.active"), value: creators.filter((creator) => creator.status === "Active").length, description: t("dashboard.activeDescription"), icon: "active", tone: "green" },
    { label: t("dashboard.averageHealth"), value: averageHealth, description: t("dashboard.averageHealthDescription"), icon: "health", tone: "blue" },
    { label: t("dashboard.needsReview"), value: reviewCount, description: t("dashboard.needsReviewDescription"), icon: "review", tone: "orange" },
    { label: t("dashboard.followUps"), value: stats.followUp, description: t("dashboard.followUpsDescription"), icon: "followup", tone: "red" },
  ];

  document.getElementById("statsGrid").innerHTML = cards.map((card) => `
    <article class="stat-card stat-${card.tone}">
      <div class="stat-card-head"><span>${escapeHtml(card.label)}</span>${icon(card.icon)}</div>
      <strong>${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.description)}</small>
    </article>
  `).join("");
}

function renderCreatorActivity(creators) {
  const container = document.getElementById("creatorActivityChart");
  const dates = lastSevenDays();
  const counts = dates.map(({ key }) => countActivityOnDate(creators, key));
  if (!counts.some(Boolean)) {
    container.innerHTML = emptyState("activity", t("dashboard.noActivityData"), t("dashboard.noActivityDataHint"));
    return;
  }

  const width = 760;
  const height = 220;
  const padX = 28;
  const padY = 24;
  const max = Math.max(...counts, 1);
  const points = counts.map((count, index) => {
    const x = padX + index * ((width - padX * 2) / Math.max(counts.length - 1, 1));
    const y = height - padY - (count / max) * (height - padY * 2);
    return { x, y, count };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padX},${height - padY} ${line} ${width - padX},${height - padY}`;
  container.innerHTML = `
    <div class="line-chart" role="img" aria-label="${escapeHtml(t("dashboard.activityChartLabel", { count: counts.reduce((sum, count) => sum + count, 0) }))}">
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="activityArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b5cf6" stop-opacity=".3"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></linearGradient></defs>
        <path class="chart-grid-line" d="M${padX} ${height * .25}H${width - padX}M${padX} ${height * .5}H${width - padX}M${padX} ${height * .75}H${width - padX}"/>
        <polygon class="chart-area" points="${area}"/>
        <polyline class="chart-line" points="${line}"/>
        ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4"><title>${point.count}</title></circle>`).join("")}
      </svg>
      <div class="chart-labels">${dates.map(({ label }) => `<span>${escapeHtml(label)}</span>`).join("")}</div>
    </div>`;
}

function renderHealthDistribution(models) {
  const container = document.getElementById("healthDistribution");
  const verified = models.filter((item) => item.health.verified);
  if (!verified.length) {
    container.innerHTML = emptyState("health", t("dashboard.noHealthData"), t("dashboard.noHealthDataHint"));
    return;
  }

  const bands = [
    { label: t("health.healthy"), count: verified.filter((item) => item.health.tone === "good").length, color: "#22c55e" },
    { label: t("health.warning"), count: verified.filter((item) => item.health.tone === "watch").length, color: "#f59e0b" },
    { label: t("health.inactive"), count: verified.filter((item) => item.health.tone === "bad").length, color: "#ef4444" },
  ];
  let cursor = 0;
  const stops = bands.map((band) => {
    const start = cursor;
    cursor += (band.count / verified.length) * 100;
    return `${band.color} ${start}% ${cursor}%`;
  }).join(",");
  container.innerHTML = `
    <div class="health-visual"><div class="health-donut" style="--health-segments:conic-gradient(${stops})"><div><strong>${verified.length}</strong><span>${escapeHtml(t("dashboard.creators"))}</span></div></div></div>
    <div class="health-legend">${bands.map((band) => `<div><span class="legend-dot" style="--dot:${band.color}"></span><span>${escapeHtml(band.label)}</span><strong>${band.count}</strong></div>`).join("")}</div>`;
}

function renderRecentActivity(creators) {
  const container = document.getElementById("recentActivity");
  const activity = creators.flatMap((creator) => [
    ...(creator.timeline || []).map((item) => ({ creator, type: item.type || "note", text: item.message, date: item.timestamp })),
    ...(creator.history || []).map((item) => ({ creator, type: item.type || "activity", text: item.note || item.type, date: item.date })),
  ]).filter((item) => item.date && item.text).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

  if (!activity.length) {
    container.innerHTML = emptyState("activity", t("dashboard.noRecentActivity"), t("dashboard.noRecentActivityHint"));
    return;
  }
  container.innerHTML = `<div class="activity-feed">${activity.map((item) => `
    <button type="button" class="activity-feed-item" data-open-creator="${escapeHtml(item.creator.id)}">
      <span class="activity-feed-icon">${icon(activityIcon(item.type))}</span>
      <span><strong>${escapeHtml(item.text)}</strong><small>${escapeHtml(item.creator.name)} · ${escapeHtml(formatDate(item.date))}</small></span>
    </button>`).join("")}</div>`;
}

function renderRecentCreators(models) {
  const container = document.getElementById("recentCreators");
  const rows = [...models].sort((a, b) => latestTimestamp(b.creator) - latestTimestamp(a.creator)).slice(0, 7);
  if (!rows.length) {
    container.innerHTML = emptyState("creators", t("dashboard.noData"), t("dashboard.noCreatorsHint"));
    return;
  }
  container.innerHTML = `
    <div class="dashboard-table" role="table">
      <div class="dashboard-table-row dashboard-table-head" role="row"><span>${escapeHtml(t("table.creator"))}</span><span>${escapeHtml(t("table.platform"))}</span><span>${escapeHtml(t("table.health"))}</span><span>${escapeHtml(t("table.lastContent"))}</span><span>${escapeHtml(t("table.activity"))}</span><span>${escapeHtml(t("table.status"))}</span><span class="align-right">${escapeHtml(t("table.actions"))}</span></div>
      ${rows.map(({ creator, health }) => `
        <div class="dashboard-table-row" role="row">
          <button class="dashboard-creator-cell" data-open-creator="${escapeHtml(creator.id)}" type="button">${renderAvatar(creator)}<span><strong>${escapeHtml(creator.name)}</strong><small>${escapeHtml(creator.channel || creator.category)}</small></span></button>
          <span>${platformBadge(creator.platform)}</span>
          <span class="health-cell"><span><b>${escapeHtml(health.label)}</b><small>${escapeHtml(health.age)}</small></span><span class="health-track health-track-${health.tone}"><i></i></span></span>
          <span class="truncate-cell">${escapeHtml(creator.latestNsapVideoTitle || creator.lastContent || t("common.unknown"))}</span>
          <span>${escapeHtml(formatDate(latestDate(creator)))}</span>
          <span>${renderBadge(creator.status)}</span>
          <span class="align-right"><button class="icon-button row-action" data-open-creator="${escapeHtml(creator.id)}" type="button" aria-label="${escapeHtml(t("dashboard.openCreator", { name: creator.name }))}" title="${escapeHtml(t("dashboard.openProfile"))}">${icon("dots")}</button></span>
        </div>`).join("")}
    </div>`;
}

function renderTopCreators(models) {
  const container = document.getElementById("topCreators");
  const rows = models.filter((item) => item.health.verified).sort((a, b) => a.health.days - b.health.days || a.creator.name.localeCompare(b.creator.name)).slice(0, 5);
  if (!rows.length) {
    container.innerHTML = emptyState("health", t("dashboard.noHealthData"), t("dashboard.noHealthDataHint"));
    return;
  }
  container.innerHTML = `<div class="top-creators-list">${rows.map(({ creator, health }, index) => `
    <button class="top-creator" data-open-creator="${escapeHtml(creator.id)}" type="button">
      <span class="creator-rank">${index + 1}</span>${renderAvatar(creator)}
      <span class="top-creator-copy"><strong>${escapeHtml(creator.name)}</strong><small>${escapeHtml(creator.platform)}</small><span class="health-track health-track-${health.tone}"><i></i></span></span>
      <b>${escapeHtml(health.age)}</b>
    </button>`).join("")}</div>`;
}

function needsReview(creator) {
  return creator.nsapMatchStatus === "no_match" && Boolean(creator.latestChannelVideoUrl)
    || !creator.nsapMatchStatus
    || creator.nsapMatchStatus === "sync_failed";
}

function countActivityOnDate(creators, dateKey) {
  return creators.reduce((total, creator) => total
    + (creator.timeline || []).filter((item) => dateKeyOf(item.timestamp) === dateKey).length
    + (creator.history || []).filter((item) => dateKeyOf(item.date) === dateKey).length, 0);
}

function lastSevenDays() {
  const formatter = new Intl.DateTimeFormat(getLanguage(), { weekday: "short" });
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - 6 + index);
    return { key: dateKeyOf(date), label: formatter.format(date) };
  });
}

function latestDate(creator) {
  return [creator.lastSync, creator.latestNsapUploadDate, creator.timeline?.[0]?.timestamp, creator.history?.[0]?.date].filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || "";
}

function latestTimestamp(creator) {
  const value = latestDate(creator);
  return value ? new Date(value).getTime() || 0 : 0;
}

function dateKeyOf(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return t("common.unknown");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("common.unknown");
  return new Intl.DateTimeFormat(getLanguage(), { day: "numeric", month: "short" }).format(date);
}

function activityIcon(type) {
  return /sync/i.test(type) ? "sync" : /update|activity/i.test(type) ? "activity" : "note";
}

function platformBadge(platform) {
  const label = escapeHtml(platform || t("common.unknown"));
  return `<span class="platform-badge platform-${String(platform || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-")}"><span>${label.slice(0, 1)}</span>${label}</span>`;
}

function emptyState(iconName, title, description) {
  return `<div class="dashboard-empty">${icon(iconName)}<strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div>`;
}

function icon(name) {
  if (name === "dots") return '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>';
  return `<svg aria-hidden="true" viewBox="0 0 24 24">${ICONS[name] || ICONS.activity}</svg>`;
}
