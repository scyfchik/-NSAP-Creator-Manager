import { api } from "./data/apiClient.js";
import { loadCreators } from "./data/creatorsRepository.js";
import { applyCreatorFilters, paginateCreators } from "./state/filters.js";
import { loadSettings, loadViewState, saveSettings, saveViewState } from "./state/storage.js";
import { renderAdmin } from "./ui/admin.js";
import { renderDashboard } from "./ui/dashboard.js";
import { renderCreatorsTable } from "./ui/creatorsTable.js";
import { renderFilterOptions } from "./ui/filters.js";
import {
  getNsapReviewCandidate,
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
import { applyStaticTranslations, setLanguage, t } from "./i18n/index.js";

const unsavedMessage = () => t("common.unsavedPrompt");

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
let quickNoteDrafts = new Map();
let quickNoteSaveStates = new Map();
let quickNoteSaveVersions = new Map();
let quickNoteFadeTimers = new Map();
let pendingSaveRequests = 0;
let searchTimer = 0;
let modalDirty = false;
let modalMode = "";
let modalInitialSnapshot = "";
let modalSaving = false;
let settingsDirty = false;
let settingsSaving = false;
let modalSaveStateTimer = 0;
let youtubeSyncJob = null;
let youtubeSyncPollTimer = 0;
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

applyStaticTranslations();
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
    setSaveState(t("save.databaseLoaded"));
  } catch (error) {
    setSaveState(t("save.couldNotLoad"));
    showToast(error.message || t("save.couldNotLoad"), "error");
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

  document.getElementById("searchInput").addEventListener("input", handleSearchInput);

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
  document.getElementById("creatorTable").addEventListener("focusout", handleQuickNoteBlur);
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
  document.getElementById("addCreator").addEventListener("click", handleOpenAddCreator);
  document.getElementById("exportJson").addEventListener("click", exportJson);
  document.getElementById("importJson").addEventListener("click", () => document.getElementById("importJsonInput").click());
  document.getElementById("importJsonInput").addEventListener("change", importJson);
  document.getElementById("undoEdit").addEventListener("click", undoLastEdit);
  document.getElementById("logoutButton").addEventListener("click", logout);
  document.getElementById("resetLocalData").addEventListener("click", refreshCreators);
  document.getElementById("accentColor").addEventListener("input", updateAccentColor);
  document.getElementById("densityMode").addEventListener("change", updateDensity);
  document.getElementById("languageMode").addEventListener("change", (event) => setLanguage(event.target.value));
  document.getElementById("saveSettings").addEventListener("click", saveSettingsChanges);
  document.getElementById("syncAllYouTube").addEventListener("click", startYouTubeSyncAll);
  document.getElementById("createBackup").addEventListener("click", createBackup);
  document.getElementById("refreshAdmin").addEventListener("click", refreshAdmin);
  document.getElementById("usersList").addEventListener("change", handleUserRoleChange);
  document.getElementById("backupsList").addEventListener("click", handleBackupRestore);
  document.getElementById("sidebarToggle").addEventListener("click", toggleSidebar);
  document.getElementById("sidebarResizer").addEventListener("pointerdown", handleSidebarResize);
  document.addEventListener("keydown", handleKeyboardShortcuts);
  window.addEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("languagechange", () => {
    applyStaticTranslations();
    renderAll();
    const creator = activeCreatorId ? getCreatorById(activeCreatorId) : null;
    if (creator && document.getElementById("creatorDialog").open && modalMode === "timeline") {
      openCreatorModal(creator, session.permissions);
      initializeModalDirty("timeline");
    }
  });
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
  renderYouTubeSyncProgress();
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
    quickNoteDrafts,
    quickNoteSaveStates,
  });

  renderFilterOptions(creators, state);
  persistViewState();
}

function handleSearchInput(event) {
  window.clearTimeout(searchTimer);
  const value = event.target.value;
  searchTimer = window.setTimeout(() => {
    state.search = value;
    state.page = 1;
    persistViewState();
    renderCreators();
  }, 160);
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

  const cancelAdd = event.target.closest("[data-cancel-add-creator]");
  if (cancelAdd) {
    requestCloseModal();
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
    return;
  }

  const syncYouTube = event.target.closest("[data-sync-youtube]");
  if (syncYouTube) {
    syncYouTubeCreator(syncYouTube.dataset.syncYoutube);
    return;
  }

  const nsapDecision = event.target.closest("[data-nsap-review]");
  if (nsapDecision) {
    setCreatorNsapDecision(nsapDecision.dataset.creatorId, nsapDecision.dataset.nsapReview);
    return;
  }
}

