import { escapeHtml, safeUrl } from "../utils/format.js";

const roles = ["viewer", "manager", "administrator", "owner"];
const roleLabels = {
  viewer: "Viewer",
  manager: "Manager",
  administrator: "Administrator",
  owner: "Owner",
};

export function renderAdmin({ users, audit, backups, permissions }) {
  renderUsers(users, permissions);
  renderBackups(backups, permissions);
  renderAudit(audit);
}

function renderUsers(users, permissions) {
  const container = document.getElementById("usersList");

  if (!permissions.canManageUsers) {
    container.innerHTML = `<p class="empty-state">Administrator role required.</p>`;
    return;
  }

  if (!users.length) {
    container.innerHTML = `<p class="empty-state">No users yet.</p>`;
    return;
  }

  container.innerHTML = users.map((user) => `
    <article class="admin-row">
      <div class="profile-chip">
        ${safeUrl(user.avatar) ? `<img class="avatar" src="${escapeHtml(safeUrl(user.avatar))}" alt="${escapeHtml(user.username)} avatar" />` : `<span class="avatar">${escapeHtml(getInitials(user.username))}</span>`}
        <div>
          <strong>${escapeHtml(user.username)}</strong>
          <span>${escapeHtml(user.discord_id)}</span>
        </div>
      </div>
      <select data-user-role="${escapeHtml(user.discord_id)}">
        ${roles.map((role) => `<option value="${role}" ${role === user.role ? "selected" : ""}>${roleLabels[role]}</option>`).join("")}
      </select>
    </article>
  `).join("");
}

function renderBackups(backups, permissions) {
  const container = document.getElementById("backupsList");

  if (!permissions.canRestoreBackups) {
    container.innerHTML = `<p class="empty-state">Administrator role required.</p>`;
    return;
  }

  if (!backups.length) {
    container.innerHTML = `<p class="empty-state">No server backups yet.</p>`;
    return;
  }

  container.innerHTML = backups.map((backup) => `
    <article class="admin-row">
      <div>
        <strong>${escapeHtml(backup.reason)}</strong>
        <span>${escapeHtml(backup.type || "manual")} / ${escapeHtml(backup.created_at)} by ${escapeHtml(backup.created_by_username || "System")}</span>
      </div>
      <button class="button button-secondary" data-restore-backup="${backup.id}" type="button">Restore</button>
    </article>
  `).join("");
}

function renderAudit(audit) {
  const container = document.getElementById("auditList");

  if (!audit.length) {
    container.innerHTML = `<p class="empty-state">No audit events yet.</p>`;
    return;
  }

  container.innerHTML = audit.map((event) => `
    <article class="audit-row">
      <strong>${escapeHtml(event.action)}</strong>
      <span>${escapeHtml(event.username || "Unknown")} / ${escapeHtml(event.discord_id || "anonymous")}</span>
      <span>${escapeHtml(event.creator_id || "-")} ${escapeHtml(event.field || "")}</span>
      <code>${escapeHtml(event.old_value || "")} -> ${escapeHtml(event.new_value || "")}</code>
      <time>${escapeHtml(event.timestamp)}</time>
    </article>
  `).join("");
}

function getInitials(name) {
  return String(name || "U").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
