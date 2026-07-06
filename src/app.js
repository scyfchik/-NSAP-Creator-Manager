import { api } from "./data/apiClient.js";
import { loadCreators } from "./data/creatorsRepository.js";
import { applyCreatorFilters, paginateCreators } from "./state/filters.js";
import { loadSettings, loadViewState, saveSettings, saveViewState } from "./state/storage.js";
import { renderAdmin } from "./ui/admin.js";
import { renderDashboard } from "./ui/dashboard.js";
import { renderCreatorsTable } from "./ui/creatorsTable.js";
import { renderFilterOptions } from "./ui/filters.js";
import {
  getFormValues,
  openAddCreatorModal,
  openCreatorModal,
  reminderTemplates,
  renderCreatorDetails,
  renderDeleteConfirmModal,
  renderEditProfileModal,
} from "./ui/modal.js";
import { renderSettings } from "./ui/settings.js";
import { showToast } from "./ui/toast.js";

const reminder = "Hey! Hope you're doing well. Just wanted to remind you to keep posting Night Shift at Paulie's content when possible, especially with upcoming updates/collabs. If you need any info or ideas, feel free to ask. Thank you!";
const unsavedMessage = "You have unsaved changes. Are you sure you want to leave?";

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
  sidebarCollapsed: false,
  sidebarWidth: 280,
};

let creators = [];
let sourceUrl = "SQLite API";
let savedAt = "";
let activeCreatorId = null;
let state = loadViewState(defaultState);
let settings = loadSettings(defaultSettings);
let settingsDraft = { ...settings };
let undoStack = [];
let quickNoteTimers = new Map();
let modalDirty = false;
let modalMode = "";
let modalInitialSnapshot = "";
let modalSaving = false;
let settingsDirty = false;
let session = {
  authenticated: false,
  user: null,
  permissions: {
    canEdit: false,
    canImportExport: false,
    canManageUsers: false,
    canRestoreBackups: false,
    canDeleteCreators: false,
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
      if (!confirmLeaveDirty()) {
        return;
      }
      state.view = button.dataset.view;
      state.page = 1;
      persistViewState();
      renderAll();
    });
  });

  document.querySelectorAll("[data-filter-shortcut]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!confirmLeaveDirty()) {
        return;
      }
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
  document.getElementById("creatorTable").addEventListener("input", handleInlineInput);
  document.getElementById("creatorTable").addEventListener("change", handleInlineEdit);
  document.getElementById("creatorTable").addEventListener("pointerdown", handleColumnResize);
  document.getElementById("dashboardView").addEventListener("click", handleOpenCreatorClick);
  document.getElementById("modalBody").addEventListener("input", handleModalEdit);
  document.getElementById("modalBody").addEventListener("change", handleModalEdit);
  document.getElementById("modalBody").addEventListener("click", handleModalClick);
  document.getElementById("closeDialog").addEventListener("click", requestCloseModal);
  document.getElementById("creatorDialog").addEventListener("cancel", (event) => {
    if (!confirmLeaveModal()) {
      event.preventDefault();
    }
  });
  document.getElementById("copyReminder").addEventListener("click", () => copyReminder("copyReminder"));
  document.getElementById("addCreator").addEventListener("click", handleOpenAddCreator);
  document.getElementById("copyReminderSettings").addEventListener("click", () => copyReminder("copyReminderSettings"));
  document.getElementById("exportJson").addEventListener("click", exportJson);
  document.getElementById("importJson").addEventListener("click", () => document.getElementById("importJsonInput").click());
  document.getElementById("importJsonInput").addEventListener("change", importJson);
  document.getElementById("undoEdit").addEventListener("click", undoLastEdit);
  document.getElementById("logoutButton").addEventListener("click", logout);
  document.getElementById("resetLocalData").addEventListener("click", refreshCreators);
  document.getElementById("accentColor").addEventListener("input", updateAccentColor);
  document.getElementById("densityMode").addEventListener("change", updateDensity);
  document.getElementById("saveSettings").addEventListener("click", saveSettingsChanges);
  document.getElementById("createBackup").addEventListener("click", createBackup);
  document.getElementById("refreshAdmin").addEventListener("click", refreshAdmin);
  document.getElementById("usersList").addEventListener("change", handleUserRoleChange);
  document.getElementById("backupsList").addEventListener("click", handleBackupRestore);
  document.getElementById("sidebarToggle").addEventListener("click", toggleSidebar);
  document.getElementById("sidebarResizer").addEventListener("pointerdown", handleSidebarResize);
  document.addEventListener("keydown", handleKeyboardShortcuts);
  window.addEventListener("beforeunload", handleBeforeUnload);
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
    settings: settingsDraft,
    backups: adminData.backups,
  });
  renderAdmin({
    ...adminData,
    permissions: session.permissions,
  });
  updateSettingsDirtyUi();
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

  if (activeCreatorId && activeCreatorId !== creator.id && !confirmLeaveModal()) {
    return;
  }

  activeCreatorId = creator.id;
  openCreatorModal(creator, session.permissions);
  initializeModalDirty("timeline");
}

