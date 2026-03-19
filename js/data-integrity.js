/* ================= DATA INTEGRITY ================= */

function hasValidCoordinate(value) {
  return Number.isFinite(Number(value));
}

function getDataIntegrityReport(storeData, statusMap) {
  const report = {
    missingRegion: [],
    missingTerritory: [],
    missingState: [],
    missingCoords: [],
    missingStatus: []
  };

  (Array.isArray(storeData) ? storeData : []).forEach(store => {
    const storeId = String(store?.store_id || "");

    if (!String(store?.region || "").trim()) {
      report.missingRegion.push(store);
    }

    if (!String(store?.territory || "").trim()) {
      report.missingTerritory.push(store);
    }

    if (!String(store?.state || "").trim()) {
      report.missingState.push(store);
    }

    if (!hasValidCoordinate(store?.lat) || !hasValidCoordinate(store?.lng)) {
      report.missingCoords.push(store);
    }

    if (!storeId || !statusMap || !Object.prototype.hasOwnProperty.call(statusMap, storeId)) {
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
  const report = getDataIntegrityReport(scopedStores, statusMap);

  const plottedIssueStores = typeof getPlottedIntegrityIssueStores === "function"
    ? getPlottedIntegrityIssueStores(scopedStores, statusMap)
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