import en from "./en.js";
import ru from "./ru.js";

const STORAGE_KEY = "nsap-creator-manager:language";
const dictionaries = { en, ru };
let language = readLanguage();

export function t(key, values = {}) {
  const template = dictionaries[language]?.[key] ?? en[key] ?? key;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
}

export function getLanguage() {
  return language;
}

export function setLanguage(nextLanguage) {
  language = dictionaries[nextLanguage] ? nextLanguage : "en";
  localStorage.setItem(STORAGE_KEY, language);
  applyStaticTranslations();
  window.dispatchEvent(new CustomEvent("languagechange", { detail: { language } }));
}

export function applyStaticTranslations(root = document) {
  document.documentElement.lang = language;
  root.querySelectorAll("[data-i18n]").forEach((element) => { element.textContent = t(element.dataset.i18n); });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  root.querySelectorAll("[data-i18n-title]").forEach((element) => { element.title = t(element.dataset.i18nTitle); });
  root.querySelectorAll("[data-i18n-aria-label]").forEach((element) => { element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel)); });
}

function readLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return dictionaries[saved] ? saved : "en";
  } catch {
    return "en";
  }
}
