import { formatLocalizedDate, formatLocalizedDateTime, relativeSyncLabel } from "../utils/dates.js";
import { getNsapHealth, renderAvatar, renderBadge } from "../utils/creatorVisuals.js";
import { escapeHtml, formatNumber, formatOptional, safeUrl } from "../utils/format.js";
import { t } from "../i18n/index.js";
import { NSAP_REVIEW_DECISION } from "../constants/nsapReview.js";

export const reminderTemplates = {
  inactivity: {
    labelKey: "template.inactivity",
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
    labelKey: "template.followUp",
    timeline: "Copied follow-up reminder",
    build: (creator) => `Hey ${creator.name}! Just following up on our last message. Are you still interested in creating Night Shift at Paul's content?`,
  },
  collab: {
    labelKey: "template.collab",
    timeline: "Copied collab reminder",
    build: (creator) => `Hey ${creator.name}! Quick reminder to post the collab content when you have a chance. Thank you for helping with Night Shift at Paul's.`,
  },
  update: {
    labelKey: "template.update",
    timeline: "Copied big update reminder",
    build: (creator) => `Hey ${creator.name}! Night Shift at Paul's has a big update coming up, and we'd love to see fresh content from you around it.`,
  },
  thanks: {
    labelKey: "template.thanks",
    timeline: "Copied thank-you message",
    build: (creator) => `Hey ${creator.name}! Thank you for supporting Night Shift at Paul's. We really appreciate the content and effort.`,
  },
  welcome: {
    labelKey: "template.welcome",
    timeline: "Copied welcome message",
    build: (creator) => `Hey ${creator.name}! Welcome to the Night Shift at Paul's creator group. Excited to have you here.`,
  },
};

const profileFields = [
  ["name", "field.creatorName", "text", true],
  ["discordUsername", "field.discordUsername", "text"],
  ["discordId", "field.discordId", "text"],
  ["youtubeUrl", "field.youtubeUrl", "url"],
  ["tiktokUrl", "field.tiktokUrl", "url"],
  ["twitchUrl", "field.twitchUrl", "url"],
  ["twitterUrl", "field.twitterUrl", "url"],
  ["robloxUsername", "field.robloxUsername", "text"],
  ["category", "field.category", "text"],
  ["quickNote", "profile.quickNote", "text"],
  ["followUpDate", "field.followUpDate", "date"],
  ["lastUploadDate", "field.lastUpload", "date"],
  ["notes", "profile.notes", "textarea"],
];

export function openCreatorModal(creator, permissions = { canEdit: false }, reviewState) {
  const dialog = document.getElementById("creatorDialog");
  renderCreatorDetails(creator, permissions, reviewState);
  if (!dialog.open) {
    dialog.showModal();
  }
}

export function openAddCreatorModal() {
  document.getElementById("modalName").textContent = t("profile.addCreator");
  document.getElementById("modalBody").innerHTML = `
    <section class="modal-section">
      <h4>${escapeHtml(t("profile.creatorProfile"))}</h4>
      <div class="modal-form notes-section" id="addCreatorForm">
        ${renderInput("name", t("field.creatorName"), "", "text", true)}
        ${renderInput("discordUsername", t("field.discordUsername"))}
        ${renderInput("discordId", t("field.discordId"))}
        ${renderInput("youtubeUrl", t("field.youtubeUrl"), "", "url")}
        ${renderInput("tiktokUrl", t("field.tiktokUrl"), "", "url")}
        ${renderInput("twitchUrl", t("field.twitchUrl"), "", "url")}
        ${renderInput("twitterUrl", t("field.twitterUrl"), "", "url")}
        ${renderInput("robloxUsername", t("field.robloxUsername"))}
        ${renderSelect("status", t("filter.status"), "Active", ["Active", "Inactive", "On Break"])}
        ${renderSelect("priority", t("filter.priority"), "Medium", ["High", "Medium", "Low"])}
        ${renderInput("category", t("field.category"), "Content Creator")}
        ${renderInput("quickNote", t("profile.quickNote"))}
        ${renderInput("followUpDate", t("field.followUpDate"), "", "date")}
        ${renderTextarea("notes", t("profile.notes"))}
      </div>
      <div class="button-row modal-actions-row">
        <button class="button button-secondary" data-cancel-add-creator type="button">${escapeHtml(t("common.cancel"))}</button>
        <button class="button button-primary" data-save-new-creator data-default-text="${escapeHtml(t("profile.createCreator"))}" type="button" disabled>${escapeHtml(t("profile.createCreator"))}</button>
      </div>
    </section>
  `;
  const dialog = document.getElementById("creatorDialog");
  if (!dialog.open) {
    dialog.showModal();
  }
}

