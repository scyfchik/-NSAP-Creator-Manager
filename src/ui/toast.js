import { escapeHtml } from "../utils/format.js";

export function showToast(message, tone = "success") {
  const stack = document.getElementById("toastStack");
  const toast = document.createElement("div");

  toast.className = `toast toast-${tone}`;
  toast.setAttribute("role", tone === "error" ? "alert" : "status");
  const icon = tone === "error"
    ? '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 17h.01"/></svg>'
    : '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>';
  toast.innerHTML = `<span class="toast-icon" aria-hidden="true">${icon}</span><strong>${escapeHtml(message)}</strong>`;
  stack.append(toast);

  window.setTimeout(() => {
    toast.classList.add("leaving");
    window.setTimeout(() => toast.remove(), 220);
  }, 2600);
}
