/* ================= STORE MAINTENANCE ================= */

const STORE_MAINTENANCE_DUPLICATE_MESSAGE = "Store already exists in this project. No duplicate was created.";
const STORE_MAINTENANCE_GEOCODE_FAILURE_MESSAGE = "Could not geocode this address. Check address/city/state/ZIP and try again.";
const STORE_MAINTENANCE_ADD_SUCCESS_MESSAGE = "Store added and plotted successfully.";

let storeMaintenanceMode = "add";
let storeMaintenanceBusy = false;
let storeMaintenanceOriginalAddressKey = "";

function getStoreMaintenanceEl(id) {
  return document.getElementById(id);
}

function getStoreMaintenanceSelectedStore() {
  const selectedStoreId = String(currentSelectedStoreId || "").trim();
  if (!selectedStoreId) return null;

  if (typeof getStoreById === "function") {
    return getStoreById(selectedStoreId, { includeRemoved: true });
  }

  return (storeData || []).find(store => String(store.store_id) === selectedStoreId) || null;
}

function getStoreMaintenanceAddressKey(payload = {}) {
  return [
    payload.full_address,
    payload.city,
    payload.state,
    payload.postal_code
  ]
    .map(value => String(value || "").trim().toLowerCase())
    .join("|");
}

function setStoreMaintenanceMessage(message, type = "info") {
  const messageEl = getStoreMaintenanceEl("storeMaintenanceMessage");
  if (!messageEl) return;

  messageEl.textContent = message || "";
  messageEl.classList.remove("storeMaintenanceMessageSuccess", "storeMaintenanceMessageError");
  if (type === "success") messageEl.classList.add("storeMaintenanceMessageSuccess");
  if (type === "error") messageEl.classList.add("storeMaintenanceMessageError");
}

function setStoreMaintenanceBusy(isBusy, label = "") {
  storeMaintenanceBusy = isBusy === true;
  const submitBtn = getStoreMaintenanceEl("storeMaintenanceSubmitBtn");
  const addBtn = getStoreMaintenanceEl("storeMaintenanceAddBtn");
  const editBtn = getStoreMaintenanceEl("storeMaintenanceEditBtn");
  const removeBtn = getStoreMaintenanceEl("storeMaintenanceRemoveBtn");
  const reactivateBtn = getStoreMaintenanceEl("storeMaintenanceReactivateBtn");
  const cancelBtn = getStoreMaintenanceEl("storeMaintenanceCancelBtn");
  const form = getStoreMaintenanceEl("storeMaintenanceForm");

  [addBtn, editBtn, removeBtn, reactivateBtn, cancelBtn].forEach(button => {
    if (button) button.disabled = storeMaintenanceBusy;
  });

  if (submitBtn) {
    submitBtn.disabled = storeMaintenanceBusy;
    submitBtn.textContent = storeMaintenanceBusy ? (label || "Saving...") : (storeMaintenanceMode === "add" ? "Add Store" : "Save Store");
  }

  if (form) {
    Array.from(form.elements || []).forEach(element => {
      if (element === submitBtn || element === cancelBtn) return;
      element.disabled = storeMaintenanceBusy || (storeMaintenanceMode === "edit" && element.name === "store_id");
    });
  }

  if (!storeMaintenanceBusy) {
    updateStoreMaintenanceSelectionState();
  }
}

function collectStoreMaintenanceFormPayload() {
  return {
    store_id: getStoreMaintenanceEl("storeMaintenanceStoreId")?.value || "",
    store_name: getStoreMaintenanceEl("storeMaintenanceStoreName")?.value || "",
    full_address: getStoreMaintenanceEl("storeMaintenanceFullAddress")?.value || "",
    city: getStoreMaintenanceEl("storeMaintenanceCity")?.value || "",
    state: getStoreMaintenanceEl("storeMaintenanceState")?.value || "",
    postal_code: getStoreMaintenanceEl("storeMaintenancePostalCode")?.value || "",
    region: getStoreMaintenanceEl("storeMaintenanceRegion")?.value || "",
    territory: getStoreMaintenanceEl("storeMaintenanceTerritory")?.value || "",
    district: getStoreMaintenanceEl("storeMaintenanceDistrict")?.value || "",
    division: getStoreMaintenanceEl("storeMaintenanceDivision")?.value || "",
    market: getStoreMaintenanceEl("storeMaintenanceMarket")?.value || ""
  };
}