function handleInlineEdit(event) {
  if (!session.permissions.canEdit) {
    showToast(t("error.managerRequired"), "error");
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
    showToast(t("error.managerRequired"), "error");
    renderCreators();
    return;
  }

  const creatorId = control.dataset.creatorId;
  quickNoteDrafts.set(creatorId, control.value);
  setQuickNoteSaveState(creatorId, "unsaved", "Unsaved changes");
  window.clearTimeout(quickNoteTimers.get(creatorId));
  quickNoteTimers.set(creatorId, window.setTimeout(() => {
    quickNoteTimers.delete(creatorId);
    saveQuickNote(creatorId);
  }, 650));
}

function handleQuickNoteBlur(event) {
  const control = event.target.closest("[data-inline-field='quickNote']");
  if (!control || !session.permissions.canEdit) {
    return;
  }

  const creatorId = control.dataset.creatorId;
  window.clearTimeout(quickNoteTimers.get(creatorId));
  quickNoteTimers.delete(creatorId);
  quickNoteDrafts.set(creatorId, control.value);
  saveQuickNote(creatorId);
}

async function saveQuickNote(creatorId) {
  const creator = getCreatorById(creatorId);
  if (!creator || !quickNoteDrafts.has(creatorId)) return;
  const value = quickNoteDrafts.get(creatorId);
  if ((creator.quickNote ?? "") === value) {
    quickNoteDrafts.delete(creatorId);
    setQuickNoteSaveState(creatorId, "saved", "Saved", true);
    return;
  }

  const version = (quickNoteSaveVersions.get(creatorId) || 0) + 1;
  quickNoteSaveVersions.set(creatorId, version);
  pendingSaveRequests += 1;
  setQuickNoteSaveState(creatorId, "saving", "Saving...");
  try {
    const response = await api.updateCreator(creatorId, "quickNote", value);
    if (quickNoteSaveVersions.get(creatorId) === version) {
      replaceCreator(response.creator);
      if (quickNoteDrafts.get(creatorId) === value) {
        quickNoteDrafts.delete(creatorId);
        setQuickNoteSaveState(creatorId, "saved", "Saved", true);
      } else {
        setQuickNoteSaveState(creatorId, "unsaved", "Unsaved changes");
      }
      savedAt = new Date().toISOString();
      renderDashboard(creators);
      renderCreators();
    }
  } catch (error) {
    if (quickNoteSaveVersions.get(creatorId) === version) {
      setQuickNoteSaveState(creatorId, "failed", "Save failed");
      renderCreators();
    }
    showToast(error.message, "error");
  } finally {
    pendingSaveRequests = Math.max(0, pendingSaveRequests - 1);
  }
}

function setQuickNoteSaveState(creatorId, stateName, label, fade = false) {
  window.clearTimeout(quickNoteFadeTimers.get(creatorId));
  quickNoteSaveStates.set(creatorId, { state: stateName, label });
  const indicator = document.querySelector(`[data-quick-note-state="${CSS.escape(creatorId)}"]`);
  if (indicator) {
    indicator.hidden = false;
    indicator.className = `field-save-status state-${stateName}`;
    indicator.textContent = label;
  }
  if (fade) {
    quickNoteFadeTimers.set(creatorId, window.setTimeout(() => {
      quickNoteSaveStates.delete(creatorId);
      const current = document.querySelector(`[data-quick-note-state="${CSS.escape(creatorId)}"]`);
      if (current) current.hidden = true;
      quickNoteFadeTimers.delete(creatorId);
    }, 2600));
  }
}

function handleOpenAddCreator() {
  if (!session.permissions.canEdit) {
    showToast(t("error.managerRequired"), "error");
    return;
  }

  if (!confirmLeaveDirty()) {
    return;
  }

  activeCreatorId = null;
  openAddCreatorModal();
  initializeModalDirty("add", "addCreatorForm");
}

