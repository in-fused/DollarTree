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
      custom: null
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
    label.textContent = "Reschedule reason (optional)";

    const preset = document.createElement("select");
    preset.id = "rescheduleReasonPreset";

    const custom = document.createElement("textarea");
    custom.id = "rescheduleReasonInput";
    custom.placeholder = "Enter a reschedule reason (optional)...";
    custom.style.display = "none";

    section.appendChild(label);
    section.appendChild(preset);
    section.appendChild(custom);

    statusButtons.insertAdjacentElement("afterend", section);
  }

  const preset = document.getElementById("rescheduleReasonPreset");
  const custom = document.getElementById("rescheduleReasonInput");

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
    });

    preset.dataset.initialized = "true";
  }

  return {
    button: rescheduleButton,
    section,
    preset,
    custom
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
    controls.removeBtn.classList.toggle("hidden", !isAdmin() || isRemoved);
  }

  if (controls.restoreBtn) {
    controls.restoreBtn.classList.toggle("hidden", !isAdmin() || !isRemoved);
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

  if (lifecycleControls.removeBtn) {
    lifecycleControls.removeBtn.onclick = async () => {
      if (!isAdmin()) return;

      const { error } = await dataLayer.updateStoreLifecycle(currentProjectId, normalizedStoreId, true);
      if (error) {
        console.error(error);
        alert(error.message || "Removing store failed.");
        return;
      }

      const match = storeData.find(item => String(item.store_id) === normalizedStoreId);
      if (match) {
        match.is_removed = true;
        match.removed_at = new Date().toISOString();
      }

      touchDataRefresh();
      updateStoreLifecycleControls(normalizedStoreId);
      updateProjectSourceTag();
      handleFilterChange();
      updateSelectedStorePanel(normalizedStoreId);

      if (showRemovedStores !== true) {
        modal.classList.add("hidden");
      }
    };
  }

  if (lifecycleControls.restoreBtn) {
    lifecycleControls.restoreBtn.onclick = async () => {
      if (!isAdmin()) return;

      const { error } = await dataLayer.updateStoreLifecycle(currentProjectId, normalizedStoreId, false);
      if (error) {
        console.error(error);
        alert(error.message || "Restoring store failed.");
        return;
      }

      const match = storeData.find(item => String(item.store_id) === normalizedStoreId);
      if (match) {
        match.is_removed = false;
        match.removed_at = null;
      }

      touchDataRefresh();
      updateStoreLifecycleControls(normalizedStoreId);
      updateProjectSourceTag();
      handleFilterChange();
      updateSelectedStorePanel(normalizedStoreId);
    };
  }

  if (addNoteBtn) addNoteBtn.onclick = () => addNote(normalizedStoreId);
  if (addToRouteBtn) addToRouteBtn.onclick = () => addStoreToRoute(normalizedStoreId);
  if (uploadPhotoBtn) uploadPhotoBtn.onclick = () => uploadPhoto(normalizedStoreId);
  if (confirmCancel) {
    confirmCancel.onclick = () => {
      modal.classList.add("hidden");
    };
  }

  loadNotes(normalizedStoreId);
  loadPhotos(normalizedStoreId);
  updateWriteAccessUI();
  updateRouteModeUI();
  clearPhotoMessage();
}

async function updateStore(storeId, completedOrStatus, closed = false, statusReason = "") {
  if (!isSignedIn()) {
    alert("Sign in to update store status.");
    return;
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
    return;
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
      ? `✔ Store ${normalizedStoreId} completed`
      : nextStatus.status_code === "closed"
        ? `⚠ Store ${normalizedStoreId} closed`
        : nextStatus.status_code === "rescheduled"
          ? `⟳ Store ${normalizedStoreId} rescheduled`
          : `• Store ${normalizedStoreId} active`,
    detail: nextStatus.status_reason || "Status updated"
  });

  rebuild();
  updateHeaderDashboard();
  updateScopeSummary();
  updateDataHealthPanel();
  updateActivityList();
  updateIntelRail();
  updateSelectedStorePanel(normalizedStoreId);
  renderPhotoLibrary();
}

async function addNote(storeId) {
  if (!isSignedIn()) {
    alert("Sign in to add notes.");
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
    title: `📝 Note added to Store ${storeId}`,
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