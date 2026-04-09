/* ================= LOGO / MOBILE ================= */

function bindLogoHome() {
  const logo = document.querySelector(".brandLogoWide");
  if (!logo || logo.dataset.bound) return;

  logo.addEventListener("click", () => {
    currentWorkspaceView = "map";
    localStorage.setItem(ACTIVE_VIEW_KEY, currentWorkspaceView);
    updateWorkspaceViewUI();
    updateMapViewportForMode();
  });

  logo.dataset.bound = "true";
}

/* ================= EXEC / NATIONAL / SIDEBAR ================= */

function bindExecutiveModeUI() {
  const toggle = document.getElementById("executiveModeToggle");
  const floatingExit = document.getElementById("floatingExecutiveExit");

  if (toggle && !toggle.dataset.bound) {
    toggle.addEventListener("change", () => {
      executiveModeEnabled = toggle.checked;
      localStorage.setItem(EXECUTIVE_MODE_KEY, String(executiveModeEnabled));
      updateExecutiveModeUI();
    });
    toggle.dataset.bound = "true";
  }

  if (floatingExit && !floatingExit.dataset.bound) {
    floatingExit.addEventListener("click", () => {
      executiveModeEnabled = false;
      localStorage.setItem(EXECUTIVE_MODE_KEY, "false");
      updateExecutiveModeUI();
    });
    floatingExit.dataset.bound = "true";
  }
}

function updateExecutiveModeUI() {
  document.body.classList.toggle("executive-mode", executiveModeEnabled);

  const toggle = document.getElementById("executiveModeToggle");
  const floatingExit = document.getElementById("floatingExecutiveExit");

  if (toggle) toggle.checked = executiveModeEnabled;
  if (floatingExit) floatingExit.classList.toggle("hidden", !executiveModeEnabled);

  if (executiveModeEnabled) {
    document.body.classList.remove("sidebar-open");
  }

  updateHeaderMetaAndSummaries();
  setTimeout(() => map.resize(), 180);
}

function bindNationalOverviewUI() {
  const toggle = document.getElementById("nationalOverviewToggle");
  if (!toggle || toggle.dataset.bound) return;

  toggle.addEventListener("change", () => {
    nationalOverviewEnabled = toggle.checked;
    localStorage.setItem(NATIONAL_OVERVIEW_KEY, String(nationalOverviewEnabled));
    updateNationalOverviewUI();
    updateHeaderDashboard();
    updateScopeSummary();
    updateIntelRail();
    updateMapViewportForMode();
    renderPhotoLibrary();
  });

  toggle.dataset.bound = "true";
}

function updateNationalOverviewUI() {
  const toggle = document.getElementById("nationalOverviewToggle");
  if (toggle) toggle.checked = nationalOverviewEnabled;
  setMapModeTags();
  updateHeaderMetaAndSummaries();
}

function bindMobileSidebarUI() {
  const toggle = document.getElementById("mobileSidebarToggle");
  const sidebar = document.getElementById("sidebar");

  if (toggle && !toggle.dataset.bound) {
    toggle.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-open");
      setTimeout(() => map.resize(), 180);
    });
    toggle.dataset.bound = "true";
  }

  if (sidebar && !sidebar.dataset.bound) {
    sidebar.addEventListener("click", (e) => {
      if (window.innerWidth <= 900 && e.target.tagName === "A") {
        document.body.classList.remove("sidebar-open");
      }
    });
    sidebar.dataset.bound = "true";
  }

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      document.body.classList.remove("sidebar-open");
    }
    setTimeout(() => map.resize(), 120);
  });
}

function getSidebarStateStorageKey() {
  const projectScope = String(currentProjectId || "global");
  return `sidebarState:${projectScope}`;
}

function bindSidebarCollapsibles() {
  const sections = document.querySelectorAll(".sidebar-section");

  sections.forEach(section => {
    const header = section.querySelector(".section-header");
    if (!header || header.dataset.bound) return;

    header.addEventListener("click", (event) => {
      if (event.target.closest("button, input, select, textarea, a, label")) return;
      section.classList.toggle("collapsed");
      persistSidebarState();
    });

    header.dataset.bound = "true";
  });

  restoreSidebarState();

  const projectSelect = document.getElementById("projectSelect");
  if (projectSelect && !projectSelect.dataset.sidebarStateBound) {
    projectSelect.addEventListener("change", () => {
      setTimeout(() => {
        restoreSidebarState();
      }, 0);
    });
    projectSelect.dataset.sidebarStateBound = "true";
  }
}