async function createCreator(button) {
  if (!session.permissions.canEdit) {
    showToast(t("error.managerRequired"), "error");
    return;
  }

  if (modalSaving || !modalDirty) {
    return;
  }

  if (!isModalValid()) {
    showToast(t("error.creatorNameRequired"), "error");
    return;
  }

  setSaveLoading(button, true);
  setModalWorkflowState("saving", t("save.saving"));
  try {
    const payload = getFormValues("addCreatorForm");
    const response = await api.createCreator(payload);
    creators = [response.creator, ...creators];
    activeCreatorId = null;
    savedAt = new Date().toISOString();
    resetModalDirty();
    renderAll();
    document.getElementById("creatorDialog").close();
    showToast(t("message.creatorAdded"));
  } catch (error) {
    setModalWorkflowState("failed", t("save.failed"));
    console.error("Add Creator failed", {
      error,
      payload: getFormValues("addCreatorForm"),
    });
    showToast(error.message || t("error.creatorAddFailed"), "error");
  } finally {
    setSaveLoading(button, false);
  }
}

async function saveCreatorProfile(creatorId, button) {
  if (!session.permissions.canEdit) {
    showToast(t("error.managerRequired"), "error");
    return;
  }

  if (modalSaving || !modalDirty) {
    return;
  }

  setSaveLoading(button, true);
  setModalWorkflowState("saving", t("save.saving"));
  try {
    const response = await api.updateCreatorProfile(creatorId, getFormValues("editCreatorForm"));
    replaceCreator(response.creator);
    savedAt = new Date().toISOString();
    resetModalDirty();
    renderAll();
    activeCreatorId = response.creator.id;
    openCreatorModal(response.creator, session.permissions);
    initializeModalDirty("timeline");
    setModalWorkflowState("saved", t("save.saved"), true);
    showToast(t("message.changesSaved"));
  } catch (error) {
    setModalWorkflowState("failed", t("save.failed"));
    showToast(error.message, "error");
  } finally {
    setSaveLoading(button, false);
  }
}

