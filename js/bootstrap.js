/* ================= APP INIT ================= */

map.on("load", async () => {
  currentProjectId = localStorage.getItem(ACTIVE_PROJECT_KEY) || DEFAULT_PROJECT_ID;
  executiveModeEnabled = localStorage.getItem(EXECUTIVE_MODE_KEY) === "true";
  nationalOverviewEnabled = localStorage.getItem(NATIONAL_OVERVIEW_KEY) === "true";

  bindLogoHome();
  await initializeAuth();
  bindAuthUI();
  await bindAccountSettingsUI();
  bindExecutiveModeUI();
  bindNationalOverviewUI();
  bindMobileSidebarUI();
  bindSidebarCollapsibles();
  bindAdminPanel();
  bindFilters();
  bindWorkspaceViews();
  bindPhotoLibraryUI();
  bindProjectSelector();
  bindSearch();
  bindRouteBuilder();
  bindPhotoUI();
  bindLightboxUI();
  bindSnapshotExportUI();
  bindAnalyticsExportControls();

  await loadProjects();
  await loadActiveProject();

  updateAuthUI();
  updateRouteModeUI();
  updateExecutiveModeUI();
  updateNationalOverviewUI();
  updateWorkspaceViewUI();
  bindSnapshotExportUI();
  bindAnalyticsExportControls();
});
