import { daysSinceUpload, uploadAgeLabel, uploadAgeTone } from "../utils/dates.js";
import { renderAvatar, renderBadge } from "../utils/creatorVisuals.js";
import { escapeHtml, formatNumber, formatOptional, safeUrl } from "../utils/format.js";

const editableFields = [
  ["status", "Status", "select", ["Active", "Inactive", "On Break"]],
  ["priority", "Priority", "select", ["High", "Medium", "Low"]],
  ["lastContent", "Last NSP Content", "text"],
  ["lastUploadDate", "Last Upload", "date"],
  ["collabPosted", "Collaboration Status", "select", ["Yes", "No"]],
  ["dmSent", "DM Status", "select", ["Yes", "No"]],
  ["followUp", "Needs Follow-up", "select", ["Yes", "No"]],
  ["deadline", "Deadline", "date"],
  ["response", "Response", "text"],
  ["notes", "Notes", "textarea"],
];

export function openCreatorModal(creator, permissions = { canEdit: false }) {
  const dialog = document.getElementById("creatorDialog");
  const days = daysSinceUpload(creator.lastUploadDate);
  const channelUrl = safeUrl(creator.url);

  document.getElementById("modalName").textContent = creator.name;
  document.getElementById("modalBody").innerHTML = `
    <div class="modal-summary">
      <div class="profile-chip">
        ${renderAvatar(creator, "large")}
        <div>
          <strong>${escapeHtml(creator.channel)}</strong>
          <span>${escapeHtml(creator.platform)}</span>
        </div>
      </div>
      <a class="button button-primary" href="${escapeHtml(channelUrl)}" target="_blank" rel="noreferrer">Open Channel</a>
      <button class="button button-secondary" data-copy-creator-reminder="${escapeHtml(creator.id)}" type="button">Copy Reminder</button>
    </div>

    <section class="modal-section">
      <h4>General</h4>
      <div class="modal-grid">
        ${renderReadOnly("Status", renderBadge(creator.status, creator.status))}
        ${renderReadOnly("Priority", renderBadge(creator.priority, creator.priority))}
        ${renderReadOnly("Last Upload", escapeHtml(formatOptional(creator.lastUploadDate)))}
        ${renderReadOnly("Upload Health", `<b class="age age-${uploadAgeTone(days)}">${escapeHtml(uploadAgeLabel(days))}</b>`)}
      </div>
    </section>

    <section class="modal-section">
      <h4>Activity</h4>
      <div class="activity-list">
        ${renderHistory(creator.history)}
      </div>
    </section>

    <section class="modal-section">
      <h4>Notes</h4>
      <div class="modal-form notes-section">
      ${editableFields.map((field) => renderEditableField(creator, field, permissions)).join("")}
      </div>
    </section>

    <section class="modal-section">
      <h4>Future Analytics</h4>
      <div class="modal-grid">
        ${renderReadOnly("Subscribers", escapeHtml(formatNumber(creator.subscriberCount)))}
        ${renderReadOnly("Views", escapeHtml(formatNumber(creator.views)))}
        ${renderReadOnly("Average Views", escapeHtml(formatNumber(creator.averageViews)))}
        ${renderReadOnly("Latest Video", escapeHtml(formatOptional(creator.latestVideo)))}
        ${renderReadOnly("Estimated Reach", escapeHtml(formatNumber(creator.estimatedReach)))}
      </div>
    </section>
  `;

  dialog.showModal();
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

export function getEditableField(target) {
  return target.closest("[data-edit-field]")?.dataset.editField;
}

function renderReadOnly(label, value) {
  return `
    <div class="info-tile">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function renderEditableField(creator, [field, label, type, options], permissions) {
  const value = creator[field] ?? "";
  const disabled = permissions?.canEdit ? "" : "disabled";

  if (type === "select") {
    return `
      <label class="field" data-edit-field="${escapeHtml(field)}">
        <span>${escapeHtml(label)}</span>
        <select ${disabled}>
          ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  if (type === "textarea") {
    return `
      <label class="field field-wide" data-edit-field="${escapeHtml(field)}">
        <span>${escapeHtml(label)}</span>
        <textarea rows="4" ${disabled}>${escapeHtml(value)}</textarea>
      </label>
    `;
  }

  return `
    <label class="field" data-edit-field="${escapeHtml(field)}">
      <span>${escapeHtml(label)}</span>
      <input type="${escapeHtml(type)}" value="${escapeHtml(value)}" ${disabled} />
    </label>
  `;
}
