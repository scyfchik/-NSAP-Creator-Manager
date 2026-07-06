import { api } from "./data/apiClient.js";
import { loadCreators } from "./data/creatorsRepository.js";
import { applyCreatorFilters, paginateCreators } from "./state/filters.js";
import { loadSettings, loadViewState, saveSettings, saveViewState } from "./state/storage.js";
import { renderAdmin } from "./ui/admin.js";
import { renderDashboard } from "./ui/dashboard.js";
import { renderCreatorsTable } from "./ui/creatorsTable.js";
import { renderFilterOptions } from "./ui/filters.js";
import { getEditableField, openCreatorModal } from "./ui/modal.js";
import { renderSettings } from "./ui/settings.js";
import { showToast } from "./ui/toast.js";

const reminder = "Hey! Hope you're doing well. Just wanted to remind you to keep posting Night Shift at Paulie's content when possible, especially with upcoming updates/collabs. If you need any info or ideas, feel free to ask. Thank you!";

const defaultState = {
  view: "dashboard",
  search: "",
  platform: "all",
  status: "all",
  priority: "all",
  collabPosted: "all",
  dmSent: "all",
  followUpOnly: false,
  collabMissingOnly: false,
  sort: {
    field: "priority",
    direction: "asc",
  },
  page: 1,
  pageSize: 10,
  columnWidths: {},
};

const defaultSettings = {
  accentColor: "#3dd6d0",
  density: "comfortable",
};

let creators = [];
let sourceUrl = "SQLite API";
let savedAt = "";
let activeCreatorId = null;
let state = loadViewState(defaultState);
let settings = loadSettings(defaultSettings);
let undoStack = [];
let session = {
  authenticated: false,
  user: null,
  permissions: {
    canEdit: false,
    canImportExport: false,
    canManageUsers: false,
    canRestoreBackups: false,
    role: "viewer",
    roleLabel: "Viewer",
  },
};
let adminData = {
  users: [],
  audit: [],
  backups: [],
};

init();

async function init() {
  try {
    session = await api.getSession();
    const repository = await loadCreators();

    creators = repository.creators;
    sourceUrl = repository.sourceUrl;
    savedAt = new Date().toISOString();

    wireEvents();
    applySettings();
    await loadAdminData();
    renderAll();
    setSaveState("Database data loaded");
  } catch (error) {
    setSaveState("Could not load creator data");
    showToast(error.message || "Could not load creator data", "error");
    console.error(error);
  }
}

function wireEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.page = 1;
      persistViewState();
      renderAll();
    });
  });

  document.querySelectorAll("[data-filter-shortcut]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = "creators";
      state.followUpOnly = button.dataset.filterShortcut === "followUp";
      state.collabMissingOnly = button.dataset.filterShortcut === "collabMissing";
      state.page = 1;
      persistViewState();
      renderAll();
    });
  });

  document.getElementById("searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    state.page = 1;
    persistViewState();
    renderCreators();
  });

  document.getElementById("platformFilter").addEventListener("change", (event) => updateFilter("platform", event.target.value));
  document.getElementById("statusFilter").addEventListener("change", (event) => updateFilter("status", event.target.value));
  document.getElementById("priorityFilter").addEventListener("change", (event) => updateFilter("priority", event.target.value));
  document.getElementById("collabPostedFilter").addEventListener("change", (event) => updateFilter("collabPosted", event.target.value));
  document.getElementById("dmSentFilter").addEventListener("change", (event) => updateFilter("dmSent", event.target.value));
  document.getElementById("followUpFilter").addEventListener("change", (event) => updateFilter("followUpOnly", event.target.checked));
  document.getElementById("collabFilter").addEventListener("change", (event) => updateFilter("collabMissingOnly", event.target.checked));
  document.getElementById("pageSize").addEventListener("change", (event) => {
    state.pageSize = Number(event.target.value);
    state.page = 1;
    persistViewState();
    renderCreators();
  });

  document.getElementById("clearFilters").addEventListener("click", () => {
    state = {
      ...state,
      search: "",
      platform: "all",
      status: "all",
      priority: "all",
      collabPosted: "all",
      dmSent: "all",
      followUpOnly: false,
      collabMissingOnly: false,
      page: 1,
    };
    persistViewState();
    renderAll();
  });

  document.getElementById("prevPage").addEventListener("click", () => changePage(-1));
  document.getElementById("nextPage").addEventListener("click", () => changePage(1));
  document.getElementById("creatorTable").addEventListener("click", handleTableClick);
  document.getElementById("creatorTable").addEventListener("change", handleInlineEdit);
  document.getElementById("creatorTable").addEventListener("pointerdown", handleColumnResize);
  document.getElementById("dashboardView").addEventListener("click", handleOpenCreatorClick);
  document.getElementById("modalBody").addEventListener("input", handleModalEdit);
  document.getElementById("modalBody").addEventListener("change", handleModalEdit);
  document.getElementById("modalBody").addEventListener("click", handleModalClick);
  document.getElementById("copyReminder").addEventListener("click", () => copyReminder("copyReminder"));
  document.getElementById("copyReminderSettings").addEventListener("click", () => copyReminder("copyReminderSettings"));
  document.getElementById("exportJson").addEventListener("click", exportJson);
  document.getElementById("importJson").addEventListener("click", () => document.getElementById("importJsonInput").click());
  document.getElementById("importJsonInput").addEventListener("change", importJson);
  document.getElementById("undoEdit").addEventListener("click", undoLastEdit);
  document.getElementById("logoutButton").addEventListener("click", logout);
  document.getElementById("resetLocalData").addEventListener("click", refreshCreators);
  document.getElementById("accentColor").addEventListener("input", updateAccentColor);
  document.getElementById("densityMode").addEventListener("change", updateDensity);
  document.getElementById("createBackup").addEventListener("click", createBackup);
  document.getElementById("refreshAdmin").addEventListener("click", refreshAdmin);
  document.getElementById("usersList").addEventListener("change", handleUserRoleChange);
  document.getElementById("backupsList").addEventListener("click", handleBackupRestore);
  document.addEventListener("keydown", handleKeyboardShortcuts);
}

function renderAll() {
  document.getElementById("searchInput").value = state.search;
  renderAuth();
  renderNavigation();
  renderDashboard(creators);
  renderFilterOptions(creators, state);
  renderCreators();
  renderSettings({
    sourceUrl,
    usingLocalData: false,
    savedAt,
    totalCreators: creators.length,
    settings,
    backups: adminData.backups,
  });
  renderAdmin({
    ...adminData,
    permissions: session.permissions,
  });
  document.getElementById("undoEdit").disabled = undoStack.length === 0;
}

function renderNavigation() {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === `${state.view}View`);
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
}

function renderCreators() {
  const filtered = applyCreatorFilters(creators, state);
  const paginated = paginateCreators(filtered, state.page, state.pageSize);
  state.page = paginated.page;

  renderCreatorsTable({
    rows: paginated.rows,
    total: filtered.length,
    page: paginated.page,
    maxPage: paginated.maxPage,
    pageSize: state.pageSize,
    sort: state.sort,
    columnWidths: state.columnWidths,
    permissions: session.permissions,
  });

  renderFilterOptions(creators, state);
  persistViewState();
}

function updateFilter(field, value) {
  state[field] = value;
  state.page = 1;
  persistViewState();
  renderCreators();
}

function changePage(delta) {
  state.page += delta;
  persistViewState();
  renderCreators();
}

function handleTableClick(event) {
  const sortButton = event.target.closest("[data-sort]");
  if (sortButton) {
    const field = sortButton.dataset.sort;
    state.sort = {
      field,
      direction: state.sort.field === field && state.sort.direction === "asc" ? "desc" : "asc",
    };
    persistViewState();
    renderCreators();
    return;
  }

  handleOpenCreatorClick(event);
}

function handleOpenCreatorClick(event) {
  if (event.target.closest("[data-inline-field], .column-resizer")) {
    return;
  }

  const opener = event.target.closest("[data-open-creator]");
  if (!opener) {
    return;
  }

  const creator = creators.find((item) => item.id === opener.dataset.openCreator);
  if (!creator) {
    return;
  }

  activeCreatorId = creator.id;
  openCreatorModal(creator, session.permissions);
}

