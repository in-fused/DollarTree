/* ================= MAP INTEGRITY ================= */

function getStoreIntegrityFlags(store, statusMap) {
  const storeId = String(store?.store_id || "");

  return {
    hasMissingRegion: !String(store?.region || "").trim(),
    hasMissingTerritory: !String(store?.territory || "").trim(),
    hasMissingState: !String(store?.state || "").trim(),
    hasMissingCoords: !hasValidCoordinate(store?.lat) || !hasValidCoordinate(store?.lng),
    hasMissingStatus: !storeId || !statusMap || !Object.prototype.hasOwnProperty.call(statusMap, storeId)
  };
}

function getStoreIntegrityIssues(store, statusMap) {
  const flags = getStoreIntegrityFlags(store, statusMap);
  const issues = [];

  if (flags.hasMissingRegion) issues.push("Missing region");
  if (flags.hasMissingTerritory) issues.push("Missing territory");
  if (flags.hasMissingState) issues.push("Missing state");
  if (flags.hasMissingCoords) issues.push("Missing coordinates");
  if (flags.hasMissingStatus) issues.push("Missing status");

  return issues;
}

function hasPlottableIntegrityIssue(store, statusMap) {
  const flags = getStoreIntegrityFlags(store, statusMap);
  return !flags.hasMissingCoords && (
    flags.hasMissingRegion ||
    flags.hasMissingTerritory ||
    flags.hasMissingState ||
    flags.hasMissingStatus
  );
}

function getPlottedIntegrityIssueStores(stores, statusMap) {
  return (Array.isArray(stores) ? stores : []).filter(store => hasPlottableIntegrityIssue(store, statusMap));
}

function getMappedStoreIntegrityProperties(store, statusMap) {
  const flags = getStoreIntegrityFlags(store, statusMap);

  return {
    has_missing_region: flags.hasMissingRegion,
    has_missing_territory: flags.hasMissingTerritory,
    has_missing_state: flags.hasMissingState,
    has_missing_status: flags.hasMissingStatus,
    has_integrity_issue: hasPlottableIntegrityIssue(store, statusMap)
  };
}
