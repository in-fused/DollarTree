/* ================= MODAL / STORE DETAILS ================= */

function ensureStoreLifecycleControls() {
  const modal = document.querySelector("#confirmModal .modalContent");
  if (!modal) return;

  if (document.getElementById("removeStoreBtn") && document.getElementById("restoreStoreBtn")) {
    return;
  }

  const removeBtn = document.createElement("button");
  removeBtn.id = "removeStoreBtn";
  removeBtn.type = "button";
  removeBtn.className = "btnClosed";
  removeBtn.textContent = "Remove from Project";

  const restoreBtn = document.createElement("button");
  restoreBtn.id = "restoreStoreBtn";
  restoreBtn.type = "button";
  restoreBtn.className = "btnSecondary";
  restoreBtn.textContent = "Restore Store";

  const cancelBtn = document.getElementById("confirmCancel");
  if (cancelBtn) {
    modal.insertBefore(removeBtn, cancelBtn);
    modal.insertBefore(restoreBtn, cancelBtn);
  } else {
    modal.appendChild(removeBtn);
    modal.appendChild(restoreBtn);
  }
}

function updateStoreLifecycleControls(storeId) {
  ensureStoreLifecycleControls();

  const removeBtn = document.getElementById("removeStoreBtn");
  const restoreBtn = document.getElementById("restoreStoreBtn");
  const store = getStoreById(storeId, { includeRemoved: true });

  if (!removeBtn || !restoreBtn || !store) return;

  const disabled = !canManageStoreLifecycle();

  removeBtn.disabled = disabled;
  restoreBtn.disabled = disabled;

  removeBtn.classList.toggle("hidden", isStoreRemoved(store));
  restoreBtn.classList.toggle("hidden", !isStoreRemoved(store));

  removeBtn.onclick = () => removeStoreFromProject(storeId);
  restoreBtn.onclick = () => restoreRemovedStore(storeId);
}

async function setStoreRemovedState(storeId, nextRemoved) {
  if (!canManageStoreLifecycle()) {
    alert("Store removal controls are only available for admin users on Supabase-backed projects.");
    return;
  }

  try {
    const { error } = await supabaseClient
      .from("stores")
      .update({
        is_removed: nextRemoved,
        removed_at: nextRemoved ? new Date().toISOString() : null
      })
      .eq("project_id", currentProjectId)
      .eq("store_id", String(storeId));

    if (error) throw error;
  } catch (error) {
    console.error(error);
    alert(error.message || "Store removal update failed.");
    return;
  }

  allStoreData = allStoreData.map(store =>
    String(store.store_id) === String(storeId)
      ? {
          ...store,
          is_removed: nextRemoved,
          removed_at: nextRemoved ? new Date().toISOString() : null
        }
      : store
  );

  applyStoreVisibility();
  restoreRouteState();
  touchDataRefresh();

  prependActivity({
    type: nextRemoved ? "store-removed" : "store-restored",
    project_id: currentProjectId,
    store_id: String(storeId),
    timestamp: new Date().toISOString(),
    title: nextRemoved
      ? `🧹 Store ${storeId} removed from project`
      : `↩ Store ${storeId} restored to project`,
    detail: nextRemoved ? "Store hidden from default operational scope." : "Store returned to operational scope."
  });

  if (nextRemoved && !showRemovedStores) {
    currentSelectedStoreId = null;
    resetSelectedStorePanel();
  } else {
    updateSelectedStorePanel(storeId);
  }

  refreshOperationalViews();
  updateStoreLifecycleControls(storeId);
}

async function removeStoreFromProject(storeId) {
  if (!confirm(`Remove Store ${storeId} from the active project? This is a soft remove and can be restored later.`)) {
    return;
  }

  await setStoreRemovedState(storeId, true);
}

async function restoreRemovedStore(storeId) {
  if (!confirm(`Restore Store ${storeId} to the active project?`)) {
    return;
  }

  await setStoreRemovedState(storeId, false);
}

function openStoreModal(storeId) {
  currentModalStoreId = storeId;
  updateSelectedStorePanel(storeId);

  const modal = document.getElementById("confirmModal");
  if (!modal) return;

  modal.classList.remove("hidden");
  setText("confirmStoreId", `Store ID: ${storeId}`);

  const store = getStoreById(storeId, { includeRemoved: true });
  setText("confirmAddress", store?.full_address || "");

  const markActive = document.getElementById("markActive");
  const markCompleted = document.getElementById("markCompleted");
  const markClosed = document.getElementById("markClosed");
  const addNoteBtn = document.getElementById("addNoteBtn");
  const addToRouteBtn = document.getElementById("addToRouteBtn");
  const uploadPhotoBtn = document.getElementById("uploadPhotoBtn");
  const confirmCancel = document.getElementById("confirmCancel");

  if (markActive) markActive.onclick = () => updateStore(storeId, false, false);
  if (markCompleted) markCompleted.onclick = () => updateStore(storeId, true, false);
  if (markClosed) markClosed.onclick = () => updateStore(storeId, false, true);
  if (addNoteBtn) addNoteBtn.onclick = () => addNote(storeId);
  if (addToRouteBtn) addToRouteBtn.onclick = () => addStoreToRoute(storeId);
  if (uploadPhotoBtn) uploadPhotoBtn.onclick = () => uploadPhoto(storeId);
  if (confirmCancel) {
    confirmCancel.onclick = () => {
      modal.classList.add("hidden");
    };
  }

  ensureStoreLifecycleControls();
  updateStoreLifecycleControls(storeId);
  loadNotes(storeId);
  loadPhotos(storeId);
  updateWriteAccessUI();
  updateRouteModeUI();
  clearPhotoMessage();
}

async function updateStore(storeId, completed, closed) {
  if (!isSignedIn()) {
    alert("Sign in to update store status.");
    return;
  }

  const { error } = await dataLayer.updateStoreStatus(currentProjectId, storeId, completed, closed);

  if (error) {
    console.error(error);
    alert(error.message || "Store update failed.");
    return;
  }

  statusMap[String(storeId)] = { completed, closed };
  persistedStatusStoreIds.add(String(storeId));
  touchDataRefresh();

  prependActivity({
    type: completed ? "status-completed" : closed ? "status-closed" : "status-active",
    project_id: currentProjectId,
    store_id: String(storeId),
    timestamp: new Date().toISOString(),
    title: completed
      ? `✔ Store ${storeId} completed`
      : closed
        ? `⚠ Store ${storeId} closed`
        : `• Store ${storeId} active`,
    detail: "Status updated"
  });

  rebuild();
  updateHeaderDashboard();
  updateScopeSummary();
  updateDataHealthPanel();
  updateActivityList();
  updateIntelRail();
  updateSelectedStorePanel(storeId);
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
    project_id: currentProjectId,
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