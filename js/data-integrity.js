/* ================= DATA INTEGRITY ================= */

function hasValidCoordinate(value) {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "string" && value.trim() === "") return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= -180 && parsed <= 180;
}

function hasValidLatitude(value) {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "string" && value.trim() === "") return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= -90 && parsed <= 90;
}

function hasValidLongitude(value) {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "string" && value.trim() === "") return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= -180 && parsed <= 180;
}

function hasValidCoordinatePair(lat, lng) {
  if (lat === null || lat === undefined || lat === "" || lng === null || lng === undefined || lng === "") {
    return false;
  }
  if ((typeof lat === "string" && lat.trim() === "") || (typeof lng === "string" && lng.trim() === "")) {
    return false;
  }

  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  return (
    hasValidLatitude(parsedLat) &&
    hasValidLongitude(parsedLng) &&
    !(parsedLat === 0 && parsedLng === 0)
  );
}

function getGeoAuditConfig(stores = storeData) {
  const source = Array.isArray(stores) ? stores : [];

  return {
    shouldAuditRegion: source.some(store => !!String(store?.region || "").trim()),
    shouldAuditTerritory: source.some(store => !!String(store?.territory || "").trim()),
    shouldAuditState: source.some(store => !!String(store?.state || "").trim())
  };
}

function hasPersistedStatusRow(storeId) {
  if (!storeId) return false;
  return persistedStatusStoreIds instanceof Set
    ? persistedStatusStoreIds.has(String(storeId))
    : false;
}

function shouldAuditStatusCoverage(stores = storeData) {
  const scopedStores = Array.isArray(stores) ? stores : [];
  if (scopedStores.length === 0) return false;
  if (persistedStatusStoreIds instanceof Set && persistedStatusStoreIds.size > 0) return true;
  return Array.isArray(statusRowsCache) && statusRowsCache.length > 0;
}

function getDataIntegrityReport(storeData, statusMap, geoAudit = getGeoAuditConfig(storeData)) {
  const report = {
    missingRegion: [],
    missingTerritory: [],
    missingState: [],
    missingCoords: [],
    missingStatus: []
  };

  const auditStatusCoverage = shouldAuditStatusCoverage(storeData);

  (Array.isArray(storeData) ? storeData : []).forEach(store => {
    const storeId = String(store?.store_id || "");

    if (geoAudit.shouldAuditRegion && !String(store?.region || "").trim()) {
      report.missingRegion.push(store);
    }

    if (geoAudit.shouldAuditTerritory && !String(store?.territory || "").trim()) {
      report.missingTerritory.push(store);
    }

    if (geoAudit.shouldAuditState && !String(store?.state || "").trim()) {
      report.missingState.push(store);
    }

    if (!hasValidCoordinatePair(store?.lat, store?.lng)) {
      report.missingCoords.push(store);
    }

    if (auditStatusCoverage && !hasPersistedStatusRow(storeId)) {
      report.missingStatus.push(store);
    }
  });

  return report;
}

function ensureStatusIntegrity(storeData, statusMap) {
  const repairedStatusMap = statusMap && typeof statusMap === "object"
    ? { ...statusMap }
    : {};

  (Array.isArray(storeData) ? storeData : []).forEach(store => {
    const storeId = String(store?.store_id || "");
    if (!storeId || Object.prototype.hasOwnProperty.call(repairedStatusMap, storeId)) return;

    repairedStatusMap[storeId] = getStatusState("active");
  });

  return repairedStatusMap;
}

let storeMaintenanceHealthRefreshToken = 0;
const storeMaintenanceHealthCacheByProjectId = {};

function computeStoreMaintenanceHealthFromCurrentState(projectId = currentProjectId) {
  const stores = Array.isArray(allStoreData) && allStoreData.length > 0 ? allStoreData : storeData;
  const statuses = Array.isArray(statusRowsCache) ? statusRowsCache : [];

  if (dataLayer?.buildStoreMaintenanceHealthSnapshot) {
    return dataLayer.buildStoreMaintenanceHealthSnapshot(projectId, stores, statuses);
  }

  return {
    projectId: String(projectId || ""),
    generatedAt: new Date().toISOString(),
    counts: {
      missingStatus: 0,
      orphanStatusRows: 0,
      duplicateStores: 0,
      duplicateStatusRows: 0,
      invalidCoordinates: 0,
      removedStores: 0
    },
    totalIssueCount: 0,
    details: {}
  };
}