function setStoreMaintenanceFieldValue(id, value) {
  const input = getStoreMaintenanceEl(id);
  if (input) input.value = String(value || "");
}

function populateStoreMaintenanceForm(store = null) {
  setStoreMaintenanceFieldValue("storeMaintenanceStoreId", store?.store_id || "");
  setStoreMaintenanceFieldValue("storeMaintenanceStoreName", store?.store_name || "");
  setStoreMaintenanceFieldValue("storeMaintenanceFullAddress", store?.full_address || "");
  setStoreMaintenanceFieldValue("storeMaintenanceCity", store?.city || "");
  setStoreMaintenanceFieldValue("storeMaintenanceState", store?.state || "");
  setStoreMaintenanceFieldValue("storeMaintenancePostalCode", store?.postal_code || "");
  setStoreMaintenanceFieldValue("storeMaintenanceRegion", store?.region || "");
  setStoreMaintenanceFieldValue("storeMaintenanceTerritory", store?.territory || "");
  setStoreMaintenanceFieldValue("storeMaintenanceDistrict", store?.district || "");
  setStoreMaintenanceFieldValue("storeMaintenanceDivision", store?.division || "");
  setStoreMaintenanceFieldValue("storeMaintenanceMarket", store?.market || "");

  storeMaintenanceOriginalAddressKey = getStoreMaintenanceAddressKey(collectStoreMaintenanceFormPayload());
}

function openStoreMaintenanceForm(mode, store = null) {
  if (!isSignedIn() || !canManageProjectLifecycle() || !currentProjectId) {
    setStoreMaintenanceMessage("Project admin access is required for store maintenance.", "error");
    return;
  }

  storeMaintenanceMode = mode === "edit" ? "edit" : "add";
  const panel = getStoreMaintenanceEl("storeMaintenanceFormPanel");
  const title = getStoreMaintenanceEl("storeMaintenanceFormTitle");
  const submitBtn = getStoreMaintenanceEl("storeMaintenanceSubmitBtn");
  const storeIdInput = getStoreMaintenanceEl("storeMaintenanceStoreId");
  const reGeocodeWrap = getStoreMaintenanceEl("storeMaintenanceReGeocodeWrap");
  const reGeocode = getStoreMaintenanceEl("storeMaintenanceReGeocode");

  populateStoreMaintenanceForm(storeMaintenanceMode === "edit" ? store : null);

  if (title) title.textContent = storeMaintenanceMode === "add" ? "Add Store" : `Edit Store ${store?.store_id || ""}`.trim();
  if (submitBtn) submitBtn.textContent = storeMaintenanceMode === "add" ? "Add Store" : "Save Store";
  if (storeIdInput) storeIdInput.disabled = storeMaintenanceMode === "edit";
  if (reGeocodeWrap) reGeocodeWrap.classList.toggle("hidden", storeMaintenanceMode !== "edit");
  if (reGeocode) reGeocode.checked = true;
  if (panel) panel.classList.remove("hidden");

  setStoreMaintenanceMessage("");
  requestAnimationFrame(() => {
    const focusTarget = storeMaintenanceMode === "add"
      ? storeIdInput
      : getStoreMaintenanceEl("storeMaintenanceFullAddress");
    focusTarget?.focus();
  });
}

function closeStoreMaintenanceForm() {
  const panel = getStoreMaintenanceEl("storeMaintenanceFormPanel");
  if (panel) panel.classList.add("hidden");
  storeMaintenanceMode = "add";
  storeMaintenanceOriginalAddressKey = "";
  populateStoreMaintenanceForm(null);
  updateStoreMaintenanceSelectionState();
}