function persistSidebarState() {
  const state = {};
  document.querySelectorAll(".sidebar-section").forEach(section => {
    const sectionKey = String(section.dataset.section || "").trim();
    if (!sectionKey) return;
    state[sectionKey] = section.classList.contains("collapsed");
  });

  localStorage.setItem(getSidebarStateStorageKey(), JSON.stringify(state));
}

function restoreSidebarState() {
  const raw = localStorage.getItem(getSidebarStateStorageKey());
  if (!raw) return;

  try {
    const state = JSON.parse(raw);
    Object.entries(state).forEach(([key, collapsed]) => {
      const section = document.querySelector(`.sidebar-section[data-section="${key}"]`);
      if (!section) return;
      section.classList.toggle("collapsed", !!collapsed);
    });
  } catch (error) {
    console.warn("Sidebar state restore skipped:", error);
  }
}

function bindAdminPanel() {
  const btn = document.getElementById("adminPanelToggle");
  const panel = document.getElementById("adminPanel");

  if (!btn || !panel || btn.dataset.bound) return;

  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    panel.classList.toggle("hidden");
  });

  panel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  document.addEventListener("click", () => {
    panel.classList.add("hidden");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      panel.classList.add("hidden");
    }
  });

  btn.dataset.bound = "true";
}

/* ================= WORKSPACE VIEWS ================= */

function bindWorkspaceViews() {
  const mapBtn = document.getElementById("mapViewBtn");
  const photoBtn = document.getElementById("photoLibraryViewBtn");

  if (mapBtn && !mapBtn.dataset.bound) {
    mapBtn.addEventListener("click", () => {
      currentWorkspaceView = "map";
      localStorage.setItem(ACTIVE_VIEW_KEY, currentWorkspaceView);
      updateWorkspaceViewUI();
    });
    mapBtn.dataset.bound = "true";
  }

  if (photoBtn && !photoBtn.dataset.bound) {
    photoBtn.addEventListener("click", () => {
      currentWorkspaceView = "photos";
      localStorage.setItem(ACTIVE_VIEW_KEY, currentWorkspaceView);
      updateWorkspaceViewUI();
      renderPhotoLibrary();
    });
    photoBtn.dataset.bound = "true";
  }
}

function updateWorkspaceViewUI() {
  const mapBtn = document.getElementById("mapViewBtn");
  const photoBtn = document.getElementById("photoLibraryViewBtn");
  const mapView = document.getElementById("mapWorkspaceView");
  const photoView = document.getElementById("photoLibraryWorkspaceView");

  const showingMap = currentWorkspaceView !== "photos";

  mapBtn?.classList.toggle("active", showingMap);
  photoBtn?.classList.toggle("active", !showingMap);

  mapView?.classList.toggle("hidden", !showingMap);
  mapView?.classList.toggle("active", showingMap);

  photoView?.classList.toggle("hidden", showingMap);
  photoView?.classList.toggle("active", !showingMap);

  updateHeaderMetaAndSummaries();

  if (showingMap) {
    setTimeout(() => map.resize(), 120);
  } else {
    renderPhotoLibrary();
  }
}

/* ================= MAP ================= */

function stopActivePulseAnimation() {
  if (activePointPulseAnimationId) {
    cancelAnimationFrame(activePointPulseAnimationId);
    activePointPulseAnimationId = null;
  }
}

function ensureActivePulseAnimation() {
  if (activePointPulseAnimationId || !map.getLayer("active-point-pulse")) return;

  activePointPulseStartedAt = performance.now();

  const step = (timestamp) => {
    if (!map.getLayer("active-point-pulse")) {
      activePointPulseAnimationId = null;
      return;
    }

    const progress = ((timestamp - activePointPulseStartedAt) % 2200) / 2200;
    const radius = 11 + (progress * 9);
    const opacity = 0.22 * (1 - progress);

    try {
      map.setPaintProperty("active-point-pulse", "circle-radius", radius);
      map.setPaintProperty("active-point-pulse", "circle-opacity", opacity);
    } catch (error) {
      activePointPulseAnimationId = null;
      return;
    }

    activePointPulseAnimationId = requestAnimationFrame(step);
  };

  activePointPulseAnimationId = requestAnimationFrame(step);
}

