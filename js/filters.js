/* ================= FILTERS ================= */

function bindFilters() {
  const regionFilter = document.getElementById("regionFilter");
  const territoryFilter = document.getElementById("territoryFilter");
  const stateFilter = document.getElementById("stateFilter");
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

  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.addEventListener("click", () => {
      activeFilters = { region: "", territory: "", state: "" };
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
      state: saved.state || ""
    };
  } catch {
    activeFilters = { region: "", territory: "", state: "" };
  }
}

function persistFilterState() {
  localStorage.setItem(filtersKey(), JSON.stringify(activeFilters));
}

function getFilteredStores() {
  return storeData.filter(store => {
    if (activeFilters.region && String(store.region || "") !== activeFilters.region) return false;
    if (activeFilters.territory && String(store.territory || "") !== activeFilters.territory) return false;
    if (activeFilters.state && String(store.state || "") !== activeFilters.state) return false;
    return true;
  });
}

function getStoresForOptionPopulation(dimension) {
  return storeData.filter(store => {
    if (dimension !== "region" && activeFilters.region && String(store.region || "") !== activeFilters.region) return false;
    if (dimension !== "territory" && activeFilters.territory && String(store.territory || "") !== activeFilters.territory) return false;
    if (dimension !== "state" && activeFilters.state && String(store.state || "") !== activeFilters.state) return false;
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
  }
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
}

function updateFilterSummary() {
  const parts = [];
  if (activeFilters.region) parts.push(`Region: ${activeFilters.region}`);
  if (activeFilters.territory) parts.push(`Territory: ${activeFilters.territory}`);
  if (activeFilters.state) parts.push(`State: ${activeFilters.state}`);

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

  if (currentSelectedStoreId && !getFilteredStores().some(s => String(s.store_id) === String(currentSelectedStoreId))) {
    currentSelectedStoreId = null;
    resetSelectedStorePanel();
  }
}