function updateStoreMaintenanceSelectionState() {
  const section = getStoreMaintenanceEl("storeMaintenanceSection");
  const selectionEl = getStoreMaintenanceEl("storeMaintenanceSelection");
  const addBtn = getStoreMaintenanceEl("storeMaintenanceAddBtn");
  const editBtn = getStoreMaintenanceEl("storeMaintenanceEditBtn");
  const removeBtn = getStoreMaintenanceEl("storeMaintenanceRemoveBtn");
  const reactivateBtn = getStoreMaintenanceEl("storeMaintenanceReactivateBtn");
  const canManage = isSignedIn() && canManageProjectLifecycle() && !!String(currentProjectId || "").trim();

  if (section) section.classList.toggle("hidden", !canManage);
  if (!canManage) {
    [addBtn, editBtn, removeBtn, reactivateBtn].forEach(button => {
      if (button) button.disabled = true;
    });
    return;
  }

  const selectedStore = getStoreMaintenanceSelectedStore();
  const selectedStoreId = String(selectedStore?.store_id || "").trim();
  const isRemoved = selectedStore?.is_removed === true;

  if (selectionEl) {
    selectionEl.textContent = selectedStore
      ? `Selected: Store ${selectedStoreId}${isRemoved ? " (removed)" : ""}`
      : "No store selected.";
  }

  if (addBtn) addBtn.disabled = storeMaintenanceBusy;
  if (editBtn) editBtn.disabled = storeMaintenanceBusy || !selectedStore;
  if (removeBtn) removeBtn.disabled = storeMaintenanceBusy || !selectedStore || isRemoved;
  if (reactivateBtn) reactivateBtn.disabled = storeMaintenanceBusy || !selectedStore || !isRemoved;
}

function flyToMaintenanceStore(store) {
  if (!store) return;

  currentSelectedStoreId = String(store.store_id);
  updateSelectedStorePanel(store.store_id);

  currentWorkspaceView = "map";
  localStorage.setItem(ACTIVE_VIEW_KEY, currentWorkspaceView);
  updateWorkspaceViewUI();

  if (hasValidCoordinatePair(store.lat, store.lng)) {
    map.flyTo({
      center: [store.lng, store.lat],
      zoom: 14
    });
  }
}

async function refreshProjectAfterStoreMaintenance(storeId, options = {}) {
  const scopedStoreId = String(storeId || "").trim();
  await loadActiveProject();

  if (!scopedStoreId) return null;

  const store = typeof getStoreById === "function"
    ? getStoreById(scopedStoreId, { includeRemoved: true })
    : (storeData || []).find(item => String(item.store_id) === scopedStoreId);

  if (store && options.focus !== false) {
    flyToMaintenanceStore(store);
  }

  if (typeof updateDataHealthPanel === "function") {
    updateDataHealthPanel();
  }
  if (typeof refreshStoreMaintenanceAdminUI === "function") {
    refreshStoreMaintenanceAdminUI();
  }

  return store || null;
}

async function handleStoreMaintenanceAdd(rawPayload) {
  const normalized = dataLayer.normalizeStoreMaintenancePayload(rawPayload);
  if (normalized.error) {
    setStoreMaintenanceMessage(normalized.error.message || "Store validation failed.", "error");
    return;
  }

  const payload = normalized.data;
  const duplicateCheck = await dataLayer.findStoreByProjectAndStoreId(currentProjectId, payload.store_id);
  if (duplicateCheck.error) {
    setStoreMaintenanceMessage(duplicateCheck.error.message || "Duplicate check failed.", "error");
    return;
  }
  if (duplicateCheck.data?.store) {
    setStoreMaintenanceMessage(STORE_MAINTENANCE_DUPLICATE_MESSAGE, "error");
    flyToMaintenanceStore(duplicateCheck.data.store);
    return;
  }

  const geocodeResult = await dataLayer.geocodeStoreAddress(payload);
  if (geocodeResult.error || !geocodeResult.data) {
    setStoreMaintenanceMessage(STORE_MAINTENANCE_GEOCODE_FAILURE_MESSAGE, "error");
    return;
  }

  const addResult = await dataLayer.addStoreToProject(currentProjectId, {
    ...payload,
    lat: geocodeResult.data.lat,
    lng: geocodeResult.data.lng
  });

  if (addResult.duplicate === true || addResult.data?.duplicate === true) {
    setStoreMaintenanceMessage(STORE_MAINTENANCE_DUPLICATE_MESSAGE, "error");
    if (addResult.data?.store) flyToMaintenanceStore(addResult.data.store);
    return;
  }

  if (addResult.error) {
    setStoreMaintenanceMessage(addResult.error.message || "Unable to add store.", "error");
    return;
  }

  const statusResult = await dataLayer.ensureBaselineStoreStatus(currentProjectId, payload.store_id);
  if (statusResult.error) {
    await refreshProjectAfterStoreMaintenance(payload.store_id);
    setStoreMaintenanceMessage(statusResult.error.message || "Store added, but baseline status could not be created.", "error");
    return;
  }

  const activityResult = await dataLayer.createManualStoreActivityEvent(currentProjectId, payload.store_id, "store-added", {
    store_name: payload.store_name || "",
    full_address: payload.full_address || ""
  });
  if (activityResult.error) {
    console.warn("Store add activity failed:", activityResult.error);
  }

  closeStoreMaintenanceForm();
  await refreshProjectAfterStoreMaintenance(payload.store_id);
  setStoreMaintenanceMessage(STORE_MAINTENANCE_ADD_SUCCESS_MESSAGE, "success");
}

