import { daysSinceUpload, relativeSyncLabel, uploadAgeLabel, uploadAgeTone, uploadHealthLabel } from "../utils/dates.js";
import { renderAvatar, renderBadge } from "../utils/creatorVisuals.js";
import { escapeHtml, formatNumber, formatOptional, safeUrl } from "../utils/format.js";

export const reminderTemplates = {
  inactivity: {
    label: "Inactivity Check",
    timeline: "Copied inactivity reminder",
    build: (creator) => `Hey ${creator.name}!

Hope you've been doing well.

We noticed it's been a little while since your last upload, so I just wanted to check in and see how things are going.

No pressure at all - we completely understand that real life comes first. We just wanted to know if you're still interested in creating content for Night Shift at Paul's.

Even a quick reply is appreciated, whether you're still interested or taking a break.

Looking forward to hearing from you!

-# Lunyxzz | Creator Supervisor`,
  },
  followup: {
    label: "Follow-up",
    timeline: "Copied follow-up reminder",
    build: (creator) => `Hey ${creator.name}! Just following up on our last message. Are you still interested in creating Night Shift at Paul's content?`,
  },
  collab: {
    label: "Collab Reminder",
    timeline: "Copied collab reminder",
    build: (creator) => `Hey ${creator.name}! Quick reminder to post the collab content when you have a chance. Thank you for helping with Night Shift at Paul's.`,
  },
  update: {
    label: "Big Update Reminder",
    timeline: "Copied big update reminder",
    build: (creator) => `Hey ${creator.name}! Night Shift at Paul's has a big update coming up, and we'd love to see fresh content from you around it.`,
  },
  thanks: {
    label: "Thank You",
    timeline: "Copied thank-you message",
    build: (creator) => `Hey ${creator.name}! Thank you for supporting Night Shift at Paul's. We really appreciate the content and effort.`,
  },
  welcome: {
    label: "Welcome Creator",
    timeline: "Copied welcome message",
    build: (creator) => `Hey ${creator.name}! Welcome to the Night Shift at Paul's creator group. Excited to have you here.`,
  },
};

const profileFields = [
  ["name", "Creator Name", "text", true],
  ["discordUsername", "Discord Username", "text"],
  ["discordId", "Discord ID", "text"],
  ["youtubeUrl", "YouTube URL", "url"],
  ["tiktokUrl", "TikTok URL", "url"],
  ["twitchUrl", "Twitch URL", "url"],
  ["twitterUrl", "X/Twitter URL", "url"],
  ["robloxUsername", "Roblox Username", "text"],
  ["category", "Category", "text"],
  ["quickNote", "Quick Note", "text"],
  ["followUpDate", "Follow-up Date", "date"],
  ["lastUploadDate", "Last Upload", "date"],
  ["notes", "Notes", "textarea"],
];

export function openCreatorModal(creator, permissions = { canEdit: false }) {
  const dialog = document.getElementById("creatorDialog");
  renderCreatorDetails(creator, permissions);
  if (!dialog.open) {
    dialog.showModal();
  }
}

export function openAddCreatorModal() {
  document.getElementById("modalName").textContent = "Add Creator";
  document.getElementById("modalBody").innerHTML = `
    <section class="modal-section">
      <h4>Creator Profile</h4>
      <div class="modal-form notes-section" id="addCreatorForm">
        ${renderInput("name", "Creator Name", "", "text", true)}
        ${renderInput("discordUsername", "Discord Username")}
        ${renderInput("discordId", "Discord ID")}
        ${renderInput("youtubeUrl", "YouTube URL", "", "url")}
        ${renderInput("tiktokUrl", "TikTok URL", "", "url")}
        ${renderInput("twitchUrl", "Twitch URL", "", "url")}
        ${renderInput("twitterUrl", "X/Twitter URL", "", "url")}
        ${renderInput("robloxUsername", "Roblox Username")}
        ${renderSelect("status", "Status", "Active", ["Active", "Inactive", "On Break"])}
        ${renderSelect("priority", "Priority", "Medium", ["High", "Medium", "Low"])}
        ${renderInput("category", "Category", "Content Creator")}
        ${renderInput("quickNote", "Quick Note")}
        ${renderInput("followUpDate", "Follow-up Date", "", "date")}
        ${renderTextarea("notes", "Notes")}
      </div>
      <div class="button-row modal-actions-row">
        <button class="button button-secondary" data-cancel-add-creator type="button">Cancel</button>
        <button class="button button-primary" data-save-new-creator data-default-text="Create Creator" type="button" disabled>Create Creator</button>
      </div>
    </section>
  `;
  const dialog = document.getElementById("creatorDialog");
  if (!dialog.open) {
    dialog.showModal();
  }
}

