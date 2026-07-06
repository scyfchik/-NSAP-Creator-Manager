const STATE_KEY = "nsap-creator-manager:view-state";
const SETTINGS_KEY = "nsap-creator-manager:settings";

export function loadViewState(defaultState) {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? { ...defaultState, ...JSON.parse(raw) } : defaultState;
  } catch {
    return defaultState;
  }
}

export function saveViewState(state) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export function loadSettings(defaultSettings) {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
