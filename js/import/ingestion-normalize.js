/* ================= INGESTION NORMALIZER (PHASE 11.2.c) ================= */

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

  function getSchemaApi() {
    if (globalScope && globalScope.ingestionSchema) return globalScope.ingestionSchema;
    return safeRequire("./ingestion-schema.js");
  }

  function getValidatorApi() {
    if (globalScope && globalScope.ingestionValidator) return globalScope.ingestionValidator;
    return safeRequire("./ingestion-validate.js");
  }

  const schemaApi = getSchemaApi();
  const validatorApi = getValidatorApi();

  const FALLBACK_SCHEMA_VERSION = "11.2.0-foundation";
  const FALLBACK_REQUIRED_FIELDS = Object.freeze(["store_id"]);
  const FALLBACK_OPTIONAL_FIELDS = Object.freeze([
    "store_name",
    "customer_id",
    "full_address",
    "address_line_1",
    "address_line_2",
    "city",
    "state",
    "postal_code",
    "region",
    "territory",
    "district",
    "division",
    "market",
    "status",
    "status_reason",
    "completed",
    "closed",
    "latitude",
    "longitude",
    "notes_count",
    "photos_count",
    "last_activity_at",
    "source_row_index"
  ]);
  const FALLBACK_STATUS_VALUES = Object.freeze(["active", "rescheduled", "completed", "closed"]);
  const FALLBACK_DEFAULTS = Object.freeze({
    status: "active",
    status_reason: "",
    completed: false,
    closed: false,
    notes_count: 0,
    photos_count: 0,
    last_activity_at: "",
    source_row_index: -1
  });
  const FALLBACK_BOOLEAN_INPUTS = Object.freeze({
    truthy: Object.freeze([true, "true", "t", "yes", "y", "1", 1, "on", "done", "complete", "completed", "closed"]),
    falsy: Object.freeze([false, "false", "f", "no", "n", "0", 0, "off", "open", "incomplete", "active"])
  });

  function normalizeSchemaToken(value) {
    if (schemaApi && typeof schemaApi.normalizeSchemaToken === "function") {
      return schemaApi.normalizeSchemaToken(value);
    }

    return String(value == null ? "" : value)
      .trim()
      .toLowerCase()
      .replace(/[\s\-]+/g, "_");
  }

  function getSchemaVersion() {
    if (schemaApi && typeof schemaApi.getSchemaMetadata === "function") {
      const meta = schemaApi.getSchemaMetadata();
      if (meta && typeof meta.version === "string" && meta.version.trim()) {
        return meta.version;
      }
    }

    if (schemaApi && typeof schemaApi.INGESTION_SCHEMA_VERSION === "string") {
      return schemaApi.INGESTION_SCHEMA_VERSION;
    }

    return FALLBACK_SCHEMA_VERSION;
  }

  function getRequiredFields() {
    if (schemaApi && typeof schemaApi.getRequiredFieldNames === "function") {
      const fields = schemaApi.getRequiredFieldNames();
      if (Array.isArray(fields) && fields.length) return fields.slice();
    }
    return FALLBACK_REQUIRED_FIELDS.slice();
  }

  function getOptionalFields() {
    if (schemaApi && typeof schemaApi.getOptionalFieldNames === "function") {
      const fields = schemaApi.getOptionalFieldNames();
      if (Array.isArray(fields)) return fields.slice();
    }

    if (schemaApi && Array.isArray(schemaApi.INGESTION_OPTIONAL_FIELDS)) {
      return schemaApi.INGESTION_OPTIONAL_FIELDS.slice();
    }

    return FALLBACK_OPTIONAL_FIELDS.slice();
  }

  function getAcceptedStatusValues() {
    if (schemaApi && typeof schemaApi.getAcceptedStatusValues === "function") {
      const values = schemaApi.getAcceptedStatusValues();
      if (Array.isArray(values) && values.length) return values.slice();
    }
    return FALLBACK_STATUS_VALUES.slice();
  }

  function getDefaultValuesPolicy() {
    if (schemaApi && typeof schemaApi.getDefaultValuesPolicy === "function") {
      const defaults = schemaApi.getDefaultValuesPolicy();
      if (defaults && typeof defaults === "object") return { ...defaults };
    }

    if (schemaApi && schemaApi.INGESTION_DEFAULT_VALUES && typeof schemaApi.INGESTION_DEFAULT_VALUES === "object") {
      return { ...schemaApi.INGESTION_DEFAULT_VALUES };
    }

    return { ...FALLBACK_DEFAULTS };
  }

  function getBooleanNormalizationInputs() {
    if (schemaApi && typeof schemaApi.getBooleanNormalizationInputs === "function") {
      const inputs = schemaApi.getBooleanNormalizationInputs();
      if (inputs && typeof inputs === "object") {
        return {
          truthy: Array.isArray(inputs.truthy) ? inputs.truthy.slice() : FALLBACK_BOOLEAN_INPUTS.truthy.slice(),
          falsy: Array.isArray(inputs.falsy) ? inputs.falsy.slice() : FALLBACK_BOOLEAN_INPUTS.falsy.slice()
        };
      }
    }

    return {
      truthy: FALLBACK_BOOLEAN_INPUTS.truthy.slice(),
      falsy: FALLBACK_BOOLEAN_INPUTS.falsy.slice()
    };
  }

  function isEmptyValue(value) {
    if (validatorApi && typeof validatorApi.isEmptyRequiredValue === "function") {
      return validatorApi.isEmptyRequiredValue(value);
    }

    return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
  }

  function toTrimmedString(value, emptyFallback) {
    if (value === null || value === undefined) return emptyFallback;
    const stringValue = String(value).trim();
    return stringValue === "" ? emptyFallback : stringValue;
  }

  function normalizeBooleanLikeValue(value, fallbackValue) {
    if (isEmptyValue(value)) return Boolean(fallbackValue);
    if (typeof value === "boolean") return value;

    const boolInputs = getBooleanNormalizationInputs();
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : value;

    if (boolInputs.truthy.some((candidate) => candidate === normalized)) return true;
    if (boolInputs.falsy.some((candidate) => candidate === normalized)) return false;

    if (typeof value === "number") return value !== 0;
    return Boolean(fallbackValue);
  }

  function normalizeStatusValue(value, fallbackValue) {
    const accepted = new Set(getAcceptedStatusValues().map((item) => String(item).toLowerCase()));
    const fallbackStatus = toTrimmedString(fallbackValue, "active").toLowerCase();

    if (isEmptyValue(value)) {
      return accepted.has(fallbackStatus) ? fallbackStatus : "active";
    }

    const normalizedInput = String(value).trim().toLowerCase();
    const normalized = normalizedInput === "complete"
      ? "completed"
      : (normalizedInput === "inactive"
        ? "closed"
        : (normalizedInput === "reschedule" ? "rescheduled" : normalizedInput));
    if (accepted.has(normalized)) return normalized;
    return accepted.has(fallbackStatus) ? fallbackStatus : "active";
  }

  function normalizeIntegerLikeValue(value, fallbackValue) {
    if (isEmptyValue(value)) return Number.isInteger(fallbackValue) ? fallbackValue : 0;

    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.trunc(value);
    }

    const parsed = Number(String(value).trim());
    if (!Number.isFinite(parsed)) return Number.isInteger(fallbackValue) ? fallbackValue : 0;
    return Math.trunc(parsed);
  }

  function normalizeCoordinateValue(value) {
    if (isEmptyValue(value)) return null;

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    const parsed = Number(String(value).trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  function resolveCanonicalValuesFromRawRow(rawRow, headerReport) {
    const headers = Array.isArray(headerReport && headerReport.headers) ? headerReport.headers.slice() : [];
    const canonicalByHeaderIndex = Array.isArray(headerReport && headerReport.canonicalByHeaderIndex)
      ? headerReport.canonicalByHeaderIndex.slice()
      : [];

    const canonicalValues = {};
    const unknownFields = {};

    headers.forEach((headerName, index) => {
      const canonicalName = canonicalByHeaderIndex[index] || "";
      let rawValue;

      if (Array.isArray(rawRow)) {
        rawValue = rawRow[index];
      } else if (rawRow && typeof rawRow === "object") {
        rawValue = rawRow[headerName];
      }

      if (canonicalName) {
        canonicalValues[canonicalName] = rawValue;
      } else {
        unknownFields[headerName] = rawValue;
      }
    });

    return { canonicalValues, unknownFields };
  }

  function buildCanonicalInput(inputRow, options) {
    const opts = options && typeof options === "object" ? options : {};
    const headerReport = opts.headerReport && typeof opts.headerReport === "object" ? opts.headerReport : null;

    if (opts.canonicalValues && typeof opts.canonicalValues === "object" && !Array.isArray(opts.canonicalValues)) {
      return {
        canonicalValues: { ...opts.canonicalValues },
        unknownFields: opts.unknownFields && typeof opts.unknownFields === "object" ? { ...opts.unknownFields } : {}
      };
    }

    if (inputRow && typeof inputRow === "object" && !Array.isArray(inputRow) && inputRow.canonicalValues) {
      return {
        canonicalValues: { ...inputRow.canonicalValues },
        unknownFields: inputRow.unknownValues && typeof inputRow.unknownValues === "object" ? { ...inputRow.unknownValues } : {}
      };
    }

    if (headerReport) {
      return resolveCanonicalValuesFromRawRow(inputRow, headerReport);
    }

    const candidate = (inputRow && typeof inputRow === "object" && !Array.isArray(inputRow)) ? inputRow : {};
    const canonicalValues = {};
    const unknownFields = {};
    const canonicalSet = new Set([...getRequiredFields(), ...getOptionalFields()]);

    Object.keys(candidate).forEach((key) => {
      const canonical = normalizeSchemaToken(key);
      if (canonicalSet.has(canonical)) {
        canonicalValues[canonical] = candidate[key];
      } else {
        unknownFields[key] = candidate[key];
      }
    });

    return { canonicalValues, unknownFields };
  }

  function normalizeOneRow(inputRow, options) {
    const opts = options && typeof options === "object" ? options : {};
    const defaults = getDefaultValuesPolicy();
    const requiredFields = getRequiredFields();
    const optionalFields = getOptionalFields();
    const canonicalFields = [...requiredFields, ...optionalFields];
    const normalizedAt = typeof opts.normalizedAt === "string" && opts.normalizedAt.trim()
      ? opts.normalizedAt
      : new Date().toISOString();

    const { canonicalValues, unknownFields } = buildCanonicalInput(inputRow, opts);

    const record = {};
    canonicalFields.forEach((fieldName) => {
      record[fieldName] = null;
    });

    const warnings = [];

    record.store_id = toTrimmedString(canonicalValues.store_id, "");
    if (!record.store_id) {
      warnings.push({ code: "MISSING_STORE_ID", message: "store_id normalized to empty string." });
    }

    record.store_name = toTrimmedString(canonicalValues.store_name, "");
    record.customer_id = toTrimmedString(canonicalValues.customer_id, "");
    record.full_address = toTrimmedString(canonicalValues.full_address, "");
    record.address_line_1 = toTrimmedString(canonicalValues.address_line_1, "");
    record.address_line_2 = toTrimmedString(canonicalValues.address_line_2, "");
    record.city = toTrimmedString(canonicalValues.city, "");
    record.state = toTrimmedString(canonicalValues.state, "");
    record.postal_code = toTrimmedString(canonicalValues.postal_code, "");
    record.region = toTrimmedString(canonicalValues.region, "");
    record.territory = toTrimmedString(canonicalValues.territory, "");
    record.district = toTrimmedString(canonicalValues.district, "");
    record.division = toTrimmedString(canonicalValues.division, "");
    record.market = toTrimmedString(canonicalValues.market, "");

    const sourceCompleted = normalizeBooleanLikeValue(canonicalValues.completed, defaults.completed);
    const sourceClosed = normalizeBooleanLikeValue(canonicalValues.closed, defaults.closed);
    const hasExplicitStatus = !isEmptyValue(canonicalValues.status);

    if (sourceCompleted && sourceClosed) {
      warnings.push({
        code: "CONFLICTING_STATUS_FLAGS",
        message: "Both completed and closed were true; completed takes precedence when no explicit status is supplied."
      });
    }

    record.status = hasExplicitStatus
      ? normalizeStatusValue(canonicalValues.status, defaults.status)
      : (sourceCompleted ? "completed" : (sourceClosed ? "closed" : normalizeStatusValue(null, defaults.status)));
    record.status_reason = toTrimmedString(canonicalValues.status_reason, toTrimmedString(defaults.status_reason, ""));
    record.completed = record.status === "completed";
    record.closed = record.status === "closed";

    record.latitude = normalizeCoordinateValue(canonicalValues.latitude);
    record.longitude = normalizeCoordinateValue(canonicalValues.longitude);

    record.notes_count = normalizeIntegerLikeValue(canonicalValues.notes_count, defaults.notes_count);
    record.photos_count = normalizeIntegerLikeValue(canonicalValues.photos_count, defaults.photos_count);

    record.last_activity_at = toTrimmedString(canonicalValues.last_activity_at, toTrimmedString(defaults.last_activity_at, ""));

    const sourceIndexFallback = Number.isInteger(opts.rowIndex) ? opts.rowIndex : defaults.source_row_index;
    record.source_row_index = normalizeIntegerLikeValue(canonicalValues.source_row_index, sourceIndexFallback);

    if (!record.full_address && !(record.address_line_1 && record.city && record.state)) {
      warnings.push({
        code: "INCOMPLETE_ADDRESS_CONTEXT",
        message: "Address context remains incomplete after normalization."
      });
    }

    return {
      ...record,
      __meta: {
        schemaVersion: getSchemaVersion(),
        normalizedAt,
        sourceRowIndex: record.source_row_index,
        unknownFields: { ...unknownFields },
        warnings
      }
    };
  }

  function normalizeBatch(inputRows, options) {
    const rows = Array.isArray(inputRows) ? inputRows : [];
    const opts = options && typeof options === "object" ? options : {};
    const normalizedAt = typeof opts.normalizedAt === "string" && opts.normalizedAt.trim()
      ? opts.normalizedAt
      : new Date().toISOString();

    const records = rows.map((row, index) => normalizeOneRow(row, {
      ...opts,
      rowIndex: index,
      normalizedAt
    }));

    const warningCount = records.reduce((sum, record) => {
      const warnings = record && record.__meta && Array.isArray(record.__meta.warnings) ? record.__meta.warnings.length : 0;
      return sum + warnings;
    }, 0);

    const totals = {
      rowCount: rows.length,
      normalizedCount: records.length,
      warningCount
    };

    return {
      records,
      totals,
      warningCount
    };
  }

  const ingestionNormalizer = Object.freeze({
    normalizeBooleanLikeValue,
    normalizeStatusValue,
    normalizeIntegerLikeValue,
    normalizeCoordinateValue,
    normalizeOneRow,
    normalizeBatch
  });

  if (globalScope) {
    globalScope.ingestionNormalizer = ingestionNormalizer;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ingestionNormalizer;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
