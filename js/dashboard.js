/* ================= DASHBOARD / INTEL ================= */

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

function getScopeMetrics() {
  const filteredStores = getFilteredStores();
  const filteredIds = new Set(filteredStores.map(store => String(store.store_id)));

  let completed = 0;
  let closed = 0;
  let rescheduled = 0;

  filteredStores.forEach(store => {
    const status = statusMap[String(store.store_id)] || {};
    const normalized = normalizeStatusCode(
      status.status_code,
      status.completed === true,
      status.closed === true
    );

    if (normalized === "completed") completed += 1;
    else if (normalized === "closed") closed += 1;
    else if (normalized === "rescheduled") rescheduled += 1;
  });

  const totalStores = filteredStores.length;
  const active = totalStores - completed - closed - rescheduled;
  const actionableTotal = totalStores - closed;
  const completionRate = actionableTotal > 0 ? (completed / actionableTotal) * 100 : 0;

  const completedEvents = activityFeed.filter(item =>
    item.type === "status-completed" && filteredIds.has(String(item.store_id))
  );

  const completedToday = completedEvents.filter(item => isToday(item.timestamp)).length;
  const avgPerDay = calculateAverageCompletedPerDay(completedEvents);
  const etaDays = avgPerDay > 0 ? (active + rescheduled) / avgPerDay : null;
  const filteredPhotoCount = photoRowsCache.filter(row => filteredIds.has(String(row.store_id))).length;

  return {
    filteredStores,
    filteredIds,
    totalStores,
    completed,
    closed,
    rescheduled,
    active,
    completionRate,
    completedToday,
    avgPerDay,
    etaDays,
    filteredPhotoCount
  };
}

function buildOperationalSummary(metrics) {
  if (metrics.totalStores === 0) return "No stores currently in scope.";

  const parts = [
    `${metrics.totalStores.toLocaleString()} in scope`,
    `${metrics.completed.toLocaleString()} completed`,
    `${metrics.active.toLocaleString()} active`
  ];

  if (metrics.rescheduled > 0) {
    parts.push(`${metrics.rescheduled.toLocaleString()} rescheduled`);
  }

  if (metrics.closed > 0) {
    parts.push(`${metrics.closed.toLocaleString()} closed`);
  }

  return parts.join(" • ");
}

function buildExecutiveSummary(metrics) {
  if (metrics.totalStores === 0) return "No mapped stores currently in scope.";

  const schedulePart = metrics.rescheduled > 0
    ? `${metrics.rescheduled.toLocaleString()} rescheduled, `
    : "";

  return `${metrics.totalStores.toLocaleString()} stores in scope • ${metrics.completionRate.toFixed(1)}% actionable completion • ${metrics.completedToday.toLocaleString()} completed today • ${schedulePart}${metrics.filteredPhotoCount.toLocaleString()} photo records captured.`;
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
  if (metrics.avgPerDay > 0 && metrics.etaDays !== null) {
    return `${metrics.avgPerDay.toFixed(1)}/day run rate • ETA ${formatEta(metrics.etaDays)}`;
  }
  if (metrics.rescheduled > 0) {
    return `${metrics.rescheduled.toLocaleString()} rescheduled stores currently need follow-up`;
  }
  return "Execution pace and completion trend";
}

function updateHeaderMetaAndSummaries() {
  const metrics = getScopeMetrics();
  setText("headerScopeSummary", getCurrentScopeLabel(metrics));
  setText("headerOperationalSummary", buildOperationalSummary(metrics));
  setText("headerViewModeText", currentWorkspaceView === "photos" ? "Photo Evidence Review" : "Map Operations");
  setText("headerLastUpdatedText", formatLastUpdated(lastDataRefreshAt));
  setText("workspaceProgressContext", getWorkspaceProgressContext(metrics));
  setText("mapExecutiveSummaryLine", buildExecutiveSummary(metrics));
  setText("photoLibraryScopeBadge", metrics.totalStores > 0 ? `${metrics.totalStores.toLocaleString()} in scope` : "No Stores");
  setText("photoLibraryModeBadge", currentPhotoLibrarySelection ? "Inspection" : "Review");
  updateMobileExecutiveSummaryUI();
}