function handleModalEdit(event) {
  if (!session.permissions.canEdit || event.type === "input") {
    return;
  }

  const field = getEditableField(event.target);
  if (!field || !activeCreatorId) {
    return;
  }

  updateCreatorField(activeCreatorId, field, event.target.value, "modal");
}

function handleModalClick(event) {
  const button = event.target.closest("[data-copy-creator-reminder]");
  if (!button) {
    return;
  }

  copyText(reminder);
  button.textContent = "Copied";
  showToast("Reminder copied");
  window.setTimeout(() => {
    button.textContent = "Copy Reminder";
  }, 1200);
}

function handleInlineEdit(event) {
  if (!session.permissions.canEdit) {
    showToast("Manager role required", "error");
    renderCreators();
    return;
  }

  const control = event.target.closest("[data-inline-field]");
  if (!control) {
    return;
  }

  updateCreatorField(control.dataset.creatorId, control.dataset.inlineField, control.value, "table");
}

async function updateCreatorField(creatorId, field, value, source) {
  const creator = creators.find((item) => item.id === creatorId);
  if (!creator || creator[field] === value) {
    return;
  }

  const oldValue = creator[field] ?? "";

  try {
    const response = await api.updateCreator(creatorId, field, value);
    replaceCreator(response.creator);
    undoStack.unshift({ creatorId, field, oldValue });
    undoStack = undoStack.slice(0, 10);
    document.getElementById("undoEdit").disabled = false;
    savedAt = new Date().toISOString();
    setSaveState("Saved to database");
    showToast("Saved");
    renderDashboard(creators);
    renderCreators();
  } catch (error) {
    showToast(error.message, "error");
    renderCreators();
  }

  if (source === "modal") {
    activeCreatorId = creator.id;
  }
}