export function renderCreatorDetails(creator, permissions = { canEdit: false }) {
  const days = daysSinceUpload(creator.latestNsapUploadDate);
  const channelUrl = getPrimaryChannelUrl(creator);
  const contactItems = renderContactItems(creator);
  const metricItems = renderMetricItems(creator);
  const latestNsapVideoUrl = getPlatformUrl(creator.latestNsapVideoUrl, ["youtube.com", "youtu.be"]);
  const latestChannelVideoUrl = getPlatformUrl(creator.latestChannelVideoUrl, ["youtube.com", "youtu.be"]);
  const canYouTubeSync = Boolean(creator.youtubeUrl || creator.platform === "YouTube");

  document.getElementById("modalName").textContent = creator.name;
  document.getElementById("modalBody").innerHTML = `
    <div class="modal-summary profile-summary">
      <div class="profile-chip">
        ${renderAvatar(creator, "large")}
        <div>
          <strong>${escapeHtml(creator.name)}</strong>
          ${creator.discordUsername ? `<span>${escapeHtml(creator.discordUsername)}</span>` : ""}
          <span>${escapeHtml([creator.platform || "Unknown", creator.category].filter(Boolean).join(" / "))}</span>
          <div class="profile-badges">
            ${renderBadge(creator.status, creator.status)}
            ${renderBadge(creator.priority, creator.priority)}
          </div>
        </div>
      </div>
      <div class="profile-actions">
        ${channelUrl ? `<a class="button button-primary" href="${escapeHtml(channelUrl)}" target="_blank" rel="noreferrer">Open Channel</a>` : `<button class="button button-secondary" type="button" disabled>No Channel</button>`}
        <button class="button button-secondary" data-copy-template="${escapeHtml(creator.id)}" type="button">Copy Reminder</button>
        ${permissions.canEdit ? `<button class="button button-secondary" data-mark-dm-sent="${escapeHtml(creator.id)}" type="button">Mark DM Sent</button>` : ""}
        ${permissions.canEdit ? `<button class="button button-secondary" data-edit-profile="${escapeHtml(creator.id)}" type="button">Edit Profile</button>` : ""}
        ${permissions.canEdit && canYouTubeSync ? `<button class="button button-secondary" data-sync-youtube="${escapeHtml(creator.id)}" type="button">Sync YouTube</button>` : ""}
        ${permissions.canEdit && latestChannelVideoUrl ? `<button class="button button-secondary" data-nsap-decision="confirmed" data-creator-id="${escapeHtml(creator.id)}" type="button">Mark as NSAP Content</button>` : ""}
        ${permissions.canEdit && latestChannelVideoUrl ? `<button class="button button-secondary" data-nsap-decision="rejected" data-creator-id="${escapeHtml(creator.id)}" type="button">Mark as Unrelated</button>` : ""}
        ${latestNsapVideoUrl ? `<a class="button button-secondary" href="${escapeHtml(latestNsapVideoUrl)}" target="_blank" rel="noreferrer">Open NSAP Video</a>` : ""}
        ${permissions.canDeleteCreators ? `<button class="button button-danger" data-delete-creator="${escapeHtml(creator.id)}" type="button">Delete Creator</button>` : ""}
      </div>
    </div>

    <div class="profile-content-grid">
      <section class="modal-section profile-section">
        <h4>Overview</h4>
        <div class="modal-grid overview-grid">
        ${renderReadOnly("Quick Note", escapeHtml(formatOptional(creator.quickNote, "No quick note.")))}
        ${renderReadOnly("Follow-up", escapeHtml(formatOptional(creator.followUpDate, "No follow-up scheduled.")))}
        ${renderReadOnly("Last NSAP Upload", escapeHtml(formatOptional(creator.latestNsapUploadDate, "No matched NSAP upload.")))}
        ${renderReadOnly("NSAP Upload Age", `<b class="age age-${uploadAgeTone(days)}">${escapeHtml(uploadHealthLabel(days))} / ${escapeHtml(uploadAgeLabel(days))}</b>`)}
        ${renderReadOnly("Collaboration", escapeHtml(creator.collabPosted === "Yes" ? "Posted" : "Not posted"))}
        ${renderReadOnly("DM Status", escapeHtml(creator.dmSent === "Yes" ? "Sent" : "Not sent"))}
        ${renderReadOnly("Last Sync", escapeHtml(relativeSyncLabel(creator.lastSync)))}
        ${renderReadOnly("Sync Status", escapeHtml(getSyncStatusLabel(creator)))}
        </div>
      </section>

      <section class="modal-section profile-section">
        <h4>Contact &amp; Channels</h4>
        ${contactItems ? `<div class="compact-detail-list">${contactItems}</div>` : `<p class="empty-state compact-empty">No social channels added.</p>`}
      </section>
    </div>

    <section class="modal-section profile-section">
      <h4>NSAP Activity</h4>
      <div class="modal-grid overview-grid">
        ${renderReadOnly("Latest NSAP Video", escapeHtml(formatOptional(creator.latestNsapVideoTitle, "No matched NSAP video.")))}
        ${renderReadOnly("Match Status", escapeHtml(getNsapMatchStatusLabel(creator.nsapMatchStatus)))}
        ${renderReadOnly("Match Reason", escapeHtml(formatOptional(creator.nsapMatchReason, "Not reviewed yet.")))}
        ${creator.nsapMatchedKeyword ? renderReadOnly("Matched Keyword", escapeHtml(creator.nsapMatchedKeyword)) : ""}
        ${creator.nsapDecisionActor ? renderReadOnly("Manual Decision", escapeHtml(`${creator.nsapDecisionActor} / ${creator.nsapDecisionAt || "Unknown time"}`)) : ""}
      </div>
    </section>

    ${(creator.latestChannelVideoTitle || creator.latestChannelUploadDate) ? `
      <section class="modal-section profile-section">
        <h4>General YouTube</h4>
        <div class="modal-grid overview-grid">
          ${renderReadOnly("Latest Channel Upload", escapeHtml(formatOptional(creator.latestChannelUploadDate, "Unknown")))}
          ${renderReadOnly("Latest Channel Video", escapeHtml(formatOptional(creator.latestChannelVideoTitle, "Unknown")))}
          ${latestChannelVideoUrl ? renderReadOnly("Channel Video", `<a href="${escapeHtml(latestChannelVideoUrl)}" target="_blank" rel="noreferrer">Open latest channel video</a>`) : ""}
        </div>
      </section>
    ` : ""}

    <section class="modal-section profile-section">
      <h4>Notes</h4>
      <div class="profile-notes">${creator.notes ? escapeHtml(creator.notes) : `<span>No notes added.</span>`}</div>
    </section>

    ${metricItems ? `
      <section class="modal-section profile-section additional-metrics">
        <h4>Additional Metrics</h4>
        <div class="compact-detail-list">${metricItems}</div>
      </section>
    ` : ""}

    <section class="modal-section profile-section">
      <h4>Reminder Template</h4>
      <div class="reminder-tools">
        <label>
          <span>Template</span>
          <select id="reminderTemplate">${renderTemplateOptions()}</select>
        </label>
      </div>
    </section>

    <section class="modal-section profile-section">
      <h4>Timeline</h4>
      ${permissions.canEdit ? renderTimelineComposer() : ""}
      ${permissions.canEdit ? `
        <div class="button-row modal-actions-row timeline-save-row">
          <button class="button button-primary" data-save-timeline-entry="${escapeHtml(creator.id)}" data-default-text="Add Entry" type="button" disabled>Add Entry</button>
        </div>
      ` : ""}
      <div class="activity-list">
        ${renderTimeline(creator)}
      </div>
    </section>

    <section class="modal-section profile-section activity-section">
      <h4>Activity</h4>
      <div class="activity-list">
        ${renderHistory(creator.history)}
      </div>
    </section>

  `;
}