function handleModalEdit(event) {
  const target = event.target;
  if (target.closest("#addCreatorForm")) {
    setModalDirty(serializeForm("addCreatorForm") !== modalInitialSnapshot);
    return;
  }

  if (target.closest("#editCreatorForm")) {
    setModalDirty(serializeForm("editCreatorForm") !== modalInitialSnapshot);
    return;
  }

  if (target.id === "timelineMessage" || target.id === "timelineType") {
    setModalDirty(Boolean(document.getElementById("timelineMessage")?.value.trim()));
  }
}

function handleModalClick(event) {
  const addButton = event.target.closest("[data-save-new-creator]");
  if (addButton) {
    createCreator(addButton);
    return;
  }

  const editButton = event.target.closest("[data-edit-profile]");
  if (editButton) {
    if (!confirmLeaveModal()) {
      return;
    }
    const creator = getCreatorById(editButton.dataset.editProfile);
    if (creator) {
      renderEditProfileModal(creator);
      initializeModalDirty("profile", "editCreatorForm");
    }
    return;
  }

  const cancelEdit = event.target.closest("[data-cancel-profile-edit]");
  if (cancelEdit) {
    if (!confirmLeaveModal()) {
      return;
    }
    const creator = getCreatorById(cancelEdit.dataset.cancelProfileEdit);
    if (creator) {
      renderCreatorDetails(creator, session.permissions);
      initializeModalDirty("timeline");
    }
    return;
  }

  const saveProfile = event.target.closest("[data-save-profile]");
  if (saveProfile) {
    saveCreatorProfile(saveProfile.dataset.saveProfile, saveProfile);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-creator]");
  if (deleteButton) {
    if (!confirmLeaveModal()) {
      return;
    }
    const creator = getCreatorById(deleteButton.dataset.deleteCreator);
    if (creator) {
      renderDeleteConfirmModal(creator);
    }
    return;
  }

  const confirmDelete = event.target.closest("[data-confirm-delete]");
  if (confirmDelete) {
    deleteCreator(confirmDelete.dataset.confirmDelete);
    return;
  }

  const timelineButton = event.target.closest("[data-save-timeline-entry]");
  if (timelineButton && activeCreatorId) {
    addTimelineEntry(activeCreatorId, timelineButton);
    return;
  }

  const copyTemplate = event.target.closest("[data-copy-template]");
  if (copyTemplate) {
    if (!confirmLeaveModal()) {
      return;
    }
    copyCreatorReminder(copyTemplate.dataset.copyTemplate);
    return;
  }

  const markDmSent = event.target.closest("[data-mark-dm-sent]");
  if (markDmSent) {
    if (!confirmLeaveModal()) {
      return;
    }
    markCreatorDmSent(markDmSent.dataset.markDmSent);
  }
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

  if (control.dataset.inlineField === "quickNote") {
    return;
  }

  updateCreatorField(control.dataset.creatorId, control.dataset.inlineField, control.value, "table");
}

function handleInlineInput(event) {
  const control = event.target.closest("[data-inline-field='quickNote']");
  if (!control) {
    return;
  }

  if (!session.permissions.canEdit) {
    showToast("Manager role required", "error");
    renderCreators();
    return;
  }

  const creatorId = control.dataset.creatorId;
  window.clearTimeout(quickNoteTimers.get(creatorId));
  quickNoteTimers.set(creatorId, window.setTimeout(() => {
    updateCreatorField(creatorId, "quickNote", control.value, "table");
    quickNoteTimers.delete(creatorId);
  }, 650));
}

function handleOpenAddCreator() {
  if (!session.permissions.canEdit) {
    showToast("Manager role required", "error");
    return;
  }

  if (!confirmLeaveModal()) {
    return;
  }

  activeCreatorId = null;
  openAddCreatorModal();
  initializeModalDirty("add", "addCreatorForm");
}

