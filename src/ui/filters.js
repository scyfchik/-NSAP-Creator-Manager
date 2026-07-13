import { getOptions } from "../utils/calculations.js";
import { t } from "../i18n/index.js";
import { escapeHtml } from "../utils/format.js";

export function renderFilterOptions(creators, state) {
  renderSelect("platformFilter", getOptions(creators, "platform"), state.platform);
  renderSelect("statusFilter", getOptions(creators, "status"), state.status);
  renderSelect("priorityFilter", getOptions(creators, "priority"), state.priority);

  document.getElementById("collabPostedFilter").value = state.collabPosted;
  document.getElementById("dmSentFilter").value = state.dmSent;
  document.getElementById("followUpFilter").checked = state.followUpOnly;
  document.getElementById("collabFilter").checked = state.collabMissingOnly;
}

function renderSelect(id, options, value) {
  const select = document.getElementById(id);
  select.innerHTML = [
    `<option value="all">${t("common.all")}</option>`,
    ...options.map((option) => {
      const translated = t(`value.${option}`);
      return `<option value="${escapeHtml(option)}">${escapeHtml(translated === `value.${option}` ? option : translated)}</option>`;
    }),
  ].join("");

  select.value = value;
}
