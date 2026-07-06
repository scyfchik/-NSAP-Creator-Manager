import { futureIntegrations } from "../data/integrations.js";
import { escapeHtml } from "../utils/format.js";

export function renderSettings({ sourceUrl, savedAt, totalCreators, settings, backups }) {
  document.getElementById("dataSourceSummary").innerHTML = `
    <p><strong>Source:</strong> ${escapeHtml(sourceUrl)}</p>
    <p><strong>Creators loaded:</strong> ${totalCreators}</p>
    <p><strong>Last synced:</strong> ${escapeHtml(formatSavedAt(savedAt))}</p>
    <p><strong>Server backups:</strong> ${backups.length}</p>
  `;

  document.getElementById("accentColor").value = settings.accentColor;
  document.getElementById("densityMode").value = settings.density;

  document.getElementById("integrationList").innerHTML = futureIntegrations
    .map((integration) => `
      <article class="integration-item">
        <div>
          <strong>${escapeHtml(integration.name)}</strong>
          <p>${escapeHtml(integration.description)}</p>
        </div>
        <span>${escapeHtml(integration.status)}</span>
      </article>
    `)
    .join("");
}

function formatSavedAt(savedAt) {
  if (!savedAt) {
    return "this browser";
  }

  return new Date(savedAt).toLocaleString();
}
