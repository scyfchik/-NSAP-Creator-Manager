import { futureIntegrations } from "../data/integrations.js";
import { getLanguage, t } from "../i18n/index.js";
import { escapeHtml } from "../utils/format.js";

export function renderSettings({ sourceUrl, savedAt, totalCreators, settings, backups }) {
  document.getElementById("dataSourceSummary").innerHTML = `
    <p><strong>${t("settings.source")}</strong> ${escapeHtml(sourceUrl)}</p>
    <p><strong>${t("settings.loaded")}</strong> ${totalCreators}</p>
    <p><strong>${t("settings.lastSynced")}</strong> ${escapeHtml(formatSavedAt(savedAt))}</p>
    <p><strong>${t("settings.backups")}</strong> ${backups.length}</p>
  `;

  document.getElementById("accentColor").value = settings.accentColor;
  document.getElementById("densityMode").value = settings.density;
  document.getElementById("languageMode").value = getLanguage();

  document.getElementById("integrationList").innerHTML = futureIntegrations
    .map((integration) => `
      <article class="integration-item">
        <div>
          <strong>${escapeHtml(t(`integration.${integration.id}.name`))}</strong>
          <p>${escapeHtml(t(`integration.${integration.id}.description`))}</p>
        </div>
        <span>${escapeHtml(t("integration.prepared"))}</span>
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