export function renderEditProfileModal(creator) {
  document.getElementById("modalName").textContent = `Edit ${creator.name}`;
  document.getElementById("modalBody").innerHTML = `
    <section class="modal-section">
      <h4>Profile Fields</h4>
      <div class="modal-form notes-section" id="editCreatorForm" data-editing-creator="${escapeHtml(creator.id)}">
        ${profileFields.map(([field, label, type, required]) => {
          if (field === "notes") {
            return renderTextarea(field, label, creator[field] || "");
          }
          return renderInput(field, label, creator[field] || "", type, required);
        }).join("")}
        ${renderSelect("status", "Status", creator.status, ["Active", "Inactive", "On Break"])}
        ${renderSelect("priority", "Priority", creator.priority, ["High", "Medium", "Low"])}
        ${renderSelect("collabPosted", "Collaboration Status", creator.collabPosted, ["Yes", "No"])}
        ${renderSelect("dmSent", "DM Status", creator.dmSent, ["Yes", "No"])}
      </div>
      <div class="button-row modal-actions-row">
        <button class="button button-secondary" data-cancel-profile-edit="${escapeHtml(creator.id)}" type="button">Cancel</button>
        <button class="button button-primary" data-save-profile="${escapeHtml(creator.id)}" data-default-text="Save Changes" type="button" disabled>Save Changes</button>
      </div>
    </section>
  `;
}

