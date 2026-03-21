/* ================= MODAL / STORE DETAILS ================= */

function openStoreModal(storeId) {
  const normalizedStoreId = String(storeId);
  currentModalStoreId = normalizedStoreId;
  updateSelectedStorePanel(normalizedStoreId);

  const modal = document.getElementById("confirmModal");
  if (!modal) return;

  modal.classList.remove("hidden");
  setText("confirmStoreId", `Store ID: ${normalizedStoreId}`);

  const store = storeData.find(item => String(item.store_id) === normalizedStoreId);
  setText("confirmAddress", store?.full_address || "");

  const markActive = document.getElementById("markActive");
  const markCompleted = document.getElementById("markCompleted");
  const markClosed = document.getElementById("markClosed");
  const addNoteBtn = document.getElementById("addNoteBtn");
  const addToRouteBtn = document.getElementById("addToRouteBtn");
  const uploadPhotoBtn = document.getElementById("uploadPhotoBtn");
  const confirmCancel = document.getElementById("confirmCancel");

  if (markActive) markActive.onclick = () => updateStore(normalizedStoreId, false, false);
  if (markCompleted) markCompleted.onclick = () => updateStore(normalizedStoreId, true, false);
  if (markClosed) markClosed.onclick = () => updateStore(normalizedStoreId, false, true);
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