async function deleteCreator(creatorId) {
  if (!session.permissions.canDeleteCreators) {
    showToast(t("error.administratorRequired"), "error");
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
    showToast(t("message.creatorDeleted"));
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
  setModalWorkflowState("saving", t("save.saving"));
  try {
    const response = await api.addTimelineEntry(creatorId, { type, message });
    replaceCreator(response.creator);
    resetModalDirty();
    renderCreatorDetails(response.creator, session.permissions);
    initializeModalDirty("timeline");
    setModalWorkflowState("saved", t("save.saved"), true);
    showToast(t("message.changesSaved"));
  } catch (error) {
    setModalWorkflowState("failed", t("save.failed"));
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
  showToast(t("message.reminderCopied"));

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
    showToast(t("error.managerRequired"), "error");
    return;
  }

  try {
    pendingSaveRequests += 1;
    setModalWorkflowState("saving", t("save.saving"));
    const response = await api.markDmSent(creatorId);
    replaceCreator(response.creator);
    renderAll();
    openCreatorModal(response.creator, session.permissions);
    setModalWorkflowState("saved", t("save.saved"), true);
    showToast(t("message.dmMarkedSent"));
  } catch (error) {
    setModalWorkflowState("failed", t("save.failed"));
    showToast(error.message, "error");
  } finally {
    pendingSaveRequests = Math.max(0, pendingSaveRequests - 1);
  }
}

async function syncYouTubeCreator(creatorId) {
  if (!session.permissions.canEdit) {
    showToast(t("error.managerRequired"), "error");
    return;
  }
  pendingSaveRequests += 1;
  setModalWorkflowState("saving", t("sync.syncing"));
  try {
    const response = await api.syncYouTubeCreator(creatorId);
    replaceCreator(response.creator);
    savedAt = new Date().toISOString();
    renderAll();
    activeCreatorId = response.creator.id;
    openCreatorModal(response.creator, session.permissions);
    initializeModalDirty("timeline");
    const succeeded = response.creator.syncStatus === "synced";
    setModalWorkflowState(succeeded ? "saved" : "failed", succeeded ? t("sync.synced") : t("sync.failed"), succeeded);
    showToast(succeeded ? t("sync.activitySynced") : response.creator.syncError || t("sync.failed"), succeeded ? "success" : "error");
  } catch (error) {
    setModalWorkflowState("failed", t("sync.failed"));
    showToast(error.message, "error");
  } finally {
    pendingSaveRequests = Math.max(0, pendingSaveRequests - 1);
  }
}

async function setCreatorNsapDecision(creatorId, decision) {
  if (!session.permissions.canEdit) {
    showToast(t("error.managerRequired"), "error");
    return;
  }

  const creator = getCreatorById(creatorId);
  const candidate = creator ? getNsapReviewCandidate(creator) : null;
  if (decision !== "clear_manual_decision" && !candidate) {
    showToast(t("review.noCandidate"), "error");
    return;
  }

  const promptKey = decision === "manual_confirmed"
    ? "review.confirmPrompt"
    : decision === "manual_rejected"
      ? "review.rejectPrompt"
      : "review.clearPrompt";
  if (!window.confirm(t(promptKey, { title: candidate?.videoTitle || creator?.nsapDecisionVideoTitle || t("common.unknown") }))) {
    return;
  }

  const payload = decision === "clear_manual_decision"
    ? { decision }
    : { decision, ...candidate };
  pendingSaveRequests += 1;
  setModalWorkflowState("saving", t("review.saving"));
  try {
    const response = await api.setNsapDecision(creatorId, payload);
    replaceCreator(response.creator);
    savedAt = new Date().toISOString();
    renderAll();
    activeCreatorId = response.creator.id;
    openCreatorModal(response.creator, session.permissions);
    initializeModalDirty("timeline");
    setModalWorkflowState("saved", t("save.saved"), true);
    const toastKey = decision === "manual_confirmed"
      ? "review.confirmed"
      : decision === "manual_rejected"
        ? "review.rejected"
        : "review.cleared";
    showToast(t(toastKey));
  } catch (error) {
    setModalWorkflowState("failed", t("review.failed"));
    showToast(error.message, "error");
  } finally {
    pendingSaveRequests = Math.max(0, pendingSaveRequests - 1);
  }
}

async function startYouTubeSyncAll() {
  if (session.permissions.role !== "owner" || youtubeSyncJob?.status === "running") return;
  const button = document.getElementById("syncAllYouTube");
  button.disabled = true;
  try {
    const response = await api.startYouTubeSyncAll();
    youtubeSyncJob = response.job;
    renderYouTubeSyncProgress();
    scheduleYouTubeSyncPoll();
  } catch (error) {
    button.disabled = false;
    showToast(error.message, "error");
  }
}

function scheduleYouTubeSyncPoll() {
  window.clearTimeout(youtubeSyncPollTimer);
  youtubeSyncPollTimer = window.setTimeout(pollYouTubeSyncJob, 1000);
}

async function pollYouTubeSyncJob() {
  if (!youtubeSyncJob) return;
  try {
    youtubeSyncJob = (await api.getYouTubeSyncJob(youtubeSyncJob.id)).job;
    renderYouTubeSyncProgress();
    if (youtubeSyncJob.status === "completed") {
      creators = (await loadCreators()).creators;
      renderAll();
      showToast(t("sync.complete", { synced: youtubeSyncJob.completed - youtubeSyncJob.failed, failed: youtubeSyncJob.failed }));
      return;
    }
    scheduleYouTubeSyncPoll();
  } catch (error) {
    showToast(error.message, "error");
    document.getElementById("syncAllYouTube").disabled = false;
  }
}

function renderYouTubeSyncProgress() {
  const container = document.getElementById("youtubeSyncProgress");
  const button = document.getElementById("syncAllYouTube");
  button.hidden = session.permissions.role !== "owner";
  const active = youtubeSyncJob && ["queued", "running"].includes(youtubeSyncJob.status);
  button.disabled = Boolean(active);
  container.hidden = !youtubeSyncJob;
  if (!youtubeSyncJob) return;
  const percent = youtubeSyncJob.total ? Math.round((youtubeSyncJob.completed / youtubeSyncJob.total) * 100) : 100;
  document.getElementById("youtubeSyncCurrent").textContent = active ? youtubeSyncJob.currentCreator || "Preparing sync..." : "Sync complete";
  document.getElementById("youtubeSyncCount").textContent = `${youtubeSyncJob.completed} / ${youtubeSyncJob.total}`;
  document.getElementById("youtubeSyncBar").style.width = `${percent}%`;
}

async function updateCreatorField(creatorId, field, value, source) {
  const creator = creators.find((item) => item.id === creatorId);
  if (!creator || creator[field] === value) {
    return;
  }

  const oldValue = creator[field] ?? "";

  try {
    pendingSaveRequests += 1;
    setSaveState(t("save.saving"));
    const response = await api.updateCreator(creatorId, field, value);
    replaceCreator(response.creator);
    undoStack.unshift({ creatorId, field, oldValue });
    undoStack = undoStack.slice(0, 10);
    document.getElementById("undoEdit").disabled = false;
    savedAt = new Date().toISOString();
    setSaveState(t("save.saved"));
    showToast(t("save.saved"));
    renderDashboard(creators);
    renderCreators();
  } catch (error) {
    setSaveState(t("save.failed"));
    showToast(error.message, "error");
    renderCreators();
  } finally {
    pendingSaveRequests = Math.max(0, pendingSaveRequests - 1);
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
    showToast(t("message.lastEditUndone"));
  } catch (error) {
    showToast(error.message, "error");
  }
}

function persistViewState() {
  saveViewState(state);
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
    showToast(t("error.adminRequired"), "error");
    return;
  }

  exportJsonFromApi();
}

