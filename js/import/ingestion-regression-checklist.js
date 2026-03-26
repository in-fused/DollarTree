/* ================= INGESTION REGRESSION CHECKLIST (PHASE 11.2.h) ================= */

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

  const stageApi = getDependency("ingestionStage", "./ingestion-stage.js");
  const adapterApi = getDependency("ingestionAdapter", "./ingestion-adapter.js");
  const diagnosticsApi = getDependency("ingestionDiagnostics", "./ingestion-diagnostics.js");

  const BASELINE_REGRESSION_CHECKLIST = Object.freeze([
    Object.freeze({
      id: "baseline-cluster-counts",
      area: "cluster counts",
      description: "Cluster count totals must remain identical to CURRENT MAIN for equivalent datasets and filters.",
      severity: "critical",
      expectedState: "unchanged"
    }),
    Object.freeze({
      id: "baseline-cluster-color-logic",
      area: "cluster color logic",
      description: "Cluster dominant-color and status-color rendering logic must remain unchanged.",
      severity: "critical",
      expectedState: "unchanged"
    }),
    Object.freeze({
      id: "baseline-supabase-hydration",
      area: "Supabase hydration",
      description: "Supabase-backed hydration order and data shape compatibility must remain unchanged.",
      severity: "critical",
      expectedState: "unchanged"
    }),
    Object.freeze({
      id: "baseline-notes",
      area: "notes",
      description: "Store notes retrieval, display, and persistence behavior must remain unchanged.",
      severity: "warning",
      expectedState: "unchanged"
    }),
    Object.freeze({
      id: "baseline-photos",
      area: "photos",
      description: "Photo retrieval, display, and evidence handling behavior must remain unchanged.",
      severity: "warning",
      expectedState: "unchanged"
    }),
    Object.freeze({
      id: "baseline-activity-feed",
      area: "activity feed",
      description: "Activity feed ordering and rendering behavior must remain unchanged.",
      severity: "warning",
      expectedState: "unchanged"
    }),
    Object.freeze({
      id: "baseline-search-fly-to",
      area: "search fly-to",
      description: "Search selection and fly-to map behavior must remain unchanged.",
      severity: "warning",
      expectedState: "unchanged"
    }),
    Object.freeze({
      id: "baseline-modal-behavior",
      area: "modal behavior",
      description: "Modal open/close interactions and focus behavior must remain unchanged.",
      severity: "warning",
      expectedState: "unchanged"
    }),
    Object.freeze({
      id: "baseline-mobile-layout",
      area: "mobile layout",
      description: "Mobile layout breakpoints and production visual behavior must remain unchanged.",
      severity: "critical",
      expectedState: "unchanged"
    }),
    Object.freeze({
      id: "baseline-route-builder",
      area: "route builder",
      description: "Route builder sequencing, generation, and interaction behavior must remain unchanged.",
      severity: "critical",
      expectedState: "unchanged"
    }),
    Object.freeze({
      id: "baseline-executive-mode",
      area: "executive mode",
      description: "Executive mode toggles, overlays, and map-summary behavior must remain unchanged.",
      severity: "critical",
      expectedState: "unchanged"
    }),
    Object.freeze({
      id: "baseline-snapshot-export",
      area: "snapshot export",
      description: "Snapshot export rendering and print/PDF behavior must remain unchanged.",
      severity: "critical",
      expectedState: "unchanged"
    }),
    Object.freeze({
      id: "baseline-analytics-export",
      area: "analytics CSV/JSON export",
      description: "Analytics CSV/JSON schema and export behavior must remain unchanged.",
      severity: "critical",
      expectedState: "unchanged"
    })
  ]);

  const INGESTION_ISOLATION_CHECKLIST = Object.freeze([
    Object.freeze({
      id: "ingestion-no-live-mutation",
      area: "ingestion isolation",
      description: "Ingestion pipeline must not mutate live runtime app state.",
      severity: "critical",
      expectedState: "enforced"
    }),
    Object.freeze({
      id: "ingestion-no-ui-wiring",
      area: "ingestion isolation",
      description: "No production UI wiring or runtime feature toggles are introduced in this phase.",
      severity: "warning",
      expectedState: "enforced"
    }),
    Object.freeze({
      id: "ingestion-dry-run-only",
      area: "ingestion isolation",
      description: "Stage/import execution must remain dry-run only.",
      severity: "critical",
      expectedState: "enforced"
    }),
    Object.freeze({
      id: "ingestion-no-runtime-replacement",
      area: "ingestion isolation",
      description: "No automatic replacement of active runtime datasets is allowed.",
      severity: "critical",
      expectedState: "enforced"
    }),
    Object.freeze({
      id: "ingestion-no-auto-apply",
      area: "ingestion isolation",
      description: "No automatic apply/commit path is executed.",
      severity: "critical",
      expectedState: "enforced"
    }),
    Object.freeze({
      id: "ingestion-no-network-telemetry",
      area: "ingestion isolation",
      description: "Diagnostics remain local-only; no telemetry network calls are made.",
      severity: "warning",
      expectedState: "enforced"
    })
  ]);

  function cloneChecklistItems(items) {
    return items.map((item) => ({
      id: item.id,
      area: item.area,
      description: item.description,
      severity: item.severity,
      expectedState: item.expectedState
    }));
  }

  function getBaselineRegressionChecklist() {
    return cloneChecklistItems(BASELINE_REGRESSION_CHECKLIST);
  }

  function getIngestionIsolationChecklist() {
    return cloneChecklistItems(INGESTION_ISOLATION_CHECKLIST);
  }

  function buildRegressionChecklistSummary() {
    const baseline = getBaselineRegressionChecklist();
    const isolation = getIngestionIsolationChecklist();
    const all = baseline.concat(isolation);

    const criticalCount = all.filter((item) => item.severity === "critical").length;
    const warningCount = all.filter((item) => item.severity === "warning").length;

    return {
      totalItems: all.length,
      protectedAreaCount: baseline.length,
      ingestionIsolationCount: isolation.length,
      criticalCount,
      warningCount
    };
  }

  function deriveStageAudit(stageResult) {
    const stage = stageResult && typeof stageResult === "object" ? stageResult : {};
    const manifest = stage.manifest && typeof stage.manifest === "object" ? stage.manifest : {};
    const importMode = typeof manifest.importMode === "string" ? manifest.importMode : "";
    const transport = typeof manifest.transport === "string" ? manifest.transport : "";

    return {
      remainedDryRun: importMode === "dry_run" && transport === "in_memory_stage",
      importMode,
      transport
    };
  }

  function deriveAdapterAudit(adapterResult) {
    const adapted = adapterResult && typeof adapterResult === "object" ? adapterResult : {};
    const summary = adapted.summary && typeof adapted.summary === "object" ? adapted.summary : {};

    const hasRecordsArray = Array.isArray(adapted.records);
    const hasInvalidCount = Number.isInteger(adapted.invalidRecordCount);
    const noApplySignal = !("applied" in adapted) && !("committed" in adapted);

    return {
      remainedNonInvasive: hasRecordsArray && hasInvalidCount && noApplySignal,
      adaptedRecordCount: hasRecordsArray ? adapted.records.length : 0,
      invalidRecordCount: hasInvalidCount ? adapted.invalidRecordCount : 0,
      stageAcceptedCount: Number.isInteger(summary.stageAcceptedCount) ? summary.stageAcceptedCount : 0
    };
  }

  function deriveDiagnosticsAudit(diagnosticsOutput) {
    const diagnostics = diagnosticsOutput && typeof diagnosticsOutput === "object" ? diagnosticsOutput : {};

    const hasNetworkFields = Object.prototype.hasOwnProperty.call(diagnostics, "endpoint")
      || Object.prototype.hasOwnProperty.call(diagnostics, "url")
      || Object.prototype.hasOwnProperty.call(diagnostics, "request");

    return {
      remainedLocalOnly: !hasNetworkFields,
      hasNetworkFields
    };
  }

  function buildIngestionAuditSnapshot(stageResult, adapterResult, diagnosticsOutput) {
    const stageAudit = deriveStageAudit(stageResult);
    const adapterAudit = deriveAdapterAudit(adapterResult);
    const diagnosticsAudit = deriveDiagnosticsAudit(diagnosticsOutput);

    const checklistSummary = buildRegressionChecklistSummary();

    return {
      stageRemainedDryRun: stageAudit.remainedDryRun,
      adapterRemainedNonInvasive: adapterAudit.remainedNonInvasive,
      diagnosticsRemainedLocalOnly: diagnosticsAudit.remainedLocalOnly,
      checklistCoverageSummary: checklistSummary,
      details: {
        stage: stageAudit,
        adapter: adapterAudit,
        diagnostics: diagnosticsAudit
      }
    };
  }

  const ingestionRegressionChecklist = Object.freeze({
    getBaselineRegressionChecklist,
    getIngestionIsolationChecklist,
    buildRegressionChecklistSummary,
    buildIngestionAuditSnapshot
  });

  if (globalScope) {
    globalScope.ingestionRegressionChecklist = ingestionRegressionChecklist;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ingestionRegressionChecklist;
  }

  void stageApi;
  void adapterApi;
  void diagnosticsApi;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));