function updateHeaderDashboard() {
  const metrics = getScopeMetrics();

  setText("dashboardProjectName", currentProjectMeta?.name || currentProjectId);
  setText(
    "dashboardProjectSubline",
    `Operational visibility • ${currentProjectMeta?.sourceLabel || "Project ready"} • ${nationalOverviewEnabled ? "National Overview" : "Project View"}`
  );
  setText("dashboardTotalStores", metrics.totalStores.toLocaleString());
  setText("dashboardCompletedStores", metrics.completed.toLocaleString());
  setText("dashboardActiveStores", (metrics.active + metrics.rescheduled).toLocaleString());
  setText("dashboardClosedStores", metrics.closed.toLocaleString());
  setText("dashboardStoresToday", metrics.completedToday.toLocaleString());
  setText("dashboardAvgPerDay", metrics.avgPerDay > 0 ? metrics.avgPerDay.toFixed(1) : "—");
  setText("dashboardPhotoCount", metrics.filteredPhotoCount.toLocaleString());
  setText("dashboardEta", metrics.etaDays !== null ? formatEta(metrics.etaDays) : "—");
  setText("dashboardProgressLabel", `${metrics.completionRate.toFixed(1)}% complete`);

  const fill = document.getElementById("dashboardProgressFill");
  if (fill) fill.style.width = `${metrics.completionRate}%`;

  updateHeaderMetaAndSummaries();
}

function updateScopeSummary() {
  const metrics = getScopeMetrics();

  setText("scopeStoreCountPill", metrics.totalStores.toLocaleString());
  setText("scopeVisibleStores", metrics.totalStores.toLocaleString());
  setText("scopeVisibleCompleted", metrics.completed.toLocaleString());
  setText("scopeVisibleActive", (metrics.active + metrics.rescheduled).toLocaleString());
  setText("scopeVisibleClosed", metrics.closed.toLocaleString());
}

function updateIntelRail() {
  const metrics = getScopeMetrics();

  setText("intelScopeMode", nationalOverviewEnabled ? "National" : "Project");
  setText("intelVisibleStores", metrics.totalStores.toLocaleString());
  setText("intelCompletionRate", `${metrics.completionRate.toFixed(1)}%`);
  setText("intelPhotoCount", metrics.filteredPhotoCount.toLocaleString());
  setText("intelEtaValue", metrics.etaDays !== null ? formatEta(metrics.etaDays) : "—");
  setText("intelCompletedStores", metrics.completed.toLocaleString());
  setText("intelActiveStores", (metrics.active + metrics.rescheduled).toLocaleString());
  setText("intelClosedStores", metrics.closed.toLocaleString());
  setText("intelCompletedToday", metrics.completedToday.toLocaleString());

  if (!currentSelectedStoreId) {
    resetSelectedStorePanel();
  }
}

function resetSelectedStorePanel() {
  setText("intelSelectedStoreId", "No store selected");
  setText("intelSelectedStoreAddress", "Tap a store marker to review current status, field notes, and photo evidence.");

  const issuesEl = document.getElementById("intelSelectedStoreIssues");
  if (issuesEl) {
    issuesEl.textContent = "Data Issues: None";
    issuesEl.classList.add("hidden");
  }
}

function updateSelectedStorePanel(storeId) {
  currentSelectedStoreId = String(storeId);

  const store = typeof getStoreById === "function"
    ? getStoreById(storeId, { includeRemoved: showRemovedStores === true })
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
  const noteCount = noteRowsCache.filter(row => String(row.store_id) === String(store.store_id)).length;
  const photoCount = photoRowsCache.filter(row => String(row.store_id) === String(store.store_id)).length;

  const parts = [];
  if (store.full_address) parts.push(store.full_address);
  parts.push(`Status: ${statusLabel}`);

  if (statusCode === "rescheduled" && String(status.status_reason || "").trim()) {
    parts.push(`Reason: ${String(status.status_reason).trim()}`);
  }

  if (noteCount > 0) {
    parts.push(`${noteCount} note${noteCount === 1 ? "" : "s"}`);
  }

  if (photoCount > 0) {
    parts.push(`${photoCount} photo${photoCount === 1 ? "" : "s"}`);
  }

  if (store.region) parts.push(`Region ${store.region}`);
  if (store.territory) parts.push(`Territory ${store.territory}`);
  if (store.state) parts.push(store.state);

  if (store.is_removed === true) {
    parts.push("Removed");
  }

  const integrityIssues = typeof getStoreIntegrityIssues === "function"
    ? getStoreIntegrityIssues(store, statusMap)
    : [];
  const issuesEl = document.getElementById("intelSelectedStoreIssues");

  setText("intelSelectedStoreId", `Store ${store.store_id}`);
  setText("intelSelectedStoreAddress", parts.join(" • "));

  if (issuesEl) {
    issuesEl.textContent = integrityIssues.length
      ? `Data Issues: ${integrityIssues.join(", ")}`
      : "Data Issues: None";
    issuesEl.classList.toggle("hidden", integrityIssues.length === 0);
  }
}