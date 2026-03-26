/* ================= INGESTION ADAPTER (PHASE 11.2.f) ================= */

(function (globalScope) {
  "use strict";

  function safeRequire(path) {
    if (typeof require !== "function") return null;
    try {
      return require(path);
    } catch (error) {
      return null;
    }
  }

  function getDependency(windowKey, requirePath) {
    if (globalScope && globalScope[windowKey]) return globalScope[windowKey];
    return safeRequire(requirePath);
  }

  const schemaApi = getDependency("ingestionSchema", "./ingestion-schema.js");
  const stageApi = getDependency("ingestionStage", "./ingestion-stage.js");
  const normalizerApi = getDependency("ingestionNormalizer", "./ingestion-normalize.js");

  const FALLBACK_SCHEMA_VERSION = "11.2.0-foundation";

  function getSchemaVersion() {
    if (schemaApi && typeof schemaApi.getSchemaMetadata === "function") {
      const metadata = schemaApi.getSchemaMetadata();
      if (metadata && typeof metadata.version === "string" && metadata.version.trim()) {
        return metadata.version;
      }
    }

    if (schemaApi && typeof schemaApi.INGESTION_SCHEMA_VERSION === "string") {
      return schemaApi.INGESTION_SCHEMA_VERSION;
    }

    return FALLBACK_SCHEMA_VERSION;
  }

  function isFiniteCoordinate(value) {
    if (value === null || value === undefined || value === "") return false;
    const numeric = typeof value === "number" ? value : Number(String(value).trim());
    return Number.isFinite(numeric);
  }

  function normalizeCoordinate(value) {
    if (!isFiniteCoordinate(value)) return null;
    return typeof value === "number" ? value : Number(String(value).trim());
  }

  function toTrimmedString(value, fallbackValue) {
    if (value === null || value === undefined) return fallbackValue;
    const trimmed = String(value).trim();
    return trimmed === "" ? fallbackValue : trimmed;
  }

  function ensureNormalizedRecordShape(record) {
    const source = record && typeof record === "object" ? record : {};
    return {
      store_id: source.store_id,
      full_address: source.full_address,
      address_line_1: source.address_line_1,
      address_line_2: source.address_line_2,
      city: source.city,
      state: source.state,
      postal_code: source.postal_code,
      region: source.region,
      territory: source.territory,
      latitude: source.latitude,
      longitude: source.longitude,
      source_row_index: source.source_row_index,
      __meta: source.__meta && typeof source.__meta === "object" ? source.__meta : {}
    };
  }

  function adaptNormalizedRecordToRuntimeStore(normalizedRecord, options) {
    const opts = options && typeof options === "object" ? options : {};
    const normalized = ensureNormalizedRecordShape(normalizedRecord);

    const schemaVersion = toTrimmedString(
      normalized.__meta && normalized.__meta.schemaVersion,
      getSchemaVersion()
    );

    const adaptedAt = toTrimmedString(
      opts.adaptedAt,
      new Date().toISOString()
    );

    const sourceRowIndex = Number.isInteger(normalized.source_row_index)
      ? normalized.source_row_index
      : (
          Number.isInteger(normalized.__meta && normalized.__meta.sourceRowIndex)
            ? normalized.__meta.sourceRowIndex
            : -1
        );

    const runtimeStore = {
      store_id: toTrimmedString(normalized.store_id, ""),
      full_address: toTrimmedString(normalized.full_address, ""),
      address_line_1: toTrimmedString(normalized.address_line_1, ""),
      address_line_2: toTrimmedString(normalized.address_line_2, ""),
      city: toTrimmedString(normalized.city, ""),
      state: toTrimmedString(normalized.state, ""),
      postal_code: toTrimmedString(normalized.postal_code, ""),
      region: toTrimmedString(normalized.region, ""),
      territory: toTrimmedString(normalized.territory, ""),
      latitude: normalizeCoordinate(normalized.latitude),
      longitude: normalizeCoordinate(normalized.longitude),
      __ingestion: {
        schemaVersion,
        adaptedAt,
        sourceRowIndex,
        importMode: "dry_run",
        status: toTrimmedString(normalized.status, ""),
        status_reason: toTrimmedString(normalized.status_reason, ""),
        completed: normalized.completed === true,
        closed: normalized.closed === true
      }
    };

    return runtimeStore;
  }

  function adaptNormalizedBatchToRuntimeStores(normalizedRecords, options) {
    const records = Array.isArray(normalizedRecords) ? normalizedRecords.slice() : [];
    const opts = options && typeof options === "object" ? options : {};
    const adaptedAt = toTrimmedString(opts.adaptedAt, new Date().toISOString());

    const runtimeRecords = [];
    const invalidRecords = [];

    records.forEach((record, index) => {
      const safeRecord = record && typeof record === "object" ? record : null;

      if (!safeRecord || toTrimmedString(safeRecord.store_id, "") === "") {
        invalidRecords.push({
          index,
          reason: "MISSING_STORE_ID",
          record: safeRecord
        });
        return;
      }

      const runtimeRecord = adaptNormalizedRecordToRuntimeStore(safeRecord, { adaptedAt });
      runtimeRecords.push(runtimeRecord);
    });

    return {
      records: runtimeRecords,
      totals: {
        inputCount: records.length,
        adaptedCount: runtimeRecords.length,
        invalidRecordCount: invalidRecords.length
      },
      invalidRecordCount: invalidRecords.length,
      invalidRecords
    };
  }

  function adaptStageResultToRuntimeDataset(stageResult, options) {
    const opts = options && typeof options === "object" ? options : {};
    const safeStageResult = stageResult && typeof stageResult === "object" ? stageResult : {};
    const acceptedRecords = Array.isArray(safeStageResult.acceptedRecords) ? safeStageResult.acceptedRecords.slice() : [];

    const adaptedBatch = adaptNormalizedBatchToRuntimeStores(acceptedRecords, {
      adaptedAt: toTrimmedString(opts.adaptedAt, new Date().toISOString())
    });

    const summary = {
      stageIsValid: safeStageResult.isValid === true,
      stageCanProceed: safeStageResult.canProceed === true,
      acceptedRecordCount: acceptedRecords.length,
      adaptedRecordCount: adaptedBatch.records.length,
      invalidRecordCount: adaptedBatch.invalidRecordCount,
      sourceRowCount: safeStageResult.manifest && Number.isInteger(safeStageResult.manifest.sourceRowCount)
        ? safeStageResult.manifest.sourceRowCount
        : 0,
      schemaVersion: safeStageResult.manifest && typeof safeStageResult.manifest.schemaVersion === "string"
        ? safeStageResult.manifest.schemaVersion
        : getSchemaVersion(),
      importMode: "dry_run"
    };

    return {
      manifest: safeStageResult.manifest ? { ...safeStageResult.manifest } : {
        schemaVersion: getSchemaVersion(),
        importMode: "dry_run",
        transport: "in_memory_stage"
      },
      records: adaptedBatch.records,
      totals: adaptedBatch.totals,
      invalidRecordCount: adaptedBatch.invalidRecordCount,
      invalidRecords: adaptedBatch.invalidRecords.slice(),
      summary
    };
  }

  const ingestionAdapter = Object.freeze({
    adaptNormalizedRecordToRuntimeStore,
    adaptNormalizedBatchToRuntimeStores,
    adaptStageResultToRuntimeDataset
  });

  if (globalScope) {
    globalScope.ingestionAdapter = ingestionAdapter;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ingestionAdapter;
  }

  // Explicitly reference optional dependencies to preserve additive loading behavior.
  void stageApi;
  void normalizerApi;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));