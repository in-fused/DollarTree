/* ================= APP INIT ================= */

map.on("load", async () => {
  currentProjectId = localStorage.getItem(ACTIVE_PROJECT_KEY) || DEFAULT_PROJECT_ID;
  executiveModeEnabled = localStorage.getItem(EXECUTIVE_MODE_KEY) === "true";
  nationalOverviewEnabled = localStorage.getItem(NATIONAL_OVERVIEW_KEY) === "true";

  bindLogoHome();
  await initializeAuth();
  bindAuthUI();
  bindExecutiveModeUI();
  bindNationalOverviewUI();
  bindMobileSidebarUI();
  bindFilters();
  bindWorkspaceViews();
  bindPhotoLibraryUI();
  bindProjectSelector();
  bindSearch();
  bindRouteBuilder();
  bindPhotoUI();
  bindLightboxUI();
  bindMobileExecutiveSummary();

  await loadProjects();
  await loadActiveProject();

  updateAuthUI();
  updateRouteModeUI();
  updateExecutiveModeUI();
  updateNationalOverviewUI();
  updateWorkspaceViewUI();
});
