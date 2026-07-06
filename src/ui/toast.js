import { escapeHtml } from "../utils/format.js";

export function showToast(message, tone = "success") {
  const stack = document.getElementById("toastStack");
  const toast = document.createElement("div");

  toast.className = `toast toast-${tone}`;
  toast.innerHTML = `<strong>${escapeHtml(message)}</strong>`;
  stack.append(toast);

  window.setTimeout(() => {
    toast.classList.add("leaving");
    window.setTimeout(() => toast.remove(), 220);
  }, 2600);
}
