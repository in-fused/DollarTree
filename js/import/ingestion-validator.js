(function ingestionValidatorModule(globalScope) {
  "use strict";

  function getMapperApi() {
    if (globalScope && globalScope.ingestionMapper) return globalScope.ingestionMapper;
    if (typeof require === "function") {
      try {
        return require("./ingestion-mapper.js");
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  const mapperApi = getMapperApi();

  function normalizeNullLike(value) {
    if (value === undefined || value === null) return "";
    const normalized = String(value).trim();
    if (!normalized) return "";

    const nullLikes = new Set(["null", "n/a", "na", "none", "undefined", "nil", "-"]);
    return nullLikes.has(normalized.toLowerCase()) ? "" : normalized;
  }

  function normalizeCoordinate(value) {
    const normalized = normalizeNullLike(value);
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeStatusCodeForImport(value) {
    const mapper = mapperApi || {};
    const sanitize = typeof mapper.sanitizeColumnName === "function"
      ? mapper.sanitizeColumnName
      : function fallbackSanitize(input) { return String(input || "").trim().toLowerCase(); };

    const normalized = sanitize(normalizeNullLike(value));
    if (normalized === "complete" || normalized === "completed") return "completed";
    if (normalized === "closed" || normalized === "inactive") return "closed";
    if (normalized === "rescheduled" || normalized === "reschedule") return "rescheduled";
    return "active";
  }

  function normalizeOptionalText(value) {
    const normalized = normalizeNullLike(value);
    return normalized || null;
  }

  function buildFullAddress(row) {
    if (row.full_address && String(row.full_address).trim()) {
      return String(row.full_address).trim();
    }

    const address = String(row.address || "").trim();
    const address2 = String(row.address_2 || "").trim();
    const city = String(row.city || "").trim();
    const state = String(row.state || "").trim();
    const zip = String(row.zip || "").trim();

    return [address, address2, city, state, zip].filter(Boolean).join(", ");
  }

  function normalizeRowFromCanonicalValues(canonicalValues) {
    const row = canonicalValues && typeof canonicalValues === "object" ? canonicalValues : {};

    return {
      store_id: String(normalizeNullLike(row.store_id || row.customer_id || "")).trim(),
      store_name: normalizeOptionalText(row.store_name),
      customer_id: normalizeOptionalText(row.customer_id),
      full_address: normalizeOptionalText(row.full_address),
      address: normalizeOptionalText(row.address),
      address_2: normalizeOptionalText(row.address_2),
      city: normalizeOptionalText(row.city),
      state: normalizeOptionalText(row.state),
      zip: normalizeOptionalText(row.zip),
      region: normalizeOptionalText(row.region),
      territory: normalizeOptionalText(row.territory),
      district: normalizeOptionalText(row.district),
      division: normalizeOptionalText(row.division),
      market: normalizeOptionalText(row.market),
      status_code: normalizeStatusCodeForImport(row.status_code),
      lat: normalizeCoordinate(row.lat),
      lng: normalizeCoordinate(row.lng)
    };
  }

  function validateHeaders(rawHeaders, mappingReport) {
    const headers = Array.isArray(rawHeaders) ? rawHeaders.slice() : [];
    const report = mappingReport && typeof mappingReport === "object"
      ? mappingReport
      : (mapperApi && typeof mapperApi.buildHeaderMappingReport === "function"
        ? mapperApi.buildHeaderMappingReport(headers)
        : null);

    const errors = [];
    const warnings = [];

    if (!report || !Array.isArray(report.canonicalAssignments)) {
      errors.push({ severity: "error", code: "MAPPING_UNAVAILABLE", message: "Header mapping report is unavailable.", field: "", rowIndex: -1 });
      return {
        isValid: false,
        headers,
        mappedHeaders: [],
        canonicalByHeaderIndex: [],
        canonicalHeaderMap: {},
        canonicalToSourceIndexes: {},
        missingRequiredFields: ["store_id"],
        unknownHeaders: headers,
        emptyHeaderIndexes: [],
        errors,
        warnings,
        errorCount: errors.length,
        warningCount: warnings.length
      };
    }

    const canonicalByHeaderIndex = report.canonicalByHeaderIndex || report.canonicalAssignments;
    const mappedHeaders = headers.map(function mapHeader(original, headerIndex) {
      const canonical = canonicalByHeaderIndex[headerIndex] || "";
      const mapped = Boolean(canonical);
      if (!mapped) {
        warnings.push({ severity: "warning", code: "UNKNOWN_HEADER", message: `Header \"${original}\" is not mapped to a canonical field.`, field: "", rowIndex: -1 });
      }
      return {
        headerIndex,
        original,
        normalizedIncoming: mapperApi && mapperApi.sanitizeColumnName ? mapperApi.sanitizeColumnName(original) : String(original || "").trim().toLowerCase(),
        canonical,
        mapped
      };
    });

    if (Array.isArray(report.duplicateAssignments)) {
      report.duplicateAssignments.forEach(function addDuplicateIssue(item) {
        errors.push({
          severity: "error",
          code: "DUPLICATE_CANONICAL_HEADER",
          message: `Multiple headers map to canonical field \"${item.canonical}\" (indexes: ${(item.sourceIndexes || []).join(", ")}).`,
          field: item.canonical,
          rowIndex: -1
        });
      });
    }

    if (Array.isArray(report.missingRequiredFields)) {
      report.missingRequiredFields.forEach(function addMissing(field) {
        errors.push({
          severity: "error",
          code: "MISSING_REQUIRED_HEADER",
          message: `Required canonical field \"${field}\" is missing from headers.`,
          field,
          rowIndex: -1
        });
      });
    }

    return {
      isValid: errors.length === 0,
      headers,
      mappedHeaders,
      canonicalByHeaderIndex: canonicalByHeaderIndex.slice(),
      canonicalHeaderMap: report.canonicalHeaderMap || {},
      canonicalToSourceIndexes: report.canonicalToSourceIndexes || {},
      missingRequiredFields: Array.isArray(report.missingRequiredFields) ? report.missingRequiredFields.slice() : [],
      unknownHeaders: Array.isArray(report.unmappedHeaders)
        ? report.unmappedHeaders.map(function toName(item) { return String(item.sourceHeader || ""); }).filter(Boolean)
        : [],
      emptyHeaderIndexes: [],
      errors,
      warnings,
      errorCount: errors.length,
      warningCount: warnings.length
    };
  }

  const ingestionValidator = Object.freeze({
    normalizeNullLike,
    normalizeCoordinate,
    normalizeStatusCodeForImport,
    normalizeOptionalText,
    buildFullAddress,
    normalizeRowFromCanonicalValues,
    validateHeaders
  });

  if (globalScope) {
    globalScope.ingestionValidator = ingestionValidator;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ingestionValidator;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
