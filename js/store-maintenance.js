/* ================= STORE MAINTENANCE ================= */

const STORE_MAINTENANCE_DUPLICATE_MESSAGE = "Store already exists in this project. No duplicate was created.";
const STORE_MAINTENANCE_GEOCODE_FAILURE_MESSAGE = "Could not geocode this address. Check address/city/state/ZIP and try again.";
const STORE_MAINTENANCE_ADD_SUCCESS_MESSAGE = "Store added and plotted successfully.";
const STORE_MAINTENANCE_SELECTOR_LIMIT = 10;

let storeMaintenanceMode = "add";
let storeMaintenanceBusy = false;
let storeMaintenanceOriginalAddressKey = "";

function getStoreMaintenanceEl(id) {
  return document.getElementById(id);
}

function getDuplicateStoreRowsAdminMessage(storeId, actionLabel = "this action") {
  const normalizedStoreId = String(storeId || "").trim() || "this Store ID";
  return `Action blocked: duplicate store rows exist for Store ${normalizedStoreId}. Correct the source data so exactly one store row exists for this project and Store ID before ${actionLabel}.`;
}

function getStoreMaintenanceSelectedStore() {
  const selectedStoreId = String(currentSelectedStoreId || "").trim();
  if (!selectedStoreId) return null;

  if (typeof getStoreById === "function") {
    return getStoreById(selectedStoreId, { includeRemoved: true });
  }

  return (storeData || []).find(store => String(store.store_id) === selectedStoreId) || null;
}

function getStoreMaintenanceAllStores() {
  const source = Array.isArray(storeData) ? storeData : [];
  return source
    .filter(store => String(store?.store_id || "").trim())
    .slice()
    .sort((a, b) => String(a.store_id || "").localeCompare(String(b.store_id || ""), undefined, { numeric: true }));
}

