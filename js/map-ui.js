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

function bindMobileExecutiveSummary() {
  const card = document.getElementById("mapExecutiveCallout");
  if (!card || card.dataset.bound) return;

  card.addEventListener("click", () => {
    if (!isMobileViewport() || !executiveModeEnabled) return;
    mobileExecutiveSummaryExpanded = !mobileExecutiveSummaryExpanded;
    updateMobileExecutiveSummaryUI();
  });

  card.dataset.bound = "true";
}

function updateMobileExecutiveSummaryUI() {
  const card = document.getElementById("mapExecutiveCallout");
  const line = document.getElementById("mapExecutiveSummaryLine");
  if (!card || !line) return;

  const shouldCollapse = isMobileViewport() && executiveModeEnabled;

  card.classList.toggle("mobile-collapsible", shouldCollapse);
  card.classList.toggle("expanded", shouldCollapse && mobileExecutiveSummaryExpanded);
  line.classList.toggle("collapsed", shouldCollapse && !mobileExecutiveSummaryExpanded);
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
      completedCount: [
        "+",
        ["case", ["==", ["get", "completed"], true], 1, 0]
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
      "circle-radius": 28,
      "circle-color": [
        "case",
        [">=", ["/", ["get", "completedCount"], ["get", "totalCount"]], 0.75], "#2ecc71",
        [">=", ["/", ["get", "completedCount"], ["get", "totalCount"]], 0.4], "#ff9900",
        "#ff2d2d"
      ],
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
      "text-size": 14
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