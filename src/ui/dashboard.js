import { getCreatorStats, getPlatformDistribution } from "../utils/calculations.js";
import { daysSinceUpload, uploadAgeLabel, uploadAgeTone } from "../utils/dates.js";
import { renderAvatar } from "../utils/creatorVisuals.js";
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
  const syncFailures = creators.filter((creator) => ["failed", "channel_not_found"].includes(creator.syncStatus)).length;
  const manualUpdates = creators.filter((creator) => ["TikTok", "Twitch", "X", "X/Twitter"].includes(creator.platform)).length;
  const uploadsToday = creators.filter((creator) => creator.lastUploadDate === today).length;
  const inactiveUploads = creators.filter((creator) => (daysSinceUpload(creator.lastUploadDate) ?? 0) >= 31).length;
  const cards = [
    ["Total Creators", stats.total],
    ["Active Creators", stats.active],
    ["Need Follow-up", stats.followUp],
    ["Collaboration Missing", stats.collabMissing],
    ["Average Upload Age", stats.averageUploadAge === null ? "Unknown" : `${stats.averageUploadAge} days`],
    ["Creators Synced Today", syncedToday],
    ["Sync Failures", syncFailures],
    ["Needs Manual Update", manualUpdates],
    ["Uploads Today", uploadsToday],
    ["Inactive Uploads", inactiveUploads],
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
    container.innerHTML = `<p class="empty-state">No creator data loaded.</p>`;
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
    .filter((creator) => creator.followUp === "Yes" || creator.collabPosted !== "Yes" || (daysSinceUpload(creator.lastUploadDate) ?? 0) > 14)
    .sort((a, b) => (daysSinceUpload(b.lastUploadDate) ?? -1) - (daysSinceUpload(a.lastUploadDate) ?? -1))
    .slice(0, 6);

  const container = document.getElementById("attentionList");

  if (!attention.length) {
    container.innerHTML = `<p class="empty-state">No creators need attention right now.</p>`;
    return;
  }

  container.innerHTML = attention
    .map((creator) => {
      const days = daysSinceUpload(creator.lastUploadDate);
      return `
        <button class="attention-item" data-open-creator="${escapeHtml(creator.id)}" type="button">
          ${renderAvatar(creator)}
          <span>
            <strong>${escapeHtml(creator.name)}</strong>
            <small>${escapeHtml(creator.platform)} / ${escapeHtml(uploadAgeLabel(days))}</small>
          </span>
          <b class="age age-${uploadAgeTone(days)}">${escapeHtml(creator.priority)}</b>
        </button>
      `;
    })
    .join("");
}

function renderNotifications(creators) {
  const container = document.getElementById("notificationList");
  const notifications = getNotifications(creators).slice(0, 8);

  if (!notifications.length) {
    container.innerHTML = `<p class="empty-state">No notifications from current creator data.</p>`;
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
    const days = daysSinceUpload(creator.lastUploadDate);
    const items = [];

    if (days !== null && days <= 7) {
      items.push({
        creator,
        tone: "good",
        title: `${creator.name} uploaded recently.`,
        detail: `${uploadAgeLabel(days)} on ${creator.platform}.`,
      });
    }

    if (days !== null && days >= 15) {
      items.push({
        creator,
        tone: "bad",
        title: `${creator.name} needs follow-up.`,
        detail: `${uploadAgeLabel(days)} since last upload.`,
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