function getStoreMaintenanceStoreSearchText(store) {
  return [
    store?.store_id,
    store?.store_name,
    store?.customer_id,
    store?.full_address,
    store?.city,
    store?.state,
    store?.postal_code,
    store?.region,
    store?.territory
  ]
    .map(value => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function getStoreMaintenanceSearchMatches(query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const stores = getStoreMaintenanceAllStores();
  if (!normalizedQuery) return [];

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return stores
    .map(store => {
      const storeId = String(store.store_id || "").trim().toLowerCase();
      const searchText = getStoreMaintenanceStoreSearchText(store);
      const allTermsMatch = terms.every(term => searchText.includes(term));
      if (!allTermsMatch) return null;

      let score = 0;
      if (storeId === normalizedQuery) score += 100;
      else if (storeId.startsWith(normalizedQuery)) score += 60;
      else if (storeId.includes(normalizedQuery)) score += 30;
      if (String(store.store_name || "").trim().toLowerCase().includes(normalizedQuery)) score += 16;
      if (String(store.city || "").trim().toLowerCase().includes(normalizedQuery)) score += 10;
      if (String(store.full_address || "").trim().toLowerCase().includes(normalizedQuery)) score += 8;

      return { store, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || String(a.store.store_id).localeCompare(String(b.store.store_id), undefined, { numeric: true }))
    .slice(0, STORE_MAINTENANCE_SELECTOR_LIMIT)
    .map(entry => entry.store);
}

function createStoreMaintenanceSearchEmpty(message) {
  const empty = document.createElement("div");
  empty.className = "storeMaintenanceSearchEmpty";
  empty.textContent = message;
  return empty;
}

function createStoreMaintenanceSearchResultButton(store) {
  const storeId = String(store?.store_id || "").trim();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "storeMaintenanceResultBtn";
  button.dataset.storeId = storeId;
  button.setAttribute("role", "option");
  button.setAttribute("aria-selected", String(currentSelectedStoreId || "") === storeId ? "true" : "false");
  button.classList.toggle("is-selected", String(currentSelectedStoreId || "") === storeId);

  const top = document.createElement("div");
  top.className = "storeMaintenanceResultTop";

  const title = document.createElement("div");
  title.className = "storeMaintenanceResultTitle";
  title.textContent = [storeId ? `Store ${storeId}` : "", store?.store_name].filter(Boolean).join(" - ");

  const badge = document.createElement("span");
  badge.className = "storeMaintenanceResultBadge";
  badge.textContent = store?.is_removed === true ? "Removed" : "Active";
  badge.classList.toggle("removed", store?.is_removed === true);

  const address = document.createElement("div");
  address.className = "storeMaintenanceResultMeta";
  address.textContent = store?.full_address || "No address on file";

  const geo = document.createElement("div");
  geo.className = "storeMaintenanceResultMeta";
  geo.textContent = [store?.city, store?.state, store?.region ? `Region: ${store.region}` : ""].filter(Boolean).join(" | ") || "No city metadata";

  top.appendChild(title);
  top.appendChild(badge);
  button.appendChild(top);
  button.appendChild(address);
  button.appendChild(geo);

  button.addEventListener("click", () => selectStoreFromMaintenanceSearch(storeId));
  return button;
}

function renderStoreMaintenanceSearchResults() {
  const input = getStoreMaintenanceEl("storeMaintenanceSearchInput");
  const resultsEl = getStoreMaintenanceEl("storeMaintenanceSearchResults");
  if (!resultsEl) return;

  const query = input?.value || "";
  resultsEl.innerHTML = "";

  if (!String(query || "").trim()) {
    const selectedStore = getStoreMaintenanceSelectedStore();
    resultsEl.appendChild(createStoreMaintenanceSearchEmpty(
      selectedStore
        ? "Search to switch stores, or use the selected store actions below."
        : "Type to find a store in this project."
    ));
    return;
  }

  const matches = getStoreMaintenanceSearchMatches(query);
  if (matches.length === 0) {
    resultsEl.appendChild(createStoreMaintenanceSearchEmpty("No stores match that search."));
    return;
  }

  matches.forEach(store => {
    resultsEl.appendChild(createStoreMaintenanceSearchResultButton(store));
  });
}

function selectStoreFromMaintenanceSearch(storeId) {
  const normalizedStoreId = String(storeId || "").trim();
  const store = typeof getStoreById === "function"
    ? getStoreById(normalizedStoreId, { includeRemoved: true })
    : (storeData || []).find(item => String(item.store_id) === normalizedStoreId);

  if (!store) {
    setStoreMaintenanceMessage(`Store ${normalizedStoreId || ""} was not found in the current project.`, "error");
    return;
  }

  currentSelectedStoreId = String(store.store_id);
  const input = getStoreMaintenanceEl("storeMaintenanceSearchInput");
  if (input) input.value = String(store.store_id);

  flyToMaintenanceStore(store);
  renderStoreMaintenanceSearchResults();
  updateStoreMaintenanceSelectionState();
  setStoreMaintenanceMessage(`Selected Store ${store.store_id}.`, "success");
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
  const searchInput = getStoreMaintenanceEl("storeMaintenanceSearchInput");
  const searchClearBtn = getStoreMaintenanceEl("storeMaintenanceSearchClearBtn");
  const form = getStoreMaintenanceEl("storeMaintenanceForm");

  [addBtn, editBtn, removeBtn, reactivateBtn, cancelBtn, searchClearBtn].forEach(button => {
    if (button) button.disabled = storeMaintenanceBusy;
  });
  if (searchInput) searchInput.disabled = storeMaintenanceBusy;

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
  const searchInput = getStoreMaintenanceEl("storeMaintenanceSearchInput");
  const searchClearBtn = getStoreMaintenanceEl("storeMaintenanceSearchClearBtn");
  const canManage = isSignedIn() && canManageProjectLifecycle() && !!String(currentProjectId || "").trim();

  if (section) section.classList.toggle("hidden", !canManage);
  if (!canManage) {
    [addBtn, editBtn, removeBtn, reactivateBtn, searchClearBtn].forEach(button => {
      if (button) button.disabled = true;
    });
    if (searchInput) searchInput.disabled = true;
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
  if (searchInput) searchInput.disabled = storeMaintenanceBusy;
  if (searchClearBtn) searchClearBtn.disabled = storeMaintenanceBusy;
  renderStoreMaintenanceSearchResults();
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
  if (duplicateCheck.data?.duplicateCount > 0) {
    setStoreMaintenanceMessage(getDuplicateStoreRowsAdminMessage(payload.store_id, "adding a store with this ID"), "error");
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
    setStoreMaintenanceMessage(
      addResult.data?.store
        ? STORE_MAINTENANCE_DUPLICATE_MESSAGE
        : getDuplicateStoreRowsAdminMessage(payload.store_id, "adding a store with this ID"),
      "error"
    );
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
    setStoreMaintenanceMessage(getDuplicateStoreRowsAdminMessage(selectedStoreId, actionLabel), "error");
    return null;
  }

  return selectedStore;
}

async function performStoreLifecycleChange(storeId, isRemoved, options = {}) {
  const normalizedStoreId = String(storeId || "").trim();
  if (!normalizedStoreId) {
    return { data: null, error: new Error("Store ID is required for lifecycle changes.") };
  }

  const store = options.store || (
    typeof getStoreById === "function"
      ? getStoreById(normalizedStoreId, { includeRemoved: true })
      : (storeData || []).find(item => String(item.store_id) === normalizedStoreId)
  );

  const lifecycleResult = await dataLayer.updateStoreLifecycle(currentProjectId, normalizedStoreId, isRemoved);
  if (lifecycleResult.error) {
    return { data: null, error: lifecycleResult.error };
  }

  const activityResult = await dataLayer.createManualStoreActivityEvent(
    currentProjectId,
    normalizedStoreId,
    isRemoved ? "store-removed" : "store-reactivated",
    {
      full_address: store?.full_address || ""
    }
  );
  if (activityResult.error) {
    console.warn("Store lifecycle activity failed:", activityResult.error);
  }

  const shouldFocus = Object.prototype.hasOwnProperty.call(options, "focus")
    ? options.focus !== false
    : (!isRemoved || showRemovedStores === true);
  const refreshedStore = await refreshProjectAfterStoreMaintenance(normalizedStoreId, { focus: shouldFocus });

  return {
    data: {
      store: refreshedStore || store || null,
      activityRecorded: !activityResult.error
    },
    error: null
  };
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
    const shouldFocus = !isRemoved || showRemovedStores === true;
    const lifecycleResult = await performStoreLifecycleChange(selectedStoreId, isRemoved, {
      store: selectedStore,
      focus: shouldFocus
    });
    if (lifecycleResult.error) {
      setStoreMaintenanceMessage(lifecycleResult.error.message || (isRemoved ? "Unable to remove store." : "Unable to reactivate store."), "error");
      return;
    }

    closeStoreMaintenanceForm();
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
  const searchInput = getStoreMaintenanceEl("storeMaintenanceSearchInput");
  const searchClearBtn = getStoreMaintenanceEl("storeMaintenanceSearchClearBtn");

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

  if (searchInput && !searchInput.dataset.bound) {
    searchInput.addEventListener("input", renderStoreMaintenanceSearchResults);
    searchInput.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      const firstResult = getStoreMaintenanceEl("storeMaintenanceSearchResults")?.querySelector(".storeMaintenanceResultBtn");
      if (!firstResult) return;
      event.preventDefault();
      selectStoreFromMaintenanceSearch(firstResult.dataset.storeId || "");
    });
    searchInput.dataset.bound = "true";
  }

  if (searchClearBtn && !searchClearBtn.dataset.bound) {
    searchClearBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      renderStoreMaintenanceSearchResults();
      searchInput?.focus();
    });
    searchClearBtn.dataset.bound = "true";
  }

  updateStoreMaintenanceSelectionState();
}

function refreshStoreMaintenanceAdminUI() {
  bindStoreMaintenanceUI();
  updateStoreMaintenanceSelectionState();
}
