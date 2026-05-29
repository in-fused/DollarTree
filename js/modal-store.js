/* ================= MODAL / STORE DETAILS ================= */

const RESCHEDULE_REASON_PRESETS = [
  "Access issue",
  "Staffing",
  "Inventory",
  "Weather",
  "Scheduling conflict",
  "Other"
];

function ensureRescheduleControls() {
  const modal = document.getElementById("confirmModal");
  const statusButtons = modal?.querySelector(".statusButtons");
  if (!modal || !statusButtons) {
    return {
      button: null,
      section: null,
      preset: null,
      custom: null,
      applyBtn: null,
      helper: null
    };
  }

  let rescheduleButton = document.getElementById("markRescheduled");
  if (!rescheduleButton) {
    rescheduleButton = document.createElement("button");
    rescheduleButton.id = "markRescheduled";
    rescheduleButton.type = "button";
    rescheduleButton.className = "btnClosed";
    rescheduleButton.textContent = "Mark Rescheduled";
    statusButtons.appendChild(rescheduleButton);
  }

  let section = document.getElementById("rescheduleReasonSection");
  if (!section) {
    section = document.createElement("div");
    section.id = "rescheduleReasonSection";

    const label = document.createElement("div");
    label.id = "rescheduleReasonLabel";
    label.className = "projectSourceTag";
    label.textContent = "Reschedule reason";

    const preset = document.createElement("select");
    preset.id = "rescheduleReasonPreset";

    const custom = document.createElement("textarea");
    custom.id = "rescheduleReasonInput";
    custom.placeholder = "Enter a reschedule reason (optional)...";
    custom.style.display = "none";

    const helper = document.createElement("div");
    helper.id = "rescheduleReasonHelper";
    helper.className = "projectSourceTag";
    helper.textContent = "Reason applies only when the store is rescheduled.";

    const applyBtn = document.createElement("button");
    applyBtn.id = "applyRescheduleReasonBtn";
    applyBtn.type = "button";
    applyBtn.className = "btnSecondary";
    applyBtn.textContent = "Apply Reschedule Reason";

    section.appendChild(label);
    section.appendChild(preset);
    section.appendChild(custom);
    section.appendChild(helper);
    section.appendChild(applyBtn);

    statusButtons.insertAdjacentElement("afterend", section);
  }

  const preset = document.getElementById("rescheduleReasonPreset");
  const custom = document.getElementById("rescheduleReasonInput");
  const applyBtn = document.getElementById("applyRescheduleReasonBtn");
  const helper = document.getElementById("rescheduleReasonHelper");

  if (preset && !preset.dataset.initialized) {
    preset.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Select reason (optional)";
    preset.appendChild(defaultOption);

    RESCHEDULE_REASON_PRESETS.forEach(reason => {
      const option = document.createElement("option");
      option.value = reason;
      option.textContent = reason;
      preset.appendChild(option);
    });

    preset.addEventListener("change", () => {
      if (!custom) return;

      if (preset.value === "Other") {
        custom.style.display = "block";
        custom.placeholder = "Enter custom reschedule reason...";
      } else {
        custom.style.display = "none";
      }

      updateRescheduleReasonHelper();
    });

    preset.dataset.initialized = "true";
  }

  if (custom && !custom.dataset.bound) {
    custom.addEventListener("input", () => {
      updateRescheduleReasonHelper();
    });
    custom.dataset.bound = "true";
  }

  return {
    button: rescheduleButton,
    section,
    preset,
    custom,
    applyBtn,
    helper
  };
}

function ensureStoreLifecycleControls() {
  const modal = document.getElementById("confirmModal");
  const closeBtn = document.getElementById("confirmCancel");
  if (!modal || !closeBtn) {
    return {
      removeBtn: null,
      restoreBtn: null
    };
  }

  let lifecycleWrap = document.getElementById("storeLifecycleControls");
  if (!lifecycleWrap) {
    lifecycleWrap = document.createElement("div");
    lifecycleWrap.id = "storeLifecycleControls";
    lifecycleWrap.className = "filterGrid";

    const removeBtn = document.createElement("button");
    removeBtn.id = "removeStoreBtn";
    removeBtn.type = "button";
    removeBtn.className = "btnClosed";
    removeBtn.textContent = "Remove Store from Project";

    const restoreBtn = document.createElement("button");
    restoreBtn.id = "restoreStoreBtn";
    restoreBtn.type = "button";
    restoreBtn.className = "btnComplete";
    restoreBtn.textContent = "Restore Store";

    lifecycleWrap.appendChild(removeBtn);
    lifecycleWrap.appendChild(restoreBtn);

    closeBtn.insertAdjacentElement("beforebegin", lifecycleWrap);
  }

  return {
    removeBtn: document.getElementById("removeStoreBtn"),
    restoreBtn: document.getElementById("restoreStoreBtn")
  };
}