export function renderCreatorDetails(creator, permissions = { canEdit: false }, reviewState = { status: "not_loaded", candidate: null, hasNextCandidate: false, checkedCount: 0 }) {
  const health = getNsapHealth(creator);
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
          <span>${escapeHtml([creator.platform || t("common.unknown"), creator.category].filter(Boolean).join(" / "))}</span>
          <div class="profile-badges">
            ${renderBadge(creator.status, creator.status)}
            ${renderBadge(creator.priority, creator.priority)}
          </div>
        </div>
      </div>
      <div class="profile-actions">
        ${channelUrl ? `<a class="button button-primary" href="${escapeHtml(channelUrl)}" target="_blank" rel="noreferrer">${escapeHtml(t("profile.openChannel"))}</a>` : `<button class="button button-secondary" type="button" disabled>${escapeHtml(t("profile.noChannel"))}</button>`}
        <button class="button button-secondary" data-copy-template="${escapeHtml(creator.id)}" type="button">${escapeHtml(t("profile.copyReminder"))}</button>
        ${permissions.canEdit ? `<button class="button button-secondary" data-mark-dm-sent="${escapeHtml(creator.id)}" type="button">${escapeHtml(t("profile.markDm"))}</button>` : ""}
        ${permissions.canEdit ? `<button class="button button-secondary" data-edit-profile="${escapeHtml(creator.id)}" type="button">${escapeHtml(t("profile.edit"))}</button>` : ""}
        ${permissions.canEdit && canYouTubeSync ? `<button class="button button-secondary" data-sync-youtube="${escapeHtml(creator.id)}" type="button">${escapeHtml(t("profile.syncYoutube"))}</button>` : ""}
        ${latestNsapVideoUrl ? `<a class="button button-secondary" href="${escapeHtml(latestNsapVideoUrl)}" target="_blank" rel="noreferrer">${escapeHtml(t("profile.openNsapVideo"))}</a>` : ""}
        ${permissions.canDeleteCreators ? `<button class="button button-danger" data-delete-creator="${escapeHtml(creator.id)}" type="button">${escapeHtml(t("profile.delete"))}</button>` : ""}
      </div>
    </div>

    <div class="profile-content-grid">
      <section class="modal-section profile-section">
        <h4>${escapeHtml(t("profile.overview"))}</h4>
        <div class="modal-grid overview-grid">
        ${renderReadOnly(t("profile.quickNote"), escapeHtml(formatOptional(creator.quickNote, t("profile.noQuickNote"))))}
        ${renderReadOnly(t("profile.followUp"), escapeHtml(formatOptional(creator.followUpDate, t("profile.noFollowUp"))))}
        ${renderReadOnly(t("profile.lastNsapUpload"), escapeHtml(formatOptional(creator.latestNsapUploadDate, t("profile.noMatchedUpload"))))}
        ${renderReadOnly(t("profile.nsapUploadAge"), `<b class="age age-${health.tone}">${escapeHtml(health.label)} / ${escapeHtml(health.age)}</b>`)}
        ${renderReadOnly(t("profile.collaboration"), escapeHtml(creator.collabPosted === "Yes" ? t("profile.posted") : t("profile.notPosted")))}
        ${renderReadOnly(t("profile.dmStatus"), escapeHtml(creator.dmSent === "Yes" ? t("profile.sent") : t("profile.notSent")))}
        ${renderReadOnly(t("profile.lastSync"), escapeHtml(relativeSyncLabel(creator.lastSync)))}
        ${renderReadOnly(t("profile.syncStatus"), escapeHtml(getSyncStatusLabel(creator)))}
        </div>
      </section>

      <section class="modal-section profile-section">
        <h4>${escapeHtml(t("profile.contacts"))}</h4>
        ${contactItems ? `<div class="compact-detail-list">${contactItems}</div>` : `<p class="empty-state compact-empty">${escapeHtml(t("profile.noChannels"))}</p>`}
      </section>
    </div>

    <section class="modal-section profile-section">
      <h4>${escapeHtml(t("profile.nsapActivity"))}</h4>
      <div class="modal-grid overview-grid">
        ${renderReadOnly(t("profile.latestNsapVideo"), escapeHtml(formatOptional(creator.latestNsapVideoTitle, t("profile.noMatchedVideo"))))}
        ${renderReadOnly(t("profile.matchStatus"), escapeHtml(getNsapMatchStatusLabel(creator.nsapMatchStatus)))}
        ${renderReadOnly(t("profile.matchReason"), escapeHtml(localizeMatchReason(creator.nsapMatchReason)))}
        ${creator.nsapMatchedKeyword ? renderReadOnly(t("profile.matchedKeyword"), escapeHtml(creator.nsapMatchedKeyword)) : ""}
        ${creator.nsapDecisionActor ? renderReadOnly(t("profile.manualDecision"), escapeHtml(`${creator.nsapDecisionActor} / ${formatLocalizedDateTime(creator.nsapDecisionAt)}`)) : ""}
      </div>
    </section>

    ${renderNsapReview(creator, permissions, reviewState)}

    ${(creator.latestChannelVideoTitle || creator.latestChannelUploadDate) ? `
      <section class="modal-section profile-section">
        <h4>${escapeHtml(t("profile.generalYoutube"))}</h4>
        <div class="modal-grid overview-grid">
          ${renderReadOnly(t("profile.latestChannelUpload"), escapeHtml(formatOptional(creator.latestChannelUploadDate, t("common.unknown"))))}
          ${renderReadOnly(t("profile.latestChannelVideo"), escapeHtml(formatOptional(creator.latestChannelVideoTitle, t("common.unknown"))))}
          ${latestChannelVideoUrl ? renderReadOnly(t("profile.channelVideo"), `<a href="${escapeHtml(latestChannelVideoUrl)}" target="_blank" rel="noreferrer">${escapeHtml(t("profile.openChannelVideo"))}</a>`) : ""}
        </div>
      </section>
    ` : ""}

    <section class="modal-section profile-section">
      <h4>${escapeHtml(t("profile.notes"))}</h4>
      <div class="profile-notes">${creator.notes ? escapeHtml(creator.notes) : `<span>${escapeHtml(t("profile.noNotes"))}</span>`}</div>
    </section>

    ${metricItems ? `
      <section class="modal-section profile-section additional-metrics">
        <h4>${escapeHtml(t("profile.metrics"))}</h4>
        <div class="compact-detail-list">${metricItems}</div>
      </section>
    ` : ""}

    <section class="modal-section profile-section">
      <h4>${escapeHtml(t("profile.reminder"))}</h4>
      <div class="reminder-tools">
        <label>
          <span>${escapeHtml(t("common.template"))}</span>
          <select id="reminderTemplate">${renderTemplateOptions()}</select>
        </label>
      </div>
    </section>

    <section class="modal-section profile-section">
      <h4>${escapeHtml(t("profile.timeline"))}</h4>
      ${permissions.canEdit ? renderTimelineComposer() : ""}
      ${permissions.canEdit ? `
        <div class="button-row modal-actions-row timeline-save-row">
          <button class="button button-primary" data-save-timeline-entry="${escapeHtml(creator.id)}" data-default-text="${escapeHtml(t("profile.addEntry"))}" type="button" disabled>${escapeHtml(t("profile.addEntry"))}</button>
        </div>
      ` : ""}
      <div class="activity-list">
        ${renderTimeline(creator)}
      </div>
    </section>

    <section class="modal-section profile-section activity-section">
      <h4>${escapeHtml(t("profile.activity"))}</h4>
      <div class="activity-list">
        ${renderHistory(creator.history)}
      </div>
    </section>

  `;
}

export function renderEditProfileModal(creator) {
  document.getElementById("modalName").textContent = t("profile.editCreator", { name: creator.name });
  document.getElementById("modalBody").innerHTML = `
    <section class="modal-section">
      <h4>${escapeHtml(t("profile.fields"))}</h4>
      <div class="modal-form notes-section" id="editCreatorForm" data-editing-creator="${escapeHtml(creator.id)}">
        ${profileFields.map(([field, labelKey, type, required]) => {
          const label = t(labelKey);
          if (field === "notes") {
            return renderTextarea(field, label, creator[field] || "");
          }
          return renderInput(field, label, creator[field] || "", type, required);
        }).join("")}
        ${renderSelect("status", t("filter.status"), creator.status, ["Active", "Inactive", "On Break"])}
        ${renderSelect("priority", t("filter.priority"), creator.priority, ["High", "Medium", "Low"])}
        ${renderSelect("collabPosted", t("field.collaborationStatus"), creator.collabPosted, ["Yes", "No"])}
        ${renderSelect("dmSent", t("profile.dmStatus"), creator.dmSent, ["Yes", "No"])}
      </div>
      <div class="button-row modal-actions-row">
        <button class="button button-secondary" data-cancel-profile-edit="${escapeHtml(creator.id)}" type="button">${escapeHtml(t("common.cancel"))}</button>
        <button class="button button-primary" data-save-profile="${escapeHtml(creator.id)}" data-default-text="${escapeHtml(t("settings.save"))}" type="button" disabled>${escapeHtml(t("settings.save"))}</button>
      </div>
    </section>
  `;
}

export function renderDeleteConfirmModal(creator) {
  document.getElementById("modalName").textContent = t("profile.deleteCreator", { name: creator.name });
  document.getElementById("modalBody").innerHTML = `
    <section class="modal-section">
      <h4>${escapeHtml(t("profile.typeDelete"))}</h4>
      <p class="settings-copy">${escapeHtml(t("profile.deleteExplanation"))}</p>
      <label class="field">
        <span>${escapeHtml(t("profile.confirmation"))}</span>
        <input id="deleteConfirmation" type="text" autocomplete="off" />
      </label>
      <div class="button-row modal-actions-row">
        <button class="button button-secondary" data-cancel-profile-edit="${escapeHtml(creator.id)}" type="button">${escapeHtml(t("common.cancel"))}</button>
        <button class="button button-danger" data-confirm-delete="${escapeHtml(creator.id)}" type="button">${escapeHtml(t("profile.delete"))}</button>
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
    .map(([value, template]) => `<option value="${escapeHtml(value)}">${escapeHtml(t(template.labelKey))}</option>`)
    .join("");
}

