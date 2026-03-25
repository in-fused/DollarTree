/* ================= LOGO / MOBILE ================= */

const EXEC_SUMMARY_COLLAPSE_KEY = "execSummaryCollapsed";

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

function getExecutiveSummaryCollapsedState() {
  try {
    const stored = sessionStorage.getItem(EXEC_SUMMARY_COLLAPSE_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
  } catch (error) {
    // Ignore storage failures and use compact default.
  }
  return true;
}

function setExecutiveSummaryCollapsedState(collapsed) {
  try {
    sessionStorage.setItem(EXEC_SUMMARY_COLLAPSE_KEY, String(collapsed));
  } catch (error) {
    // Ignore storage failures.
  }
}

function bindMobileExecutiveSummary() {
  const card = document.getElementById("mapExecutiveCallout");
  const toggle = document.getElementById("executiveSummaryToggleBtn");
  if (!card || !toggle || toggle.dataset.bound) return;

  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const isMobileExecutiveView = isMobileViewport() && executiveModeEnabled;
    if (isMobileExecutiveView) {
      mobileExecutiveSummaryExpanded = !mobileExecutiveSummaryExpanded;
      updateMobileExecutiveSummaryUI();
      return;
    }

    const collapsed = card.classList.contains("exec-summary-collapsed");
    setExecutiveSummaryCollapsedState(!collapsed);
    updateMobileExecutiveSummaryUI();
  });

  toggle.dataset.bound = "true";
}

function updateMobileExecutiveSummaryUI() {
  const card = document.getElementById("mapExecutiveCallout");
  const line = document.getElementById("mapExecutiveSummaryLine");
  const details = document.getElementById("mapExecutiveDetails");
  const toggle = document.getElementById("executiveSummaryToggleBtn");
  if (!card || !line || !details || !toggle) return;

  const shouldUseMobileBehavior = isMobileViewport() && executiveModeEnabled;
  const collapsed = shouldUseMobileBehavior
    ? !mobileExecutiveSummaryExpanded
    : getExecutiveSummaryCollapsedState();

  card.classList.toggle("mobile-collapsible", shouldUseMobileBehavior);
  card.classList.toggle("expanded", shouldUseMobileBehavior && !collapsed);
  card.classList.toggle("exec-summary-collapsed", collapsed);
  card.classList.toggle("exec-summary-expanded", !collapsed);

  line.classList.toggle("collapsed", shouldUseMobileBehavior && collapsed);

  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.setAttribute("aria-label", collapsed ? "Expand executive summary" : "Collapse executive summary");
  toggle.textContent = collapsed ? "Expand" : "Collapse";

  details.setAttribute("aria-hidden", String(collapsed));

  if (shouldUseMobileBehavior) {
    setExecutiveSummaryCollapsedState(collapsed);
  }
}

/* ================= EXEC / NATIONAL / SIDEBAR ================= */

