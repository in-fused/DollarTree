(function () {
  "use strict";

  const MAPBOX_TOKEN = "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9.3-ZXlPJosjQ4c5bucpnWYA";
  const STATUS_OPTIONS = [
    { value: "", label: "All Statuses" },
    { value: "active", label: "Active" },
    { value: "completed", label: "Completed" },
    { value: "closed", label: "Closed" },
    { value: "rescheduled", label: "Rescheduled" }
  ];

  const state = {
    payload: null,
    map: null,
    filters: {
      region: "",
      territory: "",
      state: "",
      status: ""
    },
    selectedStoreId: ""
  };

  function getEl(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const el = getEl(id);
    if (el) el.textContent = value;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  function formatTimestamp(value) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function normalizeStatusCode(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["active", "completed", "closed", "rescheduled"].includes(normalized)) return normalized;
    return "active";
  }

  function getStatusLabel(statusCode) {
    const normalized = normalizeStatusCode(statusCode);
    if (normalized === "completed") return "Completed";
    if (normalized === "closed") return "Closed";
    if (normalized === "rescheduled") return "Rescheduled";
    return "Active";
  }

  function hasValidCoordinatePair(lat, lng) {
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    return (
      Number.isFinite(parsedLat) &&
      Number.isFinite(parsedLng) &&
      parsedLat >= -90 &&
      parsedLat <= 90 &&
      parsedLng >= -180 &&
      parsedLng <= 180 &&
      !(parsedLat === 0 && parsedLng === 0)
    );
  }

  function sanitizeBrandColor(value) {
    const raw = String(value || "").trim();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return "#c8102e";
    if (raw.length === 4) {
      return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
    }
    return raw.toLowerCase();
  }

  function getBrandRgb(color) {
    const hex = sanitizeBrandColor(color).slice(1);
    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);
    if (![red, green, blue].every(Number.isFinite)) return "200, 16, 46";
    return `${red}, ${green}, ${blue}`;
  }

  function uniqueSorted(values) {
    return Array.from(new Set(
      values.map(value => String(value || "").trim()).filter(Boolean)
    )).sort((a, b) => a.localeCompare(b));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getToken() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get("t") || "").trim();
  }

  async function fetchSharePayload(token) {
    const response = await fetch(`/api/share-links/resolve?t=${encodeURIComponent(token)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      const message = payload?.error?.message || "The link may be expired, revoked, or malformed.";
      const error = new Error(message);
      error.code = payload?.error?.code || "share_load_failed";
      throw error;
    }

    return payload;
  }

  function getStores() {
    return Array.isArray(state.payload?.stores) ? state.payload.stores : [];
  }

  function getFilteredStores() {
    return getStores().filter(store => {
      if (state.filters.region && String(store.region || "") !== state.filters.region) return false;
      if (state.filters.territory && String(store.territory || "") !== state.filters.territory) return false;
      if (state.filters.state && String(store.state || "") !== state.filters.state) return false;
      if (state.filters.status && normalizeStatusCode(store.status_code) !== state.filters.status) return false;
      return true;
    });
  }

  function calculateSummary(stores) {
    const summary = {
      total: stores.length,
      active: 0,
      completed: 0,
      rescheduled: 0,
      closed: 0,
      open_work: 0,
      percent_complete: 0,
      attention_count: 0,
      missing_coordinate_count: 0,
      missing_status_count: 0
    };

    stores.forEach(store => {
      const statusCode = normalizeStatusCode(store.status_code);
      if (statusCode === "completed") summary.completed += 1;
      else if (statusCode === "closed") summary.closed += 1;
      else if (statusCode === "rescheduled") summary.rescheduled += 1;
      else summary.active += 1;

      if (!hasValidCoordinatePair(store.lat, store.lng)) summary.missing_coordinate_count += 1;
      if (store.has_persisted_status !== true) summary.missing_status_count += 1;
      if (statusCode === "rescheduled" && !String(store.status_reason || "").trim()) summary.attention_count += 1;
      if (store.has_persisted_status !== true) summary.attention_count += 1;
    });

    summary.open_work = summary.active + summary.rescheduled;
    const actionableTotal = Math.max(0, summary.total - summary.closed);
    summary.percent_complete = actionableTotal > 0 ? (summary.completed / actionableTotal) * 100 : 0;
    return summary;
  }

  function applyBranding(project) {
    const brandColor = sanitizeBrandColor(project?.brand_color);
    document.documentElement.style.setProperty("--project-accent", brandColor);
    document.documentElement.style.setProperty("--project-accent-rgb", getBrandRgb(brandColor));

    const logoUrl = String(project?.brand_logo_url || "").trim();
    const logoFrame = getEl("shareLogoFrame");
    const logo = getEl("shareProjectLogo");
    if (!logoFrame || !logo) return;

    if (!logoUrl) {
      logoFrame.classList.add("hidden");
      logo.removeAttribute("src");
      logo.alt = "";
      return;
    }

    logo.src = logoUrl;
    logo.alt = `${project?.name || "Project"} logo`;
    logoFrame.classList.remove("hidden");
    logo.onerror = () => {
      logoFrame.classList.add("hidden");
      logo.removeAttribute("src");
    };
  }

  function populateSelect(id, defaultLabel, values, selectedValue) {
    const select = getEl(id);
    if (!select) return;
    select.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = defaultLabel;
    select.appendChild(defaultOption);

    values.forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });

    select.value = values.includes(selectedValue) ? selectedValue : "";
  }

  function populateFilters() {
    const stores = getStores();
    populateSelect("shareRegionFilter", "All Regions", uniqueSorted(stores.map(store => store.region)), state.filters.region);
    populateSelect("shareTerritoryFilter", "All Territories", uniqueSorted(stores.map(store => store.territory)), state.filters.territory);
    populateSelect("shareStateFilter", "All States", uniqueSorted(stores.map(store => store.state)), state.filters.state);

    const statusSelect = getEl("shareStatusFilter");
    if (statusSelect) {
      statusSelect.innerHTML = "";
      STATUS_OPTIONS.forEach(optionConfig => {
        const option = document.createElement("option");
        option.value = optionConfig.value;
        option.textContent = optionConfig.label;
        statusSelect.appendChild(option);
      });
      statusSelect.value = state.filters.status || "";
    }
  }

  function updateSummaryCards() {
    const summary = calculateSummary(getFilteredStores());
    const percent = Number.isFinite(summary.percent_complete) ? summary.percent_complete : 0;

    setText("summaryTotal", formatNumber(summary.total));
    setText("summaryCompleted", formatNumber(summary.completed));
    setText("summaryActive", formatNumber(summary.active));
    setText("summaryRescheduled", formatNumber(summary.rescheduled));
    setText("summaryClosed", formatNumber(summary.closed));
    setText("summaryAttention", formatNumber(summary.attention_count));
    setText("shareProgressText", `${percent.toFixed(1)}% complete`);
    setText("shareOpenWorkText", `${formatNumber(summary.open_work)} open`);
    setText("shareFilterSummary", summary.total === getStores().length
      ? `Showing all ${formatNumber(summary.total)} stores.`
      : `Showing ${formatNumber(summary.total)} of ${formatNumber(getStores().length)} stores.`);

    const fill = getEl("shareProgressFill");
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, percent)).toFixed(2)}%`;

    const plottable = getFilteredStores().filter(store => hasValidCoordinatePair(store.lat, store.lng)).length;
    setText("shareMapScope", `${formatNumber(plottable)} of ${formatNumber(summary.total)} stores plotted in the current scope.`);
  }

  function renderStatusBreakdown() {
    const summary = calculateSummary(getFilteredStores());
    const rows = [
      { key: "active", label: "Active", value: summary.active },
      { key: "rescheduled", label: "Rescheduled", value: summary.rescheduled },
      { key: "completed", label: "Completed", value: summary.completed },
      { key: "closed", label: "Closed", value: summary.closed }
    ];
    const total = Math.max(summary.total, 1);
    const root = getEl("shareStatusBreakdown");
    if (!root) return;

    root.innerHTML = rows.map(row => {
      const percent = summary.total > 0 ? (row.value / total) * 100 : 0;
      return `
        <div class="statusBreakdownRow">
          <div class="statusBreakdownMeta">
            <span><i class="legendDot status-${escapeHtml(row.key)}"></i>${escapeHtml(row.label)}</span>
            <strong>${formatNumber(row.value)} <em>${percent.toFixed(1)}%</em></strong>
          </div>
          <div class="statusBreakdownTrack">
            <div class="statusBreakdownFill status-${escapeHtml(row.key)}" style="width:${percent.toFixed(2)}%;"></div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderDataHealth() {
    const summary = state.payload?.summary || {};
    const items = [
      ["Missing coordinates", summary.missing_coordinate_count],
      ["Missing status", summary.missing_status_count],
      ["Missing region", summary.missing_region_count],
      ["Missing territory", summary.missing_territory_count],
      ["Missing state", summary.missing_state_count]
    ].filter(([, value]) => Number(value || 0) > 0);

    const panel = getEl("shareDataHealthPanel");
    const list = getEl("shareDataHealthList");
    if (!panel || !list) return;

    panel.classList.toggle("hidden", items.length === 0);
    list.innerHTML = items.map(([label, value]) => `
      <div class="dataHealthItem">
        <span>${escapeHtml(label)}</span>
        <strong>${formatNumber(value)}</strong>
      </div>
    `).join("");
  }

  function renderActivity() {
    const root = getEl("shareActivityList");
    if (!root) return;

    const activity = Array.isArray(state.payload?.activity) ? state.payload.activity : [];
    if (!activity.length) {
      root.innerHTML = `<div class="emptyText">No recent public-safe activity is available for this share.</div>`;
      return;
    }

    root.innerHTML = activity.slice(0, 8).map(item => `
      <button class="activityItem" type="button" data-store-id="${escapeHtml(item.store_id || "")}">
        <span>${escapeHtml(formatTimestamp(item.timestamp) || "Recent")}</span>
        <strong>${escapeHtml(item.title || "Project activity")}</strong>
        <em>${escapeHtml(item.detail || "")}</em>
      </button>
    `).join("");
  }

  function createGeoJson(stores) {
    return {
      type: "FeatureCollection",
      features: stores
        .filter(store => hasValidCoordinatePair(store.lat, store.lng))
        .map(store => ({
          type: "Feature",
          properties: {
            store_id: String(store.store_id),
            status_code: normalizeStatusCode(store.status_code)
          },
          geometry: {
            type: "Point",
            coordinates: [Number(store.lng), Number(store.lat)]
          }
        }))
    };
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

  function fitMapToStores(stores) {
    if (!state.map) return;
    const plottable = stores.filter(store => hasValidCoordinatePair(store.lat, store.lng));
    if (!plottable.length) {
      state.map.easeTo({ center: [-96, 38], zoom: 3.2, duration: 500 });
      return;
    }

    if (plottable.length === 1) {
      state.map.easeTo({
        center: [Number(plottable[0].lng), Number(plottable[0].lat)],
        zoom: 12.5,
        duration: 500
      });
      return;
    }

    const bounds = new mapboxgl.LngLatBounds();
    plottable.forEach(store => bounds.extend([Number(store.lng), Number(store.lat)]));
    state.map.fitBounds(bounds, {
      padding: 58,
      maxZoom: 8.8,
      duration: 500
    });
  }

  function initMap() {
    mapboxgl.accessToken = MAPBOX_TOKEN;
    state.map = new mapboxgl.Map({
      container: "shareMap",
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-96, 38],
      zoom: 3.2
    });
    state.map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    state.map.on("load", () => {
      state.map.addSource("share-stores", {
        type: "geojson",
        data: createGeoJson(getFilteredStores()),
        cluster: true,
        clusterRadius: 50,
        clusterProperties: {
          activeCount: ["+", ["case", ["==", ["get", "status_code"], "active"], 1, 0]],
          rescheduledCount: ["+", ["case", ["==", ["get", "status_code"], "rescheduled"], 1, 0]],
          completedCount: ["+", ["case", ["==", ["get", "status_code"], "completed"], 1, 0]],
          closedCount: ["+", ["case", ["==", ["get", "status_code"], "closed"], 1, 0]],
          totalCount: ["+", 1]
        }
      });

      state.map.addLayer({
        id: "share-clusters",
        type: "circle",
        source: "share-stores",
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": ["step", ["get", "point_count"], 26, 10, 30, 25, 34, 50, 38],
          "circle-color": getDominantClusterStatusColorExpression(),
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(255,255,255,0.2)",
          "circle-opacity": 0.93
        }
      });

      state.map.addLayer({
        id: "share-cluster-count",
        type: "symbol",
        source: "share-stores",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count}",
          "text-size": 14
        },
        paint: {
          "text-color": "#ffffff"
        }
      });

      state.map.addLayer({
        id: "share-points",
        type: "circle",
        source: "share-stores",
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
          "circle-stroke-width": 1.6,
          "circle-stroke-color": "rgba(255,255,255,0.4)"
        }
      });

      state.map.on("click", "share-clusters", event => {
        const features = state.map.queryRenderedFeatures(event.point, { layers: ["share-clusters"] });
        if (!features.length) return;
        const clusterId = features[0].properties.cluster_id;
        state.map.getSource("share-stores").getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error) return;
          state.map.easeTo({ center: features[0].geometry.coordinates, zoom });
        });
      });

      state.map.on("click", "share-points", event => {
        const feature = event.features?.[0];
        if (!feature) return;
        selectStore(feature.properties.store_id, true);
      });

      ["share-clusters", "share-points"].forEach(layerId => {
        state.map.on("mouseenter", layerId, () => {
          state.map.getCanvas().style.cursor = "pointer";
        });
        state.map.on("mouseleave", layerId, () => {
          state.map.getCanvas().style.cursor = "";
        });
      });

      fitMapToStores(getFilteredStores());
    });
  }

  function updateMapData(shouldFit = false) {
    if (!state.map?.getSource("share-stores")) return;
    const stores = getFilteredStores();
    state.map.getSource("share-stores").setData(createGeoJson(stores));
    if (shouldFit) fitMapToStores(stores);
  }

  function selectStore(storeId, flyToStore) {
    const normalizedStoreId = String(storeId || "").trim();
    const store = getStores().find(item => String(item.store_id) === normalizedStoreId);
    state.selectedStoreId = normalizedStoreId;

    if (!store) {
      setText("shareSelectedStoreTitle", "No store selected");
      setText("shareSelectedStoreBody", "Select a map point to inspect store status and public project metadata.");
      return;
    }

    setText("shareSelectedStoreTitle", `Store ${store.store_id}`);
    const locationParts = [
      store.store_name,
      store.full_address,
      store.city,
      store.state ? `State: ${store.state}` : "",
      store.region ? `Region: ${store.region}` : "",
      store.territory ? `Territory: ${store.territory}` : "",
      `Status: ${getStatusLabel(store.status_code)}`,
      store.status_reason ? `Reason: ${store.status_reason}` : ""
    ].filter(Boolean);

    const body = getEl("shareSelectedStoreBody");
    if (body) {
      body.innerHTML = locationParts.map(part => `<div>${escapeHtml(part)}</div>`).join("");
    }

    if (flyToStore && state.map && hasValidCoordinatePair(store.lat, store.lng)) {
      state.map.flyTo({
        center: [Number(store.lng), Number(store.lat)],
        zoom: Math.max(state.map.getZoom(), 11.5)
      });
    }
  }

  function handleFilterChange() {
    state.filters.region = String(getEl("shareRegionFilter")?.value || "");
    state.filters.territory = String(getEl("shareTerritoryFilter")?.value || "");
    state.filters.state = String(getEl("shareStateFilter")?.value || "");
    state.filters.status = String(getEl("shareStatusFilter")?.value || "");
    updateSummaryCards();
    renderStatusBreakdown();
    updateMapData(true);

    if (state.selectedStoreId && !getFilteredStores().some(store => String(store.store_id) === state.selectedStoreId)) {
      selectStore("");
    }
  }

  function bindControls() {
    ["shareRegionFilter", "shareTerritoryFilter", "shareStateFilter", "shareStatusFilter"].forEach(id => {
      const select = getEl(id);
      if (select) select.addEventListener("change", handleFilterChange);
    });

    const clearBtn = getEl("shareClearFiltersBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        state.filters = { region: "", territory: "", state: "", status: "" };
        populateFilters();
        handleFilterChange();
      });
    }

    const activityList = getEl("shareActivityList");
    if (activityList) {
      activityList.addEventListener("click", event => {
        const button = event.target.closest("[data-store-id]");
        if (!button) return;
        const storeId = String(button.dataset.storeId || "").trim();
        if (storeId) selectStore(storeId, true);
      });
    }
  }

  function renderPayload(payload) {
    state.payload = payload;
    const project = payload.project || {};
    applyBranding(project);

    setText("shareProjectName", project.name || "Project Overview");
    const generated = formatTimestamp(payload.generated_at);
    const expires = formatTimestamp(payload.expires_at);
    setText("shareGeneratedMeta", [
      generated ? `Generated ${generated}` : "",
      expires ? `Link expires ${expires}` : ""
    ].filter(Boolean).join(" | "));

    populateFilters();
    updateSummaryCards();
    renderStatusBreakdown();
    renderDataHealth();
    renderActivity();
    initMap();
    bindControls();

    getEl("shareApp")?.classList.remove("is-loading");
  }

  function showError(error) {
    getEl("shareApp")?.classList.add("hidden");
    const errorState = getEl("shareErrorState");
    if (errorState) errorState.classList.remove("hidden");
    setText("shareErrorTitle", error?.code === "missing_token" ? "Missing share token" : "Unable to load overview");
    setText("shareErrorMessage", error?.message || "The link may be expired, revoked, or malformed.");
  }

  async function init() {
    const token = getToken();
    if (!token) {
      const error = new Error("A share token is required.");
      error.code = "missing_token";
      showError(error);
      return;
    }

    try {
      const payload = await fetchSharePayload(token);
      renderPayload(payload);
    } catch (error) {
      showError(error);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