function updateStoreLifecycleControls(storeId) {
  const controls = ensureStoreLifecycleControls();
  const store = typeof getStoreById === "function"
    ? getStoreById(storeId, { includeRemoved: true })
    : storeData.find(item => String(item.store_id) === String(storeId));
  const isRemoved = store?.is_removed === true;

  if (controls.removeBtn) {
    controls.removeBtn.classList.toggle("hidden", !canManageStoreLifecycle() || isRemoved);
  }

  if (controls.restoreBtn) {
    controls.restoreBtn.classList.toggle("hidden", !canManageStoreLifecycle() || !isRemoved);
  }

  return controls;
}

function setRescheduleReasonUI(status) {
  const controls = ensureRescheduleControls();
  if (!controls.section || !controls.preset || !controls.custom) return;

  const reason = String(status?.status_reason || "").trim();
  const statusCode = normalizeStatusCode(
    status?.status_code,
    status?.completed === true,
    status?.closed === true
  );

  const matchesPreset = RESCHEDULE_REASON_PRESETS.includes(reason) && reason !== "Other";

  controls.section.style.display = statusCode === "rescheduled" ? "block" : "none";
  controls.preset.value = matchesPreset ? reason : reason ? "Other" : "";
  controls.custom.value = matchesPreset ? "" : reason;
  controls.custom.style.display = controls.preset.value === "Other" ? "block" : "none";
  updateRescheduleReasonHelper("saved");
}

function getRescheduleReasonValue() {
  const preset = document.getElementById("rescheduleReasonPreset");
  const custom = document.getElementById("rescheduleReasonInput");

  if (!preset) return "";

  if (preset.value === "Other") {
    return String(custom?.value || "").trim();
  }

  return String(preset.value || "").trim();
}

function getModalEffectiveStatus(storeId) {
  return statusMap[String(storeId)] || {};
}

function isStoreCurrentlyRescheduled(storeId) {
  const currentStatus = getModalEffectiveStatus(storeId);
  return normalizeStatusCode(
    currentStatus?.status_code,
    currentStatus?.completed === true,
    currentStatus?.closed === true
  ) === "rescheduled";
}

function hasPendingRescheduleReasonChange(storeId) {
  if (!isStoreCurrentlyRescheduled(storeId)) return false;

  const currentStatus = getModalEffectiveStatus(storeId);
  const currentReason = String(currentStatus?.status_reason || "").trim();
  const nextReason = getRescheduleReasonValue();

  return currentReason !== nextReason;
}

function updateRescheduleReasonHelper(state = "") {
  const helper = document.getElementById("rescheduleReasonHelper");
  const applyBtn = document.getElementById("applyRescheduleReasonBtn");

  if (!helper || !applyBtn || !currentModalStoreId) return;

  if (!isStoreCurrentlyRescheduled(currentModalStoreId)) {
    helper.textContent = "Reason applies only when the store is rescheduled.";
    helper.style.color = "";
    applyBtn.disabled = true;
    return;
  }

  const dirty = hasPendingRescheduleReasonChange(currentModalStoreId);
  applyBtn.disabled = !canEditStores() || !dirty;

  if (state === "saved") {
    helper.textContent = "Reschedule reason saved.";
    helper.style.color = "#d7f9e0";
    return;
  }

  if (dirty) {
    helper.textContent = "Unsaved reschedule reason change.";
    helper.style.color = "#ffd27a";
    return;
  }

  helper.textContent = "Reason applies only when the store is rescheduled.";
  helper.style.color = "";
}

async function persistRescheduleReasonIfNeeded(storeId) {
  const normalizedStoreId = String(storeId);

  if (!canEditStores() || !isStoreCurrentlyRescheduled(normalizedStoreId)) {
    return true;
  }

  if (!hasPendingRescheduleReasonChange(normalizedStoreId)) {
    updateRescheduleReasonHelper("saved");
    return true;
  }

  const updated = await updateStore(normalizedStoreId, {
    status_code: "rescheduled",
    status_reason: getRescheduleReasonValue()
  });

  if (updated) {
    updateRescheduleReasonHelper("saved");
  }

  return updated;
}