function renderTimelineComposer() {
  return `
    <div class="timeline-composer">
      <label>
        <span>${escapeHtml(t("timeline.type"))}</span>
        <select id="timelineType">
          <option value="note">${escapeHtml(t("timeline.note"))}</option>
          <option value="reply_received">${escapeHtml(t("timeline.replyReceived"))}</option>
          <option value="followup_set">${escapeHtml(t("timeline.followUpSet"))}</option>
          <option value="custom">${escapeHtml(t("timeline.custom"))}</option>
        </select>
      </label>
      <label>
        <span>${escapeHtml(t("timeline.entry"))}</span>
        <input id="timelineMessage" type="text" placeholder="${escapeHtml(t("timeline.placeholder"))}" />
      </label>
    </div>
  `;
}

function renderTimeline(creator) {
  const timeline = Array.isArray(creator.timeline) ? creator.timeline : [];
  if (!timeline.length) {
    return `<p class="empty-state">${escapeHtml(t("profile.noTimeline"))}</p>`;
  }

  return timeline
    .map((item) => `
      <article class="activity-item">
        <strong>${escapeHtml(item.type || "custom")}</strong>
        <span>${escapeHtml(formatActivityDate(item.timestamp))} / ${escapeHtml(item.actorUsername || t("common.system"))} (${escapeHtml(t(`role.${item.actorRole || "system"}`))})</span>
        <p>${escapeHtml(item.message || "")}</p>
      </article>
    `)
    .join("");
}