async function createCreator(button) {
  if (!session.permissions.canEdit) {
    showToast("Manager role required", "error");
    return;
  }

  if (modalSaving || !modalDirty) {
    return;
  }

  setSaveLoading(button, true);
  try {
    const response = await api.createCreator(getFormValues("addCreatorForm"));
    creators = [response.creator, ...creators];
    activeCreatorId = response.creator.id;
    savedAt = new Date().toISOString();
    resetModalDirty();
    renderAll();
    openCreatorModal(response.creator, session.permissions);
    initializeModalDirty("timeline");
    showToast("Changes saved successfully.");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setSaveLoading(button, false);
  }
}

async function saveCreatorProfile(creatorId, button) {
  if (!session.permissions.canEdit) {
    showToast("Manager role required", "error");
    return;
  }

  if (modalSaving || !modalDirty) {
    return;
  }

  setSaveLoading(button, true);
  try {
    const response = await api.updateCreatorProfile(creatorId, getFormValues("editCreatorForm"));
    replaceCreator(response.creator);
    savedAt = new Date().toISOString();
    resetModalDirty();
    renderAll();
    activeCreatorId = response.creator.id;
    openCreatorModal(response.creator, session.permissions);
    initializeModalDirty("timeline");
    showToast("Changes saved successfully.");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setSaveLoading(button, false);
  }
}

