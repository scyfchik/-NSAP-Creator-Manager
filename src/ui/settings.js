import { futureIntegrations } from "../data/integrations.js";
import { getLanguage, t } from "../i18n/index.js";
import { escapeHtml } from "../utils/format.js";

export function renderSettings({ sourceUrl, savedAt, totalCreators, settings, backups }) {
  document.getElementById("dataSourceSummary").innerHTML = `
    <div class="settings-summary-item"><span>${t("settings.source")}</span><strong>${escapeHtml(sourceUrl)}</strong></div>
    <div class="settings-summary-item"><span>${t("settings.loaded")}</span><strong>${totalCreators}</strong></div>
    <div class="settings-summary-item"><span>${t("settings.lastSynced")}</span><strong>${escapeHtml(formatSavedAt(savedAt))}</strong></div>
    <div class="settings-summary-item"><span>${t("settings.backups")}</span><strong>${backups.length}</strong></div>
  `;

  document.getElementById("accentColor").value = settings.accentColor;
  document.getElementById("densityMode").value = settings.density;
  document.getElementById("languageMode").value = getLanguage();

  document.getElementById("integrationList").innerHTML = futureIntegrations
    .map((integration) => `
      <article class="integration-item">
        <span class="integration-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="5"/></svg></span>
        <div>
          <strong>${escapeHtml(t(`integration.${integration.id}.name`))}</strong>
          <p>${escapeHtml(t(`integration.${integration.id}.description`))}</p>
        </div>
        <span class="integration-status">${escapeHtml(t("integration.prepared"))}</span>
      </article>
    `)
    .join("");
}

function formatSavedAt(savedAt) {
  if (!savedAt) {
    return t("settings.thisBrowser");
  }

  return new Date(savedAt).toLocaleString(getLanguage() === "ru" ? "ru-RU" : "en-US");
}
