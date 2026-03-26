/* ================= INGESTION DIAGNOSTICS (PHASE 11.2.g) ================= */

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
  const adapterApi = getDependency("ingestionAdapter", "./ingestion-adapter.js");

  const FALLBACK_SCHEMA_VERSION = "11.2.0-foundation";

  function getSchemaVersion(stageResult, adaptedResult) {
    if (stageResult && stageResult.manifest && typeof stageResult.manifest.schemaVersion === "string") {
      return stageResult.manifest.schemaVersion;
    }

    if (adaptedResult && adaptedResult.manifest && typeof adaptedResult.manifest.schemaVersion === "string") {
      return adaptedResult.manifest.schemaVersion;
    }

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

  function normalizeIssueObject(issue, fallbackSource) {
    const src = issue && typeof issue === "object" ? issue : {};
    return {
      source: fallbackSource || "",
      severity: typeof src.severity === "string" ? src.severity : "info",
      code: typeof src.code === "string" && src.code.trim() ? src.code : "UNKNOWN_ISSUE",
      field: typeof src.field === "string" ? src.field : "",
      rowIndex: Number.isInteger(src.rowIndex) ? src.rowIndex : -1,
      message: typeof src.message === "string" ? src.message : ""
    };
  }

  function collectStageIssues(stageResult) {
    const stage = stageResult && typeof stageResult === "object" ? stageResult : {};
    const issues = [];

    const mappingReport = stage.mappingReport && typeof stage.mappingReport === "object" ? stage.mappingReport : {};
    const headerReport = stage.headerReport && typeof stage.headerReport === "object" ? stage.headerReport : {};
    const rowReports = Array.isArray(stage.rowReports) ? stage.rowReports : [];
    const stageWarnings = Array.isArray(stage.warnings) ? stage.warnings : [];
    const stageErrors = Array.isArray(stage.errors) ? stage.errors : [];

    const mappingIssues = Array.isArray(mappingReport.issues) ? mappingReport.issues : [];
    mappingIssues.forEach((issue) => {
      issues.push(normalizeIssueObject(issue, "mapping"));
    });

    const headerWarnings = Array.isArray(headerReport.warnings) ? headerReport.warnings : [];
    const headerErrors = Array.isArray(headerReport.errors) ? headerReport.errors : [];
    headerWarnings.forEach((issue) => {
      issues.push(normalizeIssueObject(issue, "header"));
    });
    headerErrors.forEach((issue) => {
      issues.push(normalizeIssueObject(issue, "header"));
    });

    rowReports.forEach((rowReport) => {
      const rowIndex = Number.isInteger(rowReport && rowReport.rowIndex) ? rowReport.rowIndex : -1;
      const errors = Array.isArray(rowReport && rowReport.errors) ? rowReport.errors : [];
      const warnings = Array.isArray(rowReport && rowReport.warnings) ? rowReport.warnings : [];

      errors.forEach((issue) => {
        const normalized = normalizeIssueObject(issue, "row");
        normalized.rowIndex = normalized.rowIndex >= 0 ? normalized.rowIndex : rowIndex;
        issues.push(normalized);
      });

      warnings.forEach((issue) => {
        const normalized = normalizeIssueObject(issue, "row");
        normalized.rowIndex = normalized.rowIndex >= 0 ? normalized.rowIndex : rowIndex;
        issues.push(normalized);
      });
    });

    stageWarnings.forEach((issue) => {
      issues.push(normalizeIssueObject(issue, "stage"));
    });

    stageErrors.forEach((issue) => {
      issues.push(normalizeIssueObject(issue, "stage"));
    });

    return issues;
  }

  function summarizeIssuesByCode(issues) {
    const list = Array.isArray(issues) ? issues : [];
    const counts = {};

    list.forEach((issue) => {
      const normalized = normalizeIssueObject(issue, issue && issue.source);
      counts[normalized.code] = (counts[normalized.code] || 0) + 1;
    });

    const entries = Object.keys(counts)
      .sort()
      .map((code) => ({ code, count: counts[code] }));

    return {
      total: list.length,
      entries
    };
  }

  function summarizeIssuesBySeverity(issues) {
    const list = Array.isArray(issues) ? issues : [];
    const counts = {};

    list.forEach((issue) => {
      const normalized = normalizeIssueObject(issue, issue && issue.source);
      counts[normalized.severity] = (counts[normalized.severity] || 0) + 1;
    });

    const entries = Object.keys(counts)
      .sort()
      .map((severity) => ({ severity, count: counts[severity] }));

    return {
      total: list.length,
      entries
    };
  }

  function summarizeIssuesByField(issues) {
    const list = Array.isArray(issues) ? issues : [];
    const counts = {};

    list.forEach((issue) => {
      const normalized = normalizeIssueObject(issue, issue && issue.source);
      const key = normalized.field || "__none__";
      counts[key] = (counts[key] || 0) + 1;
    });

    return Object.keys(counts)
      .sort()
      .map((field) => ({
        field: field === "__none__" ? "" : field,
        count: counts[field]
      }));
  }

  function buildDryRunIntegritySummary(stageResult) {
    const stage = stageResult && typeof stageResult === "object" ? stageResult : {};
    const summary = stage.summary && typeof stage.summary === "object" ? stage.summary : {};
    const mappingReport = stage.mappingReport && typeof stage.mappingReport === "object" ? stage.mappingReport : {};

    const collectedIssues = collectStageIssues(stage);
    const byCode = summarizeIssuesByCode(collectedIssues);
    const topIssueCodes = byCode.entries
      .slice()
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.code.localeCompare(b.code);
      })
      .slice(0, 5)
      .map((row) => row.code);

    return {
      schemaVersion: getSchemaVersion(stage, null),
      stageIsValid: stage.isValid === true,
      canProceed: stage.canProceed === true,
      totalRows: Number(summary.totalRows) || (Array.isArray(stage.rowReports) ? stage.rowReports.length : 0),
      acceptedRowCount: Number(summary.acceptedRowCount) || (Array.isArray(stage.acceptedRecords) ? stage.acceptedRecords.length : 0),
      rejectedRowCount: Number(summary.rejectedRowCount) || (Array.isArray(stage.rejectedRows) ? stage.rejectedRows.length : 0),
      warningCount: Number(summary.warningCount) || collectedIssues.filter((issue) => issue.severity === "warning").length,
      errorCount: Number(summary.errorCount) || collectedIssues.filter((issue) => issue.severity === "error").length,
      topIssueCodes,
      duplicateMappingCount: Number(summary.duplicateMappingCount) || (Array.isArray(mappingReport.duplicateAssignments) ? mappingReport.duplicateAssignments.length : 0),
      missingRequiredMappingCount: Number(summary.missingRequiredMappingCount) || (Array.isArray(mappingReport.missingRequiredFields) ? mappingReport.missingRequiredFields.length : 0),
      unmappedHeaderCount: Number(summary.unmappedHeaderCount) || (Array.isArray(mappingReport.unmappedHeaders) ? mappingReport.unmappedHeaders.length : 0),
      issueCountsBySeverity: summarizeIssuesBySeverity(collectedIssues).entries,
      issueCountsByField: summarizeIssuesByField(collectedIssues)
    };
  }

  function buildAdapterCompatibilitySummary(adaptedRuntimeResult, stageResult) {
    const adapted = adaptedRuntimeResult && typeof adaptedRuntimeResult === "object" ? adaptedRuntimeResult : {};
    const stage = stageResult && typeof stageResult === "object" ? stageResult : {};

    const adaptedCount = Array.isArray(adapted.records) ? adapted.records.length : 0;
    const invalidCount = Number.isInteger(adapted.invalidRecordCount) ? adapted.invalidRecordCount : 0;
    const stageAcceptedCount = Array.isArray(stage.acceptedRecords) ? stage.acceptedRecords.length : 0;
    const sourceRowCount = stage.manifest && Number.isInteger(stage.manifest.sourceRowCount)
      ? stage.manifest.sourceRowCount
      : (adapted.manifest && Number.isInteger(adapted.manifest.sourceRowCount) ? adapted.manifest.sourceRowCount : 0);

    return {
      adaptedRecordCount: adaptedCount,
      invalidRecordCount: invalidCount,
      stageAcceptedCount,
      sourceRowCount,
      schemaVersion: getSchemaVersion(stage, adapted)
    };
  }

  function buildManifestDiagnostics(manifest) {
    const input = manifest && typeof manifest === "object" ? manifest : {};
    return {
      schemaVersion: typeof input.schemaVersion === "string" && input.schemaVersion.trim()
        ? input.schemaVersion
        : getSchemaVersion(null, null),
      generatedAt: new Date().toISOString(),
      importMode: typeof input.importMode === "string" ? input.importMode : "dry_run",
      transport: typeof input.transport === "string" ? input.transport : "in_memory_stage",
      sourceFilename: typeof input.sourceFilename === "string" ? input.sourceFilename : "",
      presetUsed: typeof input.presetUsed === "string" ? input.presetUsed : "canonical",
      sourceHeaderCount: Number.isInteger(input.sourceHeaderCount) ? input.sourceHeaderCount : 0,
      sourceRowCount: Number.isInteger(input.sourceRowCount) ? input.sourceRowCount : 0
    };
  }

  const ingestionDiagnostics = Object.freeze({
    collectStageIssues,
    summarizeIssuesByCode,
    summarizeIssuesBySeverity,
    buildDryRunIntegritySummary,
    buildAdapterCompatibilitySummary,
    buildManifestDiagnostics
  });

  if (globalScope) {
    globalScope.ingestionDiagnostics = ingestionDiagnostics;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ingestionDiagnostics;
  }

  void stageApi;
  void adapterApi;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));