async function handleStoreModalClose(storeId) {
  const modal = document.getElementById("confirmModal");
  if (!modal) return;

  const normalizedStoreId = String(storeId);
  const currentStatus = getModalEffectiveStatus(normalizedStoreId);
  const currentStatusCode = normalizeStatusCode(
    currentStatus?.status_code,
    currentStatus?.completed === true,
    currentStatus?.closed === true
  );

  if (currentStatusCode !== "rescheduled" || !canEditStores()) {
    modal.classList.add("hidden");
    return;
  }

  const updated = await persistRescheduleReasonIfNeeded(normalizedStoreId);
  if (updated) {
    modal.classList.add("hidden");
  }
}

function openStoreModal(storeId) {
  const normalizedStoreId = String(storeId);
  currentModalStoreId = normalizedStoreId;
  updateSelectedStorePanel(normalizedStoreId);

  const modal = document.getElementById("confirmModal");
  if (!modal) return;

  modal.classList.remove("hidden");
  setText("confirmStoreId", `Store ID: ${normalizedStoreId}`);

  const store = typeof getStoreById === "function"
    ? getStoreById(normalizedStoreId, { includeRemoved: true })
    : storeData.find(item => String(item.store_id) === normalizedStoreId);

  setText("confirmAddress", store?.full_address || "");

  const markActive = document.getElementById("markActive");
  const markCompleted = document.getElementById("markCompleted");
  const markClosed = document.getElementById("markClosed");
  const addNoteBtn = document.getElementById("addNoteBtn");
  const addToRouteBtn = document.getElementById("addToRouteBtn");
  const uploadPhotoBtn = document.getElementById("uploadPhotoBtn");
  const confirmCancel = document.getElementById("confirmCancel");

  const rescheduleControls = ensureRescheduleControls();
  const lifecycleControls = updateStoreLifecycleControls(normalizedStoreId);
  const currentStatus = statusMap[normalizedStoreId] || {};
  setRescheduleReasonUI(currentStatus);

  if (markActive) {
    markActive.onclick = () => updateStore(normalizedStoreId, {
      status_code: "active",
      status_reason: ""
    });
  }

  if (markCompleted) {
    markCompleted.onclick = () => updateStore(normalizedStoreId, {
      status_code: "completed",
      status_reason: ""
    });
  }

  if (markClosed) {
    markClosed.onclick = () => updateStore(normalizedStoreId, {
      status_code: "closed",
      status_reason: ""
    });
  }

  if (rescheduleControls.button) {
    rescheduleControls.button.onclick = () => updateStore(normalizedStoreId, {
      status_code: "rescheduled",
      status_reason: getRescheduleReasonValue()
    });
  }

  if (rescheduleControls.applyBtn) {
    rescheduleControls.applyBtn.onclick = async () => {
      await persistRescheduleReasonIfNeeded(normalizedStoreId);
    };
  }

  if (lifecycleControls.removeBtn) {
    lifecycleControls.removeBtn.onclick = async () => {
      if (!canManageStoreLifecycle()) return;

      const result = await performStoreLifecycleChange(normalizedStoreId, true, {
        store,
        focus: showRemovedStores === true
      });
      if (result.error) {
        console.error(result.error);
        alert(result.error.message || "Removing store failed.");
        return;
      }

      if (showRemovedStores !== true) {
        modal.classList.add("hidden");
        currentModalStoreId = null;
        clearPhotoUI();
        return;
      }

      currentModalStoreId = normalizedStoreId;
      updateStoreLifecycleControls(normalizedStoreId);
      updateSelectedStorePanel(normalizedStoreId);
      loadNotes(normalizedStoreId);
      loadPhotos(normalizedStoreId);
      updateWriteAccessUI();
      updateRouteModeUI();
    };
  }

  if (lifecycleControls.restoreBtn) {
    lifecycleControls.restoreBtn.onclick = async () => {
      if (!canManageStoreLifecycle()) return;

      const result = await performStoreLifecycleChange(normalizedStoreId, false, {
        store,
        focus: true
      });
      if (result.error) {
        console.error(result.error);
        alert(result.error.message || "Restoring store failed.");
        return;
      }

      currentModalStoreId = normalizedStoreId;
      updateStoreLifecycleControls(normalizedStoreId);
      updateSelectedStorePanel(normalizedStoreId);
      loadNotes(normalizedStoreId);
      loadPhotos(normalizedStoreId);
      updateWriteAccessUI();
      updateRouteModeUI();
    };
  }

  if (addNoteBtn) addNoteBtn.onclick = () => addNote(normalizedStoreId);
  if (addToRouteBtn) addToRouteBtn.onclick = () => addStoreToRoute(normalizedStoreId);
  if (uploadPhotoBtn) uploadPhotoBtn.onclick = () => uploadPhoto(normalizedStoreId);
  if (confirmCancel) {
    confirmCancel.onclick = async () => {
      await handleStoreModalClose(normalizedStoreId);
    };
  }

  loadNotes(normalizedStoreId);
  loadPhotos(normalizedStoreId);
  updateWriteAccessUI();
  updateRouteModeUI();
  updateRescheduleReasonHelper("saved");
  clearPhotoMessage();
}