function getDominantClusterStatusColorExpression() {
  return [
    "case",
    [
      "all",
      [">=", ["get", "closedCount"], ["get", "rescheduledCount"]],
      [">=", ["get", "closedCount"], ["get", "activeCount"]],
      [">=", ["get", "closedCount"], ["get", "completedCount"]],
      [">", ["get", "closedCount"], 0]
    ],
    "#ff2d2d",
    [
      "all",
      [">=", ["get", "rescheduledCount"], ["get", "activeCount"]],
      [">=", ["get", "rescheduledCount"], ["get", "completedCount"]],
      [">", ["get", "rescheduledCount"], 0]
    ],
    "#ff9900",
    [
      "all",
      [">=", ["get", "activeCount"], ["get", "completedCount"]],
      [">", ["get", "activeCount"], 0]
    ],
    "#64b5f6",
    [">", ["get", "completedCount"], 0],
    "#2ecc71",
    "#64b5f6"
  ];
}

function createGeoJson(stores) {
  const geoAudit = getGeoAuditConfig(stores);

  return {
    type: "FeatureCollection",
    features: stores
      .filter(store => hasValidCoordinate(store?.lat) && hasValidCoordinate(store?.lng))
      .map(store => {
        const status = statusMap[String(store.store_id)] || getStatusState("active");

        return {
          type: "Feature",
          properties: {
            store_id: String(store.store_id),
            status_code: normalizeStatusCode(status.status_code),
            status_reason: status.status_reason || "",
            completed: status.completed === true,
            closed: status.closed === true,
            ...getMappedStoreIntegrityProperties(store, statusMap, geoAudit)
          },
          geometry: {
            type: "Point",
            coordinates: [store.lng, store.lat]
          }
        };
      })
  };
}

function buildMap() {
  geojsonData = createGeoJson(getFilteredStores());

  map.addSource("stores", {
    type: "geojson",
    data: geojsonData,
    cluster: true,
    clusterRadius: 50,
    clusterProperties: {
      activeCount: [
        "+",
        ["case", ["==", ["get", "status_code"], "active"], 1, 0]
      ],
      rescheduledCount: [
        "+",
        ["case", ["==", ["get", "status_code"], "rescheduled"], 1, 0]
      ],
      completedCount: [
        "+",
        ["case", ["==", ["get", "status_code"], "completed"], 1, 0]
      ],
      closedCount: [
        "+",
        ["case", ["==", ["get", "status_code"], "closed"], 1, 0]
      ],
      totalCount: ["+", 1]
    }
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "stores",
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": [
        "step",
        ["get", "point_count"],
        28,
        10, 30,
        25, 33,
        50, 36
      ],
      "circle-color": getDominantClusterStatusColorExpression(),
      "circle-stroke-width": 2,
      "circle-stroke-color": "rgba(255,255,255,0.18)",
      "circle-opacity": 0.92
    }
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "stores",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count}",
      "text-size": [
        "step",
        ["get", "point_count"],
        14,
        10, 15,
        25, 16
      ]
    },
    paint: {
      "text-color": "#ffffff"
    }
  });

  map.addLayer({
    id: "active-point-pulse",
    type: "circle",
    source: "stores",
    filter: [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "status_code"], "active"]
    ],
    paint: {
      "circle-radius": 11,
      "circle-color": "rgba(100, 181, 246, 0.28)",
      "circle-opacity": 0.18,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "rgba(100, 181, 246, 0.55)"
    }
  });

  map.addLayer({
    id: "point-issue-halo",
    type: "circle",
    source: "stores",
    filter: [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "has_integrity_issue"], true]
    ],
    paint: {
      "circle-radius": 12,
      "circle-color": "rgba(255, 179, 71, 0.18)",
      "circle-stroke-width": 2,
      "circle-stroke-color": "rgba(255, 196, 92, 0.82)"
    }
  });

  map.addLayer({
    id: "points",
    type: "circle",
    source: "stores",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": 8,
      "circle-color": [
        "match",
        ["get", "status_code"],
        "completed", "#2ecc71",
        "closed", "#ff2d2d",
        "rescheduled", "#ff9900",
        "#64b5f6"
      ],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "rgba(255,255,255,0.35)"
    }
  });

  map.on("click", "points", handleStorePointClick);
  map.on("click", "clusters", handleClusterClick);

  map.on("mouseenter", "points", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "points", () => {
    map.getCanvas().style.cursor = "";
  });

  map.on("mouseenter", "clusters", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "clusters", () => {
    map.getCanvas().style.cursor = "";
  });

  ensureActivePulseAnimation();
}