async function deleteCreator(creatorId) {
  if (!session.permissions.canDeleteCreators) {
    showToast("Administrator role required", "error");
    return;
  }

  try {
    const confirmation = document.getElementById("deleteConfirmation")?.value || "";
    await api.deleteCreator(creatorId, confirmation);
    creators = creators.filter((creator) => creator.id !== creatorId);
    activeCreatorId = null;
    resetModalDirty();
    document.getElementById("creatorDialog").close();
    renderAll();
    showToast("Creator deleted");
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function addTimelineEntry(creatorId, button) {
  const message = document.getElementById("timelineMessage")?.value || "";
  const type = document.getElementById("timelineType")?.value || "note";

  if (modalSaving || !modalDirty) {
    return;
  }

  setSaveLoading(button, true);
  try {
    const response = await api.addTimelineEntry(creatorId, { type, message });
    replaceCreator(response.creator);
    resetModalDirty();
    renderCreatorDetails(response.creator, session.permissions);
    initializeModalDirty("timeline");
    showToast("Changes saved successfully.");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setSaveLoading(button, false);
  }
}

async function copyCreatorReminder(creatorId) {
  const creator = getCreatorById(creatorId);
  if (!creator) {
    return;
  }

  const templateKey = document.getElementById("reminderTemplate")?.value || "inactivity";
  const template = reminderTemplates[templateKey] || reminderTemplates.inactivity;
  await copyText(template.build(creator));
  showToast("Reminder copied");

  if (session.permissions.canEdit) {
    try {
      const response = await api.addTimelineEntry(creatorId, {
        type: "reminder_sent",
        message: template.timeline,
      });
      replaceCreator(response.creator);
      renderCreatorDetails(response.creator, session.permissions);
    } catch (error) {
      showToast(error.message, "error");
    }
  }
}

async function markCreatorDmSent(creatorId) {
  if (!session.permissions.canEdit) {
    showToast("Manager role required", "error");
    return;
  }

  try {
    const response = await api.markDmSent(creatorId);
    replaceCreator(response.creator);
    renderAll();
    openCreatorModal(response.creator, session.permissions);
    showToast("DM marked sent");
  } catch (error) {
    showToast(error.message, "error");
  }
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
  const templateKey = document.getElementById("globalReminderTemplate")?.value || "inactivity";
  const template = reminderTemplates[templateKey] || reminderTemplates.inactivity;
  await copyText(template.build({ name: "there", status: "Active" }) || reminder);
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

function getCreatorById(creatorId) {
  return creators.find((creator) => creator.id === creatorId);
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
  document.getElementById("addCreator").hidden = !session.permissions.canEdit;
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

function initializeModalDirty(mode, formId = "") {
  modalMode = mode;
  modalInitialSnapshot = formId ? serializeForm(formId) : "";
  setModalDirty(false);
}

function serializeForm(formId) {
  return JSON.stringify(getFormValues(formId));
}

function setModalDirty(isDirty) {
  modalDirty = Boolean(isDirty);
  updateModalDirtyUi();
}

function resetModalDirty() {
  modalDirty = false;
  modalMode = "";
  modalInitialSnapshot = "";
  modalSaving = false;
  updateModalDirtyUi();
}

function updateModalDirtyUi() {
  document.querySelectorAll("[data-dirty-badge]").forEach((badge) => {
    badge.hidden = !modalDirty;
  });

  const saveSelectors = [
    "[data-save-new-creator]",
    "[data-save-profile]",
    "[data-save-timeline-entry]",
  ];

  document.querySelectorAll(saveSelectors.join(",")).forEach((button) => {
    button.disabled = !modalDirty || modalSaving;
  });
}

function setSaveLoading(button, isLoading) {
  modalSaving = isLoading;
  if (!button) {
    updateModalDirtyUi();
    return;
  }

  button.disabled = isLoading || !modalDirty;
  button.classList.toggle("is-saving", isLoading);
  button.textContent = isLoading ? "Saving..." : "Save Changes";
  updateModalDirtyUi();
}

function confirmLeaveModal() {
  if (!modalDirty) {
    return true;
  }

  const confirmed = window.confirm(unsavedMessage);
  if (confirmed) {
    resetModalDirty();
  }
  return confirmed;
}

function confirmLeaveDirty() {
  if (!modalDirty && !settingsDirty) {
    return true;
  }

  const confirmed = window.confirm(unsavedMessage);
  if (confirmed) {
    resetModalDirty();
    settingsDraft = { ...settings };
    setSettingsDirty(false);
    applySettings(settings);
    const dialog = document.getElementById("creatorDialog");
    if (dialog.open) {
      dialog.close();
    }
  }
  return confirmed;
}

function requestCloseModal() {
  if (!confirmLeaveModal()) {
    return;
  }

  resetModalDirty();
  activeCreatorId = null;
  document.getElementById("creatorDialog").close();
}

function handleBeforeUnload(event) {
  if (!modalDirty && !settingsDirty) {
    return;
  }

  event.preventDefault();
  event.returnValue = unsavedMessage;
}

function setSettingsDirty(isDirty) {
  settingsDirty = Boolean(isDirty);
  updateSettingsDirtyUi();
}

function isSettingsDraftDirty() {
  return JSON.stringify(settingsDraft) !== JSON.stringify(settings);
}

function updateSettingsDirtyUi() {
  const badge = document.getElementById("settingsDirtyBadge");
  const button = document.getElementById("saveSettings");
  if (!badge || !button) {
    return;
  }

  badge.hidden = !settingsDirty;
  button.disabled = !settingsDirty;
}

function updateAccentColor(event) {
  settingsDraft.accentColor = event.target.value;
  setSettingsDirty(isSettingsDraftDirty());
  applySettings(settingsDraft);
}

function updateDensity(event) {
  settingsDraft.density = event.target.value;
  setSettingsDirty(isSettingsDraftDirty());
  applySettings(settingsDraft);
}

function saveSettingsChanges() {
  const button = document.getElementById("saveSettings");
  if (!settingsDirty || button.disabled) {
    return;
  }

  button.disabled = true;
  button.classList.add("is-saving");
  button.textContent = "Saving...";

  try {
    settings = { ...settingsDraft };
    saveSettings(settings);
    setSettingsDirty(false);
    applySettings(settings);
    showToast("Changes saved successfully.");
  } catch (error) {
    showToast(error.message || "Unable to save settings", "error");
    updateSettingsDirtyUi();
  } finally {
    button.classList.remove("is-saving");
    button.textContent = "Save Changes";
    updateSettingsDirtyUi();
  }
}

function applySettings(source = settings) {
  document.documentElement.style.setProperty("--accent", source.accentColor);
  document.documentElement.style.setProperty("--sidebar-width", `${source.sidebarWidth || 280}px`);
  document.body.dataset.density = source.density;
  document.body.dataset.sidebar = source.sidebarCollapsed ? "collapsed" : "expanded";
}

function toggleSidebar() {
  settings.sidebarCollapsed = !settings.sidebarCollapsed;
  settingsDraft = { ...settings };
  saveSettings(settings);
  applySettings();
}

function handleSidebarResize(event) {
  const startX = event.clientX;
  const startWidth = settings.sidebarWidth || 280;

  event.target.setPointerCapture(event.pointerId);

  const onMove = (moveEvent) => {
    const width = Math.min(320, Math.max(72, Math.round(startWidth + moveEvent.clientX - startX)));
    settings.sidebarWidth = width;
    settings.sidebarCollapsed = width <= 96;
    settingsDraft = { ...settings };
    applySettings();
  };

  const onUp = () => {
    saveSettings(settings);
    event.target.removeEventListener("pointermove", onMove);
    event.target.removeEventListener("pointerup", onUp);
  };

  event.target.addEventListener("pointermove", onMove);
  event.target.addEventListener("pointerup", onUp);
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
    requestCloseModal();
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
    quickNote: 220,
    followUpDate: 150,
    notes: 220,
  };

  return Object.keys(defaults)
    .map((field) => `${state.columnWidths[field] || defaults[field]}px`)
    .join(" ");
}
