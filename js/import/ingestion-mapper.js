(function ingestionMapperModule(globalScope) {
  "use strict";

  const IMPORT_COLUMN_ALIASES = Object.freeze({
    store_id: Object.freeze(["store_id", "store id", "storeid", "store #", "store number", "store_num", "store_no", "location id", "location_id", "site id", "site_id"]),
    store_name: Object.freeze(["store_name", "store name", "location name", "location_name", "site name", "site_name", "store"]),
    customer_id: Object.freeze(["customer_id", "customer id", "customer", "customer number", "customer_number"]),
    full_address: Object.freeze(["full_address", "full address", "address_full", "fulladdress", "address line", "address_line", "street address", "street_address"]),
    address: Object.freeze(["address", "address1", "address 1", "street", "street1", "street 1", "addr", "address_line_1", "address line 1"]),
    address_2: Object.freeze(["address2", "address 2", "street2", "street 2", "address_line_2", "address line 2", "suite", "unit"]),
    city: Object.freeze(["city", "town"]),
    state: Object.freeze(["state", "province", "state_code", "state code"]),
    zip: Object.freeze(["zip", "zipcode", "zip code", "postal_code", "postal code", "postcode"]),
    region: Object.freeze(["region", "area", "zone"]),
    territory: Object.freeze(["territory", "territory_name", "territory name", "territory code", "territory_code"]),
    district: Object.freeze(["district", "district_name", "district name"]),
    division: Object.freeze(["division", "division_name", "division name"]),
    market: Object.freeze(["market", "market_name", "market name"]),
    lat: Object.freeze(["lat", "latitude", "ycoord", "y_coord", "geo_lat", "geo latitude"]),
    lng: Object.freeze(["lng", "lon", "long", "longitude", "xcoord", "x_coord", "geo_lng", "geo_longitude"]),
    status_code: Object.freeze(["status_code", "status", "store status", "store_status"])
  });

  const CANONICAL_FIELDS = Object.freeze(Object.keys(IMPORT_COLUMN_ALIASES));
  const REQUIRED_FIELDS = Object.freeze(["store_id"]);

  function sanitizeColumnName(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function canonicalizeImportColumn(value) {
    const sanitized = sanitizeColumnName(value);
    if (!sanitized) return "";

    for (const [canonical, aliases] of Object.entries(IMPORT_COLUMN_ALIASES)) {
      if (aliases.some(function matchesAlias(alias) {
        return sanitizeColumnName(alias) === sanitized;
      })) {
        return canonical;
      }
    }

    return sanitized;
  }

  function getMappingPresets() {
    return [
      { id: "canonical", label: "Default / Canonical" },
      { id: "store-number-heavy", label: "Store-Number-Heavy" },
      { id: "address-heavy", label: "Address-Heavy" }
    ];
  }

  function buildIndexHelpers(assignments) {
    const canonicalByHeaderIndex = Array.isArray(assignments) ? assignments.slice() : [];
    const canonicalHeaderMap = {};
    const canonicalToSourceIndexes = {};

    canonicalByHeaderIndex.forEach(function assignCanonical(canonical, index) {
      if (!canonical) return;
      if (!canonicalToSourceIndexes[canonical]) canonicalToSourceIndexes[canonical] = [];
      canonicalToSourceIndexes[canonical].push(index);
      if (canonicalHeaderMap[canonical] == null) canonicalHeaderMap[canonical] = index;
    });

    return { canonicalByHeaderIndex, canonicalHeaderMap, canonicalToSourceIndexes };
  }

  function buildHeaderMappingReport(sourceHeaders, options) {
    const headers = Array.isArray(sourceHeaders) ? sourceHeaders.slice() : [];
    const opts = options && typeof options === "object" ? options : {};
    const overrideMappings = opts.overrideMappings && typeof opts.overrideMappings === "object"
      ? opts.overrideMappings
      : {};

    const canonicalAssignments = headers.map(canonicalizeImportColumn);
    const confidenceByHeader = headers.map(function toConfidence(header, headerIndex) {
      const canonical = canonicalAssignments[headerIndex];
      const token = sanitizeColumnName(header);
      const confidence = canonical && CANONICAL_FIELDS.indexOf(canonical) >= 0
        ? (token === canonical ? "high" : "medium")
        : "none";
      const strategy = confidence === "high"
        ? "exact-canonical"
        : (confidence === "medium" ? "alias" : "unmapped");

      return {
        headerIndex,
        sourceHeader: String(header || ""),
        canonical,
        confidence,
        strategy
      };
    });

    const overrideIssues = [];
    Object.keys(overrideMappings).forEach(function applyOverride(headerKey) {
      const headerIndex = Number(headerKey);
      if (!Number.isInteger(headerIndex) || headerIndex < 0 || headerIndex >= headers.length) {
        overrideIssues.push({
          severity: "warning",
          code: "OVERRIDE_INDEX_OUT_OF_RANGE",
          message: "Mapping override was ignored because the source header index was out of range.",
          field: "",
          rowIndex: -1
        });
        return;
      }

      const overrideCanonical = canonicalizeImportColumn(overrideMappings[headerKey]);
      canonicalAssignments[headerIndex] = overrideCanonical;
      confidenceByHeader[headerIndex] = {
        headerIndex,
        sourceHeader: String(headers[headerIndex] || ""),
        canonical: overrideCanonical,
        confidence: overrideCanonical ? "manual" : "none",
        strategy: overrideCanonical ? "manual-override" : "manual-clear"
      };
    });

    const unmappedHeaders = [];
    const duplicateAssignments = [];
    const missingRequiredFields = [];
    const issues = [];
    const canonicalToIndexes = {};

    canonicalAssignments.forEach(function collect(canonical, headerIndex) {
      const sourceHeader = String(headers[headerIndex] || "");
      if (!canonical || CANONICAL_FIELDS.indexOf(canonical) < 0) {
        unmappedHeaders.push({ headerIndex, sourceHeader, canonical: "" });
        issues.push({
          severity: "warning",
          code: "UNMAPPED_HEADER",
          message: `Header \"${sourceHeader}\" is not mapped to a canonical field and will be ignored.`,
          field: "",
          rowIndex: -1
        });
        return;
      }

      if (!canonicalToIndexes[canonical]) canonicalToIndexes[canonical] = [];
      canonicalToIndexes[canonical].push(headerIndex);
    });

    Object.keys(canonicalToIndexes).forEach(function trackDuplicates(canonical) {
      const indexes = canonicalToIndexes[canonical];
      if (indexes.length > 1) {
        duplicateAssignments.push({ canonical, sourceIndexes: indexes.slice() });
        issues.push({
          severity: "error",
          code: "DUPLICATE_CANONICAL_MAPPING",
          message: `Multiple headers map to canonical field \"${canonical}\".`,
          field: canonical,
          rowIndex: -1
        });
      }
    });

    REQUIRED_FIELDS.forEach(function ensureRequired(required) {
      if (!canonicalToIndexes[required] || !canonicalToIndexes[required].length) {
        missingRequiredFields.push(required);
        issues.push({
          severity: "error",
          code: "MISSING_REQUIRED_MAPPING",
          message: `Required field \"${required}\" is not mapped to any source header.`,
          field: required,
          rowIndex: -1
        });
      }
    });

    overrideIssues.forEach(function append(issue) {
      issues.push(issue);
    });

    const indexHelpers = buildIndexHelpers(canonicalAssignments);

    return {
      sourceHeaders: headers,
      canonicalAssignments: canonicalAssignments.slice(),
      confidenceByHeader,
      unmappedHeaders,
      duplicateAssignments,
      missingRequiredFields,
      issues,
      isValid: !issues.some(function hasError(issue) { return issue.severity === "error"; }),
      presetUsed: opts.presetId || "canonical",
      ...indexHelpers
    };
  }

  function projectRowWithMapping(sourceHeaders, mappingReport, rawRow) {
    const headers = Array.isArray(sourceHeaders) ? sourceHeaders : [];
    const canonicalByHeaderIndex = Array.isArray(mappingReport && mappingReport.canonicalByHeaderIndex)
      ? mappingReport.canonicalByHeaderIndex
      : headers.map(function blank() { return ""; });

    const canonicalValues = {};
    const unknownValues = {};

    headers.forEach(function project(headerName, index) {
      const canonical = canonicalByHeaderIndex[index] || "";
      let value;

      if (Array.isArray(rawRow)) {
        value = rawRow[index];
      } else if (rawRow && typeof rawRow === "object") {
        value = rawRow[headerName];
      }

      if (canonical && CANONICAL_FIELDS.indexOf(canonical) >= 0) {
        if (canonicalValues[canonical] == null || canonicalValues[canonical] === "") {
          canonicalValues[canonical] = value;
        }
      } else {
        unknownValues[headerName] = value;
      }
    });

    return { canonicalValues, unknownValues };
  }

  const ingestionMapper = Object.freeze({
    IMPORT_COLUMN_ALIASES,
    CANONICAL_FIELDS,
    REQUIRED_FIELDS,
    sanitizeColumnName,
    canonicalizeImportColumn,
    getMappingPresets,
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
