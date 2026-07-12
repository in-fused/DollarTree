/* ================= INGESTION VALIDATOR (PHASE 11.2.b) ================= */

(function (globalScope) {
  "use strict";

  function getSchemaApi() {
    if (globalScope && globalScope.ingestionSchema) {
      return globalScope.ingestionSchema;
    }

    if (typeof require === "function") {
      try {
        return require("./ingestion-schema.js");
      } catch (error) {
        // Fallback below keeps validator functional even when schema module is unavailable.
      }
    }

    return null;
  }

  const schemaApi = getSchemaApi();

  const FALLBACK_REQUIRED_FIELDS = Object.freeze(["store_id"]);
  const FALLBACK_STATUS_VALUES = Object.freeze(["active", "rescheduled", "completed", "closed"]);

  function getRequiredFields() {
    if (schemaApi && typeof schemaApi.getRequiredFieldNames === "function") {
      const fields = schemaApi.getRequiredFieldNames();
      return Array.isArray(fields) && fields.length ? fields.slice() : FALLBACK_REQUIRED_FIELDS.slice();
    }
    return FALLBACK_REQUIRED_FIELDS.slice();
  }

  function getAcceptedStatusValues() {
    if (schemaApi && typeof schemaApi.getAcceptedStatusValues === "function") {
      const statuses = schemaApi.getAcceptedStatusValues();
      return Array.isArray(statuses) && statuses.length ? statuses.slice() : FALLBACK_STATUS_VALUES.slice();
    }
    return FALLBACK_STATUS_VALUES.slice();
  }

  function normalizeSchemaToken(value) {
    if (schemaApi && typeof schemaApi.normalizeSchemaToken === "function") {
      return schemaApi.normalizeSchemaToken(value);
    }

    return String(value == null ? "" : value)
      .trim()
      .toLowerCase()
      .replace(/[\s\-]+/g, "_");
  }

  function resolveIncomingFieldName(inputName) {
    if (schemaApi && typeof schemaApi.resolveIncomingFieldName === "function") {
      return schemaApi.resolveIncomingFieldName(inputName);
    }

    const token = normalizeSchemaToken(inputName);
    return token;
  }

  function isEmptyRequiredValue(value) {
    return (
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "")
    );
  }

  function isFiniteNumericCoordinate(value) {
    if (value === null || value === undefined || value === "") return false;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return false;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed);
    }
    return false;
  }

  function normalizeStatusInput(value) {
    const normalized = String(value == null ? "" : value).trim().toLowerCase();
    if (normalized === "complete" || normalized === "completed") return "completed";
    if (normalized === "closed" || normalized === "inactive") return "closed";
    if (normalized === "rescheduled" || normalized === "reschedule") return "rescheduled";
    return normalized;
  }

  function toIssue(severity, code, message, field, rowIndex) {
    return Object.freeze({
      severity,
      code,
      message,
      field: field || "",
      rowIndex: Number.isInteger(rowIndex) ? rowIndex : -1
    });
  }

  function cloneArray(value) {
    return Array.isArray(value) ? value.slice() : [];
  }

  function validateHeaders(rawHeaders) {
    const headers = cloneArray(rawHeaders);
    const requiredFields = getRequiredFields();

    const errors = [];
    const warnings = [];
    const mappedHeaders = [];
    const canonicalByHeaderIndex = [];
    const canonicalToSourceIndexes = {};
    const unknownHeaders = [];
    const emptyHeaderIndexes = [];

    headers.forEach((headerValue, headerIndex) => {
      const original = headerValue == null ? "" : String(headerValue);
      const normalizedIncoming = normalizeSchemaToken(original);

      if (!normalizedIncoming) {
        emptyHeaderIndexes.push(headerIndex);
        errors.push(
          toIssue(
            "error",
            "EMPTY_HEADER_NAME",
            `Header at index ${headerIndex} is empty.`,
            "",
            -1
          )
        );

        mappedHeaders.push({
          headerIndex,
          original,
          normalizedIncoming,
          canonical: "",
          mapped: false
        });
        canonicalByHeaderIndex.push("");
        return;
      }

      const canonical = resolveIncomingFieldName(original);
      const mapped = Boolean(canonical);

      mappedHeaders.push({
        headerIndex,
        original,
        normalizedIncoming,
        canonical: mapped ? canonical : "",
        mapped
      });

      canonicalByHeaderIndex.push(mapped ? canonical : "");

      if (!mapped) {
        unknownHeaders.push(original);
        warnings.push(
          toIssue(
            "warning",
            "UNKNOWN_HEADER",
            `Header \"${original}\" is not mapped to a canonical field.`,
            normalizedIncoming,
            -1
          )
        );
        return;
      }

      if (!canonicalToSourceIndexes[canonical]) {
        canonicalToSourceIndexes[canonical] = [];
      }
      canonicalToSourceIndexes[canonical].push(headerIndex);
    });

    Object.keys(canonicalToSourceIndexes)
      .sort()
      .forEach((canonicalField) => {
        const indexes = canonicalToSourceIndexes[canonicalField];
        if (indexes.length > 1) {
          errors.push(
            toIssue(
              "error",
              "DUPLICATE_CANONICAL_HEADER",
              `Multiple headers map to canonical field \"${canonicalField}\" (indexes: ${indexes.join(", ")}).`,
              canonicalField,
              -1
            )
          );
        }
      });

    const presentCanonicalSet = new Set(
      Object.keys(canonicalToSourceIndexes).filter((field) => canonicalToSourceIndexes[field].length > 0)
    );

    const missingRequiredFields = requiredFields.filter((field) => !presentCanonicalSet.has(field));
    missingRequiredFields.forEach((field) => {
      errors.push(
        toIssue(
          "error",
          "MISSING_REQUIRED_HEADER",
          `Required canonical field \"${field}\" is missing from headers.`,
          field,
          -1
        )
      );
    });

    const canonicalHeaderMap = {};
    Object.keys(canonicalToSourceIndexes)
      .sort()
      .forEach((field) => {
        canonicalHeaderMap[field] = canonicalToSourceIndexes[field][0];
      });

    return {
      isValid: errors.length === 0,
      headers,
      mappedHeaders,
      canonicalByHeaderIndex,
      canonicalHeaderMap,
      canonicalToSourceIndexes,
      missingRequiredFields,
      unknownHeaders,
      emptyHeaderIndexes,
      errors,
      warnings,
      errorCount: errors.length,
      warningCount: warnings.length
    };
  }

  function getRawCellValue(rawRow, sourceHeaderIndex, headers) {
    if (Array.isArray(rawRow)) {
      if (sourceHeaderIndex >= 0 && sourceHeaderIndex < rawRow.length) {
        return rawRow[sourceHeaderIndex];
      }
      return undefined;
    }

    if (rawRow && typeof rawRow === "object") {
      const key = headers[sourceHeaderIndex];
      return key in rawRow ? rawRow[key] : undefined;
    }

    return undefined;
  }

  function validateRow(rawRow, rowIndex, headerReport, options) {
    const opts = options && typeof options === "object" ? options : {};
    const seenStoreIds = opts.seenStoreIds instanceof Set ? opts.seenStoreIds : null;
    const requiredFields = getRequiredFields();
    const allowedStatuses = new Set(getAcceptedStatusValues().map((status) => String(status).toLowerCase()));

    const errors = [];
    const warnings = [];

    const canonicalValues = opts.canonicalValues && typeof opts.canonicalValues === "object" && !Array.isArray(opts.canonicalValues)
      ? { ...opts.canonicalValues }
      : {};
    const unknownValues = opts.unknownFields && typeof opts.unknownFields === "object" && !Array.isArray(opts.unknownFields)
      ? { ...opts.unknownFields }
      : {};

    const headers = cloneArray(headerReport && headerReport.headers);
    const canonicalByHeaderIndex = cloneArray(headerReport && headerReport.canonicalByHeaderIndex);

    headers.forEach((headerName, index) => {
      const canonical = canonicalByHeaderIndex[index] || "";
      const value = getRawCellValue(rawRow, index, headers);

      if (canonical) {
        canonicalValues[canonical] = value;
      } else {
        unknownValues[headerName] = value;
      }
    });

    requiredFields.forEach((requiredField) => {
      if (isEmptyRequiredValue(canonicalValues[requiredField])) {
        errors.push(
          toIssue(
            "error",
            "MISSING_REQUIRED_VALUE",
            `Required field \"${requiredField}\" is missing or empty.`,
            requiredField,
            rowIndex
          )
        );
      }
    });

    if (!isEmptyRequiredValue(canonicalValues.store_id)) {
      const storeIdKey = String(canonicalValues.store_id).trim().toLowerCase();
      if (seenStoreIds) {
        if (seenStoreIds.has(storeIdKey)) {
          errors.push(
            toIssue(
              "error",
              "DUPLICATE_STORE_ID",
              `Duplicate store_id \"${String(canonicalValues.store_id)}\" detected in batch.`,
              "store_id",
              rowIndex
            )
          );
        } else {
          seenStoreIds.add(storeIdKey);
        }
      }
    }

    if (!isEmptyRequiredValue(canonicalValues.status)) {
      const normalizedStatus = normalizeStatusInput(canonicalValues.status);
      if (!allowedStatuses.has(normalizedStatus)) {
        errors.push(
          toIssue(
            "error",
            "INVALID_STATUS",
            `Status \"${String(canonicalValues.status)}\" is not an accepted canonical status.`,
            "status",
            rowIndex
          )
        );
      } else {
        canonicalValues.status = normalizedStatus;
      }
    }

    const hasLatitude = !isEmptyRequiredValue(canonicalValues.latitude);
    const hasLongitude = !isEmptyRequiredValue(canonicalValues.longitude);

    if (hasLatitude && !isFiniteNumericCoordinate(canonicalValues.latitude)) {
      warnings.push(
        toIssue(
          "warning",
          "INVALID_LATITUDE",
          `Latitude \"${String(canonicalValues.latitude)}\" is not a valid finite number.`,
          "latitude",
          rowIndex
        )
      );
    }

    if (hasLongitude && !isFiniteNumericCoordinate(canonicalValues.longitude)) {
      warnings.push(
        toIssue(
          "warning",
          "INVALID_LONGITUDE",
          `Longitude \"${String(canonicalValues.longitude)}\" is not a valid finite number.`,
          "longitude",
          rowIndex
        )
      );
    }

    const hasFullAddress = !isEmptyRequiredValue(canonicalValues.full_address);
    const hasAddressLine1 = !isEmptyRequiredValue(canonicalValues.address_line_1);
    const hasCity = !isEmptyRequiredValue(canonicalValues.city);
    const hasState = !isEmptyRequiredValue(canonicalValues.state);

    if (!hasFullAddress && !(hasAddressLine1 && hasCity && hasState)) {
      warnings.push(
        toIssue(
          "warning",
          "MISSING_ADDRESS_CONTEXT",
          "Address context is incomplete (provide full_address or address_line_1 + city + state).",
          "full_address",
          rowIndex
        )
      );
    }

    const isValid = errors.length === 0;

    return {
      rowIndex,
      isValid,
      rawRow,
      canonicalValues,
      unknownValues,
      errors,
      warnings,
      errorCount: errors.length,
      warningCount: warnings.length
    };
  }

  function validateBatch(rawHeaders, rawRows, options) {
    const headerReport = validateHeaders(rawHeaders);
    const rows = Array.isArray(rawRows) ? rawRows : [];
    const seenStoreIds = new Set();

    const rowReports = rows.map((row, index) => validateRow(row, index, headerReport, {
      ...(options && typeof options === "object" ? options : {}),
      seenStoreIds
    }));

    const headerErrorCount = headerReport.errorCount;
    const headerWarningCount = headerReport.warningCount;
    const rowErrorCount = rowReports.reduce((sum, report) => sum + report.errorCount, 0);
    const rowWarningCount = rowReports.reduce((sum, report) => sum + report.warningCount, 0);

    const acceptedRowCount = rowReports.reduce((sum, report) => sum + (report.isValid ? 1 : 0), 0);
    const rejectedRowCount = rowReports.length - acceptedRowCount;

    const totals = {
      headerCount: Array.isArray(rawHeaders) ? rawHeaders.length : 0,
      rowCount: rowReports.length,
      acceptedRowCount,
      rejectedRowCount,
      warningCount: headerWarningCount + rowWarningCount,
      errorCount: headerErrorCount + rowErrorCount
    };

    return {
      isValid: headerReport.isValid && rejectedRowCount === 0,
      headerReport,
      rowReports,
      totals,
      acceptedRowCount,
      rejectedRowCount,
      warningCount: totals.warningCount,
      errorCount: totals.errorCount
    };
  }

  const ingestionValidator = Object.freeze({
    validateHeaders,
    validateRow,
    validateBatch,
    isFiniteNumericCoordinate,
    isEmptyRequiredValue
  });

  if (globalScope) {
    globalScope.ingestionValidator = ingestionValidator;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ingestionValidator;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
