/* ================= APP INIT ================= */

let authBootstrapPromise = null;
let appBootstrapPromise = null;

function startAuthBootstrap() {
  bindAuthUI();

  if (!authBootstrapPromise) {
    authBootstrapPromise = initializeAuth().catch(error => {
      console.error("Authentication initialization failed:", error);
      setAuthMessage(getAuthErrorMessage(error, "Unable to initialize account access."), "error");
      return null;
    });
  }

  return authBootstrapPromise;
}

async function initializeMapApplication() {
  await startAuthBootstrap();

  currentProjectId = localStorage.getItem(ACTIVE_PROJECT_KEY) || DEFAULT_PROJECT_ID;
  executiveModeEnabled = localStorage.getItem(EXECUTIVE_MODE_KEY) === "true";
  nationalOverviewEnabled = localStorage.getItem(NATIONAL_OVERVIEW_KEY) === "true";

  bindLogoHome();
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
}

function startMapApplication() {
  if (!appBootstrapPromise) {
    appBootstrapPromise = initializeMapApplication().catch(error => {
      console.error("Application initialization failed:", error);
      const sourceTag = document.getElementById("projectSourceTag");
      if (sourceTag) {
        sourceTag.textContent = "Application initialization failed · Reload to retry";
      }
      throw error;
    });
  }

  return appBootstrapPromise;
}

function bootstrapApplication() {
  // Authentication and credential controls must remain available even when
  // Mapbox, WebGL, or the map style cannot load on a mobile connection.
  startAuthBootstrap();

  const startAfterMapLoad = () => {
    startMapApplication().catch(() => {
      // The detailed error and user-facing state are handled above.
    });
  };

  if (!map || typeof map.once !== "function") {
    console.error("Map application unavailable:", mapInitializationError || new Error("Mapbox is unavailable."));
    const sourceTag = document.getElementById("projectSourceTag");
    if (sourceTag) sourceTag.textContent = "Map unavailable · Account access remains available";
    return;
  }

  if (typeof map.loaded === "function" && map.loaded()) {
    startAfterMapLoad();
  } else {
    map.once("load", startAfterMapLoad);
  }

  if (typeof map.on === "function") {
    map.on("error", event => {
      console.error("Mapbox runtime error:", event?.error || event);
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapApplication, { once: true });
} else {
  bootstrapApplication();
}
