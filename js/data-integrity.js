/* ================= DATA INTEGRITY ================= */

function hasValidCoordinate(value) {
  return Number.isFinite(Number(value));
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

    if (!hasValidCoordinate(store?.lat) || !hasValidCoordinate(store?.lng)) {
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

function updateDataHealthPanel() {
  const panel = document.getElementById("adminDataHealthPanel");
  if (!panel) return;

  const scopedStores = typeof getFilteredStores === "function" ? getFilteredStores() : storeData;
  const geoAudit = getGeoAuditConfig(scopedStores);
  const report = getDataIntegrityReport(scopedStores, statusMap, geoAudit);

  const plottedIssueStores = typeof getPlottedIntegrityIssueStores === "function"
    ? getPlottedIntegrityIssueStores(scopedStores, statusMap, geoAudit)
    : [];

  const counts = {
    healthMissingRegion: report.missingRegion.length,
    healthMissingTerritory: report.missingTerritory.length,
    healthMissingState: report.missingState.length,
    healthMissingCoords: report.missingCoords.length,
    healthMissingStatus: report.missingStatus.length,
    healthPlottedIssues: plottedIssueStores.length
  };

  Object.entries(counts).forEach(([id, value]) => {
    setText(id, value.toLocaleString());
  });

  const hasIssues = Object.values(counts).some(value => value > 0);
  panel.classList.toggle("hidden", !hasIssues);
}