function renderHistory(history = []) {
  if (!history.length) {
    return `<p class="empty-state">${escapeHtml(t("profile.noActivity"))}</p>`;
  }

  return history
    .map((item) => `
      <article class="activity-item">
        <strong>${escapeHtml(item.type || t("profile.activity"))}</strong>
        <span>${escapeHtml(formatActivityDate(item.date))}</span>
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
    legacyChannel && !explicitUrls.includes(legacyChannel) ? renderCompactDetail(t("field.primaryChannel"), `<a href="${escapeHtml(legacyChannel)}" target="_blank" rel="noreferrer">${escapeHtml(legacyChannel)}</a>`) : "",
  ].filter(Boolean).join("");
}

function renderMetricItems(creator) {
  return [
    Number.isFinite(creator.subscriberCount) ? renderCompactDetail(t("field.subscribers"), escapeHtml(formatNumber(creator.subscriberCount))) : "",
    Number.isFinite(creator.views) ? renderCompactDetail(t("field.views"), escapeHtml(formatNumber(creator.views))) : "",
    Number.isFinite(creator.averageViews) ? renderCompactDetail(t("field.averageViews"), escapeHtml(formatNumber(creator.averageViews))) : "",
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

function renderNsapReview(creator, permissions, reviewState) {
  if (reviewState.status === "confirmed") return "";
  const candidate = reviewState.candidate;
  const hasManualDecision = Boolean(creator.nsapDecisionVideoUrl || creator.nsapDecisionActor || creator.nsapDecisionAt);
  const candidateDetails = candidate
    ? `<div class="modal-grid overview-grid">
        ${renderReadOnly(t("review.candidateTitle"), escapeHtml(candidate.title))}
        ${renderReadOnly(t("review.uploadDate"), escapeHtml(formatLocalizedDate(candidate.uploadDate)))}
        ${renderReadOnly(t("review.videoUrl"), `<a href="${escapeHtml(candidate.url)}" target="_blank" rel="noreferrer">${escapeHtml(candidate.url)}</a>`)}
        ${renderReadOnly(t("review.position"), escapeHtml(t("review.positionValue", { current: candidate.index, total: candidate.total })))}
        ${renderReadOnly(t("profile.matchReason"), escapeHtml(localizeMatchReason(candidate.matchReason)))}
      </div>`
    : `<p class="empty-state compact-empty">${escapeHtml(getEmptyReviewMessage(reviewState.status))}</p>`;

  const actions = permissions.canEdit
    ? `<div class="button-row modal-actions-row">
        <div>
          <button class="button button-primary" data-nsap-review="${NSAP_REVIEW_DECISION.CONFIRM}" data-creator-id="${escapeHtml(creator.id)}" type="button" ${candidate ? "" : "disabled"}>${escapeHtml(t("review.confirm"))}</button>
          <p class="settings-copy">${escapeHtml(t("review.confirmText"))}</p>
        </div>
        <div>
          <button class="button button-secondary" data-nsap-review="${NSAP_REVIEW_DECISION.REJECT}" data-creator-id="${escapeHtml(creator.id)}" type="button" ${candidate ? "" : "disabled"}>${escapeHtml(t("review.reject"))}</button>
          <p class="settings-copy">${escapeHtml(t("review.rejectText"))}</p>
        </div>
        <div>
          <button class="button button-secondary" data-nsap-next="${escapeHtml(creator.id)}" type="button" ${candidate ? "" : "disabled"}>${escapeHtml(t("review.showNext"))}</button>
          <p class="settings-copy">${escapeHtml(t("review.showNextText"))}</p>
        </div>
        ${hasManualDecision ? `<div>
          <button class="button button-secondary" data-nsap-review="${NSAP_REVIEW_DECISION.CLEAR}" data-creator-id="${escapeHtml(creator.id)}" type="button">${escapeHtml(t("review.clear"))}</button>
          <p class="settings-copy">${escapeHtml(t("review.clearText"))}</p>
        </div>` : ""}
      </div>`
    : "";

  return `<section class="modal-section profile-section nsap-review-section">
    <h4>${escapeHtml(t("review.title"))}</h4>
    ${candidateDetails}
    ${actions}
  </section>`;
}

function getEmptyReviewMessage(status) {
  if (status === "exhausted") return t("review.allChecked");
  if (status === "unavailable") return t("review.unavailable");
  return t("review.syncToLoad");
}

function localizeMatchReason(reason) {
  const value = String(reason || "");
  if (!value) return t("profile.notReviewed");
  if (value === "No relevant NSAP video found in recent feed entries") return t("match.noRelevantVideo");
  if (value === "Potential NSAP term requires manual review") return t("match.ambiguousNsap");
  if (value === "Potential Paulies reference requires manual review") return t("match.ambiguousPaulies");
  if (value === "Potential Night Shift + Roblox reference requires manual review") return t("match.ambiguousNightShiftRoblox");
  let match = value.match(/^Matched (title|description) (hashtag|phrase): \"(.+)\"$/);
  if (match) return t(`match.${match[1]}.${match[2]}`, { value: match[3] });
  match = value.match(/^Matched combined terms: \"(.+)\"$/);
  if (match) return t("match.combinedTerms", { value: match[1] });
  match = value.match(/^Manually confirmed by (.+)$/);
  if (match) return t("match.manuallyConfirmed", { actor: match[1] });
  return value;
}

function formatActivityDate(value) {
  if (!value) return t("common.noDate");
  return String(value).includes("T") ? formatLocalizedDateTime(value) : formatLocalizedDate(value);
}

function getSyncStatusLabel(creator) {
  if (["TikTok", "Twitch", "X", "X/Twitter"].includes(creator.platform) && !creator.youtubeUrl) return t("status.manualUpdate");
  if (creator.syncStatus === "synced") return relativeSyncLabel(creator.lastSync);
  if (creator.syncStatus === "channel_not_found") return t("status.channelNotFound");
  if (creator.syncStatus === "manual") return t("status.manualUpdate");
  if (creator.syncStatus === "failed") return creator.syncError || t("status.syncFailed");
  return t("common.notSynced");
}

function getNsapMatchStatusLabel(status) {
  const labels = {
    matched: "status.matched",
    no_match: "status.noMatch",
    [NSAP_REVIEW_DECISION.CONFIRM]: "status.manualConfirmed",
    [NSAP_REVIEW_DECISION.REJECT]: "status.manualRejected",
    sync_failed: "status.syncFailed",
    unsupported: "status.unsupported",
  };
  return labels[status] ? t(labels[status]) : t("profile.notReviewed");
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
        ${options.map((option) => {
          const translated = t(`value.${option}`);
          return `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(translated === `value.${option}` ? option : translated)}</option>`;
        }).join("")}
      </select>
    </label>
  `;
}
