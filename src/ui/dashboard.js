import { getCreatorStats, getPlatformDistribution } from "../utils/calculations.js";
import { daysSinceUpload, uploadAgeLabel, uploadAgeTone } from "../utils/dates.js";
import { getNsapHealth, renderAvatar } from "../utils/creatorVisuals.js";
import { t } from "../i18n/index.js";
import { escapeHtml } from "../utils/format.js";

export function renderDashboard(creators) {
  renderStats(creators);
  renderPlatformDistribution(creators);
  renderAttentionList(creators);
  renderNotifications(creators);
}

function renderStats(creators) {
  const stats = getCreatorStats(creators);
  const today = localDateKey(new Date());
  const syncedToday = creators.filter((creator) => creator.lastSync && localDateKey(new Date(creator.lastSync)) === today).length;
  const syncFailures = creators.filter((creator) => creator.nsapMatchStatus === "sync_failed" || ["failed", "channel_not_found"].includes(creator.syncStatus)).length;
  const nsapUploadsToday = creators.filter((creator) => creator.latestNsapUploadDate === today).length;
  const activeNsapCreators = creators.filter((creator) => getNsapHealth(creator).labelKey === "health.healthy").length;
  const noMatches = creators.filter((creator) => creator.nsapMatchStatus === "no_match").length;
  const manualReview = creators.filter((creator) => creator.nsapMatchStatus === "no_match" && creator.latestChannelVideoUrl).length;
  const cards = [
    [t("dashboard.totalCreators"), stats.total],
    [t("dashboard.activeNsapCreators"), activeNsapCreators],
    [t("dashboard.needFollowUp"), stats.followUp],
    [t("dashboard.collaborationMissing"), stats.collabMissing],
    [t("dashboard.averageUploadAge"), stats.averageUploadAge === null ? t("common.unknown") : t("date.uploadDaysAgo", { count: stats.averageUploadAge })],
    [t("dashboard.syncedToday"), syncedToday],
    [t("dashboard.nsapUploadsToday"), nsapUploadsToday],
    [t("dashboard.noMatching"), noMatches],
    [t("dashboard.manualReview"), manualReview],
    [t("dashboard.syncFailures"), syncFailures],
  ];

  document.getElementById("statsGrid").innerHTML = cards
    .map(([label, value]) => `
      <article class="stat-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </article>
    `)
    .join("");
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderPlatformDistribution(creators) {
  const distribution = getPlatformDistribution(creators);
  const container = document.getElementById("platformDistribution");

  if (!distribution.length) {
    container.innerHTML = `<p class="empty-state">${t("dashboard.noData")}</p>`;
    return;
  }

  container.innerHTML = distribution
    .map((item, index) => `
      <div class="platform-row">
        <div>
          <strong>${escapeHtml(item.platform)}</strong>
          <span>${item.count} creators</span>
        </div>
        <div class="meter" aria-label="${escapeHtml(item.platform)} ${item.percent}%">
          <span data-meter-index="${index}"></span>
        </div>
        <b>${item.percent}%</b>
      </div>
    `)
    .join("");

  distribution.forEach((item, index) => {
    container.querySelector(`[data-meter-index="${index}"]`).style.width = `${item.percent}%`;
  });
}

function renderAttentionList(creators) {
  const attention = [...creators]
    .filter((creator) => creator.followUp === "Yes" || creator.collabPosted !== "Yes" || (daysSinceUpload(creator.latestNsapUploadDate) ?? Infinity) > 14)
    .sort((a, b) => (daysSinceUpload(b.latestNsapUploadDate) ?? Infinity) - (daysSinceUpload(a.latestNsapUploadDate) ?? Infinity))
    .slice(0, 6);

  const container = document.getElementById("attentionList");

  if (!attention.length) {
    container.innerHTML = `<p class="empty-state">${t("dashboard.noAttention")}</p>`;
    return;
  }

  container.innerHTML = attention
    .map((creator) => {
      const health = getNsapHealth(creator);
      return `
        <button class="attention-item" data-open-creator="${escapeHtml(creator.id)}" type="button">
          ${renderAvatar(creator)}
          <span>
            <strong>${escapeHtml(creator.name)}</strong>
            <small>${escapeHtml(creator.platform)} / ${escapeHtml(health.label)}</small>
          </span>
          <b class="age age-${health.tone}">${escapeHtml(creator.priority)}</b>
        </button>
      `;
    })
    .join("");
}

function renderNotifications(creators) {
  const container = document.getElementById("notificationList");
  const notifications = getNotifications(creators).slice(0, 8);

  if (!notifications.length) {
    container.innerHTML = `<p class="empty-state">${t("dashboard.noNotifications")}</p>`;
    return;
  }

  container.innerHTML = notifications
    .map((notification) => `
      <button class="notification-item notification-${notification.tone}" data-open-creator="${escapeHtml(notification.creator.id)}" type="button">
        ${renderAvatar(notification.creator)}
        <span>
          <strong>${escapeHtml(notification.title)}</strong>
          <small>${escapeHtml(notification.detail)}</small>
        </span>
      </button>
    `)
    .join("");
}

function getNotifications(creators) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);

  return creators.flatMap((creator) => {
    const health = getNsapHealth(creator);
    const days = health.verified ? health.days : null;
    const items = [];

    if (days !== null && days <= 7) {
      items.push({
        creator,
        tone: "good",
        title: t("dashboard.uploadedRecently", { name: creator.name }),
        detail: `${uploadAgeLabel(days)} on ${creator.platform}.`,
      });
    }

    if (days !== null && days >= 15) {
      items.push({
        creator,
        tone: "bad",
        title: t("dashboard.needsFollowUpTitle", { name: creator.name }),
        detail: t("dashboard.sinceNsapUpload", { age: uploadAgeLabel(days) }),
      });
    }

    if (creator.deadline === tomorrowKey) {
      items.push({
        creator,
        tone: "watch",
        title: `${creator.name} has a reminder deadline tomorrow.`,
        detail: "Deadline is based on the saved creator record.",
      });
    }

    return items;
  });
}