function bindExecutiveModeUI() {
  const toggle = document.getElementById("executiveModeToggle");
  const floatingExit = document.getElementById("floatingExecutiveExit");

  if (toggle && !toggle.dataset.bound) {
    toggle.addEventListener("change", () => {
      executiveModeEnabled = toggle.checked;
      localStorage.setItem(EXECUTIVE_MODE_KEY, String(executiveModeEnabled));
      mobileExecutiveSummaryExpanded = false;
      updateExecutiveModeUI();
    });
    toggle.dataset.bound = "true";
  }

  if (floatingExit && !floatingExit.dataset.bound) {
    floatingExit.addEventListener("click", () => {
      executiveModeEnabled = false;
      localStorage.setItem(EXECUTIVE_MODE_KEY, "false");
      mobileExecutiveSummaryExpanded = false;
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
  updateMobileExecutiveSummaryUI();
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
    updateMobileExecutiveSummaryUI();
    setTimeout(() => map.resize(), 120);
  });
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

  mobileExecutiveSummaryExpanded = false;
  updateHeaderMetaAndSummaries();
  updateMobileExecutiveSummaryUI();

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

function applyRouteSelectionVisuals() {
  if (!map || !map.getSource("stores")) return;

  const selectedSet = new Set(
    routeStops
      .map((stop) => Number.parseInt(String(stop.storeId), 10))
      .filter(Number.isFinite)
  );

  const routeSet = new Set(selectedSet);

  allStores.forEach((store) => {
    const storeId = Number.parseInt(store.store_id, 10);
    if (!Number.isFinite(storeId)) return;
    store._routeSelected = selectedSet.has(storeId);
    store._inRoute = routeSet.has(storeId);
  });

  const source = map.getSource("stores");
  source.setData({
    type: "FeatureCollection",
    features: allStores.map(storeToFeature)
  });
}

function initializeMapSourcesAndLayers() {
  const baseFeatures = allStores.map(storeToFeature);

  map.addSource("stores", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: baseFeatures
    },
    cluster: true,
    clusterRadius: 48,
    clusterProperties: {
      activeCount: ["+", ["case", ["==", ["get", "status"], "active"], 1, 0]],
      completedCount: ["+", ["case", ["==", ["get", "status"], "completed"], 1, 0]],
      closedCount: ["+", ["case", ["==", ["get", "status"], "closed"], 1, 0]],
      rescheduledCount: ["+", ["case", ["==", ["get", "status"], "rescheduled"], 1, 0]]
    }
  });

  const clusterColorExpression = [
    "case",
    [">=", ["get", "activeCount"], ["max", ["get", "completedCount"], ["get", "closedCount"], ["get", "rescheduledCount"]]], "#64b5f6",
    [">=", ["get", "rescheduledCount"], ["max", ["get", "completedCount"], ["get", "closedCount"], ["get", "activeCount"]]], "#ff9900",
    [">=", ["get", "completedCount"], ["max", ["get", "activeCount"], ["get", "closedCount"], ["get", "rescheduledCount"]]], "#2ecc71",
    "#ff2d2d"
  ];

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "stores",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": clusterColorExpression,
      "circle-radius": [
        "step",
        ["get", "point_count"],
        16,
        12, 20,
        40, 26,
        100, 32
      ],
      "circle-opacity": 0.88,
      "circle-stroke-width": 1.8,
      "circle-stroke-color": "rgba(255,255,255,0.22)"
    }
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "stores",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-size": 11,
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"]
    },
    paint: {
      "text-color": "#ffffff"
    }
  });

  map.addLayer({
    id: "route-selected-point",
    type: "circle",
    source: "stores",
    filter: [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "inRoute"], true]
    ],
    paint: {
      "circle-radius": 15,
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 2.2,
      "circle-stroke-color": "#ffd166"
    }
  });

  map.addLayer({
    id: "active-point-pulse",
    type: "circle",
    source: "stores",
    filter: [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "status"], "active"]
    ],
    paint: {
      "circle-radius": 11,
      "circle-color": "#64b5f6",
      "circle-opacity": 0.22
    }
  });

  map.addLayer({
    id: "unclustered-point",
    type: "circle",
    source: "stores",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "match",
        ["get", "status"],
        "completed", "#2ecc71",
        "active", "#64b5f6",
        "rescheduled", "#ff9900",
        "closed", "#ff2d2d",
        "#9aa7b5"
      ],
      "circle-radius": 7.2,
      "circle-stroke-width": 1.6,
      "circle-stroke-color": "rgba(255,255,255,0.8)"
    }
  });

  map.addLayer({
    id: "integrity-ring",
    type: "circle",
    source: "stores",
    filter: [
      "all",
      ["!", ["has", "point_count"]],
      [">", ["length", ["coalesce", ["get", "integrityIssues"], []]], 0]
    ],
    paint: {
      "circle-radius": 10.5,
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 1.8,
      "circle-stroke-color": "#ffc845",
      "circle-stroke-opacity": 0.95
    }
  });

  map.addLayer({
    id: "store-label",
    type: "symbol",
    source: "stores",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "text-field": ["to-string", ["get", "store_id"]],
      "text-size": 10,
      "text-offset": [0, 1.45],
      "text-anchor": "top",
      "text-allow-overlap": false
    },
    paint: {
      "text-color": "rgba(233,242,255,0.95)",
      "text-halo-color": "rgba(6,12,19,0.86)",
      "text-halo-width": 0.9
    }
  });

  ensureActivePulseAnimation();
}

function bindMapInteractions() {
  map.on("click", "clusters", (event) => {
    const features = map.queryRenderedFeatures(event.point, { layers: ["clusters"] });
    const clusterId = features[0].properties.cluster_id;

    map.getSource("stores").getClusterExpansionZoom(clusterId, (error, zoom) => {
      if (error) return;

      map.easeTo({
        center: features[0].geometry.coordinates,
        zoom
      });
    });
  });

  map.on("mouseenter", "clusters", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "clusters", () => {
    map.getCanvas().style.cursor = "";
  });

  map.on("click", "unclustered-point", (event) => {
    const feature = event.features?.[0];
    if (!feature) return;

    const storeId = Number.parseInt(String(feature.properties.store_id), 10);
    if (!Number.isFinite(storeId)) return;

    const store = allStores.find((candidate) => Number.parseInt(candidate.store_id, 10) === storeId);
    if (!store) return;

    openStoreModal(store);
  });

  map.on("mouseenter", "unclustered-point", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "unclustered-point", () => {
    map.getCanvas().style.cursor = "";
  });
}

function applyMapDataState() {
  if (!map || !map.getSource("stores")) return;
  applyRouteSelectionVisuals();
  refreshIntegrityLayerVisibility();
}

function initializeMap() {
  if (map) return;

  mapboxgl.accessToken = MAPBOX_TOKEN;
  map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/dark-v11",
    center: [-81.64, 27.91],
    zoom: 6.2,
    attributionControl: false
  });

  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

  map.on("load", () => {
    initializeMapSourcesAndLayers();
    bindMapInteractions();
    applyMapDataState();
    updateMapViewportForMode();
  });
}

function refreshMapAndOverlays() {
  refreshMapSourceData();
  refreshIntegrityLayerVisibility();
  applyRouteSelectionVisuals();
  updateMapViewportForMode();
  updateMobileExecutiveSummaryUI();
  setTimeout(() => map.resize(), 80);
}