async function undoLastEdit() {
  const snapshot = undoStack.shift();
  if (!snapshot) {
    return;
  }

  try {
    const response = await api.updateCreator(snapshot.creatorId, snapshot.field, snapshot.oldValue);
    replaceCreator(response.creator);
    renderAll();
    showToast("Last edit undone");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function persistViewState() {
  saveViewState(state);
}

async function copyReminder(buttonId) {
  await copyText(reminder);
  const button = document.getElementById(buttonId);
  const originalText = button.textContent;
  button.textContent = "Copied";
  showToast("Reminder copied");
  window.setTimeout(() => {
    button.textContent = originalText;
  }, 1200);
}

async function copyText(text) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function exportJson() {
  if (!session.permissions.canImportExport) {
    showToast("Admin role required", "error");
    return;
  }

  exportJsonFromApi();
}

async function exportJsonFromApi() {
  const payload = await api.exportCreators();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `creators-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
  showToast("Export complete");
}

async function importJson(event) {
  if (!session.permissions.canImportExport) {
    showToast("Admin role required", "error");
    event.target.value = "";
    return;
  }

  const file = event.target.files?.[0];
  event.target.value = "";

  if (!file) {
    return;
  }

  try {
    const payload = JSON.parse(await file.text());
    const response = await api.importCreators(payload);
    creators = response.creators;
    undoStack = [];
    await loadAdminData();
    renderAll();
    showToast("Import successful");
  } catch (error) {
    showToast(error.message || "Invalid JSON file", "error");
  }
}

async function refreshCreators() {
  const repository = await loadCreators();
  creators = repository.creators;
  await loadAdminData();
  renderAll();
  setSaveState("Database data refreshed");
  showToast("Data refreshed");
}

async function logout() {
  await api.logout();
  window.location.reload();
}

async function loadAdminData() {
  if (!session.permissions.canManageUsers) {
    adminData = { users: [], audit: [], backups: [] };
    return;
  }

  const [users, audit, backups] = await Promise.all([
    api.getUsers(),
    api.getAudit(),
    api.getBackups(),
  ]);

  adminData = {
    users: users.users,
    audit: audit.audit,
    backups: backups.backups,
  };
}

async function refreshAdmin() {
  try {
    await loadAdminData();
    renderAll();
    showToast("Admin data refreshed");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function createBackup() {
  if (!session.permissions.canRestoreBackups) {
    showToast("Administrator role required", "error");
    return;
  }

  try {
    const response = await api.createBackup();
    adminData.backups = response.backups;
    renderAll();
    showToast("Backup created");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function handleUserRoleChange(event) {
  const select = event.target.closest("[data-user-role]");
  if (!select) {
    return;
  }

  try {
    await api.updateUserRole(select.dataset.userRole, select.value);
    await loadAdminData();
    renderAll();
    showToast("User role updated");
  } catch (error) {
    showToast(error.message, "error");
    await refreshAdmin();
  }
}

async function handleBackupRestore(event) {
  const button = event.target.closest("[data-restore-backup]");
  if (!button) {
    return;
  }

  try {
    const response = await api.restoreBackup(button.dataset.restoreBackup);
    creators = response.creators;
    undoStack = [];
    await loadAdminData();
    renderAll();
    showToast("Backup restored");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function replaceCreator(updatedCreator) {
  creators = creators.map((creator) => creator.id === updatedCreator.id ? updatedCreator : creator);
}

function renderAuth() {
  const userLabel = session.user?.username || "Anonymous";
  document.getElementById("authUser").textContent = userLabel;
  document.getElementById("authRole").textContent = session.permissions.roleLabel || session.permissions.role || "Viewer";
  document.getElementById("loginButton").hidden = session.authenticated;
  document.getElementById("logoutButton").hidden = !session.authenticated;
  document.getElementById("importJson").disabled = !session.permissions.canImportExport;
  document.getElementById("exportJson").disabled = !session.permissions.canImportExport;
  document.getElementById("createBackup").disabled = !session.permissions.canRestoreBackups;
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.hidden = !session.permissions.canManageUsers;
  });

  if (state.view === "admin" && !session.permissions.canManageUsers) {
    state.view = "dashboard";
  }
}

function setSaveState(message) {
  document.getElementById("saveState").textContent = message;
}

function updateAccentColor(event) {
  settings.accentColor = event.target.value;
  saveSettings(settings);
  applySettings();
  showToast("Accent saved");
}

function updateDensity(event) {
  settings.density = event.target.value;
  saveSettings(settings);
  applySettings();
  showToast("Density saved");
}

function applySettings() {
  document.documentElement.style.setProperty("--accent", settings.accentColor);
  document.body.dataset.density = settings.density;
}

function handleKeyboardShortcuts(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
    event.preventDefault();
    state.view = "creators";
    renderAll();
    document.getElementById("searchInput").focus();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    exportJson();
    return;
  }

  if (event.key === "Escape" && document.getElementById("creatorDialog").open) {
    document.getElementById("creatorDialog").close();
  }
}

function handleColumnResize(event) {
  const resizer = event.target.closest("[data-resize-column]");
  if (!resizer) {
    return;
  }

  const field = resizer.dataset.resizeColumn;
  const startX = event.clientX;
  const startWidth = state.columnWidths[field] || resizer.parentElement.getBoundingClientRect().width;

  resizer.setPointerCapture(event.pointerId);

  const onMove = (moveEvent) => {
    const width = Math.max(90, Math.round(startWidth + moveEvent.clientX - startX));
    state.columnWidths = {
      ...state.columnWidths,
      [field]: width,
    };
    document.getElementById("creatorTable").style.setProperty("--creator-columns", buildColumnTemplate());
  };

  const onUp = () => {
    persistViewState();
    resizer.removeEventListener("pointermove", onMove);
    resizer.removeEventListener("pointerup", onUp);
  };

  resizer.addEventListener("pointermove", onMove);
  resizer.addEventListener("pointerup", onUp);
}

function buildColumnTemplate() {
  const defaults = {
    name: 260,
    platform: 130,
    status: 150,
    priority: 140,
    days: 160,
    collabPosted: 130,
    dmSent: 120,
    notes: 220,
  };

  return Object.keys(defaults)
    .map((field) => `${state.columnWidths[field] || defaults[field]}px`)
    .join(" ");
}
