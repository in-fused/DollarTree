/* ================= DASHBOARD / INTEL ================= */

const RECENT_ACTIVITY_WINDOW_DAYS = 14;

function calculateAverageCompletedPerDay(events) {
  const dated = events.filter(item => !!item.timestamp);
  if (dated.length === 0) return 0;

  const uniqueDays = new Set(
    dated.map(item => {
      const d = new Date(item.timestamp);
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }).filter(Boolean)
  );

  return uniqueDays.size > 0 ? dated.length / uniqueDays.size : 0;
}

function formatPercent(value) {
  return `${Number.isFinite(value) ? value.toFixed(1) : '0.0'}%`;
}

function getDashboardProjectConfig() {
  const fallbackConfig = {
    project_type: "operations",
    intelligence_mode: "reset_analytics",
    landing_mode: "operations",
    terminology: {},
    copy: {}
  };

  if (typeof getActiveProjectConfig !== "function") {
    return fallbackConfig;
  }

  try {
    const config = getActiveProjectConfig();
    return config && typeof config === "object" ? config : fallbackConfig;
  } catch (error) {
    console.warn("Project config unavailable; using operations intelligence mode.", error);
    return fallbackConfig;
  }
}

function getDashboardTerminology() {
  return getDashboardProjectConfig()?.terminology || {};
}

function isTcgDashboardMode(config = getDashboardProjectConfig()) {
  if (typeof isTcgProjectConfig === "function") {
    try {
      return isTcgProjectConfig(config);
    } catch (error) {
      console.warn("Project config invalid; using operations intelligence mode.", error);
      return false;
    }
  }

  return String(currentProjectId || "").trim() === "gotta-catch-em-all"
    && String(config?.intelligence_mode || "") === "tcg_feed";
}

function escapeDashboardHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateDashboardText(value, maxLength = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function getScopedRowCount(rows, filteredIds) {
  return (Array.isArray(rows) ? rows : []).filter(row => filteredIds.has(String(row?.store_id || ""))).length;
}

function getRecentActivityThreshold() {
  const date = new Date();
  date.setDate(date.getDate() - RECENT_ACTIVITY_WINDOW_DAYS);
  return date.getTime();
}

function buildStoreAnalyticsMaps(filteredIds) {
  const notesByStore = new Map();
  const photosByStore = new Map();
  const activityByStore = new Map();
  const recentActivityByStore = new Map();
  const recentThreshold = getRecentActivityThreshold();

  const upsert = (targetMap, storeId, value = 1) => {
    if (!filteredIds.has(storeId)) return;
    targetMap.set(storeId, (targetMap.get(storeId) || 0) + value);
  };

  const markRecent = (storeId, timestamp) => {
    if (!filteredIds.has(storeId)) return;
    const ts = getTimestampValue(timestamp);
    if (ts >= recentThreshold) {
      recentActivityByStore.set(storeId, true);
    }
  };

  noteRowsCache.forEach(row => {
    const storeId = String(row.store_id);
    upsert(notesByStore, storeId);
    upsert(activityByStore, storeId);
    markRecent(storeId, row.created_at || row.updated_at || null);
  });

  photoRowsCache.forEach(row => {
    const storeId = String(row.store_id);
    upsert(photosByStore, storeId);
    upsert(activityByStore, storeId);
    markRecent(storeId, row.created_at || row.updated_at || null);
  });

  activityFeed.forEach(item => {
    const storeId = String(item.store_id || "");
    if (!filteredIds.has(storeId)) return;
    upsert(activityByStore, storeId);
    markRecent(storeId, item.timestamp || null);
  });

  return { notesByStore, photosByStore, activityByStore, recentActivityByStore };
}

function getScopeMetrics() {
  const filteredStores = getFilteredStores();
  const filteredIds = new Set(filteredStores.map(store => String(store.store_id)));
  const { notesByStore, photosByStore, activityByStore, recentActivityByStore } = buildStoreAnalyticsMaps(filteredIds);

  let active = 0;
  let rescheduled = 0;
  let completed = 0;
  let closed = 0;
  let integrityIssueCount = 0;
  let storesWithNoUpdates = 0;
  let storesWithNotesNoPhotos = 0;
  let storesWithPhotosNoNotes = 0;
  let stalledActiveCount = 0;
  let rescheduledNoReasonCount = 0;
  let rescheduledNoRecentFollowUpCount = 0;

  filteredStores.forEach(store => {
    const storeId = String(store.store_id);
    const status = statusMap[storeId] || getStatusState("active");
    const statusCode = normalizeStatusCode(status.status_code);
    const noteCount = notesByStore.get(storeId) || 0;
    const photoCount = photosByStore.get(storeId) || 0;
    const activityCount = activityByStore.get(storeId) || 0;
    const hasRecentActivity = recentActivityByStore.get(storeId) === true;
    const hasReason = String(status.status_reason || "").trim().length > 0;
    const integrityIssues = typeof getStoreIntegrityIssues === "function"
      ? getStoreIntegrityIssues(store, statusMap)
      : [];

    if (statusCode === "completed") completed += 1;
    else if (statusCode === "closed") closed += 1;
    else if (statusCode === "rescheduled") rescheduled += 1;
    else active += 1;

    if (integrityIssues.length > 0) integrityIssueCount += 1;
    if (noteCount === 0 && photoCount === 0 && activityCount === 0) storesWithNoUpdates += 1;
    if (noteCount > 0 && photoCount === 0) storesWithNotesNoPhotos += 1;
    if (photoCount > 0 && noteCount === 0) storesWithPhotosNoNotes += 1;
    if (statusCode === "active" && noteCount === 0 && photoCount === 0 && activityCount === 0) stalledActiveCount += 1;
    if (statusCode === "rescheduled" && !hasReason) rescheduledNoReasonCount += 1;
    if (statusCode === "rescheduled" && !hasRecentActivity) rescheduledNoRecentFollowUpCount += 1;
  });

  const totalStores = filteredStores.length;
  const openWorkCount = active + rescheduled;
  const actionableTotal = totalStores - closed;
  const completionRate = actionableTotal > 0 ? (completed / actionableTotal) * 100 : 0;
  const actionableRate = totalStores > 0 ? (openWorkCount / totalStores) * 100 : 0;
  const noteCoverageCount = notesByStore.size;
  const photoCoverageCount = photosByStore.size;
  const activityCoverageCount = activityByStore.size;
  const recentActivityCoverageCount = recentActivityByStore.size;
  const noteCoverageRate = totalStores > 0 ? (noteCoverageCount / totalStores) * 100 : 0;
  const photoCoverageRate = totalStores > 0 ? (photoCoverageCount / totalStores) * 100 : 0;
  const activityCoverageRate = totalStores > 0 ? (activityCoverageCount / totalStores) * 100 : 0;
  const recentActivityCoverageRate = totalStores > 0 ? (recentActivityCoverageCount / totalStores) * 100 : 0;
  const integrityIssueRate = totalStores > 0 ? (integrityIssueCount / totalStores) * 100 : 0;

  const completedEvents = activityFeed.filter(item =>
    item.type === "status-completed" && filteredIds.has(String(item.store_id))
  );

  const completedToday = completedEvents.filter(item => isToday(item.timestamp)).length;
  const avgPerDay = calculateAverageCompletedPerDay(completedEvents);
  const etaDays = avgPerDay > 0 ? openWorkCount / avgPerDay : null;
  const filteredPhotoCount = photoRowsCache.filter(row => filteredIds.has(String(row.store_id))).length;

  const attentionNeededCount = stalledActiveCount + rescheduledNoReasonCount + rescheduledNoRecentFollowUpCount + integrityIssueCount;

  return {
    filteredStores,
    filteredIds,
    totalStores,
    active,
    rescheduled,
    completed,
    closed,
    openWorkCount,
    completionRate,
    actionableRate,
    completedToday,
    avgPerDay,
    etaDays,
    filteredPhotoCount,
    noteCoverageCount,
    photoCoverageCount,
    activityCoverageCount,
    recentActivityCoverageCount,
    noteCoverageRate,
    photoCoverageRate,
    activityCoverageRate,
    recentActivityCoverageRate,
    integrityIssueCount,
    integrityIssueRate,
    storesWithNoUpdates,
    storesWithNotesNoPhotos,
    storesWithPhotosNoNotes,
    stalledActiveCount,
    rescheduledNoReasonCount,
    rescheduledNoRecentFollowUpCount,
    attentionNeededCount
  };
}

function getProjectAnalyticsSnapshot() {
  const metrics = getScopeMetrics();
  return {
    projectId: currentProjectId,
    projectName: currentProjectMeta?.name || currentProjectId,
    generatedAt: new Date().toISOString(),
    scopeLabel: getCurrentScopeLabel(metrics),
    metrics: {
      totalStores: metrics.totalStores,
      active: metrics.active,
      rescheduled: metrics.rescheduled,
      completed: metrics.completed,
      closed: metrics.closed,
      openWorkCount: metrics.openWorkCount,
      completionRate: Number(metrics.completionRate.toFixed(2)),
      actionableRate: Number(metrics.actionableRate.toFixed(2)),
      noteCoverageRate: Number(metrics.noteCoverageRate.toFixed(2)),
      photoCoverageRate: Number(metrics.photoCoverageRate.toFixed(2)),
      activityCoverageRate: Number(metrics.activityCoverageRate.toFixed(2)),
      recentActivityCoverageRate: Number(metrics.recentActivityCoverageRate.toFixed(2)),
      integrityIssueCount: metrics.integrityIssueCount,
      integrityIssueRate: Number(metrics.integrityIssueRate.toFixed(2)),
      storesWithNoUpdates: metrics.storesWithNoUpdates,
      storesWithNotesNoPhotos: metrics.storesWithNotesNoPhotos,
      storesWithPhotosNoNotes: metrics.storesWithPhotosNoNotes,
      stalledActiveCount: metrics.stalledActiveCount,
      rescheduledNoReasonCount: metrics.rescheduledNoReasonCount,
      rescheduledNoRecentFollowUpCount: metrics.rescheduledNoRecentFollowUpCount,
      completedToday: metrics.completedToday,
      avgCompletedPerDay: Number(metrics.avgPerDay.toFixed(2)),
      etaDays: metrics.etaDays !== null ? Number(metrics.etaDays.toFixed(2)) : null,
      attentionNeededCount: metrics.attentionNeededCount
    }
  };
}

function buildOperationalSummary(metrics) {
  if (metrics.totalStores === 0) return "No stores loaded";
  if (isTcgDashboardMode()) {
    const scopedSightings = getScopedRowCount(noteRowsCache, metrics.filteredIds);
    return `${metrics.totalStores.toLocaleString()} stores tracked - ${scopedSightings.toLocaleString()} sightings - ${metrics.filteredPhotoCount.toLocaleString()} photos - ${metrics.storesWithNoUpdates.toLocaleString()} need a check`;
  }
  return `${metrics.totalStores.toLocaleString()} stores • ${metrics.completed.toLocaleString()} completed • ${metrics.openWorkCount.toLocaleString()} open work • ${metrics.attentionNeededCount.toLocaleString()} attention signals`;
}

function getCurrentScopeLabel(metrics) {
  const parts = [];
  parts.push(nationalOverviewEnabled ? "National View" : "Project View");

  if (showRemovedStores === true) {
    parts.push("Removed Visible");
  }

  if (activeFilters.region) parts.push(activeFilters.region);
  if (activeFilters.territory) parts.push(activeFilters.territory);
  if (activeFilters.state) parts.push(activeFilters.state);
  if (activeFilters.status) {
    const label = activeFilters.status.charAt(0).toUpperCase() + activeFilters.status.slice(1);
    parts.push(label);
  }
  if (metrics.totalStores > 0) parts.push(`${metrics.totalStores.toLocaleString()} stores`);

  return parts.join(" • ");
}

function getWorkspaceProgressContext(metrics) {
  if (metrics.totalStores === 0) return "Awaiting project data";
  if (isTcgDashboardMode()) {
    return `${metrics.noteCoverageCount.toLocaleString()} stores with sightings - ${formatPercent(metrics.recentActivityCoverageRate)} recent activity - ${metrics.storesWithNoUpdates.toLocaleString()} never updated`;
  }
  if (metrics.avgPerDay > 0 && metrics.etaDays !== null) {
    return `${metrics.avgPerDay.toFixed(1)}/day pace • ETA ${formatEta(metrics.etaDays)} • ${formatPercent(metrics.recentActivityCoverageRate)} recent follow-up coverage`;
  }
  return `${formatPercent(metrics.noteCoverageRate)} note coverage • ${formatPercent(metrics.photoCoverageRate)} photo coverage • ${metrics.attentionNeededCount.toLocaleString()} attention signals`;
}

function getHeaderViewModeLabel() {
  const config = getDashboardProjectConfig();
  const terminology = config?.terminology || {};

  if (currentWorkspaceView === "photos") return "Photo Evidence Review";
  if (currentWorkspaceView === "intelligence") {
    return isTcgDashboardMode(config)
      ? (terminology.intelligenceHeaderLabel || "TCG Hunting Intel")
      : "Intelligence Dashboard";
  }
  return isTcgDashboardMode(config) ? "Store Hunt Map" : "Map Operations";
}

function updateHeaderMetaAndSummaries() {
  const metrics = getScopeMetrics();
  setText("headerScopeSummary", getCurrentScopeLabel(metrics));
  setText("headerOperationalSummary", buildOperationalSummary(metrics));
  setText("headerViewModeText", getHeaderViewModeLabel());
  setText("headerLastUpdatedText", formatLastUpdated(lastDataRefreshAt));
  setText("workspaceProgressContext", getWorkspaceProgressContext(metrics));
  setText("photoLibraryScopeBadge", metrics.totalStores > 0 ? `${metrics.totalStores.toLocaleString()} in scope` : "No Stores");
  setText("photoLibraryModeBadge", currentPhotoLibrarySelection ? "Inspection" : "Review");
  if (currentWorkspaceView === "intelligence") {
    renderIntelligenceDashboard();
  }
}

function updateHeaderDashboard() {
  const metrics = getScopeMetrics();
  const config = getDashboardProjectConfig();
  const isTcgMode = isTcgDashboardMode(config);
  const projectViewLabel = nationalOverviewEnabled ? "National Overview" : "Project View";
  const headerSubline = isTcgMode
    ? `${config?.copy?.headerSublinePrefix || "TCG hunting intel"} - ${config?.copy?.projectPurpose || "Track stores, restocks, new drops, and sightings"} - ${projectViewLabel}`
    : `Operational visibility • ${currentProjectMeta?.sourceLabel || "Project ready"} • ${projectViewLabel}`;

  setText("dashboardProjectName", currentProjectMeta?.name || currentProjectId);
  setText("dashboardProjectSubline", headerSubline);
  setText("dashboardTotalStores", metrics.totalStores.toLocaleString());
  setText("dashboardCompletedStores", metrics.completed.toLocaleString());
  setText("dashboardActiveStores", metrics.active.toLocaleString());
  setText("dashboardClosedStores", metrics.closed.toLocaleString());
  setText("dashboardStoresToday", metrics.completedToday.toLocaleString());
  setText("dashboardAvgPerDay", metrics.avgPerDay > 0 ? metrics.avgPerDay.toFixed(1) : "—");
  setText("dashboardPhotoCount", metrics.filteredPhotoCount.toLocaleString());
  setText("dashboardEta", metrics.etaDays !== null ? formatEta(metrics.etaDays) : "—");
  setText(
    "dashboardProgressLabel",
    isTcgMode
      ? `${metrics.storesWithNoUpdates.toLocaleString()} need check - ${metrics.noteCoverageCount.toLocaleString()} stores with sightings`
      : `${formatPercent(metrics.completionRate)} complete • ${formatPercent(metrics.actionableRate)} open work`
  );

  const fill = document.getElementById("dashboardProgressFill");
  if (fill) fill.style.width = `${metrics.completionRate}%`;

  updateHeaderMetaAndSummaries();
}

function updateScopeSummary() {
  const metrics = getScopeMetrics();

  setText("scopeStoreCountPill", metrics.totalStores.toLocaleString());
  setText("scopeVisibleStores", metrics.totalStores.toLocaleString());
  setText("scopeVisibleCompleted", metrics.completed.toLocaleString());
  setText("scopeVisibleActive", metrics.active.toLocaleString());
  setText("scopeVisibleClosed", metrics.closed.toLocaleString());
  setText("scopeVisibleRescheduled", metrics.rescheduled.toLocaleString());
  setText("scopeVisibleNoUpdates", metrics.storesWithNoUpdates.toLocaleString());
  setText("scopeVisibleNoteCoverage", formatPercent(metrics.noteCoverageRate));
  setText("scopeVisiblePhotoCoverage", formatPercent(metrics.photoCoverageRate));
  setText("scopeVisibleAttention", metrics.attentionNeededCount.toLocaleString());
}

function updateIntelRail() {
  const metrics = getScopeMetrics();
  if (typeof applyProjectTerminologyUi === "function") {
    applyProjectTerminologyUi();
  }

  setText("intelScopeMode", nationalOverviewEnabled ? "National" : "Project");
  setText("intelVisibleStores", metrics.totalStores.toLocaleString());
  setText("intelCompletionRate", formatPercent(metrics.completionRate));
  setText("intelPhotoCount", metrics.filteredPhotoCount.toLocaleString());
  setText("intelEtaValue", metrics.etaDays !== null ? formatEta(metrics.etaDays) : "—");
  setText("intelCompletedStores", metrics.completed.toLocaleString());
  setText("intelActiveStores", metrics.active.toLocaleString());
  setText("intelClosedStores", metrics.closed.toLocaleString());
  setText("intelCompletedToday", metrics.completedToday.toLocaleString());
  setText("intelRescheduledStores", metrics.rescheduled.toLocaleString());
  setText("intelOpenWorkStores", metrics.openWorkCount.toLocaleString());
  setText("intelNoteCoverage", formatPercent(metrics.noteCoverageRate));
  setText("intelRecentCoverage", formatPercent(metrics.recentActivityCoverageRate));
  setText("intelAttentionCount", metrics.attentionNeededCount.toLocaleString());
  setText("intelIntegrityIssues", metrics.integrityIssueCount.toLocaleString());
  setText("intelNoUpdates", metrics.storesWithNoUpdates.toLocaleString());
  setText("intelNotesNoPhotos", metrics.storesWithNotesNoPhotos.toLocaleString());
  setText("intelPhotosNoNotes", metrics.storesWithPhotosNoNotes.toLocaleString());
  setText("intelHealthSummary", `${metrics.stalledActiveCount.toLocaleString()} stalled active • ${metrics.rescheduledNoRecentFollowUpCount.toLocaleString()} rescheduled lacking recent follow-up`);
  renderIntelTopAttentionStores();
  renderIntelligenceDashboard();

  if (!currentSelectedStoreId) {
    resetSelectedStorePanel();
  }
}

window.getProjectAnalyticsSnapshot = getProjectAnalyticsSnapshot;
/* ================= STORE INTELLIGENCE (PHASE 12.1) ================= */

function getStoreIntelligenceSnapshot() {
  const metrics = getScopeMetrics();

  const { notesByStore, photosByStore, activityByStore, recentActivityByStore } =
    buildStoreAnalyticsMaps(metrics.filteredIds);

  const stores = metrics.filteredStores.map(store => {
    const storeId = String(store.store_id);

    const status = statusMap[storeId] || {};
    const statusCode = normalizeStatusCode(
      status.status_code,
      status.completed === true,
      status.closed === true
    );

    const noteCount = notesByStore.get(storeId) || 0;
    const photoCount = photosByStore.get(storeId) || 0;
    const activityCount = activityByStore.get(storeId) || 0;
    const hasRecentActivity = recentActivityByStore.get(storeId) === true;

    const hasReason = String(status.status_reason || "").trim().length > 0;

    const integrityIssues = typeof getStoreIntegrityIssues === "function"
      ? getStoreIntegrityIssues(store, statusMap)
      : [];

    const flags = {
      noUpdates: noteCount === 0 && photoCount === 0 && activityCount === 0,
      notesNoPhotos: noteCount > 0 && photoCount === 0,
      photosNoNotes: photoCount > 0 && noteCount === 0,
      stalledActive: statusCode === "active" && noteCount === 0 && photoCount === 0 && activityCount === 0,
      rescheduledNoReason: statusCode === "rescheduled" && !hasReason,
      rescheduledNoRecentFollowUp: statusCode === "rescheduled" && !hasRecentActivity,
      hasIntegrityIssues: integrityIssues.length > 0
    };

    let score = 0;

    if (flags.noUpdates) score += 5;
    if (flags.stalledActive) score += 4;
    if (flags.rescheduledNoReason) score += 3;
    if (flags.rescheduledNoRecentFollowUp) score += 3;
    if (flags.notesNoPhotos) score += 2;
    if (flags.photosNoNotes) score += 2;
    if (flags.hasIntegrityIssues) score += 2;

    const severity =
      score >= 9 ? "critical" :
      score >= 6 ? "high" :
      score >= 3 ? "medium" :
      "low";

    return {
      storeId,
      statusCode,
      noteCount,
      photoCount,
      activityCount,
      hasRecentActivity,
      integrityIssueCount: integrityIssues.length,
      flags,
      attentionScore: score,
      severity
    };
  });

  const ranked = stores.sort((a, b) => b.attentionScore - a.attentionScore);

  return {
    generatedAt: new Date().toISOString(),
    projectId: currentProjectId,
    projectName: currentProjectMeta?.name || currentProjectId,
    scopeLabel: getCurrentScopeLabel(metrics),
    totals: {
      storesInScope: stores.length,
      criticalCount: ranked.filter(s => s.severity === "critical").length,
      highCount: ranked.filter(s => s.severity === "high").length,
      mediumCount: ranked.filter(s => s.severity === "medium").length,
      lowCount: ranked.filter(s => s.severity === "low").length
    },
    stores: ranked
  };
}

window.getStoreIntelligenceSnapshot = getStoreIntelligenceSnapshot;
function buildAttentionReasonSummary(store) {
  if (!store || !store.flags) return "Follow-up needed";

  if (store.flags.stalledActive) return "Active • no updates";
  if (store.flags.rescheduledNoRecentFollowUp) return "Rescheduled • no recent follow-up";
  if (store.flags.rescheduledNoReason) return "Rescheduled • no reason logged";
  if (store.flags.noUpdates) return "No updates logged";
  if (store.flags.notesNoPhotos) return "Notes only • no photos";
  if (store.flags.photosNoNotes) return "Photos only • no notes";
  if (store.flags.hasIntegrityIssues) return "Integrity issues";
  return "Follow-up needed";
}

function setIntelligenceModeVisibility(mode) {
  const operationsMode = document.getElementById("operationsIntelligenceMode");
  const tcgMode = document.getElementById("tcgIntelligenceMode");
  const normalizedMode = mode === "tcg" ? "tcg" : "operations";

  if (operationsMode) operationsMode.classList.toggle("hidden", normalizedMode === "tcg");
  if (tcgMode) tcgMode.classList.toggle("hidden", normalizedMode !== "tcg");
}

const TCG_FRESHNESS_HOT_DAYS = 2;
const TCG_FRESHNESS_WARM_DAYS = RECENT_ACTIVITY_WINDOW_DAYS;
const tcgRetailerBoardCollapsedState = new Set();

const TCG_RETAILER_MATCHERS = Object.freeze([
  { pattern: /\bwalmart\b/i, label: "Walmart" },
  { pattern: /\btarget\b/i, label: "Target" },
  { pattern: /\bgamestop\b|\bgame\s*stop\b/i, label: "GameStop" },
  { pattern: /\bbest\s*buy\b/i, label: "Best Buy" },
  { pattern: /\bcostco\b/i, label: "Costco" },
  { pattern: /\bsam'?s\s*club\b/i, label: "Sam's Club" },
  { pattern: /\bbarnes\s*&?\s*noble\b/i, label: "Barnes & Noble" },
  { pattern: /\bbooks-a-million\b|\bbooks\s*a\s*million\b/i, label: "Books-A-Million" },
  { pattern: /\bwalgreens\b/i, label: "Walgreens" },
  { pattern: /\bcvs\b/i, label: "CVS" },
  { pattern: /\bmeijer\b/i, label: "Meijer" },
  { pattern: /\bpublix\b/i, label: "Publix" },
  { pattern: /\bcool\s*stuff\b/i, label: "CoolStuffInc" },
  { pattern: /\bcard\s*kingdom\b/i, label: "Card Kingdom" },
  { pattern: /\blocal\s*game\s*store\b|\blgs\b/i, label: "Local Game Store" }
]);

function getTcgRowsInScope(rows, filteredIds) {
  return (Array.isArray(rows) ? rows : [])
    .filter(row => filteredIds.has(String(row?.store_id || "")));
}

function getTcgTimestamp(row) {
  return row?.updated_at || row?.created_at || row?.timestamp || null;
}

function getTcgStoreById(storeId, metrics) {
  const normalizedStoreId = String(storeId || "");
  return metrics?.filteredStores?.find(store => String(store.store_id) === normalizedStoreId)
    || allStoreData.find(store => String(store.store_id) === normalizedStoreId)
    || storeData.find(store => String(store.store_id) === normalizedStoreId)
    || null;
}

function compactTcgText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getTcgSlug(value) {
  return compactTcgText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function toTcgTitleCase(value) {
  return compactTcgText(value)
    .toLowerCase()
    .replace(/\b([a-z])/g, match => match.toUpperCase())
    .replace(/\bTcg\b/g, "TCG")
    .replace(/\bCvs\b/g, "CVS");
}

function normalizeTcgRetailerLabel(value) {
  const text = compactTcgText(value);
  if (!text) return "";

  const known = TCG_RETAILER_MATCHERS.find(match => match.pattern.test(text));
  if (known) return known.label;

  const cleaned = text
    .replace(/\b(?:store|location)\s*#?\s*\d+\b/ig, "")
    .replace(/#\s*\d+\b/g, "")
    .replace(/\s+-\s+.*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned ? toTcgTitleCase(cleaned) : "";
}

function getTcgRetailerIdentity(store) {
  const candidates = [
    store?.retailer,
    store?.chain,
    store?.store_chain,
    store?.banner,
    store?.store_name,
    store?.market
  ];

  for (const candidate of candidates) {
    const label = normalizeTcgRetailerLabel(candidate);
    if (label) {
      return {
        key: getTcgSlug(label),
        label
      };
    }
  }

  return {
    key: "unassigned-retailer",
    label: "Unassigned Retailer"
  };
}

function getTcgStoreDisplayName(store, storeId) {
  const normalizedStoreId = String(storeId || store?.store_id || "").trim();
  const storeName = compactTcgText(store?.store_name);
  const retailer = getTcgRetailerIdentity(store);

  if (storeName && storeName !== retailer.label) return storeName;
  if (retailer.label && retailer.key !== "unassigned-retailer") {
    return normalizedStoreId ? `${retailer.label} Store ${normalizedStoreId}` : retailer.label;
  }
  return normalizedStoreId ? `Store ${normalizedStoreId}` : "Store";
}

function getTcgStoreLocationLine(store) {
  if (!store) return "Store location unavailable";

  const parts = [];
  if (store.full_address) parts.push(store.full_address);
  if (store.city || store.state) {
    const cityState = [store.city, store.state].filter(Boolean).join(", ");
    if (cityState && !compactTcgText(store.full_address).toLowerCase().includes(cityState.toLowerCase())) {
      parts.push(cityState);
    }
  }
  if (!parts.length && store.market) parts.push(`Market ${store.market}`);
  if (!parts.length && store.territory) parts.push(`Territory ${store.territory}`);
  if (!parts.length && store.region) parts.push(`Region ${store.region}`);

  return parts.filter(Boolean).join(" - ") || "Store location unavailable";
}

function formatTcgTimestamp(timestamp) {
  if (!timestamp) return "No timestamp";
  return formatActivityTime(timestamp);
}

function formatTcgFreshness(timestampValue) {
  if (!timestampValue) return "No activity yet";

  const ageMs = Date.now() - timestampValue;
  if (ageMs <= 0) return "Updated today";

  const days = Math.floor(ageMs / 86400000);
  if (days <= 0) return "Updated today";
  if (days === 1) return "1 day ago";
  return `${days.toLocaleString()} days ago`;
}

function getTcgFreshnessMeta(timestampValue) {
  if (!timestampValue) {
    return {
      key: "no-intel",
      label: "No Intel",
      sortRank: 0
    };
  }

  const ageDays = Math.max(0, (Date.now() - timestampValue) / 86400000);
  if (ageDays <= TCG_FRESHNESS_HOT_DAYS) {
    return {
      key: "hot",
      label: "Hot",
      sortRank: 3
    };
  }
  if (ageDays <= TCG_FRESHNESS_WARM_DAYS) {
    return {
      key: "warm",
      label: "Warm",
      sortRank: 2
    };
  }
  return {
    key: "cold",
    label: "Cold",
    sortRank: 1
  };
}

function inferTcgSightingLabel(noteText) {
  const text = compactTcgText(noteText).toLowerCase();
  if (!text) return "Sighting";

  const soldOutPattern = /\b(sold\s*out|out\s*of\s*stock|oos|empty\s*shelf|empty\s*shelves|cleaned\s*out|none\s+left|no\s+stock|nothing\s+left)\b/i;
  const lowStockPattern = /\b(low\s*stock|few\s+left|last\s+few|limited\s+stock|almost\s+gone|running\s+low|only\s+\d+\s+left)\b/i;
  const restockPattern = /\b(restock|restocked|restocking|new\s+drop|fresh\s+stock|new\s+shipment|shipment\s+came|put\s+out|just\s+stocked)\b/i;
  const inStockPattern = /\b(in\s*stock|on\s+the\s+shelf|on\s+shelves|available|plenty|stocked\s+today|fully\s+stocked|found\s+(?:some|packs|boxes|etbs?|tins?))\b/i;
  const negatedPositivePattern = /\b(no|not|none)\s+(?:longer\s+)?(?:stocked|available|found|on\s+shelves?)\b/i;
  const productPattern = /\b(pokemon|pok[eé]mon|one\s+piece|lorcana|magic|mtg|yugioh|yu-gi-oh|booster|etb|elite\s+trainer|tin|collection|blister|pack|box|deck|151|prismatic|surging\s+sparks|twilight\s+masquerade|paldean|obsidian|evolving\s+skies)\b/i;

  const hasSoldOut = soldOutPattern.test(text);
  const hasLowStock = lowStockPattern.test(text);
  const hasRestock = restockPattern.test(text);
  const hasInStock = inStockPattern.test(text) && !negatedPositivePattern.test(text);
  const hasProduct = productPattern.test(text);

  if (hasSoldOut && !hasInStock && !hasRestock && !hasLowStock) return "Sold Out";
  if (hasLowStock) return "Low Stock";
  if (hasRestock) return "Restock";
  if (hasInStock) return "In Stock";
  if (hasProduct) return "Product Mentioned";
  return "Sighting";
}

function getTcgSightingSignalRank(label) {
  if (label === "In Stock") return 5;
  if (label === "Restock") return 4;
  if (label === "Low Stock") return 3;
  if (label === "Product Mentioned") return 2;
  if (label === "Sighting") return 1;
  if (label === "Sold Out") return 0;
  return 0;
}

function getTcgLatestSignalByStore(filteredIds) {
  const latestByStore = new Map();

  const touch = (storeId, timestamp, source, detail = "") => {
    const normalizedStoreId = String(storeId || "");
    if (!filteredIds.has(normalizedStoreId)) return;

    const timestampValue = getTimestampValue(timestamp);
    const existing = latestByStore.get(normalizedStoreId);
    if (!existing || timestampValue > existing.timestampValue) {
      latestByStore.set(normalizedStoreId, {
        storeId: normalizedStoreId,
        timestamp,
        timestampValue,
        source,
        detail
      });
    }
  };

  noteRowsCache.forEach(row => {
    const label = inferTcgSightingLabel(row.note || "");
    touch(row.store_id, getTcgTimestamp(row), label, row.note || "");
  });

  photoRowsCache.forEach(row => {
    touch(row.store_id, getTcgTimestamp(row), "Photo", "Shelf photo uploaded");
  });

  statusRowsCache.forEach(row => {
    const statusCode = normalizeStatusCode(row?.status_code, row?.completed === true, row?.closed === true);
    touch(row.store_id, row.updated_at || row.created_at || null, "Status", getStatusDisplayLabel(statusCode));
  });

  activityFeed.forEach(item => {
    touch(item.store_id, item.timestamp || null, "Activity", item.detail || item.title || "");
  });

  return latestByStore;
}

function getTcgStatusMeta(storeId) {
  const status = statusMap[String(storeId)] || {};
  const statusCode = normalizeStatusCode(
    status.status_code,
    status.completed === true,
    status.closed === true
  );

  return {
    statusCode,
    statusLabel: getStatusDisplayLabel(statusCode)
  };
}

function getTcgStoreSignalCounts(filteredIds) {
  const notesByStore = new Map();
  const photosByStore = new Map();
  const latestNoteByStore = new Map();
  const latestPhotoByStore = new Map();
  const activeSightingsByStore = new Map();
  const recentThreshold = getRecentActivityThreshold();

  const updateLatest = (targetMap, storeId, row) => {
    const timestampValue = getTimestampValue(getTcgTimestamp(row));
    const existing = targetMap.get(storeId);
    if (!existing || timestampValue > existing.timestampValue) {
      targetMap.set(storeId, {
        row,
        timestampValue
      });
    }
  };

  getTcgRowsInScope(noteRowsCache, filteredIds).forEach(row => {
    const storeId = String(row.store_id || "");
    const timestampValue = getTimestampValue(getTcgTimestamp(row));
    const label = inferTcgSightingLabel(row.note || "");

    notesByStore.set(storeId, (notesByStore.get(storeId) || 0) + 1);
    updateLatest(latestNoteByStore, storeId, row);

    if (timestampValue >= recentThreshold && label !== "Sold Out") {
      activeSightingsByStore.set(storeId, (activeSightingsByStore.get(storeId) || 0) + 1);
    }
  });

  getTcgRowsInScope(photoRowsCache, filteredIds).forEach(row => {
    const storeId = String(row.store_id || "");
    photosByStore.set(storeId, (photosByStore.get(storeId) || 0) + 1);
    updateLatest(latestPhotoByStore, storeId, row);
  });

  return { notesByStore, photosByStore, latestNoteByStore, latestPhotoByStore, activeSightingsByStore };
}

function buildTcgStoreIntelRows(metrics, latestByStore, counts) {
  return metrics.filteredStores.map(store => {
    const storeId = String(store.store_id);
    const latest = latestByStore.get(storeId) || null;
    const latestNoteEntry = counts.latestNoteByStore.get(storeId);
    const latestPhotoEntry = counts.latestPhotoByStore.get(storeId);
    const latestNote = latestNoteEntry?.row || null;
    const latestPhoto = latestPhotoEntry?.row || null;
    const latestTimestampValue = Math.max(
      latest?.timestampValue || 0,
      latestNoteEntry?.timestampValue || 0,
      latestPhotoEntry?.timestampValue || 0
    );
    const latestTimestamp = latestTimestampValue === latestNoteEntry?.timestampValue
      ? getTcgTimestamp(latestNote)
      : latestTimestampValue === latestPhotoEntry?.timestampValue
        ? getTcgTimestamp(latestPhoto)
        : latest?.timestamp || null;
    const noteText = compactTcgText(latestNote?.note || "");
    const sightingLabel = inferTcgSightingLabel(noteText);
    const freshness = getTcgFreshnessMeta(latestTimestampValue);
    const activeSightingCount = counts.activeSightingsByStore.get(storeId) || 0;
    const retailer = getTcgRetailerIdentity(store);
    const snippet = noteText
      ? truncateDashboardText(noteText, 210)
      : latestPhoto
        ? "Shelf photo uploaded."
        : latest?.detail
          ? truncateDashboardText(latest.detail, 210)
          : "No sightings logged yet.";

    return {
      store,
      storeId,
      retailer,
      displayName: getTcgStoreDisplayName(store, storeId),
      locationLine: getTcgStoreLocationLine(store),
      latest,
      latestNote,
      latestPhoto,
      timestamp: latestTimestamp,
      timestampValue: latestTimestampValue,
      freshness,
      sightingLabel,
      signalRank: getTcgSightingSignalRank(sightingLabel),
      activeSightingCount,
      noteCount: counts.notesByStore.get(storeId) || 0,
      photoCount: counts.photosByStore.get(storeId) || 0,
      snippet,
      ...getTcgStatusMeta(storeId)
    };
  }).sort(compareTcgStoreIntelRows);
}

function compareTcgStoreIntelRows(a, b) {
  const aActive = a.activeSightingCount > 0 ? 1 : 0;
  const bActive = b.activeSightingCount > 0 ? 1 : 0;
  if (aActive !== bActive) return bActive - aActive;
  if (a.freshness.sortRank !== b.freshness.sortRank) return b.freshness.sortRank - a.freshness.sortRank;
  if (a.signalRank !== b.signalRank) return b.signalRank - a.signalRank;
  if (a.timestampValue !== b.timestampValue) return b.timestampValue - a.timestampValue;
  return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
}

function getTcgRetailerBoards(storeRows) {
  const boardsByKey = new Map();

  storeRows.forEach(row => {
    const key = row.retailer.key;
    if (!boardsByKey.has(key)) {
      boardsByKey.set(key, {
        key,
        label: row.retailer.label,
        storeCount: 0,
        activeSightings: 0,
        latestTimestampValue: 0,
        stores: []
      });
    }

    const board = boardsByKey.get(key);
    board.storeCount += 1;
    board.activeSightings += row.activeSightingCount;
    board.latestTimestampValue = Math.max(board.latestTimestampValue, row.timestampValue || 0);
    board.stores.push(row);
  });

  return Array.from(boardsByKey.values()).sort((a, b) => {
    if (a.activeSightings !== b.activeSightings) return b.activeSightings - a.activeSightings;
    if (a.latestTimestampValue !== b.latestTimestampValue) return b.latestTimestampValue - a.latestTimestampValue;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

function renderTcgEmptyState(title, detail) {
  return `
    <div class="tcgIntelEmpty">
      <div class="tcgIntelEmptyTitle">${escapeDashboardHtml(title)}</div>
      <div class="tcgIntelEmptyDetail">${escapeDashboardHtml(detail)}</div>
    </div>
  `;
}

function renderTcgStoreIntelCard(row) {
  const signalClass = `signal-${getTcgSlug(row.sightingLabel)}`;
  const updatedLabel = row.timestampValue ? formatTcgTimestamp(row.timestamp) : "No update";
  const freshnessDetail = row.timestampValue ? formatTcgFreshness(row.timestampValue) : "No activity yet";
  const photoMarkup = row.photoCount > 0
    ? `<span class="tcgStorePhotoFlag">Photo</span>`
    : "";

  return `
    <button class="tcgStoreCard" type="button" data-store-id="${escapeDashboardHtml(row.storeId)}">
      <span class="tcgStoreCardTop">
        <span class="tcgStoreName">${escapeDashboardHtml(row.displayName)}</span>
        <span class="tcgStoreBadges">
          <span class="tcgFreshnessPill freshness-${escapeDashboardHtml(row.freshness.key)}">${escapeDashboardHtml(row.freshness.label)}</span>
          <span class="tcgSightingPill ${escapeDashboardHtml(signalClass)}">${escapeDashboardHtml(row.sightingLabel)}</span>
          ${photoMarkup}
        </span>
      </span>
      <span class="tcgStoreLocation">${escapeDashboardHtml(row.locationLine)}</span>
      <span class="tcgStoreSnippet">${escapeDashboardHtml(row.snippet)}</span>
      <span class="tcgStoreMeta">
        <span>Store ${escapeDashboardHtml(row.storeId)}</span>
        <span>${escapeDashboardHtml(updatedLabel)}</span>
        <span>${escapeDashboardHtml(freshnessDetail)}</span>
        <span>${row.noteCount.toLocaleString()} sightings</span>
        <span>${row.photoCount.toLocaleString()} photos</span>
      </span>
    </button>
  `;
}

function renderTcgRetailerBoards(boards) {
  const listEl = document.getElementById("tcgRetailerBoards");
  if (!listEl) return;

  if (!boards.length) {
    listEl.innerHTML = renderTcgEmptyState(
      "No retailer intel in current scope",
      "Stores will group here by retailer, store name, chain, or market as sightings and photos are captured."
    );
    return;
  }

  listEl.innerHTML = boards.map(board => {
    const collapsed = tcgRetailerBoardCollapsedState.has(board.key);
    const latestLabel = board.latestTimestampValue ? formatTcgFreshness(board.latestTimestampValue) : "No updates yet";
    const bodyId = `tcg-retailer-board-${board.key}`;

    return `
      <section class="tcgRetailerBoard">
        <button class="tcgRetailerBoardHeader" type="button" data-retailer-toggle="${escapeDashboardHtml(board.key)}" aria-expanded="${collapsed ? "false" : "true"}" aria-controls="${escapeDashboardHtml(bodyId)}">
          <span class="tcgRetailerBoardTitle">
            <span class="tcgRetailerBoardName">${escapeDashboardHtml(board.label)}</span>
            <span class="tcgRetailerBoardMeta">${escapeDashboardHtml(latestLabel)}</span>
          </span>
          <span class="tcgRetailerBoardStats">
            <span class="tcgRetailerStat">${board.storeCount.toLocaleString()} stores</span>
            <span class="tcgRetailerStat">${board.activeSightings.toLocaleString()} active sightings</span>
          </span>
          <span class="tcgRetailerToggleIcon" aria-hidden="true">${collapsed ? "+" : "-"}</span>
        </button>
        <div id="${escapeDashboardHtml(bodyId)}" class="tcgRetailerBoardBody${collapsed ? " hidden" : ""}">
          <div class="tcgRetailerStoreList">
            ${board.stores.map(renderTcgStoreIntelCard).join("")}
          </div>
        </div>
      </section>
    `;
  }).join("");
}

function getTcgStoresNeedingCheck(storeRows) {
  return storeRows
    .filter(row => row.freshness.key === "cold" || row.freshness.key === "no-intel")
    .sort((a, b) => {
      if (!a.timestampValue && b.timestampValue) return -1;
      if (a.timestampValue && !b.timestampValue) return 1;
      if (a.timestampValue !== b.timestampValue) return a.timestampValue - b.timestampValue;
      return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
    });
}

function renderTcgStoresNeedingCheck(rows) {
  const listEl = document.getElementById("tcgNeedsCheckList");
  if (!listEl) return;

  if (!rows.length) {
    listEl.innerHTML = renderTcgEmptyState(
      "Current scope looks fresh",
      `Every visible store has activity inside the last ${RECENT_ACTIVITY_WINDOW_DAYS} days.`
    );
    return;
  }

  listEl.innerHTML = rows.slice(0, 10).map(renderTcgStoreIntelCard).join("");
}

function getTcgPhotoSource(row) {
  if (typeof dataLayer !== "undefined" && typeof dataLayer.resolvePhotoRowUrl === "function") {
    return dataLayer.resolvePhotoRowUrl(row) || "";
  }

  return row?.resolved_image_url || row?.image_url || "";
}

function renderTcgLatestPhotos(photos, metrics) {
  const listEl = document.getElementById("tcgLatestPhotosList");
  if (!listEl) return;

  if (!photos.length) {
    listEl.innerHTML = renderTcgEmptyState(
      "No shelf photos uploaded yet",
      "Upload store photos from the store modal to build visual hunting history."
    );
    return;
  }

  listEl.innerHTML = photos.slice(0, 8).map(row => {
    const storeId = String(row.store_id || "");
    const store = getTcgStoreById(storeId, metrics);
    const retailer = getTcgRetailerIdentity(store);
    const src = getTcgPhotoSource(row);
    const imageMarkup = src
      ? `<img src="${escapeDashboardHtml(src)}" alt="Store ${escapeDashboardHtml(storeId)} shelf photo" loading="lazy" />`
      : `<div class="tcgPhotoPlaceholder">Photo unavailable</div>`;

    return `
      <button class="tcgPhotoItem" type="button" data-store-id="${escapeDashboardHtml(storeId)}" data-photo-url="${escapeDashboardHtml(src)}">
        ${imageMarkup}
        <span class="tcgPhotoMeta">
          <strong>${escapeDashboardHtml(retailer.label)} - ${escapeDashboardHtml(getTcgStoreDisplayName(store, storeId))}</strong>
          <em>${escapeDashboardHtml(formatPhotoDate(row.created_at || row.updated_at))}</em>
          <small>Store ${escapeDashboardHtml(storeId)} - ${escapeDashboardHtml(getTcgStoreLocationLine(store))}</small>
        </span>
      </button>
    `;
  }).join("");
}

function getTcgActivityItems(metrics) {
  const filteredIds = metrics.filteredIds;
  const projectScopedActivityTypes = new Set([
    "project-archived",
    "project-restored",
    "store-added",
    "store-edited",
    "store-removed",
    "store-reactivated",
    "store-restored",
    "member-role-updated",
    "member-removed",
    "invite-sent",
    "invite-revoked",
    "invite-accepted"
  ]);

  return activityFeed
    .filter(item => {
      const type = String(item.type || "").trim();
      if (projectScopedActivityTypes.has(type)) {
        return String(item.project_id || currentProjectId) === String(currentProjectId);
      }

      return filteredIds.has(String(item.store_id || ""));
    })
    .slice(0, 10);
}

function getTcgActivityDisplay(item) {
  if (item?.type === "note") {
    const storeId = String(item.store_id || "").trim();
    const label = inferTcgSightingLabel(item.detail || item.title || "");
    return {
      title: item.title || (storeId ? `Store ${storeId} ${label.toLowerCase()} sighting` : `${label} sighting`),
      detail: item.detail || "Store chatter added.",
      label
    };
  }

  if (typeof buildActivityDisplay === "function") {
    return buildActivityDisplay(item);
  }

  return {
    title: item?.title || "Project activity",
    detail: item?.detail || "Activity recorded."
  };
}

function renderTcgActiveChatter(items, metrics) {
  const listEl = document.getElementById("tcgActiveChatterList");
  if (!listEl) return;

  if (!items.length) {
    listEl.innerHTML = renderTcgEmptyState(
      "No active chatter yet",
      "Sightings, photos, status updates, and project activity will appear here."
    );
    return;
  }

  listEl.innerHTML = items.map(item => {
    const display = getTcgActivityDisplay(item);
    const storeId = String(item.store_id || "").trim();
    const store = storeId ? getTcgStoreById(storeId, metrics) : null;
    const retailer = getTcgRetailerIdentity(store);
    const storeLabel = storeId
      ? `${retailer.label} - ${getTcgStoreDisplayName(store, storeId)}`
      : "Project";
    const activityBody = `
        <div class="tcgIntelItemTop">
          <span class="tcgIntelStore">${escapeDashboardHtml(storeLabel)}</span>
          <span class="tcgIntelTime">${escapeDashboardHtml(formatTcgTimestamp(item.timestamp))}</span>
        </div>
        <div class="tcgIntelDetail">${escapeDashboardHtml(truncateDashboardText(display.title, 160))}</div>
        <div class="tcgIntelMeta">${escapeDashboardHtml(truncateDashboardText(display.detail || getTcgStoreLocationLine(store), 220))}</div>
    `;

    if (!storeId) {
      return `<div class="tcgIntelItem">${activityBody}</div>`;
    }

    return `
      <button class="tcgIntelItem tcgIntelAction" type="button" data-store-id="${escapeDashboardHtml(storeId)}">
        ${activityBody}
      </button>
    `;
  }).join("");
}

function bindTcgIntelligenceInteractions() {
  const root = document.getElementById("tcgIntelligenceMode");
  if (!root || root.dataset.bound) return;

  root.addEventListener("click", event => {
    const toggleTarget = event.target?.closest?.("[data-retailer-toggle]");
    if (toggleTarget) {
      const retailerKey = String(toggleTarget.dataset.retailerToggle || "").trim();
      if (retailerKey) {
        if (tcgRetailerBoardCollapsedState.has(retailerKey)) {
          tcgRetailerBoardCollapsedState.delete(retailerKey);
        } else {
          tcgRetailerBoardCollapsedState.add(retailerKey);
        }
        renderTcgIntelligenceDashboard();
      }
      return;
    }

    const photoTarget = event.target?.closest?.("[data-photo-url]");
    if (photoTarget) {
      const photoUrl = String(photoTarget.dataset.photoUrl || "").trim();
      if (photoUrl && typeof openPhotoLightbox === "function") {
        openPhotoLightbox(photoUrl);
        return;
      }
    }

    const storeTarget = event.target?.closest?.("[data-store-id]");
    const storeId = String(storeTarget?.dataset?.storeId || "").trim();
    if (storeId && typeof openStoreModal === "function") {
      openStoreModal(storeId);
    }
  });

  root.dataset.bound = "true";
}

function renderTcgIntelligenceDashboard() {
  if (!isTcgDashboardMode()) {
    setIntelligenceModeVisibility("operations");
    return;
  }

  setIntelligenceModeVisibility("tcg");

  const metrics = getScopeMetrics();
  const config = getDashboardProjectConfig();
  const filteredIds = metrics.filteredIds;
  const photos = getTcgRowsInScope(photoRowsCache, filteredIds)
    .sort((a, b) => getTimestampValue(getTcgTimestamp(b)) - getTimestampValue(getTcgTimestamp(a)));
  const latestByStore = getTcgLatestSignalByStore(filteredIds);
  const counts = getTcgStoreSignalCounts(filteredIds);
  const storeRows = buildTcgStoreIntelRows(metrics, latestByStore, counts);
  const retailerBoards = getTcgRetailerBoards(storeRows);
  const needsCheck = getTcgStoresNeedingCheck(storeRows);
  const activeSightings = storeRows.reduce((total, row) => total + row.activeSightingCount, 0);

  setText("tcgIntelPurpose", config?.copy?.tcgPurpose || "Track retailer sightings, shelf photos, restocks, and store chatter.");
  setText("tcgIntelStoresTracked", metrics.totalStores.toLocaleString());
  setText("tcgIntelSightings", activeSightings.toLocaleString());
  setText("tcgIntelPhotos", photos.length.toLocaleString());
  setText("tcgIntelNeedCheck", needsCheck.length.toLocaleString());
  setText("tcgIntelScopeLabel", getCurrentScopeLabel(metrics));
  setText("tcgIntelGeneratedAt", `Updated: ${formatLastUpdated(new Date().toISOString())}`);

  renderTcgRetailerBoards(retailerBoards);
  renderTcgStoresNeedingCheck(needsCheck);
  renderTcgLatestPhotos(photos, metrics);
  renderTcgActiveChatter(getTcgActivityItems(metrics), metrics);
  bindTcgIntelligenceInteractions();
}

function renderIntelligenceDashboard() {
  const root = document.getElementById("intelligenceView");
  if (!root) return;

  const useTcgMode = isTcgDashboardMode();
  if (!useTcgMode) {
    setIntelligenceModeVisibility("operations");
  }

  if (typeof getScopeMetrics !== "function" || typeof getStoreIntelligenceSnapshot !== "function") {
    setIntelligenceModeVisibility("operations");
    return;
  }

  if (useTcgMode) {
    renderTcgIntelligenceDashboard();
    return;
  }

  setIntelligenceModeVisibility("operations");

  const metrics = getScopeMetrics();
  const snapshot = getStoreIntelligenceSnapshot();
  const totals = snapshot?.totals || {};

  setText("intelligenceSummaryTotalStores", metrics.totalStores.toLocaleString());
  setText("intelligenceSummaryCompletion", formatPercent(metrics.completionRate));
  setText("intelligenceSummaryAttentionNeeded", metrics.attentionNeededCount.toLocaleString());
  setText("intelligenceSummaryRecentActivity", formatPercent(metrics.recentActivityCoverageRate));
  setText("intelligenceScopeLabel", snapshot?.scopeLabel || getCurrentScopeLabel(metrics));
  setText("intelligenceCriticalCount", Number(totals.criticalCount || 0).toLocaleString());
  setText("intelligenceHighCount", Number(totals.highCount || 0).toLocaleString());
  setText("intelligenceMediumCount", Number(totals.mediumCount || 0).toLocaleString());
  setText("intelligenceLowCount", Number(totals.lowCount || 0).toLocaleString());

  const generatedAtText = snapshot?.generatedAt
    ? `Updated: ${formatLastUpdated(snapshot.generatedAt)}`
    : "Updated: —";
  setText("intelligenceGeneratedAt", generatedAtText);

  const listEl = document.getElementById("intelligenceTopAttentionList");
  if (!listEl) return;

  const ranked = Array.isArray(snapshot?.stores) ? snapshot.stores : [];
  const topStores = ranked.filter(store => (store.attentionScore || 0) > 0).slice(0, 10);

  if (topStores.length === 0) {
    listEl.innerHTML = '<div class="intelAttentionEmpty">No attention-ranked stores in current scope.</div>';
    return;
  }

  listEl.innerHTML = topStores.map(store => {
    const severityClass = `severity-${store.severity || "low"}`;
    const severityLabel = String(store.severity || "low").toUpperCase();
    const score = Number.isFinite(store.attentionScore) ? store.attentionScore : 0;
    const reason = buildAttentionReasonSummary(store);

    return `
      <div class="intelAttentionItem">
        <div class="intelAttentionItemTop">
          <div class="intelAttentionStore">Store ${store.storeId}</div>
          <div class="intelAttentionMeta">
            <span class="intelAttentionSeverity ${severityClass}">${severityLabel}</span>
            <span class="intelAttentionScore">${score}</span>
          </div>
        </div>
        <div class="intelAttentionReason">${reason}</div>
      </div>
    `;
  }).join("");
}

function renderIntelTopAttentionStores() {
  const listEl = document.getElementById("intelTopAttentionList");
  if (!listEl) return;

  if (typeof getStoreIntelligenceSnapshot !== "function") {
    listEl.innerHTML = '<div class="intelAttentionEmpty">Store intelligence unavailable.</div>';
    return;
  }

  const snapshot = getStoreIntelligenceSnapshot();
  const ranked = Array.isArray(snapshot?.stores) ? snapshot.stores : [];
  const topStores = ranked.filter(store => (store.attentionScore || 0) > 0).slice(0, 5);

  if (topStores.length === 0) {
    listEl.innerHTML = '<div class="intelAttentionEmpty">No attention-ranked stores in current scope.</div>';
    return;
  }

  listEl.innerHTML = topStores.map(store => {
    const severityClass = `severity-${store.severity || "low"}`;
    const severityLabel = String(store.severity || "low").toUpperCase();
    const score = Number.isFinite(store.attentionScore) ? store.attentionScore : 0;
    const reason = buildAttentionReasonSummary(store);

    return `
      <div class="intelAttentionItem">
        <div class="intelAttentionItemTop">
          <div class="intelAttentionStore">Store ${store.storeId}</div>
          <div class="intelAttentionMeta">
            <span class="intelAttentionSeverity ${severityClass}">${severityLabel}</span>
            <span class="intelAttentionScore">${score}</span>
          </div>
        </div>
        <div class="intelAttentionReason">${reason}</div>
      </div>
    `;
  }).join("");
}

function resetSelectedStorePanel() {
  const terminology = getDashboardTerminology();
  setText("intelSelectedStoreId", "No store selected");
  setText("intelSelectedStoreAddress", terminology.selectedStoreHint || "Tap a store marker to inspect status, notes, and photos.");

  const nameEl = document.getElementById("intelSelectedStoreName");
  if (nameEl) {
    nameEl.textContent = "";
    nameEl.classList.add("hidden");
  }

  const issuesEl = document.getElementById("intelSelectedStoreIssues");
  if (issuesEl) {
    issuesEl.textContent = "Data Issues: None";
    issuesEl.classList.add("hidden");
  }

  if (typeof updateStoreMaintenanceSelectionState === "function") {
    updateStoreMaintenanceSelectionState();
  }
}

function updateSelectedStorePanel(storeId) {
  currentSelectedStoreId = String(storeId);

  const store = typeof getStoreById === "function"
    ? getStoreById(storeId, { includeRemoved: true })
    : storeData.find(item => String(item.store_id) === String(storeId));

  if (!store) {
    resetSelectedStorePanel();
    return;
  }

  const status = statusMap[String(store.store_id)] || {};
  const statusCode = normalizeStatusCode(
    status.status_code,
    status.completed === true,
    status.closed === true
  );
  const statusLabel = statusCode.charAt(0).toUpperCase() + statusCode.slice(1);

  const parts = [];
  if (store.full_address) parts.push(store.full_address);
  if (store.region) parts.push(`Region: ${store.region}`);
  if (store.territory) parts.push(`Territory: ${store.territory}`);
  if (store.state) parts.push(`State: ${store.state}`);
  parts.push(`Status: ${statusLabel}`);

  if (statusCode === "rescheduled" && String(status.status_reason || "").trim()) {
    parts.push(`Reason: ${String(status.status_reason).trim()}`);
  }

  if (store.is_removed === true) {
    parts.push("Removed");
  }

  const integrityIssues = typeof getStoreIntegrityIssues === "function"
    ? getStoreIntegrityIssues(store, statusMap)
    : [];
  const storeName = String(store.store_name || "").trim();
  const nameEl = document.getElementById("intelSelectedStoreName");
  const issuesEl = document.getElementById("intelSelectedStoreIssues");

  setText("intelSelectedStoreId", `Store ${store.store_id}`);
  setText("intelSelectedStoreAddress", parts.join(" • "));
  if (nameEl) {
    nameEl.textContent = storeName ? `Store Name: ${storeName}` : "";
    nameEl.classList.toggle("hidden", !storeName);
  }

  if (issuesEl) {
    issuesEl.textContent = integrityIssues.length
      ? `Data Issues: ${integrityIssues.join(", ")}`
      : "Data Issues: None";
    issuesEl.classList.toggle("hidden", integrityIssues.length === 0);
  }

  if (typeof updateStoreMaintenanceSelectionState === "function") {
    updateStoreMaintenanceSelectionState();
  }
}

window.renderIntelligenceDashboard = renderIntelligenceDashboard;
