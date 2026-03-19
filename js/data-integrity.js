/* ================= DATA INTEGRITY ================= */

function hasValidCoordinate(value) {
  return Number.isFinite(Number(value));
}

function shouldAuditGeoMetadataForStores(stores = storeData) {
  return (Array.isArray(stores) ? stores : []).some(store =>
    !!String(store?.region || "").trim() ||
    !!String(store?.territory || "").trim() ||
    !!String(store?.state || "").trim()
  );
}

function hasPersistedStatusRow(storeId) {
  if (!storeId) return false;
  return persistedStatusStoreIds instanceof Set
    ? persistedStatusStoreIds.has(String(storeId))
    : false;
}

function getDataIntegrityReport(storeData, statusMap, auditGeoMetadata = shouldAuditGeoMetadataForStores(storeData)) {
  const report = {
    missingRegion: [],
    missingTerritory: [],
    missingState: [],
    missingCoords: [],
    missingStatus: []
  };

  (Array.isArray(storeData) ? storeData : []).forEach(store => {
    const storeId = String(store?.store_id || "");

    if (auditGeoMetadata && !String(store?.region || "").trim()) {
      report.missingRegion.push(store);
    }

    if (auditGeoMetadata && !String(store?.territory || "").trim()) {
      report.missingTerritory.push(store);
    }

    if (auditGeoMetadata && !String(store?.state || "").trim()) {
      report.missingState.push(store);
    }

    if (!hasValidCoordinate(store?.lat) || !hasValidCoordinate(store?.lng)) {
      report.missingCoords.push(store);
    }

    if (!hasPersistedStatusRow(storeId)) {
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

    repairedStatusMap[storeId] = {
      completed: false,
      closed: false
    };
  });

  return repairedStatusMap;
}

function updateDataHealthPanel() {
  const panel = document.getElementById("adminDataHealthPanel");
  if (!panel) return;

  const scopedStores = typeof getFilteredStores === "function" ? getFilteredStores() : storeData;
  const auditGeoMetadata = shouldAuditGeoMetadataForStores(scopedStores);
  const report = getDataIntegrityReport(scopedStores, statusMap, auditGeoMetadata);

  const plottedIssueStores = typeof getPlottedIntegrityIssueStores === "function"
    ? getPlottedIntegrityIssueStores(scopedStores, statusMap, auditGeoMetadata)
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