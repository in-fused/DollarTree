/* ================= EXPORT SNAPSHOT / ANALYTICS ================= */

function slugifyExportName(value) {
  return String(value || "project")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}

function buildAnalyticsExportBaseName(snapshot = null) {
  const payload = snapshot || (typeof getProjectAnalyticsSnapshot === "function" ? getProjectAnalyticsSnapshot() : null);
  const projectName = payload?.projectName || currentProjectMeta?.name || currentProjectId || "project";
  const scopeName = payload?.scopeLabel || "scope";
  const date = new Date(payload?.generatedAt || Date.now()).toISOString().slice(0, 10);
  return `${slugifyExportName(projectName)}-${slugifyExportName(scopeName)}-analytics-${date}`;
}

function downloadExportBlob(filename, blob) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function downloadExportText(filename, text, mimeType = "text/plain;charset=utf-8") {
  downloadExportBlob(filename, new Blob([text], { type: mimeType }));
}

function buildAnalyticsCsvRows(snapshot = null) {
  const payload = snapshot || (typeof getProjectAnalyticsSnapshot === "function" ? getProjectAnalyticsSnapshot() : null);
  if (!payload) return [];

  return [
    ["Project ID", payload.projectId || ""],
    ["Project Name", payload.projectName || ""],
    ["Project Source", payload.projectSourceLabel || ""],
    ["Generated At", payload.generatedAt || ""],
    ["Scope Label", payload.scopeLabel || ""],
    ["Current View", payload.currentView || ""],
    ["National Overview", payload.nationalOverviewEnabled === true ? "Yes" : "No"],
    ["Region Filter", payload.filters?.region || ""],
    ["Territory Filter", payload.filters?.territory || ""],
    ["State Filter", payload.filters?.state || ""],
    ["Removed Visible", payload.filters?.showRemovedStores === true ? "Yes" : "No"],
    ["Total Stores", payload.statusCounts?.totalStores ?? ""],
    ["Active", payload.statusCounts?.active ?? ""],
    ["Rescheduled", payload.statusCounts?.rescheduled ?? ""],
    ["Completed", payload.statusCounts?.completed ?? ""],
    ["Closed", payload.statusCounts?.closed ?? ""],
    ["Open Work", payload.statusCounts?.openWorkCount ?? ""],
    ["Completion Rate", payload.execution?.completionRate ?? ""],
    ["Actionable / Open Work Rate", payload.execution?.actionableRate ?? ""],
    ["Completed Today", payload.execution?.completedToday ?? ""],
    ["Average Completed Per Day", payload.execution?.avgCompletedPerDay ?? ""],
    ["ETA Days", payload.execution?.etaDays ?? ""],
    ["Note Coverage Count", payload.coverage?.noteCoverageCount ?? ""],
    ["Photo Coverage Count", payload.coverage?.photoCoverageCount ?? ""],
    ["Activity Coverage Count", payload.coverage?.activityCoverageCount ?? ""],
    ["Recent Follow-up Coverage Count", payload.coverage?.recentActivityCoverageCount ?? ""],
    ["Note Coverage Rate", payload.coverage?.noteCoverageRate ?? ""],
    ["Photo Coverage Rate", payload.coverage?.photoCoverageRate ?? ""],
    ["Activity Coverage Rate", payload.coverage?.activityCoverageRate ?? ""],
    ["Recent Follow-up Coverage Rate", payload.coverage?.recentActivityCoverageRate ?? ""],
    ["Attention Needed", payload.attention?.attentionNeededCount ?? ""],
    ["Integrity Issue Count", payload.attention?.integrityIssueCount ?? ""],
    ["Integrity Issue Rate", payload.attention?.integrityIssueRate ?? ""],
    ["Stores With No Updates", payload.attention?.storesWithNoUpdates ?? ""],
    ["Stores With Notes But No Photos", payload.attention?.storesWithNotesNoPhotos ?? ""],
    ["Stores With Photos But No Notes", payload.attention?.storesWithPhotosNoNotes ?? ""],
    ["Stalled Active", payload.attention?.stalledActiveCount ?? ""],
    ["Rescheduled With No Reason", payload.attention?.rescheduledNoReasonCount ?? ""],
    ["Rescheduled With No Recent Follow-up", payload.attention?.rescheduledNoRecentFollowUpCount ?? ""]
  ];
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function serializeAnalyticsSnapshotToCsv(snapshot = null) {
  const rows = buildAnalyticsCsvRows(snapshot);
  return ["metric,value", ...rows.map(([metric, value]) => `${escapeCsvValue(metric)},${escapeCsvValue(value)}`)].join("\n");
}

function exportProjectAnalyticsCsv() {
  if (typeof getProjectAnalyticsSnapshot !== "function") return;
  const snapshot = getProjectAnalyticsSnapshot();
  const filename = `${buildAnalyticsExportBaseName(snapshot)}.csv`;
  const csv = serializeAnalyticsSnapshotToCsv(snapshot);
  downloadExportText(filename, csv, "text/csv;charset=utf-8");
}

function exportProjectAnalyticsJson() {
  if (typeof getProjectAnalyticsSnapshot !== "function") return;
  const snapshot = getProjectAnalyticsSnapshot();
  const filename = `${buildAnalyticsExportBaseName(snapshot)}.json`;
  downloadExportText(filename, JSON.stringify(snapshot, null, 2), "application/json;charset=utf-8");
}

function bindAnalyticsExportControls() {
  const csvBtn = document.getElementById("exportAnalyticsCsvBtn");
  const jsonBtn = document.getElementById("exportAnalyticsJsonBtn");

  if (csvBtn && !csvBtn.dataset.bound) {
    csvBtn.addEventListener("click", exportProjectAnalyticsCsv);
    csvBtn.dataset.bound = "true";
  }

  if (jsonBtn && !jsonBtn.dataset.bound) {
    jsonBtn.addEventListener("click", exportProjectAnalyticsJson);
    jsonBtn.dataset.bound = "true";
  }
}

window.buildAnalyticsExportBaseName = buildAnalyticsExportBaseName;
window.buildAnalyticsCsvRows = buildAnalyticsCsvRows;
window.serializeAnalyticsSnapshotToCsv = serializeAnalyticsSnapshotToCsv;
window.exportProjectAnalyticsCsv = exportProjectAnalyticsCsv;
window.exportProjectAnalyticsJson = exportProjectAnalyticsJson;
window.bindAnalyticsExportControls = bindAnalyticsExportControls;

bindAnalyticsExportControls();