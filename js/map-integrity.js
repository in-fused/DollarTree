/* ================= MAP INTEGRITY ================= */

function getStoreIntegrityFlags(store, statusMap, auditGeoMetadata = shouldAuditGeoMetadataForStores(storeData)) {
  const storeId = String(store?.store_id || "");

  return {
    hasMissingRegion: auditGeoMetadata && !String(store?.region || "").trim(),
    hasMissingTerritory: auditGeoMetadata && !String(store?.territory || "").trim(),
    hasMissingState: auditGeoMetadata && !String(store?.state || "").trim(),
    hasMissingCoords: !hasValidCoordinate(store?.lat) || !hasValidCoordinate(store?.lng),
    hasMissingStatus: !storeId || !(typeof hasPersistedStatusRow === "function" && hasPersistedStatusRow(storeId))
  };
}

function getStoreIntegrityIssues(store, statusMap, auditGeoMetadata = shouldAuditGeoMetadataForStores(storeData)) {
  const flags = getStoreIntegrityFlags(store, statusMap, auditGeoMetadata);
  const issues = [];

  if (flags.hasMissingRegion) issues.push("Missing region");
  if (flags.hasMissingTerritory) issues.push("Missing territory");
  if (flags.hasMissingState) issues.push("Missing state");
  if (flags.hasMissingCoords) issues.push("Missing coordinates");
  if (flags.hasMissingStatus) issues.push("Missing status");

  return issues;
}

function hasPlottableIntegrityIssue(store, statusMap, auditGeoMetadata = shouldAuditGeoMetadataForStores(storeData)) {
  const flags = getStoreIntegrityFlags(store, statusMap, auditGeoMetadata);
  return !flags.hasMissingCoords && (
    flags.hasMissingRegion ||
    flags.hasMissingTerritory ||
    flags.hasMissingState ||
    flags.hasMissingStatus
  );
}

function getPlottedIntegrityIssueStores(stores, statusMap, auditGeoMetadata = shouldAuditGeoMetadataForStores(stores)) {
  return (Array.isArray(stores) ? stores : []).filter(store => hasPlottableIntegrityIssue(store, statusMap, auditGeoMetadata));
}

function getMappedStoreIntegrityProperties(store, statusMap, auditGeoMetadata = shouldAuditGeoMetadataForStores(storeData)) {
  const flags = getStoreIntegrityFlags(store, statusMap, auditGeoMetadata);

  return {
    has_missing_region: flags.hasMissingRegion,
    has_missing_territory: flags.hasMissingTerritory,
    has_missing_state: flags.hasMissingState,
    has_missing_status: flags.hasMissingStatus,
    has_integrity_issue: hasPlottableIntegrityIssue(store, statusMap, auditGeoMetadata)
  };
}