export function renderDeleteConfirmModal(creator) {
  document.getElementById("modalName").textContent = `Delete ${creator.name}`;
  document.getElementById("modalBody").innerHTML = `
    <section class="modal-section">
      <h4>Type DELETE to confirm.</h4>
      <p class="settings-copy">This will hide the creator from the active workspace and keep audit history.</p>
      <label class="field">
        <span>Confirmation</span>
        <input id="deleteConfirmation" type="text" autocomplete="off" />
      </label>
      <div class="button-row modal-actions-row">
        <button class="button button-secondary" data-cancel-profile-edit="${escapeHtml(creator.id)}" type="button">Cancel</button>
        <button class="button button-danger" data-confirm-delete="${escapeHtml(creator.id)}" type="button">Delete Creator</button>
      </div>
    </section>
  `;
}

export function getFormValues(containerId) {
  const container = document.getElementById(containerId);
  const values = {};
  container?.querySelectorAll("[name]").forEach((field) => {
    values[field.name] = field.value;
  });
  return values;
}

function renderTemplateOptions() {
  return Object.entries(reminderTemplates)
    .map(([value, template]) => `<option value="${escapeHtml(value)}">${escapeHtml(template.label)}</option>`)
    .join("");
}

function renderTimelineComposer() {
  return `
    <div class="timeline-composer">
      <label>
        <span>Type</span>
        <select id="timelineType">
          <option value="note">Note</option>
          <option value="reply_received">Reply Received</option>
          <option value="followup_set">Follow-up Set</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <label>
        <span>Timeline Entry</span>
        <input id="timelineMessage" type="text" placeholder="Sent inactivity check message." />
      </label>
    </div>
  `;
}

function renderTimeline(creator) {
  const timeline = Array.isArray(creator.timeline) ? creator.timeline : [];
  if (!timeline.length) {
    return `<p class="empty-state">No timeline entries yet.</p>`;
  }

  return timeline
    .map((item) => `
      <article class="activity-item">
        <strong>${escapeHtml(item.type || "custom")}</strong>
        <span>${escapeHtml(item.timestamp || "")} / ${escapeHtml(item.actorUsername || "System")} (${escapeHtml(item.actorRole || "system")})</span>
        <p>${escapeHtml(item.message || "")}</p>
      </article>
    `)
    .join("");
}

function renderHistory(history = []) {
  if (!history.length) {
    return `<p class="empty-state">No activity logged yet.</p>`;
  }

  return history
    .map((item) => `
      <article class="activity-item">
        <strong>${escapeHtml(item.type || "Activity")}</strong>
        <span>${escapeHtml(item.date || "No date")}</span>
        <p>${escapeHtml(item.note || "")}</p>
      </article>
    `)
    .join("");
}

