/* ================= MAP INTEGRITY ================= */

function getStoreIntegrityFlags(store, statusMap, geoAudit = getGeoAuditConfig(storeData)) {
  const storeId = String(store?.store_id || "");

  return {
    hasMissingRegion: geoAudit.shouldAuditRegion && !String(store?.region || "").trim(),
    hasMissingTerritory: geoAudit.shouldAuditTerritory && !String(store?.territory || "").trim(),
    hasMissingState: geoAudit.shouldAuditState && !String(store?.state || "").trim(),
    hasMissingCoords: !hasValidCoordinatePair(store?.lat, store?.lng),
    hasMissingStatus: !storeId || !hasPersistedStatusRow(storeId)
  };
}

function getStoreIntegrityIssues(store, statusMap, geoAudit = getGeoAuditConfig(storeData)) {
  const flags = getStoreIntegrityFlags(store, statusMap, geoAudit);
  const issues = [];

  if (flags.hasMissingRegion) issues.push("Missing region");
  if (flags.hasMissingTerritory) issues.push("Missing territory");
  if (flags.hasMissingState) issues.push("Missing state");
  if (flags.hasMissingCoords) issues.push("Missing coordinates");
  if (flags.hasMissingStatus) issues.push("Missing status");

  return issues;
}

function hasPlottableIntegrityIssue(store, statusMap, geoAudit = getGeoAuditConfig(storeData)) {
  const flags = getStoreIntegrityFlags(store, statusMap, geoAudit);
  return !flags.hasMissingCoords && (
    flags.hasMissingRegion ||
    flags.hasMissingTerritory ||
    flags.hasMissingState ||
    flags.hasMissingStatus
  );
}

function getPlottedIntegrityIssueStores(stores, statusMap, geoAudit = getGeoAuditConfig(stores)) {
  return (Array.isArray(stores) ? stores : []).filter(store =>
    hasPlottableIntegrityIssue(store, statusMap, geoAudit)
  );
}

function getMappedStoreIntegrityProperties(store, statusMap, geoAudit = getGeoAuditConfig(storeData)) {
  const flags = getStoreIntegrityFlags(store, statusMap, geoAudit);

  return {
    has_missing_region: flags.hasMissingRegion,
    has_missing_territory: flags.hasMissingTerritory,
    has_missing_state: flags.hasMissingState,
    has_missing_status: flags.hasMissingStatus,
    has_integrity_issue: hasPlottableIntegrityIssue(store, statusMap, geoAudit)
  };
}
