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

  filteredStores.forEach(store => {
    const status = statusMap[String(store.store_id)] || {};
    if (status.completed) completed += 1;
    if (status.closed) closed += 1;
  });

  const totalStores = filteredStores.length;
  const active = totalStores - completed - closed;
  const actionableTotal = totalStores - closed;
  const completionRate = actionableTotal > 0 ? (completed / actionableTotal) * 100 : 0;

  const completedEvents = activityFeed.filter(item =>
    item.type === "status-completed" && filteredIds.has(String(item.store_id))
  );

  const completedToday = completedEvents.filter(item => isToday(item.timestamp)).length;
  const avgPerDay = calculateAverageCompletedPerDay(completedEvents);
  const etaDays = avgPerDay > 0 ? active / avgPerDay : null;
  const filteredPhotoCount = photoRowsCache.filter(row => filteredIds.has(String(row.store_id))).length;

  return {
    filteredStores,
    filteredIds,
    totalStores,
    completed,
    closed,
    active,
    completionRate,
    completedToday,
    avgPerDay,
    etaDays,
    filteredPhotoCount
  };
}

function buildOperationalSummary(metrics) {
  if (metrics.totalStores === 0) return "No stores loaded";
  return `${metrics.totalStores.toLocaleString()} stores in scope • ${metrics.completed.toLocaleString()} completed • ${metrics.active.toLocaleString()} active • ${metrics.closed.toLocaleString()} closed`;
}

function buildExecutiveSummary(metrics) {
  if (metrics.totalStores === 0) return "No mapped stores currently in scope.";
  return `${metrics.totalStores.toLocaleString()} stores in scope with ${metrics.completionRate.toFixed(1)}% actionable completion, ${metrics.completedToday.toLocaleString()} completed today, and ${metrics.filteredPhotoCount.toLocaleString()} photo evidence records captured.`;
}

function getCurrentScopeLabel(metrics) {
  const parts = [];
  parts.push(nationalOverviewEnabled ? "National View" : "Project View");

  if (activeFilters.region) parts.push(activeFilters.region);
  if (activeFilters.territory) parts.push(activeFilters.territory);
  if (activeFilters.state) parts.push(activeFilters.state);
  if (metrics.totalStores > 0) parts.push(`${metrics.totalStores.toLocaleString()} stores`);

  return parts.join(" • ");
}

function getWorkspaceProgressContext(metrics) {
  if (metrics.totalStores === 0) return "Awaiting project data";
  if (metrics.avgPerDay > 0 && metrics.etaDays !== null) {
    return `${metrics.avgPerDay.toFixed(1)}/day pace • ETA ${formatEta(metrics.etaDays)}`;
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
  setText("dashboardActiveStores", metrics.active.toLocaleString());
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
  setText("scopeVisibleActive", metrics.active.toLocaleString());
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
  setText("intelActiveStores", metrics.active.toLocaleString());
  setText("intelClosedStores", metrics.closed.toLocaleString());
  setText("intelCompletedToday", metrics.completedToday.toLocaleString());

  if (!currentSelectedStoreId) {
    resetSelectedStorePanel();
  }
}

function resetSelectedStorePanel() {
  setText("intelSelectedStoreId", "No store selected");
  setText("intelSelectedStoreAddress", "Tap a store marker to inspect status, notes, and photos.");

  const issuesEl = document.getElementById("intelSelectedStoreIssues");
  if (issuesEl) {
    issuesEl.textContent = "Data Issues: None";
    issuesEl.classList.add("hidden");
  }
}

function updateSelectedStorePanel(storeId) {
  currentSelectedStoreId = String(storeId);

  const store = storeData.find(item => String(item.store_id) === String(storeId));
  if (!store) {
    resetSelectedStorePanel();
    return;
  }

  const status = statusMap[String(store.store_id)] || { completed: false, closed: false };
  const statusLabel = status.closed ? "Closed" : status.completed ? "Completed" : "Active";

  const parts = [];
  if (store.full_address) parts.push(store.full_address);
  if (store.region) parts.push(`Region: ${store.region}`);
  if (store.territory) parts.push(`Territory: ${store.territory}`);
  if (store.state) parts.push(`State: ${store.state}`);
  parts.push(`Status: ${statusLabel}`);

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