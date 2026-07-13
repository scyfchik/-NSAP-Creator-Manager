import { escapeHtml, safeUrl } from "../utils/format.js";
import { t } from "../i18n/index.js";

const roles = ["viewer", "manager", "administrator", "owner"];
export function renderAdmin({ users, audit, backups, creators, permissions }) {
  renderUsers(users, permissions);
  renderBackups(backups, permissions);
  renderAudit(audit);
  renderCreators(creators || [], permissions);
}

function renderCreators(creators, permissions) {
  const container = document.getElementById("adminCreatorsList");
  if (!container) return;
  if (!permissions.canDeleteCreators) {
    container.innerHTML = `<p class="empty-state">${t("admin.required")}</p>`;
    return;
  }
  if (!creators.length) {
    container.innerHTML = `<p class="empty-state">${t("admin.noCreators")}</p>`;
    return;
  }
  container.innerHTML = creators.map((creator) => `
    <article class="admin-creator-row" data-admin-creator-name="${escapeHtml(creator.name.toLowerCase())}">
      <div><strong>${escapeHtml(creator.name)}</strong><span>${escapeHtml(creator.id)}</span></div>
      <span>${escapeHtml(creator.primaryPlatform || creator.platforms.join(", ") || "-")}</span>
      <span>${escapeHtml(creator.primaryChannel || "-")}</span>
      <span>${escapeHtml(creator.syncStatus || "-")} ${escapeHtml(creator.lastSync || "")}</span>
      <span>${escapeHtml(creator.status)}</span>
      <button class="button button-danger-secondary" data-admin-delete-creator="${escapeHtml(creator.id)}" type="button">${escapeHtml(t("profile.delete"))}</button>
    </article>
  `).join("");
}

function renderUsers(users, permissions) {
  const container = document.getElementById("usersList");

  if (!permissions.canManageUsers) {
    container.innerHTML = `<p class="empty-state">${t("admin.required")}</p>`;
    return;
  }

  if (!users.length) {
    container.innerHTML = `<p class="empty-state">${t("admin.noUsers")}</p>`;
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
        ${roles.map((role) => `<option value="${role}" ${role === user.role ? "selected" : ""}>${escapeHtml(t(`role.${role}`))}</option>`).join("")}
      </select>
    </article>
  `).join("");
}

function renderBackups(backups, permissions) {
  const container = document.getElementById("backupsList");

  if (!permissions.canRestoreBackups) {
    container.innerHTML = `<p class="empty-state">${t("admin.required")}</p>`;
    return;
  }

  if (!backups.length) {
    container.innerHTML = `<p class="empty-state">${t("admin.noBackups")}</p>`;
    return;
  }

  container.innerHTML = backups.map((backup) => `
    <article class="admin-row">
      <div>
        <strong>${escapeHtml(backup.reason)}</strong>
        <span>${escapeHtml(backup.type || t("admin.manual"))} / ${escapeHtml(backup.created_at)} ${escapeHtml(t("admin.by"))} ${escapeHtml(backup.created_by_username || t("common.system"))}</span>
      </div>
      <button class="button button-danger-secondary" data-restore-backup="${backup.id}" type="button">${t("admin.restore")}</button>
    </article>
  `).join("");
}

function renderAudit(audit) {
  const container = document.getElementById("auditList");

  if (!audit.length) {
    container.innerHTML = `<p class="empty-state">${t("admin.noAudit")}</p>`;
    return;
  }

  container.innerHTML = audit.map((event) => `
    <article class="audit-row">
      <strong>${escapeHtml(formatAuditAction(event.action))}</strong>
      <span>${escapeHtml(event.username || t("common.unknown"))} / ${escapeHtml(event.discord_id || t("admin.anonymous"))}</span>
      <span>${escapeHtml(event.creator_id || "-")} ${escapeHtml(event.field || "")}</span>
      <details><summary>${escapeHtml(t("admin.details"))}</summary><code>${escapeHtml(event.old_value || "")} → ${escapeHtml(event.new_value || "")}</code></details>
      <time>${escapeHtml(event.timestamp)}</time>
    </article>
  `).join("");
}

function formatAuditAction(action) {
  return String(action || "").replace(/[._]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getInitials(name) {
  return String(name || "U").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