async function exportJsonFromApi() {
  try {
    const payload = await api.exportCreators();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `creators-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    showToast(t("message.backupExported"));
  } catch (error) {
    console.error("Export Backup failed", { error });
    showToast(error.message || t("error.backupExportFailed"), "error");
  }
}

async function importJson(event) {
  if (!session.permissions.canImportExport) {
    showToast(t("error.adminRequired"), "error");
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
    showToast(t("message.importSuccessful"));
  } catch (error) {
    console.error("Import Backup failed", { error });
    showToast(error.message || t("error.invalidJson"), "error");
  }
}

async function refreshCreators() {
  const repository = await loadCreators();
  creators = repository.creators;
  await loadAdminData();
  renderAll();
  setSaveState(t("message.databaseRefreshed"));
  showToast(t("message.dataRefreshed"));
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
    showToast(t("message.adminRefreshed"));
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function createBackup() {
  if (!session.permissions.canRestoreBackups) {
    showToast(t("error.administratorRequired"), "error");
    return;
  }

  try {
    const response = await api.createBackup();
    adminData.backups = response.backups;
    renderAll();
    showToast(t("message.backupCreated"));
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
    showToast(t("message.roleUpdated"));
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
    showToast(t("message.backupRestored"));
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
  const authSummary = document.getElementById("authSummary");
  authSummary.hidden = !session.authenticated;
  document.getElementById("authUser").textContent = userLabel;
  document.getElementById("authRole").textContent = session.permissions.roleLabel || session.permissions.role || "Viewer";
  document.getElementById("loginButton").hidden = session.authenticated;
  document.getElementById("logoutButton").hidden = !session.authenticated;
  document.getElementById("importJson").hidden = !session.permissions.canImportExport;
  document.getElementById("exportJson").hidden = !session.permissions.canImportExport;
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
  if (modalDirty && !modalSaving) setModalWorkflowState("unsaved", t("settings.unsaved"));
  if (!modalDirty && !modalSaving) setModalWorkflowState("idle", "");
  updateModalDirtyUi();
}

function resetModalDirty() {
  modalDirty = false;
  modalMode = "";
  modalInitialSnapshot = "";
  modalSaving = false;
  updateModalDirtyUi();
}

function setModalWorkflowState(stateName, label, fade = false) {
  window.clearTimeout(modalSaveStateTimer);
  const indicator = document.getElementById("modalSaveState");
  if (!indicator) return;
  indicator.hidden = stateName === "idle";
  indicator.className = `workflow-save-state state-${stateName}`;
  indicator.textContent = label;
  if (fade) {
    modalSaveStateTimer = window.setTimeout(() => {
      indicator.hidden = true;
      indicator.textContent = "";
    }, 2600);
  }
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
    button.disabled = !modalDirty || modalSaving || !isModalValid();
  });
}

function isModalValid() {
  if (modalMode === "add") {
    return Boolean(document.querySelector("#addCreatorForm [name='name']")?.value.trim());
  }

  if (modalMode === "profile") {
    return Boolean(document.querySelector("#editCreatorForm [name='name']")?.value.trim());
  }

  if (modalMode === "timeline") {
    return Boolean(document.getElementById("timelineMessage")?.value.trim());
  }

  return true;
}

function setSaveLoading(button, isLoading) {
  modalSaving = isLoading;
  if (!button) {
    updateModalDirtyUi();
    return;
  }

  button.disabled = isLoading || !modalDirty || !isModalValid();
  button.classList.toggle("is-saving", isLoading);
  button.textContent = isLoading ? "Saving..." : button.dataset.defaultText || "Save Changes";
  updateModalDirtyUi();
}

function confirmLeaveModal() {
  if (!modalDirty) {
    return true;
  }

  const confirmed = window.confirm(unsavedMessage());
  if (confirmed) {
    resetModalDirty();
  }
  return confirmed;
}

function confirmLeaveDirty() {
  if (!hasUnsavedWork()) {
    return true;
  }

  const confirmed = window.confirm(unsavedMessage());
  if (confirmed) {
    resetModalDirty();
    settingsDraft = { ...settings };
    setSettingsDirty(false);
    discardQuickNoteDrafts();
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
  if (!hasUnsavedWork()) {
    return;
  }

  event.preventDefault();
  event.returnValue = unsavedMessage();
}

function hasUnsavedWork() {
  return modalDirty || modalSaving || settingsDirty || settingsSaving || quickNoteDrafts.size > 0 || quickNoteTimers.size > 0 || pendingSaveRequests > 0;
}

function discardQuickNoteDrafts() {
  quickNoteTimers.forEach((timer) => window.clearTimeout(timer));
  quickNoteFadeTimers.forEach((timer) => window.clearTimeout(timer));
  quickNoteTimers.clear();
  quickNoteDrafts.clear();
  quickNoteSaveStates.clear();
  quickNoteFadeTimers.clear();
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

  badge.hidden = !settingsDirty && !settingsSaving;
  badge.textContent = settingsSaving ? "Saving..." : settingsDirty ? "Unsaved changes" : badge.textContent;
  badge.className = `dirty-badge ${settingsSaving ? "state-saving" : settingsDirty ? "state-unsaved" : ""}`;
  button.disabled = !settingsDirty || settingsSaving;
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

  settingsSaving = true;
  button.disabled = true;
  button.classList.add("is-saving");
  button.textContent = "Saving...";

  let resultState = "";
  try {
    settings = { ...settingsDraft };
    saveSettings(settings);
    setSettingsDirty(false);
    applySettings(settings);
    resultState = "saved";
    showToast(t("message.changesSaved"));
  } catch (error) {
    resultState = "failed";
    showToast(error.message || t("error.settingsSaveFailed"), "error");
    updateSettingsDirtyUi();
  } finally {
    settingsSaving = false;
    button.classList.remove("is-saving");
    button.textContent = "Save Changes";
    updateSettingsDirtyUi();
    const badge = document.getElementById("settingsDirtyBadge");
    if (resultState) {
      badge.hidden = false;
      badge.textContent = resultState === "saved" ? "Saved" : "Save failed";
      badge.className = `dirty-badge state-${resultState}`;
      if (resultState === "saved") {
        window.setTimeout(() => { if (!settingsDirty && !settingsSaving) badge.hidden = true; }, 2600);
      }
    }
  }
}

function applySettings(source = settings) {
  document.documentElement.style.setProperty("--accent", source.accentColor);
  document.documentElement.style.setProperty("--sidebar-width", `${source.sidebarWidth || 280}px`);
  document.body.dataset.density = source.density;
  document.body.dataset.sidebar = source.sidebarCollapsed ? "collapsed" : "expanded";
  updateSidebarToggle(source.sidebarCollapsed);
}

function updateSidebarToggle(isCollapsed) {
  const button = document.getElementById("sidebarToggle");
  if (!button) {
    return;
  }

  button.textContent = isCollapsed ? ">>" : "<<";
  button.title = isCollapsed ? "Expand sidebar" : "Collapse sidebar";
  button.setAttribute("aria-label", button.title);
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
    const modalButton = document.querySelector("[data-save-new-creator], [data-save-profile], [data-save-timeline-entry]");
    if (modalDirty && modalButton && !modalButton.disabled) {
      modalButton.click();
      return;
    }

    const settingsButton = document.getElementById("saveSettings");
    if (settingsDirty && settingsButton && !settingsButton.disabled) {
      settingsButton.click();
      return;
    }

    showToast(t("message.noUnsavedChanges"));
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
  };

  return Object.keys(defaults)
    .map((field) => `${state.columnWidths[field] || defaults[field]}px`)
    .join(" ");
}
