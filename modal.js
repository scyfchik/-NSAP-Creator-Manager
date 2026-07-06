import { daysSinceUpload, uploadAgeLabel, uploadAgeTone } from "../utils/dates.js";
import { renderAvatar, renderBadge } from "../utils/creatorVisuals.js";
import { escapeHtml, formatNumber, formatOptional, safeUrl } from "../utils/format.js";

export const reminderTemplates = {
  inactivity: {
    label: "Inactivity Check",
    timeline: "Copied inactivity reminder",
    build: (creator) => `Hey ${creator.name}! 👋

Hope you've been doing well.

We noticed it's been a little while since your last upload, so I just wanted to check in and see how things are going.

No pressure at all - we completely understand that real life comes first. We just wanted to know if you're still interested in creating content for Night Shift at Paul's.

Even a quick reply is appreciated, whether you're still interested or taking a break.

Looking forward to hearing from you! ❤

-# • Lunyxzz | Creator Supervisor`,
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
        ${renderTextarea("notes", "Notes")}
      </div>
      <div class="button-row modal-actions-row">
        ${renderDirtyBadge()}
        <button class="button button-primary" data-save-new-creator type="button" disabled>Save Changes</button>
      </div>
    </section>
  `;
  const dialog = document.getElementById("creatorDialog");
  if (!dialog.open) {
    dialog.showModal();
  }
}

export function renderCreatorDetails(creator, permissions = { canEdit: false }) {
  const days = daysSinceUpload(creator.lastUploadDate);
  const channelUrl = safeUrl(creator.url || creator.youtubeUrl || creator.tiktokUrl || creator.twitchUrl || creator.twitterUrl);

  document.getElementById("modalName").textContent = creator.name;
  document.getElementById("modalBody").innerHTML = `
    <div class="modal-summary">
      <div class="profile-chip">
        ${renderAvatar(creator, "large")}
        <div>
          <strong>${escapeHtml(creator.channel || creator.discordUsername || creator.robloxUsername || creator.name)}</strong>
          <span>${escapeHtml(creator.category || creator.platform)}</span>
        </div>
      </div>
      ${channelUrl ? `<a class="button button-primary" href="${escapeHtml(channelUrl)}" target="_blank" rel="noreferrer">Open Channel</a>` : ""}
      ${permissions.canEdit ? `<button class="button button-secondary" data-edit-profile="${escapeHtml(creator.id)}" type="button">Edit Profile</button>` : ""}
      ${permissions.canDeleteCreators ? `<button class="button button-danger" data-delete-creator="${escapeHtml(creator.id)}" type="button">Delete Creator</button>` : ""}
    </div>

    <section class="modal-section">
      <h4>General</h4>
      <div class="modal-grid">
        ${renderReadOnly("Status", renderBadge(creator.status, creator.status))}
        ${renderReadOnly("Priority", renderBadge(creator.priority, creator.priority))}
        ${renderReadOnly("Quick Note", escapeHtml(formatOptional(creator.quickNote)))}
        ${renderReadOnly("Follow-up", escapeHtml(formatOptional(creator.followUpDate)))}
        ${renderReadOnly("Last Upload", escapeHtml(formatOptional(creator.lastUploadDate)))}
        ${renderReadOnly("Upload Health", `<b class="age age-${uploadAgeTone(days)}">${escapeHtml(uploadAgeLabel(days))}</b>`)}
      </div>
    </section>

    <section class="modal-section">
      <h4>Reminder</h4>
      <div class="reminder-tools">
        <label>
          <span>Template</span>
          <select id="reminderTemplate">${renderTemplateOptions()}</select>
        </label>
        <button class="button button-primary" data-copy-template="${escapeHtml(creator.id)}" type="button">Copy Reminder</button>
        ${permissions.canEdit ? `<button class="button button-secondary" data-mark-dm-sent="${escapeHtml(creator.id)}" type="button">Mark DM Sent</button>` : ""}
      </div>
    </section>

    <section class="modal-section">
      <h4>Timeline</h4>
      ${permissions.canEdit ? renderTimelineComposer() : ""}
      ${permissions.canEdit ? `
        <div class="button-row modal-actions-row timeline-save-row">
          ${renderDirtyBadge()}
          <button class="button button-primary" data-save-timeline-entry="${escapeHtml(creator.id)}" type="button" disabled>Save Changes</button>
        </div>
      ` : ""}
      <div class="activity-list">
        ${renderTimeline(creator)}
      </div>
    </section>

    <section class="modal-section">
      <h4>Activity</h4>
      <div class="activity-list">
        ${renderHistory(creator.history)}
      </div>
    </section>

    <section class="modal-section">
      <h4>Profile</h4>
      <div class="modal-grid">
        ${renderReadOnly("Discord", escapeHtml(formatOptional(creator.discordUsername)))}
        ${renderReadOnly("Discord ID", escapeHtml(formatOptional(creator.discordId)))}
        ${renderReadOnly("Roblox", escapeHtml(formatOptional(creator.robloxUsername)))}
        ${renderReadOnly("Category", escapeHtml(formatOptional(creator.category)))}
        ${renderReadOnly("Subscribers", escapeHtml(formatNumber(creator.subscriberCount)))}
        ${renderReadOnly("Views", escapeHtml(formatNumber(creator.views)))}
        ${renderReadOnly("Average Views", escapeHtml(formatNumber(creator.averageViews)))}
        ${renderReadOnly("Latest Video", escapeHtml(formatOptional(creator.latestVideo)))}
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
      </div>
      <div class="button-row modal-actions-row">
        ${renderDirtyBadge()}
        <button class="button button-secondary" data-cancel-profile-edit="${escapeHtml(creator.id)}" type="button">Cancel</button>
        <button class="button button-primary" data-save-profile="${escapeHtml(creator.id)}" type="button" disabled>Save Changes</button>
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

function renderDirtyBadge() {
  return `<span class="dirty-badge" data-dirty-badge hidden>Unsaved changes</span>`;
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
