/* ================= INGESTION STAGING (PHASE 11.2.e) ================= */

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
  const validatorApi = getDependency("ingestionValidator", "./ingestion-validate.js");
  const normalizerApi = getDependency("ingestionNormalizer", "./ingestion-normalize.js");
  const mapperApi = getDependency("ingestionMapper", "./ingestion-map.js");

  const FALLBACK_SCHEMA_VERSION = "11.2.0-foundation";

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

  function toIssue(severity, code, message, field, rowIndex) {
    return {
      severity,
      code,
      message,
      field: field || "",
      rowIndex: Number.isInteger(rowIndex) ? rowIndex : -1
    };
  }

  function fallbackBuildHeaderMappingReport(sourceHeaders, options) {
    const headers = Array.isArray(sourceHeaders) ? sourceHeaders.slice() : [];
    const issues = [];

    headers.forEach((header, index) => {
      const normalized = String(header == null ? "" : header).trim();
      if (!normalized) {
        issues.push(toIssue("error", "EMPTY_HEADER_NAME", `Header at index ${index} is empty.`, "", -1));
      }
    });

    return {
      sourceHeaders: headers,
      canonicalAssignments: headers.map(() => ""),
      unmappedHeaders: headers.map((h, i) => ({ headerIndex: i, sourceHeader: h, canonical: "" })),
      duplicateAssignments: [],
      confidenceByHeader: headers.map((h, i) => ({
        headerIndex: i,
        sourceHeader: h,
        canonical: "",
        confidence: "none",
        strategy: "unmapped"
      })),
      presetUsed: options && options.presetId ? options.presetId : "canonical",
      isValid: issues.length === 0,
      issues,
      missingRequiredFields: ["store_id"],
      canonicalByHeaderIndex: headers.map(() => ""),
      canonicalHeaderMap: {},
      canonicalSourceIndexMap: {},
      canonicalSourceNameMap: {}
    };
  }

  function fallbackValidateHeaders(sourceHeaders) {
    const headers = Array.isArray(sourceHeaders) ? sourceHeaders.slice() : [];
    const errors = [];

    if (!headers.length) {
      errors.push(toIssue("error", "MISSING_HEADERS", "No headers supplied for validation.", "", -1));
    }

    const hasStoreId = headers.some((header) => String(header == null ? "" : header).trim().toLowerCase() === "store_id");
    if (!hasStoreId) {
      errors.push(
        toIssue(
          "error",
          "MISSING_REQUIRED_HEADER",
          "Required canonical field \"store_id\" is missing from headers.",
          "store_id",
          -1
        )
      );
    }

    return {
      isValid: errors.length === 0,
      headers,
      mappedHeaders: [],
      canonicalByHeaderIndex: headers.map(() => ""),
      canonicalHeaderMap: {},
      canonicalToSourceIndexes: {},
      missingRequiredFields: hasStoreId ? [] : ["store_id"],
      unknownHeaders: headers.slice(),
      emptyHeaderIndexes: [],
      errors,
      warnings: [],
      errorCount: errors.length,
      warningCount: 0
    };
  }

  function fallbackValidateProjectedRow(projectedRow, rowIndex, seenStoreIds) {
    const canonicalValues = projectedRow && projectedRow.canonicalValues ? projectedRow.canonicalValues : {};
    const unknownValues = projectedRow && projectedRow.unknownValues ? projectedRow.unknownValues : {};
    const errors = [];
    const warnings = [];

    const storeId = String(canonicalValues.store_id == null ? "" : canonicalValues.store_id).trim();

    if (!storeId) {
      errors.push(
        toIssue(
          "error",
          "MISSING_REQUIRED_VALUE",
          "Required field \"store_id\" is missing or empty.",
          "store_id",
          rowIndex
        )
      );
    } else if (seenStoreIds instanceof Set) {
      const key = storeId.toLowerCase();
      if (seenStoreIds.has(key)) {
        errors.push(
          toIssue(
            "error",
            "DUPLICATE_STORE_ID",
            `Duplicate store_id "${storeId}" detected in batch.`,
            "store_id",
            rowIndex
          )
        );
      } else {
        seenStoreIds.add(key);
      }
    }

    return {
      rowIndex,
      isValid: errors.length === 0,
      rawRow: projectedRow,
      canonicalValues,
      unknownValues,
      errors,
      warnings,
      errorCount: errors.length,
      warningCount: warnings.length
    };
  }

  function fallbackNormalizeOneRow(projectedRow, options) {
    const canonicalValues = projectedRow && projectedRow.canonicalValues ? projectedRow.canonicalValues : {};
    const sourceRowIndex = Number.isInteger(options && options.rowIndex) ? options.rowIndex : -1;
    const normalizedAt = options && typeof options.normalizedAt === "string"
      ? options.normalizedAt
      : new Date().toISOString();

    return {
      store_id: String(canonicalValues.store_id == null ? "" : canonicalValues.store_id).trim(),
      full_address: String(canonicalValues.full_address == null ? "" : canonicalValues.full_address).trim(),
      address_line_1: String(canonicalValues.address_line_1 == null ? "" : canonicalValues.address_line_1).trim(),
      address_line_2: String(canonicalValues.address_line_2 == null ? "" : canonicalValues.address_line_2).trim(),
      city: String(canonicalValues.city == null ? "" : canonicalValues.city).trim(),
      state: String(canonicalValues.state == null ? "" : canonicalValues.state).trim(),
      postal_code: String(canonicalValues.postal_code == null ? "" : canonicalValues.postal_code).trim(),
      region: String(canonicalValues.region == null ? "" : canonicalValues.region).trim(),
      territory: String(canonicalValues.territory == null ? "" : canonicalValues.territory).trim(),
      status: String(canonicalValues.status == null ? "active" : canonicalValues.status).trim().toLowerCase() || "active",
      status_reason: String(canonicalValues.status_reason == null ? "" : canonicalValues.status_reason).trim(),
      completed: false,
      closed: false,
      latitude: null,
      longitude: null,
      notes_count: 0,
      photos_count: 0,
      last_activity_at: "",
      source_row_index: sourceRowIndex,
      __meta: {
        schemaVersion: getSchemaVersion(),
        normalizedAt,
        sourceRowIndex: sourceRowIndex,
        unknownFields: projectedRow && projectedRow.unknownValues ? { ...projectedRow.unknownValues } : {},
        warnings: []
      }
    };
  }

  function buildImportManifest(input) {
    const payload = input && typeof input === "object" ? input : {};
    const sourceHeaders = Array.isArray(payload.sourceHeaders) ? payload.sourceHeaders : [];
    const rawRows = Array.isArray(payload.rawRows) ? payload.rawRows : [];
    const mappingReport = payload.mappingReport && typeof payload.mappingReport === "object" ? payload.mappingReport : {};

    const stagedAt = typeof payload.stagedAt === "string" && payload.stagedAt.trim()
      ? payload.stagedAt
      : new Date().toISOString();

    return {
      schemaVersion: getSchemaVersion(),
      stagedAt,
      sourceFilename: typeof payload.sourceFilename === "string" ? payload.sourceFilename : "",
      sourceRowCount: rawRows.length,
      sourceHeaderCount: sourceHeaders.length,
      presetUsed: typeof mappingReport.presetUsed === "string"
        ? mappingReport.presetUsed
        : (typeof payload.presetId === "string" ? payload.presetId : "canonical"),
      importMode: "dry_run",
      transport: "in_memory_stage"
    };
  }

  function buildDryRunSummary(input) {
    const payload = input && typeof input === "object" ? input : {};

    const mappingReport = payload.mappingReport && typeof payload.mappingReport === "object" ? payload.mappingReport : {};
    const headerReport = payload.headerReport && typeof payload.headerReport === "object" ? payload.headerReport : {};

    const rowReports = Array.isArray(payload.rowReports) ? payload.rowReports : [];
    const acceptedRecords = Array.isArray(payload.acceptedRecords) ? payload.acceptedRecords : [];
    const rejectedRows = Array.isArray(payload.rejectedRows) ? payload.rejectedRows : [];

    const rowWarningCount = rowReports.reduce((sum, report) => sum + (Number(report.warningCount) || 0), 0);
    const rowErrorCount = rowReports.reduce((sum, report) => sum + (Number(report.errorCount) || 0), 0);

    const mappingIssues = Array.isArray(mappingReport.issues) ? mappingReport.issues : [];
    const mappingWarningCount = mappingIssues.filter((issue) => issue && issue.severity === "warning").length;
    const mappingErrorCount = mappingIssues.filter((issue) => issue && issue.severity === "error").length;

    const headerWarningCount = Number(headerReport.warningCount) || 0;
    const headerErrorCount = Number(headerReport.errorCount) || 0;

    return {
      totalRows: rowReports.length,
      acceptedRowCount: acceptedRecords.length,
      rejectedRowCount: rejectedRows.length,
      warningCount: mappingWarningCount + headerWarningCount + rowWarningCount,
      errorCount: mappingErrorCount + headerErrorCount + rowErrorCount,
      missingRequiredMappingCount: Array.isArray(mappingReport.missingRequiredFields) ? mappingReport.missingRequiredFields.length : 0,
      duplicateMappingCount: Array.isArray(mappingReport.duplicateAssignments) ? mappingReport.duplicateAssignments.length : 0,
      unmappedHeaderCount: Array.isArray(mappingReport.unmappedHeaders) ? mappingReport.unmappedHeaders.length : 0
    };
  }

  function projectRow(sourceHeaders, mappingReport, rawRow) {
    if (mapperApi && typeof mapperApi.projectRowWithMapping === "function") {
      return mapperApi.projectRowWithMapping(sourceHeaders, mappingReport, rawRow);
    }

    const headers = Array.isArray(sourceHeaders) ? sourceHeaders : [];
    const canonicalByHeaderIndex = Array.isArray(mappingReport && mappingReport.canonicalByHeaderIndex)
      ? mappingReport.canonicalByHeaderIndex
      : headers.map(() => "");

    const canonicalValues = {};
    const unknownValues = {};

    headers.forEach((headerName, index) => {
      const canonical = canonicalByHeaderIndex[index] || "";
      const value = Array.isArray(rawRow)
        ? rawRow[index]
        : (rawRow && typeof rawRow === "object" ? rawRow[headerName] : undefined);

      if (canonical) {
        canonicalValues[canonical] = value;
      } else {
        unknownValues[headerName] = value;
      }
    });

    return { canonicalValues, unknownValues };
  }

  function validateProjectedRow(projectedRow, rowIndex, seenStoreIds) {
    if (validatorApi && typeof validatorApi.validateRow === "function") {
      return validatorApi.validateRow(
        { canonicalValues: projectedRow.canonicalValues, unknownValues: projectedRow.unknownValues },
        rowIndex,
        null,
        {
          seenStoreIds,
          canonicalValues: projectedRow.canonicalValues,
          unknownFields: projectedRow.unknownValues
        }
      );
    }

    return fallbackValidateProjectedRow(projectedRow, rowIndex, seenStoreIds);
  }

  function stageImportBatch(input) {
    const payload = input && typeof input === "object" ? input : {};
    const sourceHeaders = Array.isArray(payload.sourceHeaders) ? payload.sourceHeaders.slice() : [];
    const rawRows = Array.isArray(payload.rawRows) ? payload.rawRows.slice() : [];

    const mappingOptions = {
      presetId: typeof payload.presetId === "string" ? payload.presetId : undefined,
      overrideMappings: payload.overrideMappings && typeof payload.overrideMappings === "object"
        ? { ...payload.overrideMappings }
        : undefined
    };

    const mappingReport = mapperApi && typeof mapperApi.buildHeaderMappingReport === "function"
      ? mapperApi.buildHeaderMappingReport(sourceHeaders, mappingOptions)
      : fallbackBuildHeaderMappingReport(sourceHeaders, mappingOptions);

    const headerReport = validatorApi && typeof validatorApi.validateHeaders === "function"
      ? validatorApi.validateHeaders(sourceHeaders)
      : fallbackValidateHeaders(sourceHeaders);

    const seenStoreIds = new Set();
    const rowReports = [];
    const acceptedRecords = [];
    const rejectedRows = [];

    const normalizedAt = typeof payload.stagedAt === "string" && payload.stagedAt.trim()
      ? payload.stagedAt
      : new Date().toISOString();

    rawRows.forEach((rawRow, rowIndex) => {
      const projected = projectRow(sourceHeaders, mappingReport, rawRow);
      const validatorResult = validateProjectedRow(projected, rowIndex, seenStoreIds);

      const rowReport = {
        rowIndex,
        isValid: Boolean(validatorResult && validatorResult.isValid),
        errors: Array.isArray(validatorResult && validatorResult.errors) ? validatorResult.errors.slice() : [],
        warnings: Array.isArray(validatorResult && validatorResult.warnings) ? validatorResult.warnings.slice() : [],
        errorCount: Number(validatorResult && validatorResult.errorCount) || 0,
        warningCount: Number(validatorResult && validatorResult.warningCount) || 0,
        projectedRow: {
          canonicalValues: { ...projected.canonicalValues },
          unknownValues: { ...projected.unknownValues }
        },
        rawRow
      };

      if (rowReport.isValid) {
        const normalized = normalizerApi && typeof normalizerApi.normalizeOneRow === "function"
          ? normalizerApi.normalizeOneRow(
              {
                canonicalValues: projected.canonicalValues,
                unknownValues: projected.unknownValues
              },
              { rowIndex, normalizedAt }
            )
          : fallbackNormalizeOneRow(
              {
                canonicalValues: projected.canonicalValues,
                unknownValues: projected.unknownValues
              },
              { rowIndex, normalizedAt }
            );

        acceptedRecords.push(normalized);
      } else {
        rejectedRows.push({
          rowIndex,
          rawRow,
          projectedRow: {
            canonicalValues: { ...projected.canonicalValues },
            unknownValues: { ...projected.unknownValues }
          },
          errors: rowReport.errors.slice(),
          warnings: rowReport.warnings.slice()
        });
      }

      rowReports.push(rowReport);
    });

    const manifest = buildImportManifest({
      sourceHeaders,
      rawRows,
      sourceFilename: payload.sourceFilename,
      presetId: mappingOptions.presetId,
      mappingReport,
      stagedAt: normalizedAt
    });

    const summary = buildDryRunSummary({
      mappingReport,
      headerReport,
      rowReports,
      acceptedRecords,
      rejectedRows
    });

    const topLevelWarnings = [];
    const topLevelErrors = [];

    if (Array.isArray(mappingReport.issues)) {
      mappingReport.issues.forEach((issue) => {
        if (issue && issue.severity === "warning") topLevelWarnings.push(issue);
        if (issue && issue.severity === "error") topLevelErrors.push(issue);
      });
    }

    if (Array.isArray(headerReport.warnings)) {
      headerReport.warnings.forEach((warning) => topLevelWarnings.push(warning));
    }

    if (Array.isArray(headerReport.errors)) {
      headerReport.errors.forEach((error) => topLevelErrors.push(error));
    }

    rowReports.forEach((report) => {
      report.warnings.forEach((warning) => topLevelWarnings.push(warning));
      report.errors.forEach((error) => topLevelErrors.push(error));
    });

    const isValid = Boolean(mappingReport.isValid) && Boolean(headerReport.isValid) && summary.rejectedRowCount === 0;
    const canProceed = isValid;

    return {
      isValid,
      canProceed,
      manifest,
      mappingReport,
      headerReport,
      rowReports,
      acceptedRecords,
      rejectedRows,
      warnings: topLevelWarnings,
      errors: topLevelErrors,
      summary
    };
  }

  const ingestionStage = Object.freeze({
    buildImportManifest,
    buildDryRunSummary,
    stageImportBatch
  });

  if (globalScope) {
    globalScope.ingestionStage = ingestionStage;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ingestionStage;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));