async function updateStore(storeId, completedOrStatus, closed = false, statusReason = "") {
  if (!isSignedIn() || !canEditStores()) {
    alert("Editor or admin sign-in required to update store status.");
    return false;
  }

  const normalizedStoreId = String(storeId);
  const nextStatus = typeof completedOrStatus === "object" && completedOrStatus !== null
    ? getStatusState(completedOrStatus)
    : getStatusState({
        completed: completedOrStatus === true,
        closed: closed === true,
        status_reason: statusReason
      });

  const { error } = await dataLayer.updateStoreStatus(
    currentProjectId,
    normalizedStoreId,
    nextStatus.completed,
    nextStatus.closed,
    nextStatus.status_code,
    nextStatus.status_reason
  );

  if (error) {
    console.error(error);
    alert(error.message || "Store update failed.");
    return false;
  }

  statusMap[normalizedStoreId] = nextStatus;
  persistedStatusStoreIds.add(normalizedStoreId);
  touchDataRefresh();
  setRescheduleReasonUI(nextStatus);

  prependActivity({
    type: nextStatus.status_code === "completed"
      ? "status-completed"
      : nextStatus.status_code === "closed"
        ? "status-closed"
        : nextStatus.status_code === "rescheduled"
          ? "status-rescheduled"
          : "status-active",
    store_id: normalizedStoreId,
    timestamp: new Date().toISOString(),
    title: nextStatus.status_code === "completed"
      ? `Store ${normalizedStoreId} marked completed`
      : nextStatus.status_code === "closed"
        ? `Store ${normalizedStoreId} marked closed`
        : nextStatus.status_code === "rescheduled"
          ? `Store ${normalizedStoreId} marked rescheduled`
          : `Store ${normalizedStoreId} marked active`,
    detail: nextStatus.status_reason || "Status updated."
  });

  rebuild();
  updateHeaderDashboard();
  updateScopeSummary();
  updateDataHealthPanel();
  updateActivityList();
  updateIntelRail();
  updateSelectedStorePanel(normalizedStoreId);
  renderPhotoLibrary();

  return true;
}

async function addNote(storeId) {
  if (!isSignedIn() || !canAddNotes()) {
    alert("Editor or admin sign-in required to add notes.");
    return;
  }

  const note = document.getElementById("noteBox")?.value.trim() || "";
  if (!note) return;

  const { error } = await dataLayer.insertNote(currentProjectId, storeId, note);

  if (error) {
    console.error(error);
    alert(error.message || "Adding note failed.");
    return;
  }

  const noteBox = document.getElementById("noteBox");
  if (noteBox) noteBox.value = "";

  noteRowsCache.unshift({
    project_id: currentProjectId,
    store_id: String(storeId),
    note,
    created_at: new Date().toISOString()
  });

  touchDataRefresh();

  prependActivity({
    type: "note",
    store_id: String(storeId),
    timestamp: new Date().toISOString(),
    title: `Store ${storeId} note added`,
    detail: note
  });

  updateHeaderDashboard();
  updateActivityList();
  updateIntelRail();
  await loadNotes(storeId);
}

async function loadNotes(storeId) {
  const { data, error } = await dataLayer.loadNotesForStore(currentProjectId, storeId);

  const container = document.getElementById("notesList");
  if (!container) return;

  container.innerHTML = "";

  if (error) {
    console.error(error);
    container.innerHTML = "Unable to load notes.";
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = "No notes yet.";
    return;
  }

  data.forEach(row => {
    const div = document.createElement("div");
    div.className = "noteItem";
    div.innerText = row.note;
    container.appendChild(div);
  });
}
