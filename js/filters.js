/* ================= FILTERS ================= */

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "closed", label: "Closed" },
  { value: "rescheduled", label: "Rescheduled" }
];

function ensureStatusFilterControl() {
  const filterGrid = document.querySelector(".filterGrid");
  if (!filterGrid) return null;

  let statusFilter = document.getElementById("statusFilter");
  if (statusFilter) return statusFilter;

  statusFilter = document.createElement("select");
  statusFilter.id = "statusFilter";

  filterGrid.appendChild(statusFilter);
  return statusFilter;
}

function getStoreFilterStatusCode(store) {
  const status = statusMap[String(store?.store_id)] || {};
  return normalizeStatusCode(
    status.status_code,
    status.completed === true,
    status.closed === true
  );
}

function matchesStatusFilter(store) {
  if (!activeFilters.status) return true;
  return getStoreFilterStatusCode(store) === activeFilters.status;
}

function matchesRemovedVisibility(store) {
  if (showRemovedStores === true) return true;
  return store?.is_removed !== true;
}

function bindFilters() {
  const regionFilter = document.getElementById("regionFilter");
  const territoryFilter = document.getElementById("territoryFilter");
  const stateFilter = document.getElementById("stateFilter");
  const statusFilter = ensureStatusFilterControl();
  const clearBtn = document.getElementById("clearFiltersBtn");

  if (regionFilter && !regionFilter.dataset.bound) {
    regionFilter.addEventListener("change", () => {
      activeFilters.region = regionFilter.value;
      persistFilterState();
      handleFilterChange();
    });
    regionFilter.dataset.bound = "true";
  }

  if (territoryFilter && !territoryFilter.dataset.bound) {
    territoryFilter.addEventListener("change", () => {
      activeFilters.territory = territoryFilter.value;
      persistFilterState();
      handleFilterChange();
    });
    territoryFilter.dataset.bound = "true";
  }

  if (stateFilter && !stateFilter.dataset.bound) {
    stateFilter.addEventListener("change", () => {
      activeFilters.state = stateFilter.value;
      persistFilterState();
      handleFilterChange();
    });
    stateFilter.dataset.bound = "true";
  }

  if (statusFilter && !statusFilter.dataset.bound) {
    statusFilter.addEventListener("change", () => {
      activeFilters.status = statusFilter.value;
      persistFilterState();
      handleFilterChange();
    });
    statusFilter.dataset.bound = "true";
  }

  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.addEventListener("click", () => {
      activeFilters = { region: "", territory: "", state: "", status: "" };
      persistFilterState();
      handleFilterChange();
    });
    clearBtn.dataset.bound = "true";
  }
}

function restoreFilterState() {
  try {
    const saved = JSON.parse(localStorage.getItem(filtersKey()) || "{}");
    activeFilters = {
      region: saved.region || "",
      territory: saved.territory || "",
      state: saved.state || "",
      status: saved.status || ""
    };
  } catch {
    activeFilters = { region: "", territory: "", state: "", status: "" };
  }
}

function persistFilterState() {
  localStorage.setItem(filtersKey(), JSON.stringify(activeFilters));
}

function getFilteredStores() {
  return storeData.filter(store => {
    if (!matchesRemovedVisibility(store)) return false;
    if (activeFilters.region && String(store.region || "") !== activeFilters.region) return false;
    if (activeFilters.territory && String(store.territory || "") !== activeFilters.territory) return false;
    if (activeFilters.state && String(store.state || "") !== activeFilters.state) return false;
    if (!matchesStatusFilter(store)) return false;
    return true;
  });
}

function getStoresForOptionPopulation(dimension) {
  return storeData.filter(store => {
    if (!matchesRemovedVisibility(store)) return false;
    if (dimension !== "region" && activeFilters.region && String(store.region || "") !== activeFilters.region) return false;
    if (dimension !== "territory" && activeFilters.territory && String(store.territory || "") !== activeFilters.territory) return false;
    if (dimension !== "state" && activeFilters.state && String(store.state || "") !== activeFilters.state) return false;
    if (dimension !== "status" && !matchesStatusFilter(store)) return false;
    return true;
  });
}

function fillFilterSelect(id, defaultLabel, values, selectedValue) {
  const el = document.getElementById(id);
  if (!el) return;

  el.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = defaultLabel;
  el.appendChild(defaultOption);

  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    el.appendChild(option);
  });

  if (selectedValue && values.includes(selectedValue)) {
    el.value = selectedValue;
  } else {
    el.value = "";
    if (id === "regionFilter") activeFilters.region = "";
    if (id === "territoryFilter") activeFilters.territory = "";
    if (id === "stateFilter") activeFilters.state = "";
    if (id === "statusFilter") activeFilters.status = "";
  }
}

function populateStatusFilterOptions() {
  const statusFilter = ensureStatusFilterControl();
  if (!statusFilter) return;

  statusFilter.innerHTML = "";

  STATUS_FILTER_OPTIONS.forEach(optionConfig => {
    const option = document.createElement("option");
    option.value = optionConfig.value;
    option.textContent = optionConfig.label;
    statusFilter.appendChild(option);
  });

  statusFilter.value = activeFilters.status || "";
}

function populateFilterOptions() {
  fillFilterSelect(
    "regionFilter",
    "All Regions",
    uniqueSortedValues(getStoresForOptionPopulation("region").map(store => store.region)),
    activeFilters.region
  );

  fillFilterSelect(
    "territoryFilter",
    "All Territories",
    uniqueSortedValues(getStoresForOptionPopulation("territory").map(store => store.territory)),
    activeFilters.territory
  );

  fillFilterSelect(
    "stateFilter",
    "All States",
    uniqueSortedValues(getStoresForOptionPopulation("state").map(store => store.state)),
    activeFilters.state
  );

  populateStatusFilterOptions();
}

function updateFilterSummary() {
  const parts = [];
  if (showRemovedStores === true) parts.push("Removed Visible");
  if (activeFilters.region) parts.push(`Region: ${activeFilters.region}`);
  if (activeFilters.territory) parts.push(`Territory: ${activeFilters.territory}`);
  if (activeFilters.state) parts.push(`State: ${activeFilters.state}`);
  if (activeFilters.status) {
    const selectedStatusOption = STATUS_FILTER_OPTIONS.find(option => option.value === activeFilters.status);
    parts.push(`Status: ${selectedStatusOption?.label || activeFilters.status}`);
  }

  const filteredCount = getFilteredStores().length;

  if (parts.length === 0) {
    setText("activeFilterSummary", `Showing all stores • ${filteredCount.toLocaleString()} in scope`);
    return;
  }

  setText("activeFilterSummary", `${parts.join(" • ")} • ${filteredCount.toLocaleString()} in scope`);
}

function handleFilterChange() {
  populateFilterOptions();
  rebuildFullMap();
  updateProjectSourceTag();
  updateHeaderDashboard();
  updateScopeSummary();
  updateFilterSummary();
  updateDataHealthPanel();
  setMapModeTags();
  updateMapViewportForMode();
  updateIntelRail();
  updateActivityList();
  renderPhotoLibrary();

  if (currentSelectedStoreId && !getFilteredStores().some(store => String(store.store_id) === String(currentSelectedStoreId))) {
    currentSelectedStoreId = null;
    resetSelectedStorePanel();
  }
}
