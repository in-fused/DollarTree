/* ================= MODAL / STORE DETAILS ================= */

function openStoreModal(storeId) {
  currentModalStoreId = storeId;
  updateSelectedStorePanel(storeId);

  const modal = document.getElementById("confirmModal");
  if (!modal) return;

  modal.classList.remove("hidden");
  setText("confirmStoreId", `Store ID: ${storeId}`);

  const store = storeData.find(item => String(item.store_id) === String(storeId));
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
  touchDataRefresh();

  prependActivity({
    type: completed ? "status-completed" : closed ? "status-closed" : "status-active",
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
