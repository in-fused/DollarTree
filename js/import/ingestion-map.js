/* ================= INGESTION FIELD MAPPING (PHASE 11.2.d) ================= */

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

  const schemaApi = getSchemaApi();

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

  function normalizeSchemaToken(value) {
    if (schemaApi && typeof schemaApi.normalizeSchemaToken === "function") {
      return schemaApi.normalizeSchemaToken(value);
    }

    return String(value == null ? "" : value)
      .trim()
      .toLowerCase()
      .replace(/[\s\-]+/g, "_");
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
    return FALLBACK_OPTIONAL_FIELDS.slice();
  }

  function getCanonicalFields() {
    return [...getRequiredFields(), ...getOptionalFields()];
  }

  function getSchemaAliases() {
    if (schemaApi && typeof schemaApi.getFieldAliases === "function") {
      const aliases = schemaApi.getFieldAliases();
      if (aliases && typeof aliases === "object") return aliases;
    }

    if (schemaApi && schemaApi.INGESTION_FIELD_ALIASES && typeof schemaApi.INGESTION_FIELD_ALIASES === "object") {
      return schemaApi.INGESTION_FIELD_ALIASES;
    }

    return {};
  }

  const MAPPING_PRESETS = Object.freeze({
    canonical: Object.freeze({
      id: "canonical",
      label: "Default / Canonical",
      description: "Best for files already aligned to canonical ingestion headers.",
      aliasesByCanonical: Object.freeze({
        store_id: Object.freeze(["store_id"]),
        store_name: Object.freeze(["store_name"]),
        customer_id: Object.freeze(["customer_id"]),
        full_address: Object.freeze(["full_address"]),
        address_line_1: Object.freeze(["address_line_1"]),
        address_line_2: Object.freeze(["address_line_2"]),
        city: Object.freeze(["city"]),
        state: Object.freeze(["state"]),
        postal_code: Object.freeze(["postal_code"]),
        region: Object.freeze(["region"]),
        territory: Object.freeze(["territory"]),
        district: Object.freeze(["district"]),
        division: Object.freeze(["division"]),
        market: Object.freeze(["market"]),
        status: Object.freeze(["status"]),
        status_reason: Object.freeze(["status_reason"]),
        completed: Object.freeze(["completed"]),
        closed: Object.freeze(["closed"]),
        latitude: Object.freeze(["latitude"]),
        longitude: Object.freeze(["longitude"]),
        notes_count: Object.freeze(["notes_count"]),
        photos_count: Object.freeze(["photos_count"]),
        last_activity_at: Object.freeze(["last_activity_at"]),
        source_row_index: Object.freeze(["source_row_index"])
      })
    }),
    "store-number-heavy": Object.freeze({
      id: "store-number-heavy",
      label: "Store-Number-Heavy",
      description: "Best for operational exports centered on store number and execution status labels.",
      aliasesByCanonical: Object.freeze({
        store_id: Object.freeze(["store number", "store_number", "store #", "store#", "store num"]),
        store_name: Object.freeze(["store name", "location name", "site name"]),
        customer_id: Object.freeze(["customer id", "customer number"]),
        status: Object.freeze(["store status", "status_code", "execution status"]),
        status_reason: Object.freeze(["reschedule reason", "reason"]),
        completed: Object.freeze(["complete", "done"]),
        closed: Object.freeze(["store_closed", "is_closed"]),
        region: Object.freeze(["area", "zone"]),
        territory: Object.freeze(["territory name", "territory code"]),
        district: Object.freeze(["district", "district name"]),
        division: Object.freeze(["division", "division name"]),
        market: Object.freeze(["market", "market name"]),
        latitude: Object.freeze(["lat", "geo_lat"]),
        longitude: Object.freeze(["lng", "geo_lng"])
      })
    }),
    "address-heavy": Object.freeze({
      id: "address-heavy",
      label: "Address-Heavy",
      description: "Best for datasets with granular street/address columns.",
      aliasesByCanonical: Object.freeze({
        store_id: Object.freeze(["store id", "store_number"]),
        full_address: Object.freeze(["address", "site address", "location"]),
        address_line_1: Object.freeze(["street", "street address", "address1", "addr1"]),
        address_line_2: Object.freeze(["suite", "unit", "address2", "addr2"]),
        city: Object.freeze(["city", "town"]),
        state: Object.freeze(["state", "st", "province"]),
        postal_code: Object.freeze(["zip", "zip code", "zipcode", "postal code"]),
        latitude: Object.freeze(["lat", "y"]),
        longitude: Object.freeze(["lng", "lon", "x"])
      })
    })
  });

  function getMappingPresets() {
    return JSON.parse(JSON.stringify(MAPPING_PRESETS));
  }

  function buildAliasLookup() {
    const aliasesByCanonical = getSchemaAliases();
    const lookup = {};

    Object.keys(aliasesByCanonical).forEach((canonical) => {
      const values = Array.isArray(aliasesByCanonical[canonical]) ? aliasesByCanonical[canonical] : [];
      values.forEach((alias) => {
        const token = normalizeSchemaToken(alias);
        if (token) lookup[token] = canonical;
      });
    });

    return lookup;
  }

  function buildPresetLookup(presetId) {
    const preset = MAPPING_PRESETS[presetId] || MAPPING_PRESETS.canonical;
    const aliasesByCanonical = preset.aliasesByCanonical || {};
    const lookup = {};

    Object.keys(aliasesByCanonical).forEach((canonical) => {
      const aliases = Array.isArray(aliasesByCanonical[canonical]) ? aliasesByCanonical[canonical] : [];
      aliases.forEach((alias) => {
        const token = normalizeSchemaToken(alias);
        if (token) lookup[token] = canonical;
      });
    });

    return {
      presetUsed: preset.id,
      lookup
    };
  }

  function suggestHeaderMapping(sourceHeaders, options) {
    const headers = Array.isArray(sourceHeaders) ? sourceHeaders.slice() : [];
    const opts = options && typeof options === "object" ? options : {};
    const presetId = typeof opts.presetId === "string" && opts.presetId in MAPPING_PRESETS ? opts.presetId : "canonical";

    const canonicalSet = new Set(getCanonicalFields());
    const schemaAliasLookup = buildAliasLookup();
    const presetLookupPayload = buildPresetLookup(presetId);
    const presetLookup = presetLookupPayload.lookup;

    const canonicalAssignments = [];
    const confidenceByHeader = [];

    headers.forEach((headerName, index) => {
      const original = headerName == null ? "" : String(headerName);
      const token = normalizeSchemaToken(original);

      let canonical = "";
      let confidence = "none";
      let strategy = "unmapped";

      if (token && canonicalSet.has(token)) {
        canonical = token;
        confidence = "high";
        strategy = "exact-canonical";
      } else if (token && schemaAliasLookup[token]) {
        canonical = schemaAliasLookup[token];
        confidence = "medium";
        strategy = "schema-alias";
      } else if (token && presetLookup[token]) {
        canonical = presetLookup[token];
        confidence = "low";
        strategy = "preset-alias";
      }

      canonicalAssignments.push(canonical);
      confidenceByHeader.push({
        headerIndex: index,
        sourceHeader: original,
        canonical,
        confidence,
        strategy
      });
    });

    return {
      sourceHeaders: headers,
      canonicalAssignments,
      confidenceByHeader,
      presetUsed: presetLookupPayload.presetUsed
    };
  }

  function applyManualMappingOverrides(mappingSuggestion, overrideMappings) {
    const suggestion = mappingSuggestion && typeof mappingSuggestion === "object" ? mappingSuggestion : {
      sourceHeaders: [],
      canonicalAssignments: [],
      confidenceByHeader: [],
      presetUsed: "canonical"
    };

    const overrides = overrideMappings && typeof overrideMappings === "object" ? overrideMappings : {};
    const canonicalSet = new Set(getCanonicalFields());

    const sourceHeaders = Array.isArray(suggestion.sourceHeaders) ? suggestion.sourceHeaders.slice() : [];
    const canonicalAssignments = Array.isArray(suggestion.canonicalAssignments)
      ? suggestion.canonicalAssignments.slice()
      : sourceHeaders.map(() => "");

    const overrideIssues = [];

    Object.keys(overrides).forEach((headerKey) => {
      const headerIndex = Number(headerKey);
      const canonicalTarget = normalizeSchemaToken(overrides[headerKey]);

      if (!Number.isInteger(headerIndex) || headerIndex < 0 || headerIndex >= sourceHeaders.length) {
        overrideIssues.push({
          severity: "error",
          code: "INVALID_OVERRIDE_INDEX",
          message: `Override header index \"${headerKey}\" is out of range.`,
          field: "",
          rowIndex: -1
        });
        return;
      }

      if (canonicalTarget && !canonicalSet.has(canonicalTarget)) {
        overrideIssues.push({
          severity: "error",
          code: "INVALID_OVERRIDE_CANONICAL_FIELD",
          message: `Override canonical target \"${overrides[headerKey]}\" is not valid.`,
          field: canonicalTarget,
          rowIndex: -1
        });
        return;
      }

      canonicalAssignments[headerIndex] = canonicalTarget;
    });

    return {
      sourceHeaders,
      canonicalAssignments,
      confidenceByHeader: Array.isArray(suggestion.confidenceByHeader) ? suggestion.confidenceByHeader.slice() : [],
      presetUsed: suggestion.presetUsed || "canonical",
      overrideIssues
    };
  }

  function buildHeaderIndexHelpers(sourceHeaders, canonicalAssignments) {
    const headers = Array.isArray(sourceHeaders) ? sourceHeaders.slice() : [];
    const assignments = Array.isArray(canonicalAssignments) ? canonicalAssignments.slice() : [];

    const canonicalByHeaderIndex = headers.map((_, index) => normalizeSchemaToken(assignments[index] || ""));
    const canonicalHeaderMap = {};
    const canonicalSourceIndexMap = {};
    const canonicalSourceNameMap = {};

    canonicalByHeaderIndex.forEach((canonical, index) => {
      if (!canonical) return;

      if (!(canonical in canonicalHeaderMap)) {
        canonicalHeaderMap[canonical] = index;
      }

      if (!(canonical in canonicalSourceIndexMap)) {
        canonicalSourceIndexMap[canonical] = [];
      }
      canonicalSourceIndexMap[canonical].push(index);

      if (!(canonical in canonicalSourceNameMap)) {
        canonicalSourceNameMap[canonical] = [];
      }
      canonicalSourceNameMap[canonical].push(headers[index]);
    });

    return {
      canonicalByHeaderIndex,
      canonicalHeaderMap,
      canonicalSourceIndexMap,
      canonicalSourceNameMap
    };
  }

  function buildHeaderMappingReport(sourceHeaders, options) {
    const suggestion = suggestHeaderMapping(sourceHeaders, options);
    const withOverrides = applyManualMappingOverrides(suggestion, options && options.overrideMappings);

    const headers = withOverrides.sourceHeaders;
    const assignments = withOverrides.canonicalAssignments;

    const indexHelpers = buildHeaderIndexHelpers(headers, assignments);

    const duplicates = [];
    Object.keys(indexHelpers.canonicalSourceIndexMap)
      .sort()
      .forEach((canonicalField) => {
        const indexes = indexHelpers.canonicalSourceIndexMap[canonicalField];
        if (indexes.length > 1) {
          duplicates.push({
            canonicalField,
            headerIndexes: indexes.slice(),
            headerNames: (indexHelpers.canonicalSourceNameMap[canonicalField] || []).slice()
          });
        }
      });

    const unmappedHeaders = headers
      .map((name, index) => ({ headerIndex: index, sourceHeader: name, canonical: assignments[index] || "" }))
      .filter((row) => !row.canonical);

    const requiredFields = getRequiredFields();
    const missingRequiredFields = requiredFields.filter((required) => !(required in indexHelpers.canonicalHeaderMap));

    const issues = [];

    duplicates.forEach((duplicate) => {
      issues.push({
        severity: "error",
        code: "DUPLICATE_CANONICAL_ASSIGNMENT",
        message: `Canonical field \"${duplicate.canonicalField}\" has multiple mapped headers.`,
        field: duplicate.canonicalField,
        rowIndex: -1
      });
    });

    missingRequiredFields.forEach((field) => {
      issues.push({
        severity: "error",
        code: "MISSING_REQUIRED_MAPPING",
        message: `Required field \"${field}\" is not mapped to any source header.`,
        field,
        rowIndex: -1
      });
    });

    withOverrides.overrideIssues.forEach((issue) => issues.push(issue));

    return {
      sourceHeaders: headers.slice(),
      canonicalAssignments: assignments.slice(),
      unmappedHeaders,
      duplicateAssignments: duplicates,
      confidenceByHeader: withOverrides.confidenceByHeader.slice(),
      presetUsed: withOverrides.presetUsed,
      isValid: issues.length === 0,
      issues,
      missingRequiredFields,
      ...indexHelpers
    };
  }

  function projectRowWithMapping(sourceHeaders, mappingReport, rawRow) {
    const headers = Array.isArray(sourceHeaders) ? sourceHeaders.slice() : [];
    const report = mappingReport && typeof mappingReport === "object"
      ? mappingReport
      : buildHeaderMappingReport(headers);

    const canonicalByHeaderIndex = Array.isArray(report.canonicalByHeaderIndex)
      ? report.canonicalByHeaderIndex.slice()
      : headers.map(() => "");

    const canonicalValues = {};
    const unknownValues = {};

    headers.forEach((headerName, index) => {
      const canonical = canonicalByHeaderIndex[index] || "";
      let value;

      if (Array.isArray(rawRow)) {
        value = rawRow[index];
      } else if (rawRow && typeof rawRow === "object") {
        value = rawRow[headerName];
      }

      if (canonical) {
        canonicalValues[canonical] = value;
      } else {
        unknownValues[headerName] = value;
      }
    });

    return {
      canonicalValues,
      unknownValues
    };
  }

  const ingestionMapper = Object.freeze({
    getMappingPresets,
    suggestHeaderMapping,
    applyManualMappingOverrides,
    buildHeaderMappingReport,
    projectRowWithMapping
  });

  if (globalScope) {
    globalScope.ingestionMapper = ingestionMapper;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ingestionMapper;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