function rebuildFullMap() {
  if (!map.getSource("stores")) return;
  geojsonData = createGeoJson(getFilteredStores());
  map.getSource("stores").setData(geojsonData);
  ensureActivePulseAnimation();
}

function rebuild() {
  rebuildFullMap();
}

function handleClusterClick(e) {
  const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
  if (!features.length) return;

  const clusterId = features[0].properties.cluster_id;
  map.getSource("stores").getClusterExpansionZoom(clusterId, (err, zoom) => {
    if (err) return;
    map.easeTo({
      center: features[0].geometry.coordinates,
      zoom
    });
  });
}

function handleStorePointClick(e) {
  const feature = e.features?.[0];
  if (!feature) return;
  const storeId = String(feature.properties.store_id);
  currentSelectedStoreId = storeId;
  updateSelectedStorePanel(storeId);
  openStoreModal(storeId);
}

function updateMapViewportForMode() {
  if (currentWorkspaceView === "photos") return;

  const filteredStores = getFilteredStores();

  if (filteredStores.length === 0) {
    map.easeTo({
      center: nationalOverviewEnabled ? NATIONAL_CENTER : DEFAULT_LOCAL_CENTER,
      zoom: nationalOverviewEnabled ? NATIONAL_ZOOM : DEFAULT_LOCAL_ZOOM,
      duration: 700
    });
    return;
  }

  if (nationalOverviewEnabled) {
    fitMapToStores(filteredStores, 48, 5.5);
    return;
  }

  if (filteredStores.length === 1) {
    map.easeTo({
      center: [filteredStores[0].lng, filteredStores[0].lat],
      zoom: 12.5,
      duration: 700
    });
    return;
  }

  fitMapToStores(filteredStores, 58, 8.75);
}

function fitMapToStores(stores, padding = 40, maxZoom = 8.5) {
  if (!stores || stores.length === 0) return;

  const bounds = new mapboxgl.LngLatBounds();

  stores.forEach(store => {
    if (Number.isFinite(store.lng) && Number.isFinite(store.lat)) {
      bounds.extend([store.lng, store.lat]);
    }
  });

  if (bounds.isEmpty()) return;

  map.fitBounds(bounds, {
    padding,
    maxZoom,
    duration: 700
  });
}

function setMapModeTags() {
  const filteredCount = getFilteredStores().length;

  setText("mapModeTag", nationalOverviewEnabled ? "National Overview" : "Project View");

  const parts = [];
  if (activeFilters.region) parts.push(activeFilters.region);
  if (activeFilters.territory) parts.push(activeFilters.territory);
  if (activeFilters.state) parts.push(activeFilters.state);
  if (showRemovedStores) parts.push("Removed Visible");

  setText(
    "mapScopeTag",
    parts.length
      ? `${parts.join(" • ")} • ${filteredCount.toLocaleString()} stores`
      : `${filteredCount.toLocaleString()} stores in scope`
  );
}

/* ================= SEARCH ================= */

function bindSearch() {
  const input = document.getElementById("storeSearch");
  if (!input || input.dataset.bound) return;

  input.addEventListener("input", (e) => {
    const value = e.target.value.trim();
    const match = storeData.find(store => String(store.store_id) === value);

    if (!match) return;

    currentSelectedStoreId = String(match.store_id);
    updateSelectedStorePanel(match.store_id);

    currentWorkspaceView = "map";
    localStorage.setItem(ACTIVE_VIEW_KEY, currentWorkspaceView);
    updateWorkspaceViewUI();

    map.flyTo({
      center: [match.lng, match.lat],
      zoom: 14
    });

    if (window.innerWidth <= 900) {
      document.body.classList.remove("sidebar-open");
    }
  });

  input.dataset.bound = "true";
}