async function handleStoreMaintenanceEdit(rawPayload) {
  const selectedStore = getStoreMaintenanceSelectedStore();
  const selectedStoreId = String(selectedStore?.store_id || "").trim();
  if (!selectedStoreId) {
    setStoreMaintenanceMessage("Select a store before editing.", "error");
    return;
  }

  const normalized = dataLayer.normalizeStoreMaintenancePayload({
    ...rawPayload,
    store_id: selectedStoreId
  });

  if (normalized.error) {
    setStoreMaintenanceMessage(normalized.error.message || "Store validation failed.", "error");
    return;
  }

  const payload = normalized.data;
  const nextAddressKey = getStoreMaintenanceAddressKey(payload);
  const addressChanged = nextAddressKey !== storeMaintenanceOriginalAddressKey;
  const shouldReGeocode = addressChanged && getStoreMaintenanceEl("storeMaintenanceReGeocode")?.checked !== false;

  if (shouldReGeocode) {
    const geocodeResult = await dataLayer.geocodeStoreAddress(payload);
    if (geocodeResult.error || !geocodeResult.data) {
      setStoreMaintenanceMessage(STORE_MAINTENANCE_GEOCODE_FAILURE_MESSAGE, "error");
      return;
    }
    payload.lat = geocodeResult.data.lat;
    payload.lng = geocodeResult.data.lng;
  }

  const updateResult = await dataLayer.updateStoreMetadata(currentProjectId, selectedStoreId, payload);
  if (updateResult.error) {
    setStoreMaintenanceMessage(updateResult.error.message || "Unable to update store.", "error");
    return;
  }

  const activityResult = await dataLayer.createManualStoreActivityEvent(currentProjectId, selectedStoreId, "store-edited", {
    re_geocoded: shouldReGeocode,
    full_address: payload.full_address || ""
  });
  if (activityResult.error) {
    console.warn("Store edit activity failed:", activityResult.error);
  }

  closeStoreMaintenanceForm();
  await refreshProjectAfterStoreMaintenance(selectedStoreId);
  setStoreMaintenanceMessage("Store updated successfully.", "success");
}

async function handleStoreMaintenanceSubmit(event) {
  event.preventDefault();
  if (storeMaintenanceBusy) return;
  if (!isSignedIn() || !canManageProjectLifecycle() || !currentProjectId) {
    setStoreMaintenanceMessage("Project admin access is required for store maintenance.", "error");
    return;
  }

  const payload = collectStoreMaintenanceFormPayload();
  setStoreMaintenanceMessage("");
  setStoreMaintenanceBusy(true, storeMaintenanceMode === "add" ? "Adding..." : "Saving...");

  try {
    if (storeMaintenanceMode === "add") {
      await handleStoreMaintenanceAdd(payload);
    } else {
      await handleStoreMaintenanceEdit(payload);
    }
  } finally {
    setStoreMaintenanceBusy(false);
  }
}

async function guardSelectedStoreMaintenanceWrite(actionLabel) {
  const selectedStore = getStoreMaintenanceSelectedStore();
  const selectedStoreId = String(selectedStore?.store_id || "").trim();
  if (!selectedStoreId) {
    setStoreMaintenanceMessage(`Select a store before ${actionLabel}.`, "error");
    return null;
  }

  const existing = await dataLayer.findStoreByProjectAndStoreId(currentProjectId, selectedStoreId);
  if (existing.error) {
    setStoreMaintenanceMessage(existing.error.message || "Unable to verify selected store.", "error");
    return null;
  }
  if (existing.data?.duplicateCount > 0) {
    setStoreMaintenanceMessage("Duplicate store rows exist for this Store ID. Resolve duplicates before lifecycle changes.", "error");
    return null;
  }

  return selectedStore;
}

