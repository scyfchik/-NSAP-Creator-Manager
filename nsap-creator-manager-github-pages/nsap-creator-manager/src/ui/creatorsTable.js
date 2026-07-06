import { renderAvatar, renderBadge, renderUploadHealth } from "../utils/creatorVisuals.js";
import { escapeHtml } from "../utils/format.js";

const columns = [
  ["name", "Creator"],
  ["platform", "Platform"],
  ["status", "Status"],
  ["priority", "Priority"],
  ["days", "Upload Age"],
  ["collabPosted", "Collab"],
  ["dmSent", "DM"],
  ["notes", "Notes"],
];

const editableSelects = {
  status: ["Active", "Inactive", "On Break"],
  priority: ["High", "Medium", "Low"],
  collabPosted: ["Yes", "No"],
  dmSent: ["Yes", "No"],
};

export function renderCreatorsTable({ rows, total, page, maxPage, pageSize, sort, columnWidths, permissions }) {
  document.getElementById("resultCount").textContent = `${total} creator${total === 1 ? "" : "s"} found`;
  document.getElementById("pageIndicator").textContent = `Page ${page} of ${maxPage}`;
  document.getElementById("prevPage").disabled = page <= 1;
  document.getElementById("nextPage").disabled = page >= maxPage;
  document.getElementById("pageSize").value = String(pageSize);

  const table = document.getElementById("creatorTable");
  table.style.setProperty("--creator-columns", getColumnTemplate(columnWidths));
  table.innerHTML = `
    <div class="table-header" role="row">
      ${columns.map(([field, label]) => renderHeaderCell(field, label, sort)).join("")}
    </div>
    <div class="table-body">
      ${rows.length ? rows.map((row) => renderRow(row, permissions)).join("") : renderEmptyRow()}
    </div>
  `;
}

function renderHeaderCell(field, label, sort) {
  const active = sort.field === field;
  const direction = active ? sort.direction : "asc";

  return `
    <div class="table-cell header-cell ${active ? "sorted" : ""}" role="columnheader">
      <button data-sort="${field}" data-direction="${direction}" type="button">
        ${escapeHtml(label)}
        <span>${active && sort.direction === "desc" ? "down" : "up"}</span>
      </button>
      <span class="column-resizer" data-resize-column="${field}" aria-hidden="true"></span>
    </div>
  `;
}

function renderRow(creator, permissions) {
  return `
    <div class="table-row" data-open-creator="${escapeHtml(creator.id)}" role="row">
      <button class="table-cell creator-cell row-open-cell" data-open-creator="${escapeHtml(creator.id)}" type="button">
        ${renderAvatar(creator)}
        <span>
          <strong>${escapeHtml(creator.name)}</strong>
          <small>${escapeHtml(creator.channel)}</small>
        </span>
      </button>
      <div class="table-cell">${renderBadge(creator.platform, creator.platform)}</div>
      <div class="table-cell">${renderInlineSelect(creator, "status", permissions)}</div>
      <div class="table-cell">${renderInlineSelect(creator, "priority", permissions)}</div>
      <div class="table-cell">${renderUploadHealth(creator)}</div>
      <div class="table-cell">${renderInlineSelect(creator, "collabPosted", permissions)}</div>
      <div class="table-cell">${renderInlineSelect(creator, "dmSent", permissions)}</div>
      <div class="table-cell">${renderInlineNotes(creator, permissions)}</div>
    </div>
  `;
}

function renderInlineSelect(creator, field, permissions) {
  const disabled = permissions?.canEdit ? "" : "disabled";
  return `
    <label class="inline-field">
      <span>${escapeHtml(field)}</span>
      <select data-inline-field="${escapeHtml(field)}" data-creator-id="${escapeHtml(creator.id)}" ${disabled}>
        ${editableSelects[field].map((option) => `<option value="${escapeHtml(option)}" ${creator[field] === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderInlineNotes(creator, permissions) {
  const disabled = permissions?.canEdit ? "" : "disabled";
  return `
    <label class="inline-field notes-inline">
      <span>Notes</span>
      <input data-inline-field="notes" data-creator-id="${escapeHtml(creator.id)}" type="text" value="${escapeHtml(creator.notes)}" placeholder="Add note..." ${disabled} />
    </label>
  `;
}

function renderEmptyRow() {
  return `
    <div class="empty-table">
      <strong>No creators match these filters.</strong>
      <span>Try clearing filters or changing the search query.</span>
    </div>
  `;
}

function getColumnTemplate(widths = {}) {
  return columns
    .map(([field]) => `${widths[field] || defaultWidth(field)}px`)
    .join(" ");
}

function defaultWidth(field) {
  const widths = {
    name: 260,
    platform: 130,
    status: 150,
    priority: 140,
    days: 160,
    collabPosted: 130,
    dmSent: 120,
    notes: 220,
  };

  return widths[field] || 140;
}