function getStoreMaintenanceHealthCount(health, key) {
  const value = Number(health?.counts?.[key]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function renderStoreMaintenanceHealthPanel(health, options = {}) {
  const panel = document.getElementById("adminDataHealthPanel");
  if (!panel) return;

  const canManage = isSignedIn() && canManageProjectLifecycle() && !!String(currentProjectId || "").trim();
  panel.classList.toggle("hidden", !canManage);
  if (!canManage) return;

  const counts = {
    healthMissingStatus: getStoreMaintenanceHealthCount(health, "missingStatus"),
    healthOrphanStatus: getStoreMaintenanceHealthCount(health, "orphanStatusRows"),
    healthDuplicateStores: getStoreMaintenanceHealthCount(health, "duplicateStores"),
    healthDuplicateStatuses: getStoreMaintenanceHealthCount(health, "duplicateStatusRows"),
    healthInvalidCoordinates: getStoreMaintenanceHealthCount(health, "invalidCoordinates"),
    healthRemovedStores: getStoreMaintenanceHealthCount(health, "removedStores")
  };

  Object.entries(counts).forEach(([id, value]) => {
    setText(id, value.toLocaleString());
  });

  const totalCount = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const summaryEl = document.getElementById("storeHealthSummaryMessage");
  const metaEl = document.getElementById("storeHealthDiagnosticsMeta");
  const listEl = document.getElementById("storeHealthIssueList");
  const refreshBtn = document.getElementById("storeHealthRefreshBtn");

  panel.classList.toggle("has-store-health-issues", totalCount > 0);
  panel.classList.toggle("is-store-health-clean", totalCount === 0);

  if (summaryEl) {
    summaryEl.textContent = options.error
      ? (options.error.message || "Unable to refresh diagnostics.")
      : (totalCount === 0
        ? "Project store data is clean."
        : "Store data drift detected. Review the counts before maintenance or reporting.");
    summaryEl.classList.toggle("adminPanelMessageError", !!options.error);
  }

  if (metaEl) {
    const generatedAt = getTimestampValue(health?.generatedAt)
      ? new Date(health.generatedAt).toLocaleString()
      : "";
    metaEl.textContent = options.loading
      ? "Refreshing diagnostics..."
      : (generatedAt ? `Diagnostics refreshed ${generatedAt}` : "Diagnostics use the current project scope.");
  }

  if (listEl) {
    if (options.error) {
      listEl.innerHTML = `<div class="storeHealthIssueText">Diagnostics could not refresh. No automatic repair was attempted.</div>`;
    } else if (totalCount === 0) {
      listEl.innerHTML = "";
    } else {
      const rows = [
        {
          count: counts.healthMissingStatus,
          label: "Stores missing status",
          text: "Store rows without a matching baseline status row."
        },
        {
          count: counts.healthOrphanStatus,
          label: "Status rows with no matching store",
          text: "Status rows whose Store ID does not exist in this project."
        },
        {
          count: counts.healthDuplicateStores,
          label: "Duplicate stores",
          text: "Store IDs with more than one store row in this project."
        },
        {
          count: counts.healthDuplicateStatuses,
          label: "Duplicate status rows",
          text: "Store IDs with more than one status row in this project."
        },
        {
          count: counts.healthInvalidCoordinates,
          label: "Invalid coordinates",
          text: "Store rows with missing, non-numeric, out-of-range, or 0,0 coordinates."
        },
        {
          count: counts.healthRemovedStores,
          label: "Removed stores",
          text: "Stores currently hidden from the active project scope."
        }
      ].filter(row => row.count > 0);

      listEl.innerHTML = rows.map(row => `
        <div class="storeHealthIssueText">
          <strong>${row.count.toLocaleString()} ${row.label}</strong>
          <span>${row.text}</span>
        </div>
      `).join("");
    }
  }

  if (refreshBtn) {
    refreshBtn.disabled = options.loading === true;
    refreshBtn.textContent = options.loading ? "Refreshing..." : "Refresh Diagnostics";
  }
}

async function refreshStoreMaintenanceHealthFromBackend() {
  const projectId = String(currentProjectId || "").trim();
  if (!projectId || !isSignedIn() || !canManageProjectLifecycle()) return;

  const token = ++storeMaintenanceHealthRefreshToken;
  const currentHealth = storeMaintenanceHealthCacheByProjectId[projectId] || computeStoreMaintenanceHealthFromCurrentState(projectId);
  renderStoreMaintenanceHealthPanel(currentHealth, { loading: true });

  let result;
  try {
    result = dataLayer?.getStoreMaintenanceHealth
      ? await dataLayer.getStoreMaintenanceHealth(projectId)
      : { data: computeStoreMaintenanceHealthFromCurrentState(projectId), error: null };
  } catch (error) {
    result = {
      data: null,
      error: error instanceof Error ? error : new Error("Unable to refresh diagnostics.")
    };
  }

  if (token !== storeMaintenanceHealthRefreshToken || String(currentProjectId || "").trim() !== projectId) {
    return;
  }

  if (result?.error) {
    renderStoreMaintenanceHealthPanel(currentHealth, { error: result.error });
    return;
  }

  storeMaintenanceHealthCacheByProjectId[projectId] = result.data;
  renderStoreMaintenanceHealthPanel(result.data);
}

function bindStoreMaintenanceHealthPanel() {
  const refreshBtn = document.getElementById("storeHealthRefreshBtn");
  if (!refreshBtn || refreshBtn.dataset.bound) return;

  refreshBtn.addEventListener("click", async () => {
    await refreshStoreMaintenanceHealthFromBackend();
  });

  refreshBtn.dataset.bound = "true";
}

function updateDataHealthPanel() {
  const panel = document.getElementById("adminDataHealthPanel");
  if (!panel) return;

  bindStoreMaintenanceHealthPanel();

  const projectId = String(currentProjectId || "").trim();
  const canManage = isSignedIn() && canManageProjectLifecycle() && !!projectId;
  if (!canManage) {
    panel.classList.add("hidden");
    return;
  }

  const health = computeStoreMaintenanceHealthFromCurrentState(projectId);
  storeMaintenanceHealthCacheByProjectId[projectId] = health;
  renderStoreMaintenanceHealthPanel(health);
}