async function handleStoreMaintenanceLifecycle(isRemoved) {
  if (storeMaintenanceBusy) return;
  if (!isSignedIn() || !canManageProjectLifecycle() || !currentProjectId) {
    setStoreMaintenanceMessage("Project admin access is required for store maintenance.", "error");
    return;
  }

  const actionLabel = isRemoved ? "removing it" : "reactivating it";
  const selectedStore = await guardSelectedStoreMaintenanceWrite(actionLabel);
  if (!selectedStore) return;

  const selectedStoreId = String(selectedStore.store_id);
  const confirmMessage = isRemoved
    ? `Remove Store ${selectedStoreId} from active project scope? Notes, photos, status, and activity will be preserved.`
    : `Reactivate Store ${selectedStoreId}? Notes, photos, status, and activity will be preserved.`;
  if (!window.confirm(confirmMessage)) return;

  setStoreMaintenanceMessage("");
  setStoreMaintenanceBusy(true, isRemoved ? "Removing..." : "Reactivating...");

  try {
    const lifecycleResult = await dataLayer.updateStoreLifecycle(currentProjectId, selectedStoreId, isRemoved);
    if (lifecycleResult.error) {
      setStoreMaintenanceMessage(lifecycleResult.error.message || (isRemoved ? "Unable to remove store." : "Unable to reactivate store."), "error");
      return;
    }

    const activityResult = await dataLayer.createManualStoreActivityEvent(
      currentProjectId,
      selectedStoreId,
      isRemoved ? "store-removed" : "store-reactivated",
      {
        full_address: selectedStore.full_address || ""
      }
    );
    if (activityResult.error) {
      console.warn("Store lifecycle activity failed:", activityResult.error);
    }

    closeStoreMaintenanceForm();
    const shouldFocus = !isRemoved || showRemovedStores === true;
    await refreshProjectAfterStoreMaintenance(selectedStoreId, { focus: shouldFocus });
    setStoreMaintenanceMessage(isRemoved ? "Store removed from active scope." : "Store reactivated successfully.", "success");
  } finally {
    setStoreMaintenanceBusy(false);
  }
}

function bindStoreMaintenanceUI() {
  const form = getStoreMaintenanceEl("storeMaintenanceForm");
  const addBtn = getStoreMaintenanceEl("storeMaintenanceAddBtn");
  const editBtn = getStoreMaintenanceEl("storeMaintenanceEditBtn");
  const removeBtn = getStoreMaintenanceEl("storeMaintenanceRemoveBtn");
  const reactivateBtn = getStoreMaintenanceEl("storeMaintenanceReactivateBtn");
  const cancelBtn = getStoreMaintenanceEl("storeMaintenanceCancelBtn");

  if (form && !form.dataset.bound) {
    form.addEventListener("submit", handleStoreMaintenanceSubmit);
    form.dataset.bound = "true";
  }

  if (addBtn && !addBtn.dataset.bound) {
    addBtn.addEventListener("click", () => openStoreMaintenanceForm("add"));
    addBtn.dataset.bound = "true";
  }

  if (editBtn && !editBtn.dataset.bound) {
    editBtn.addEventListener("click", () => {
      const selectedStore = getStoreMaintenanceSelectedStore();
      if (!selectedStore) {
        setStoreMaintenanceMessage("Select a store before editing.", "error");
        return;
      }
      openStoreMaintenanceForm("edit", selectedStore);
    });
    editBtn.dataset.bound = "true";
  }

  if (removeBtn && !removeBtn.dataset.bound) {
    removeBtn.addEventListener("click", () => handleStoreMaintenanceLifecycle(true));
    removeBtn.dataset.bound = "true";
  }

  if (reactivateBtn && !reactivateBtn.dataset.bound) {
    reactivateBtn.addEventListener("click", () => handleStoreMaintenanceLifecycle(false));
    reactivateBtn.dataset.bound = "true";
  }

  if (cancelBtn && !cancelBtn.dataset.bound) {
    cancelBtn.addEventListener("click", closeStoreMaintenanceForm);
    cancelBtn.dataset.bound = "true";
  }

  updateStoreMaintenanceSelectionState();
}

function refreshStoreMaintenanceAdminUI() {
  bindStoreMaintenanceUI();
  updateStoreMaintenanceSelectionState();
}