function renderReadOnly(label, value) {
  return `
    <div class="info-tile">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function renderContactItems(creator) {
  const explicitUrls = [creator.youtubeUrl, creator.tiktokUrl, creator.twitchUrl, creator.twitterUrl]
    .map((value) => safeUrl(value))
    .filter(Boolean);
  const legacyChannel = getPlatformUrl(creator.url, ["youtube.com", "youtu.be", "tiktok.com", "twitch.tv", "x.com", "twitter.com"]);
  return [
    creator.discordUsername ? renderCompactDetail("Discord", escapeHtml(creator.discordUsername)) : "",
    creator.robloxUsername ? renderCompactDetail("Roblox", escapeHtml(creator.robloxUsername)) : "",
    renderSocialDetail("YouTube", creator.youtubeUrl, ["youtube.com", "youtu.be"]),
    renderSocialDetail("TikTok", creator.tiktokUrl, ["tiktok.com"]),
    renderSocialDetail("Twitch", creator.twitchUrl, ["twitch.tv"]),
    renderSocialDetail("X / Twitter", creator.twitterUrl, ["x.com", "twitter.com"]),
    legacyChannel && !explicitUrls.includes(legacyChannel) ? renderCompactDetail("Primary Channel", `<a href="${escapeHtml(legacyChannel)}" target="_blank" rel="noreferrer">${escapeHtml(legacyChannel)}</a>`) : "",
  ].filter(Boolean).join("");
}

function renderMetricItems(creator) {
  return [
    Number.isFinite(creator.subscriberCount) ? renderCompactDetail("Subscribers", escapeHtml(formatNumber(creator.subscriberCount))) : "",
    Number.isFinite(creator.views) ? renderCompactDetail("Views", escapeHtml(formatNumber(creator.views))) : "",
    Number.isFinite(creator.averageViews) ? renderCompactDetail("Average Views", escapeHtml(formatNumber(creator.averageViews))) : "",
  ].filter(Boolean).join("");
}

function renderSocialDetail(label, value, hosts) {
  const url = getPlatformUrl(value, hosts);
  return url ? renderCompactDetail(label, `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`) : "";
}

function renderCompactDetail(label, value) {
  return `<div class="compact-detail"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

function getPrimaryChannelUrl(creator) {
  const platformCandidates = {
    YouTube: [[creator.youtubeUrl, ["youtube.com", "youtu.be"]]],
    TikTok: [[creator.tiktokUrl, ["tiktok.com"]]],
    Twitch: [[creator.twitchUrl, ["twitch.tv"]]],
    "X/Twitter": [[creator.twitterUrl, ["x.com", "twitter.com"]]],
  };
  const candidates = [
    ...(platformCandidates[creator.platform] || []),
    [creator.youtubeUrl, ["youtube.com", "youtu.be"]],
    [creator.tiktokUrl, ["tiktok.com"]],
    [creator.twitchUrl, ["twitch.tv"]],
    [creator.twitterUrl, ["x.com", "twitter.com"]],
    [creator.url, ["youtube.com", "youtu.be", "tiktok.com", "twitch.tv", "x.com", "twitter.com"]],
  ];
  for (const [value, hosts] of candidates) {
    const url = getPlatformUrl(value, hosts);
    if (url) return url;
  }
  return "";
}

function getPlatformUrl(value, hosts) {
  const url = safeUrl(value);
  if (!url) return "";
  const hostname = new URL(url).hostname.toLowerCase();
  return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)) ? url : "";
}

function getSyncStatusLabel(creator) {
  if (["TikTok", "Twitch", "X", "X/Twitter"].includes(creator.platform) && !creator.youtubeUrl) return "Manual Update Required";
  if (creator.syncStatus === "synced") return relativeSyncLabel(creator.lastSync);
  if (creator.syncStatus === "channel_not_found") return "Channel not found";
  if (creator.syncStatus === "manual") return "Manual Update Required";
  if (creator.syncStatus === "failed") return creator.syncError || "Sync failed";
  return "Not synced";
}

function getNsapMatchStatusLabel(status) {
  const labels = {
    matched: "Matched",
    no_match: "No match",
    manual_confirmed: "Manually confirmed",
    manual_rejected: "Manually rejected",
    sync_failed: "Sync failed",
    unsupported: "Unsupported platform",
  };
  return labels[status] || "Not reviewed";
}

function renderInput(name, label, value = "", type = "text", required = false) {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <input name="${escapeHtml(name)}" type="${escapeHtml(type || "text")}" value="${escapeHtml(value)}" ${required ? "required" : ""} />
    </label>
  `;
}

function renderTextarea(name, label, value = "") {
  return `
    <label class="field field-wide">
      <span>${escapeHtml(label)}</span>
      <textarea name="${escapeHtml(name)}" rows="4">${escapeHtml(value)}</textarea>
    </label>
  `;
}

function renderSelect(name, label, value, options) {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select name="${escapeHtml(name)}">
        ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </label>
  `;
}
