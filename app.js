mapboxgl.accessToken = "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9.3-ZXlPJosjQ4c5bucpnWYA";

const SUPABASE_URL = "https://dapjhrbfqtsgdlasuuam.supabase.co";
const SUPABASE_KEY = "sb_publishable_DF55L6u6QxGU9Tfo_9MvZw_0Rv7zsJS";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const DEFAULT_PROJECT_ID = "central-fl-dollar-tree";
const PROJECTS_FILE = "data/projects.json";
const ACTIVE_PROJECT_KEY = "activeProjectId";
const EXECUTIVE_MODE_KEY = "executiveModeEnabled";
const NATIONAL_OVERVIEW_KEY = "nationalOverviewEnabled";
const ACTIVE_VIEW_KEY = "activeWorkspaceView";

const DEFAULT_LOCAL_CENTER = [-81.7, 27.8];
const DEFAULT_LOCAL_ZOOM = 6.5;
const NATIONAL_CENTER = [-96, 38];
const NATIONAL_ZOOM = 3.2;

const PHOTO_BUCKET_CANDIDATES = ["store-photos", "store_photos", "photos"];

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: DEFAULT_LOCAL_CENTER,
  zoom: DEFAULT_LOCAL_ZOOM
});

let resolvedPhotoBucket = null;

let storeData = [];
let statusMap = {};
let geojsonData = { type: "FeatureCollection", features: [] };

let currentModalStoreId = null;
let currentSelectedStoreId = null;
let currentProjectId = DEFAULT_PROJECT_ID;
let currentProjectMeta = null;
let currentWorkspaceView = localStorage.getItem(ACTIVE_VIEW_KEY) || "map";

let currentSession = null;
let currentUser = null;
let currentRole = "viewer";

let projectList = [];
let statusRowsCache = [];
let photoRowsCache = [];
let activityFeed = [];
let routeModeEnabled = false;
let selectedRouteStops = [];
let executiveModeEnabled = false;
let nationalOverviewEnabled = false;
let currentPhotoLibrarySelection = null;
let lastDataRefreshAt = null;
let mobileExecutiveSummaryExpanded = false;

let activeFilters = {
  region: "",
  territory: "",
  state: ""
};

let photoLibraryFilters = {
  type: "",
  sort: "newest",
  group: "none",
  search: ""
};

function routeModeKey() {
  return `routeModeEnabled:${currentProjectId}`;
}

function routeStopsKey() {
  return `selectedRouteStops:${currentProjectId}`;
}

function filtersKey() {
  return `activeFilters:${currentProjectId}`;
}

function isSignedIn() {
  return !!currentUser;
}

function isAdmin() {
  return currentRole === "admin";
}

function isMobileViewport() {
  return window.innerWidth <= 900;
}

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

/* ================= BASIC HELPERS ================= */

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getTimestampValue(timestamp) {
  if (!timestamp) return 0;
  const date = new Date(timestamp);
  const value = date.getTime();
  return Number.isNaN(value) ? 0 : value;
}

function formatActivityTime(timestamp) {
  if (!timestamp) return "Recent";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Recent";
  return date.toLocaleString();
}

function formatPhotoDate(timestamp) {
  if (!timestamp) return "Uploaded";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Uploaded";
  return date.toLocaleString();
}

function formatLastUpdated(timestamp) {
  if (!timestamp) return "Live";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Live";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function isToday(timestamp) {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function formatEta(days) {
  if (!Number.isFinite(days) || days <= 0) return "0 days";
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return `${hours}h`;
  }
  return `${days.toFixed(1)} days`;
}

function uniqueSortedValues(values) {
  return [...new Set(
    values
      .map(value => String(value || "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function prependActivity(event) {
  activityFeed.unshift(event);
  activityFeed = activityFeed
    .sort((a, b) => getTimestampValue(b.timestamp) - getTimestampValue(a.timestamp))
    .slice(0, 100);
}

function normalizePhotoType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "before") return "before";
  if (normalized === "after") return "after";
  return "other";
}

function cryptoRandomKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeFileName(name) {
  return String(name || "photo")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function touchDataRefresh() {
  lastDataRefreshAt = new Date().toISOString();
}

function getPhotoSelectionKey(row) {
  return String(row.id || row.storage_path || row.url || `${row.store_id}-${row.created_at}`);
}

/* ================= AUTH ================= */

async function initializeAuth() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Auth session error:", error);
  }

  currentSession = data?.session || null;
  currentUser = currentSession?.user || null;

  if (currentUser) {
    await loadCurrentUserRole();
  } else {
    currentRole = "viewer";
  }

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentSession = session || null;
    currentUser = currentSession?.user || null;

    if (currentUser) {
      await loadCurrentUserRole();
    } else {
      currentRole = "viewer";
    }

    updateAuthUI();
    updateWriteAccessUI();
  });
}

async function loadCurrentUserRole() {
  if (!currentUser) {
    currentRole = "viewer";
    return;
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("role, email")
    .eq("user_id", currentUser.id)
    .single();

  if (error) {
    console.error("Profile lookup failed:", error);
    currentRole = "viewer";
    return;
  }

  currentRole = data?.role || "viewer";
}

function bindAuthUI() {
  const signInBtn = document.getElementById("signInBtn");
  const signOutBtn = document.getElementById("signOutBtn");

  if (signInBtn && !signInBtn.dataset.bound) {
    signInBtn.addEventListener("click", signIn);
    signInBtn.dataset.bound = "true";
  }

  if (signOutBtn && !signOutBtn.dataset.bound) {
    signOutBtn.addEventListener("click", signOut);
    signOutBtn.dataset.bound = "true";
  }
}

async function signIn() {
  const email = document.getElementById("authEmail")?.value.trim() || "";
  const password = document.getElementById("authPassword")?.value || "";

  setAuthMessage("");

  if (!email || !password) {
    setAuthMessage("Email and password are required.", "error");
    return;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    setAuthMessage(error.message || "Sign-in failed.", "error");
    return;
  }

  setAuthMessage("Signed in successfully.", "success");
}

async function signOut() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    setAuthMessage(error.message || "Sign-out failed.", "error");
    return;
  }

  setAuthMessage("Signed out.", "success");
}

function setAuthMessage(message, type = "") {
  const el = document.getElementById("authMessage");
  if (!el) return;

  el.className = "authMessage";
  if (type === "success") el.classList.add("authSuccess");
  if (type === "error") el.classList.add("authError");
  el.textContent = message;
}

function updateAuthUI() {
  const loggedOut = document.getElementById("authLoggedOut");
  const loggedIn = document.getElementById("authLoggedIn");
  const importLink = document.getElementById("importProjectLink");

  if (isSignedIn()) {
    loggedOut?.classList.add("hidden");
    loggedIn?.classList.remove("hidden");
    setText("authUserDisplay", currentUser.email || "Signed in");
    setText("authRoleDisplay", `Role: ${currentRole}`);
  } else {
    loggedOut?.classList.remove("hidden");
    loggedIn?.classList.add("hidden");
    setText("authUserDisplay", "");
    setText("authRoleDisplay", "");
  }

  if (importLink) {
    if (isAdmin()) {
      importLink.classList.remove("disabled");
      importLink.title = "";
    } else {
      importLink.classList.add("disabled");
      importLink.title = "Admin sign-in required";
    }
  }

  updateWriteAccessUI();
}

function updateWriteAccessUI() {
  const writeEnabled = isSignedIn();

  [
    "markActive",
    "markCompleted",
    "markClosed",
    "addNoteBtn",
    "noteBox",
    "photoInput",
    "uploadPhotoBtn"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !writeEnabled;
  });

  setText(
    "writeAccessMessage",
    writeEnabled ? "" : "Sign in to update store status, add notes, and upload photos."
  );
}

/* ================= LOGO / HOME ================= */

function bindLogoHome() {
  const logo = document.querySelector(".brandLogoWide");
  if (!logo || logo.dataset.bound) return;

  logo.addEventListener("click", () => {
    currentWorkspaceView = "map";
    localStorage.setItem(ACTIVE_VIEW_KEY, currentWorkspaceView);
    updateWorkspaceViewUI();
    updateMapViewportForMode();
  });

  logo.dataset.bound = "true";
}

/* ================= MOBILE EXEC SUMMARY ================= */

function bindMobileExecutiveSummary() {
  const card = document.getElementById("mapExecutiveCallout");
  if (!card || card.dataset.bound) return;

  card.addEventListener("click", () => {
    if (!isMobileViewport() || !executiveModeEnabled) return;
    mobileExecutiveSummaryExpanded = !mobileExecutiveSummaryExpanded;
    updateMobileExecutiveSummaryUI();
  });

  card.dataset.bound = "true";
}

function updateMobileExecutiveSummaryUI() {
  const card = document.getElementById("mapExecutiveCallout");
  const line = document.getElementById("mapExecutiveSummaryLine");
  if (!card || !line) return;

  const shouldCollapse = isMobileViewport() && executiveModeEnabled;

  card.classList.toggle("mobile-collapsible", shouldCollapse);
  card.classList.toggle("expanded", shouldCollapse && mobileExecutiveSummaryExpanded);
  line.classList.toggle("collapsed", shouldCollapse && !mobileExecutiveSummaryExpanded);
}

/* ================= EXECUTIVE / NATIONAL / MOBILE ================= */

function bindExecutiveModeUI() {
  const toggle = document.getElementById("executiveModeToggle");
  const floatingExit = document.getElementById("floatingExecutiveExit");

  if (toggle && !toggle.dataset.bound) {
    toggle.addEventListener("change", () => {
      executiveModeEnabled = toggle.checked;
      localStorage.setItem(EXECUTIVE_MODE_KEY, String(executiveModeEnabled));
      mobileExecutiveSummaryExpanded = false;
      updateExecutiveModeUI();
    });
    toggle.dataset.bound = "true";
  }

  if (floatingExit && !floatingExit.dataset.bound) {
    floatingExit.addEventListener("click", () => {
      executiveModeEnabled = false;
      localStorage.setItem(EXECUTIVE_MODE_KEY, "false");
      mobileExecutiveSummaryExpanded = false;
      updateExecutiveModeUI();
    });
    floatingExit.dataset.bound = "true";
  }
}

function updateExecutiveModeUI() {
  document.body.classList.toggle("executive-mode", executiveModeEnabled);

  const toggle = document.getElementById("executiveModeToggle");
  const floatingExit = document.getElementById("floatingExecutiveExit");

  if (toggle) toggle.checked = executiveModeEnabled;
  if (floatingExit) floatingExit.classList.toggle("hidden", !executiveModeEnabled);

  if (executiveModeEnabled) {
    document.body.classList.remove("sidebar-open");
  }

  updateHeaderMetaAndSummaries();
  updateMobileExecutiveSummaryUI();
  setTimeout(() => map.resize(), 180);
}

function bindNationalOverviewUI() {
  const toggle = document.getElementById("nationalOverviewToggle");
  if (!toggle || toggle.dataset.bound) return;

  toggle.addEventListener("change", () => {
    nationalOverviewEnabled = toggle.checked;
    localStorage.setItem(NATIONAL_OVERVIEW_KEY, String(nationalOverviewEnabled));
    updateNationalOverviewUI();
    updateHeaderDashboard();
    updateScopeSummary();
    updateIntelRail();
    updateMapViewportForMode();
    renderPhotoLibrary();
  });

  toggle.dataset.bound = "true";
}

function updateNationalOverviewUI() {
  const toggle = document.getElementById("nationalOverviewToggle");
  if (toggle) toggle.checked = nationalOverviewEnabled;
  setMapModeTags();
  updateHeaderMetaAndSummaries();
}

function bindMobileSidebarUI() {
  const toggle = document.getElementById("mobileSidebarToggle");
  const sidebar = document.getElementById("sidebar");

  if (toggle && !toggle.dataset.bound) {
    toggle.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-open");
      setTimeout(() => map.resize(), 180);
    });
    toggle.dataset.bound = "true";
  }

  if (sidebar && !sidebar.dataset.bound) {
    sidebar.addEventListener("click", (e) => {
      if (window.innerWidth <= 900 && e.target.tagName === "A") {
        document.body.classList.remove("sidebar-open");
      }
    });
    sidebar.dataset.bound = "true";
  }

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      document.body.classList.remove("sidebar-open");
    }
    updateMobileExecutiveSummaryUI();
    setTimeout(() => map.resize(), 120);
  });
}

/* ================= WORKSPACE VIEWS ================= */

function bindWorkspaceViews() {
  const mapBtn = document.getElementById("mapViewBtn");
  const photoBtn = document.getElementById("photoLibraryViewBtn");

  if (mapBtn && !mapBtn.dataset.bound) {
    mapBtn.addEventListener("click", () => {
      currentWorkspaceView = "map";
      localStorage.setItem(ACTIVE_VIEW_KEY, currentWorkspaceView);
      updateWorkspaceViewUI();
    });
    mapBtn.dataset.bound = "true";
  }

  if (photoBtn && !photoBtn.dataset.bound) {
    photoBtn.addEventListener("click", () => {
      currentWorkspaceView = "photos";
      localStorage.setItem(ACTIVE_VIEW_KEY, currentWorkspaceView);
      updateWorkspaceViewUI();
      renderPhotoLibrary();
    });
    photoBtn.dataset.bound = "true";
  }
}

function updateWorkspaceViewUI() {
  const mapBtn = document.getElementById("mapViewBtn");
  const photoBtn = document.getElementById("photoLibraryViewBtn");
  const mapView = document.getElementById("mapWorkspaceView");
  const photoView = document.getElementById("photoLibraryWorkspaceView");

  const showingMap = currentWorkspaceView !== "photos";

  mapBtn?.classList.toggle("active", showingMap);
  photoBtn?.classList.toggle("active", !showingMap);

  mapView?.classList.toggle("hidden", !showingMap);
  mapView?.classList.toggle("active", showingMap);

  photoView?.classList.toggle("hidden", showingMap);
  photoView?.classList.toggle("active", !showingMap);

  mobileExecutiveSummaryExpanded = false;
  updateHeaderMetaAndSummaries();
  updateMobileExecutiveSummaryUI();

  if (showingMap) {
    setTimeout(() => map.resize(), 120);
  } else {
    renderPhotoLibrary();
  }
}

/* ================= PROJECTS ================= */

async function loadProjects() {
  let loadedProjects = [];

  try {
    const { data, error } = await supabaseClient
      .from("projects")
      .select("project_id, name, created_at")
      .order("created_at", { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      loadedProjects = data.map(project => ({
        project_id: project.project_id,
        name: project.name,
        created_at: project.created_at,
        store_file: `data/${project.project_id}/stores_with_coords.json`
      }));
    }
  } catch (error) {
    console.warn("Supabase project load failed:", error);
  }

  if (loadedProjects.length === 0) {
    try {
      const res = await fetch(PROJECTS_FILE, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load ${PROJECTS_FILE}`);
      const fileProjects = await res.json();

      if (Array.isArray(fileProjects) && fileProjects.length > 0) {
        loadedProjects = fileProjects;
      }
    } catch (error) {
      console.warn("Using default project list fallback:", error);
    }
  }

  if (loadedProjects.length === 0) {
    loadedProjects = [{
      project_id: DEFAULT_PROJECT_ID,
      name: "Central FL Dollar Tree",
      store_file: "data/central-fl-dollar-tree/stores_with_coords.json"
    }];
  }

  projectList = loadedProjects;

  if (!projectList.some(project => project.project_id === currentProjectId)) {
    currentProjectId = projectList[0].project_id;
    localStorage.setItem(ACTIVE_PROJECT_KEY, currentProjectId);
  }

  const select = document.getElementById("projectSelect");
  if (!select) return;

  select.innerHTML = "";
  projectList.forEach(project => {
    const option = document.createElement("option");
    option.value = project.project_id;
    option.textContent = project.name;
    select.appendChild(option);
  });

  select.value = currentProjectId;
}

function bindProjectSelector() {
  const select = document.getElementById("projectSelect");
  if (!select || select.dataset.bound) return;

  select.addEventListener("change", async (e) => {
    currentProjectId = e.target.value;
    localStorage.setItem(ACTIVE_PROJECT_KEY, currentProjectId);
    mobileExecutiveSummaryExpanded = false;
    await loadActiveProject();
  });

  select.dataset.bound = "true";
}

async function loadActiveProject() {
  currentProjectMeta = projectList.find(project => project.project_id === currentProjectId) || {
    project_id: currentProjectId,
    name: currentProjectId,
    store_file: `data/${currentProjectId}/stores_with_coords.json`
  };

  currentSelectedStoreId = null;
  currentPhotoLibrarySelection = null;
  mobileExecutiveSummaryExpanded = false;

  restoreFilterState();
  await hydrate();
  await hydrateActivityFeed();
  restoreRouteState();
  populateFilterOptions();

  if (map.getSource("stores")) {
    rebuildFullMap();
  } else {
    buildMap();
  }

  updateProjectSourceTag();
  updateHeaderDashboard();
  updateScopeSummary();
  updateFilterSummary();
  setMapModeTags();
  updateIntelRail();
  resetSelectedStorePanel();
  updateActivityList();
  renderRouteStops();
  updateRouteModeUI();
  updateMapViewportForMode();
  resetPhotoLibraryDetail();
  renderPhotoLibrary();
  updateWorkspaceViewUI();

  if (currentModalStoreId) {
    currentModalStoreId = null;
    clearPhotoUI();
  }
}

function updateProjectSourceTag() {
  const text = `${currentProjectMeta?.name || currentProjectId} · ${currentProjectMeta?.sourceLabel || "Project ready"}`;
  setText("projectSourceTag", text);
  setText("projectSourceTagInline", currentProjectMeta?.sourceLabel || "Project ready");
}

/* ================= FILTERS ================= */

function bindFilters() {
  const regionFilter = document.getElementById("regionFilter");
  const territoryFilter = document.getElementById("territoryFilter");
  const stateFilter = document.getElementById("stateFilter");
  const clearBtn = document.getElementById("clearFiltersBtn");

  if (regionFilter && !regionFilter.dataset.bound) {
    regionFilter.addEventListener("change", () => {
      activeFilters.region = regionFilter.value;
      persistFilterState();
      handleFilterChange();
    });
    regionFilter.dataset.bound = "true";
  }

  if (territoryFilter && !territoryFilter.dataset.bound) {
    territoryFilter.addEventListener("change", () => {
      activeFilters.territory = territoryFilter.value;
      persistFilterState();
      handleFilterChange();
    });
    territoryFilter.dataset.bound = "true";
  }

  if (stateFilter && !stateFilter.dataset.bound) {
    stateFilter.addEventListener("change", () => {
      activeFilters.state = stateFilter.value;
      persistFilterState();
      handleFilterChange();
    });
    stateFilter.dataset.bound = "true";
  }

  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.addEventListener("click", () => {
      activeFilters = { region: "", territory: "", state: "" };
      persistFilterState();
      handleFilterChange();
    });
    clearBtn.dataset.bound = "true";
  }
}

function restoreFilterState() {
  try {
    const saved = JSON.parse(localStorage.getItem(filtersKey()) || "{}");
    activeFilters = {
      region: saved.region || "",
      territory: saved.territory || "",
      state: saved.state || ""
    };
  } catch {
    activeFilters = { region: "", territory: "", state: "" };
  }
}

function persistFilterState() {
  localStorage.setItem(filtersKey(), JSON.stringify(activeFilters));
}

function getFilteredStores() {
  return storeData.filter(store => {
    if (activeFilters.region && String(store.region || "") !== activeFilters.region) return false;
    if (activeFilters.territory && String(store.territory || "") !== activeFilters.territory) return false;
    if (activeFilters.state && String(store.state || "") !== activeFilters.state) return false;
    return true;
  });
}

function getStoresForOptionPopulation(dimension) {
  return storeData.filter(store => {
    if (dimension !== "region" && activeFilters.region && String(store.region || "") !== activeFilters.region) return false;
    if (dimension !== "territory" && activeFilters.territory && String(store.territory || "") !== activeFilters.territory) return false;
    if (dimension !== "state" && activeFilters.state && String(store.state || "") !== activeFilters.state) return false;
    return true;
  });
}

function fillFilterSelect(id, defaultLabel, values, selectedValue) {
  const el = document.getElementById(id);
  if (!el) return;

  el.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = defaultLabel;
  el.appendChild(defaultOption);

  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    el.appendChild(option);
  });

  if (selectedValue && values.includes(selectedValue)) {
    el.value = selectedValue;
  } else {
    el.value = "";
    if (id === "regionFilter") activeFilters.region = "";
    if (id === "territoryFilter") activeFilters.territory = "";
    if (id === "stateFilter") activeFilters.state = "";
  }
}

function populateFilterOptions() {
  fillFilterSelect(
    "regionFilter",
    "All Regions",
    uniqueSortedValues(getStoresForOptionPopulation("region").map(store => store.region)),
    activeFilters.region
  );

  fillFilterSelect(
    "territoryFilter",
    "All Territories",
    uniqueSortedValues(getStoresForOptionPopulation("territory").map(store => store.territory)),
    activeFilters.territory
  );

  fillFilterSelect(
    "stateFilter",
    "All States",
    uniqueSortedValues(getStoresForOptionPopulation("state").map(store => store.state)),
    activeFilters.state
  );
}

function updateFilterSummary() {
  const parts = [];
  if (activeFilters.region) parts.push(`Region: ${activeFilters.region}`);
  if (activeFilters.territory) parts.push(`Territory: ${activeFilters.territory}`);
  if (activeFilters.state) parts.push(`State: ${activeFilters.state}`);

  const filteredCount = getFilteredStores().length;

  if (parts.length === 0) {
    setText("activeFilterSummary", `Showing all stores • ${filteredCount.toLocaleString()} in scope`);
    return;
  }

  setText("activeFilterSummary", `${parts.join(" • ")} • ${filteredCount.toLocaleString()} in scope`);
}

function handleFilterChange() {
  populateFilterOptions();
  rebuildFullMap();
  updateProjectSourceTag();
  updateHeaderDashboard();
  updateScopeSummary();
  updateFilterSummary();
  setMapModeTags();
  updateMapViewportForMode();
  updateIntelRail();
  updateActivityList();
  renderPhotoLibrary();

  if (currentSelectedStoreId && !getFilteredStores().some(s => String(s.store_id) === String(currentSelectedStoreId))) {
    currentSelectedStoreId = null;
    resetSelectedStorePanel();
  }
}

/* ================= DATA HYDRATION ================= */

async function loadStoresForProject(projectId) {
  const { data, error } = await supabaseClient
    .from("stores")
    .select("store_id, lat, lng, full_address, region, territory, state, city, district, division, market")
    .eq("project_id", projectId);

  if (!error && Array.isArray(data) && data.length > 0) {
    currentProjectMeta.sourceLabel = "Supabase";
    return data.map(normalizeStoreRecord);
  }

  const fallbackPaths = [
    currentProjectMeta?.store_file,
    `data/${projectId}/stores_with_coords.json`,
    "stores_with_coords.json"
  ].filter(Boolean);

  for (const path of fallbackPaths) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json();
      if (Array.isArray(json) && json.length > 0) {
        currentProjectMeta.sourceLabel = "JSON fallback";
        return json.map(normalizeStoreRecord);
      }
    } catch (err) {
      console.warn("Store file fallback failed:", path, err);
    }
  }

  currentProjectMeta.sourceLabel = "No stores found";
  return [];
}

function normalizeStoreRecord(store) {
  return {
    store_id: String(store.store_id),
    lat: Number(store.lat),
    lng: Number(store.lng),
    full_address: String(store.full_address || "").trim(),
    region: String(store.region || "").trim(),
    territory: String(store.territory || "").trim(),
    state: String(store.state || "").trim(),
    city: String(store.city || "").trim(),
    district: String(store.district || "").trim(),
    division: String(store.division || "").trim(),
    market: String(store.market || "").trim()
  };
}

async function hydrate() {
  storeData = await loadStoresForProject(currentProjectId);

  statusMap = {};
  storeData.forEach(store => {
    statusMap[String(store.store_id)] = {
      completed: false,
      closed: false
    };
  });

  const { data, error } = await supabaseClient
    .from("store_status")
    .select("*")
    .eq("project_id", currentProjectId);

  if (error) {
    console.error("Supabase store_status error:", error);
    statusRowsCache = [];
    return;
  }

  statusRowsCache = Array.isArray(data) ? data : [];

  statusRowsCache.forEach(row => {
    const key = String(row.store_id);
    if (statusMap[key]) {
      statusMap[key].completed = row.completed === true;
      statusMap[key].closed = row.closed === true;
    }
  });
}

async function hydrateActivityFeed() {
  const events = [];
  photoRowsCache = [];

  statusRowsCache.forEach(row => {
    const eventTime = row.updated_at || row.created_at || null;

    if (row.completed === true) {
      events.push({
        type: "status-completed",
        store_id: String(row.store_id),
        timestamp: eventTime,
        title: `✔ Store ${row.store_id} completed`,
        detail: "Status updated"
      });
    } else if (row.closed === true) {
      events.push({
        type: "status-closed",
        store_id: String(row.store_id),
        timestamp: eventTime,
        title: `⚠ Store ${row.store_id} closed`,
        detail: "Status updated"
      });
    }
  });

  const { data: noteRows } = await supabaseClient
    .from("store_notes")
    .select("store_id, note, created_at")
    .eq("project_id", currentProjectId)
    .order("created_at", { ascending: false })
    .limit(50);

  (noteRows || []).forEach(row => {
    events.push({
      type: "note",
      store_id: String(row.store_id),
      timestamp: row.created_at || null,
      title: `📝 Note added to Store ${row.store_id}`,
      detail: row.note || "Note saved"
    });
  });

  const { data: photoRows } = await supabaseClient
    .from("store_photos")
    .select("*")
    .eq("project_id", currentProjectId)
    .order("created_at", { ascending: false });

  photoRowsCache = Array.isArray(photoRows) ? photoRows : [];

  photoRowsCache.forEach(row => {
    events.push({
      type: "photo",
      store_id: String(row.store_id),
      timestamp: row.created_at || null,
      title: `📷 Photo uploaded for Store ${row.store_id}`,
      detail: "Field photo evidence captured"
    });
  });

  activityFeed = events
    .sort((a, b) => getTimestampValue(b.timestamp) - getTimestampValue(a.timestamp))
    .slice(0, 100);

  touchDataRefresh();
}

/* ================= MAP ================= */

function createGeoJson(stores) {
  return {
    type: "FeatureCollection",
    features: stores.map(store => ({
      type: "Feature",
      properties: {
        store_id: String(store.store_id),
        completed: statusMap[String(store.store_id)]?.completed === true,
        closed: statusMap[String(store.store_id)]?.closed === true
      },
      geometry: {
        type: "Point",
        coordinates: [store.lng, store.lat]
      }
    }))
  };
}

function buildMap() {
  geojsonData = createGeoJson(getFilteredStores());

  map.addSource("stores", {
    type: "geojson",
    data: geojsonData,
    cluster: true,
    clusterRadius: 50,
    clusterProperties: {
      completedCount: [
        "+",
        ["case", ["==", ["get", "completed"], true], 1, 0]
      ],
      totalCount: ["+", 1]
    }
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "stores",
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": 28,
      "circle-color": [
        "case",
        [">=", ["/", ["get", "completedCount"], ["get", "totalCount"]], 0.75], "#2ecc71",
        [">=", ["/", ["get", "completedCount"], ["get", "totalCount"]], 0.4], "#ff9900",
        "#ff2d2d"
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": "rgba(255,255,255,0.18)",
      "circle-opacity": 0.92
    }
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "stores",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count}",
      "text-size": 14
    },
    paint: {
      "text-color": "#ffffff"
    }
  });

  map.addLayer({
    id: "points",
    type: "circle",
    source: "stores",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": 8,
      "circle-color": [
        "case",
        ["==", ["get", "closed"], true], "#ff9900",
        ["==", ["get", "completed"], true], "#2ecc71",
        "#ff2d2d"
      ],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "rgba(255,255,255,0.35)"
    }
  });

  map.on("click", "points", handleStorePointClick);
  map.on("click", "clusters", handleClusterClick);

  map.on("mouseenter", "points", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "points", () => {
    map.getCanvas().style.cursor = "";
  });

  map.on("mouseenter", "clusters", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "clusters", () => {
    map.getCanvas().style.cursor = "";
  });
}

function rebuildFullMap() {
  if (!map.getSource("stores")) return;
  geojsonData = createGeoJson(getFilteredStores());
  map.getSource("stores").setData(geojsonData);
}

function rebuild() {
  rebuildFullMap();
}

function handleClusterClick(e) {
  const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
  if (!features.length) return;

  const clusterId = features[0].properties.cluster_id;
  map.getSource("stores").getClusterExpansionZoom(clusterId, (err, zoom) => {
    if (err) return;
    map.easeTo({
      center: features[0].geometry.coordinates,
      zoom
    });
  });
}

function handleStorePointClick(e) {
  const feature = e.features?.[0];
  if (!feature) return;
  const storeId = String(feature.properties.store_id);
  currentSelectedStoreId = storeId;
  updateSelectedStorePanel(storeId);
  openStoreModal(storeId);
}

function updateMapViewportForMode() {
  if (currentWorkspaceView === "photos") return;

  const filteredStores = getFilteredStores();

  if (filteredStores.length === 0) {
    map.easeTo({
      center: nationalOverviewEnabled ? NATIONAL_CENTER : DEFAULT_LOCAL_CENTER,
      zoom: nationalOverviewEnabled ? NATIONAL_ZOOM : DEFAULT_LOCAL_ZOOM,
      duration: 700
    });
    return;
  }

  if (nationalOverviewEnabled) {
    fitMapToStores(filteredStores, 48, 5.5);
    return;
  }

  if (filteredStores.length === 1) {
    map.easeTo({
      center: [filteredStores[0].lng, filteredStores[0].lat],
      zoom: 12.5,
      duration: 700
    });
    return;
  }

  fitMapToStores(filteredStores, 58, 8.75);
}

function fitMapToStores(stores, padding = 40, maxZoom = 8.5) {
  if (!stores || stores.length === 0) return;

  const bounds = new mapboxgl.LngLatBounds();

  stores.forEach(store => {
    if (Number.isFinite(store.lng) && Number.isFinite(store.lat)) {
      bounds.extend([store.lng, store.lat]);
    }
  });

  if (bounds.isEmpty()) return;

  map.fitBounds(bounds, {
    padding,
    maxZoom,
    duration: 700
  });
}

function setMapModeTags() {
  const filteredCount = getFilteredStores().length;

  setText("mapModeTag", nationalOverviewEnabled ? "National Overview" : "Project View");

  const parts = [];
  if (activeFilters.region) parts.push(activeFilters.region);
  if (activeFilters.territory) parts.push(activeFilters.territory);
  if (activeFilters.state) parts.push(activeFilters.state);

  setText(
    "mapScopeTag",
    parts.length
      ? `${parts.join(" • ")} • ${filteredCount.toLocaleString()} stores`
      : `${filteredCount.toLocaleString()} stores in scope`
  );
}

/* ================= DASHBOARD / INTEL / SUMMARIES ================= */

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
  if (nationalOverviewEnabled) {
    parts.push("National View");
  } else {
    parts.push("Project View");
  }

  if (activeFilters.region) parts.push(activeFilters.region);
  if (activeFilters.territory) parts.push(activeFilters.territory);
  if (activeFilters.state) parts.push(activeFilters.state);

  if (metrics.totalStores > 0) {
    parts.push(`${metrics.totalStores.toLocaleString()} stores`);
  }

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

  setText("intelSelectedStoreId", `Store ${store.store_id}`);
  setText("intelSelectedStoreAddress", parts.join(" • "));
}

/* ================= PHOTO LIBRARY ================= */

function bindPhotoLibraryUI() {
  const typeFilter = document.getElementById("photoTypeFilter");
  const sortFilter = document.getElementById("photoSortFilter");
  const groupFilter = document.getElementById("photoGroupFilter");
  const searchInput = document.getElementById("photoSearchInput");
  const openLightboxBtn = document.getElementById("photoDetailOpenLightboxBtn");
  const jumpToStoreBtn = document.getElementById("photoDetailJumpToStoreBtn");

  if (typeFilter && !typeFilter.dataset.bound) {
    typeFilter.addEventListener("change", () => {
      photoLibraryFilters.type = typeFilter.value;
      renderPhotoLibrary();
    });
    typeFilter.dataset.bound = "true";
  }

  if (sortFilter && !sortFilter.dataset.bound) {
    sortFilter.addEventListener("change", () => {
      photoLibraryFilters.sort = sortFilter.value;
      renderPhotoLibrary();
    });
    sortFilter.dataset.bound = "true";
  }

  if (groupFilter && !groupFilter.dataset.bound) {
    groupFilter.addEventListener("change", () => {
      photoLibraryFilters.group = groupFilter.value;
      renderPhotoLibrary();
    });
    groupFilter.dataset.bound = "true";
  }

  if (searchInput && !searchInput.dataset.bound) {
    searchInput.addEventListener("input", () => {
      photoLibraryFilters.search = searchInput.value.trim();
      renderPhotoLibrary();
    });
    searchInput.dataset.bound = "true";
  }

  if (openLightboxBtn && !openLightboxBtn.dataset.bound) {
    openLightboxBtn.addEventListener("click", () => {
      if (currentPhotoLibrarySelection?.url) {
        openPhotoLightbox(currentPhotoLibrarySelection.url);
      }
    });
    openLightboxBtn.dataset.bound = "true";
  }

  if (jumpToStoreBtn && !jumpToStoreBtn.dataset.bound) {
    jumpToStoreBtn.addEventListener("click", () => {
      if (currentPhotoLibrarySelection?.store_id) {
        jumpToStoreFromPhoto(currentPhotoLibrarySelection.store_id);
      }
    });
    jumpToStoreBtn.dataset.bound = "true";
  }
}

function getPhotoUrlFromRow(row) {
  if (row.image_url) return row.image_url;
  if (row.url) return row.url;
  if (row.public_url) return row.public_url;

  if (row.storage_path && resolvedPhotoBucket) {
    const { data } = supabaseClient.storage.from(resolvedPhotoBucket).getPublicUrl(row.storage_path);
    return data?.publicUrl || "";
  }

  return "";
}

function getScopedPhotoRows() {
  const filteredStores = getFilteredStores();
  const filteredIds = new Set(filteredStores.map(store => String(store.store_id)));

  return photoRowsCache
    .filter(row => filteredIds.has(String(row.store_id)))
    .map(row => {
      const store = storeData.find(s => String(s.store_id) === String(row.store_id)) || null;
      const photoType = normalizePhotoType(row.photo_type || row.type || "");
      const url = getPhotoUrlFromRow(row);

      return {
        ...row,
        store,
        store_id: String(row.store_id),
        photo_type: photoType,
        url,
        created_at: row.created_at || null
      };
    })
    .filter(item => !!item.url);
}

function getFilteredPhotoLibraryRows() {
  return getScopedPhotoRows().filter(row => {
    if (photoLibraryFilters.type && row.photo_type !== photoLibraryFilters.type) return false;

    if (photoLibraryFilters.search) {
      const needle = photoLibraryFilters.search.toLowerCase();
      const haystack = [
        row.store_id,
        row.store?.full_address || "",
        row.store?.territory || "",
        row.store?.state || ""
      ].join(" ").toLowerCase();

      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
}

function sortPhotoLibraryRows(rows) {
  const sorted = [...rows];

  if (photoLibraryFilters.sort === "oldest") {
    sorted.sort((a, b) => getTimestampValue(a.created_at) - getTimestampValue(b.created_at));
  } else if (photoLibraryFilters.sort === "store_asc") {
    sorted.sort((a, b) => a.store_id.localeCompare(b.store_id, undefined, { numeric: true }));
  } else if (photoLibraryFilters.sort === "store_desc") {
    sorted.sort((a, b) => b.store_id.localeCompare(a.store_id, undefined, { numeric: true }));
  } else {
    sorted.sort((a, b) => getTimestampValue(b.created_at) - getTimestampValue(a.created_at));
  }

  return sorted;
}

function buildGroupedRows(rows, labelGetter) {
  const grouped = new Map();

  rows.forEach(row => {
    const label = labelGetter(row);
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label).push(row);
  });

  return [...grouped.entries()].map(([label, items]) => ({ label, items }));
}

function groupPhotoLibraryRows(rows) {
  if (photoLibraryFilters.group === "store") {
    return buildGroupedRows(rows, row => `Store ${row.store_id}`);
  }

  if (photoLibraryFilters.group === "date") {
    return buildGroupedRows(rows, row => {
      const date = new Date(row.created_at || "");
      if (Number.isNaN(date.getTime())) return "Unknown Date";
      return date.toLocaleDateString();
    });
  }

  if (photoLibraryFilters.group === "territory") {
    return buildGroupedRows(rows, row => row.store?.territory || "Unassigned Territory");
  }

  return [{ label: "", items: rows }];
}

function renderPhotoLibrary() {
  const grid = document.getElementById("photoLibraryGrid");
  const emptyShell = document.getElementById("photoLibraryEmptyShell");
  const photoView = document.getElementById("photoLibraryWorkspaceView");

  if (!grid || currentWorkspaceView !== "photos") return;

  if (photoView) {
    photoView.style.overflowY = "auto";
    photoView.style.webkitOverflowScrolling = "touch";
  }

  const rows = sortPhotoLibraryRows(getFilteredPhotoLibraryRows());

  setText("photoLibraryResultCount", `${rows.length.toLocaleString()} photos in current scope`);

  if (rows.length === 0) {
    grid.innerHTML = "";
    emptyShell?.classList.remove("hidden");
    resetPhotoLibraryDetail();
    updateHeaderMetaAndSummaries();
    return;
  }

  emptyShell?.classList.add("hidden");
  grid.innerHTML = "";

  if (currentPhotoLibrarySelection) {
    const exists = rows.some(row => getPhotoSelectionKey(row) === currentPhotoLibrarySelection.key);
    if (!exists) {
      currentPhotoLibrarySelection = null;
      resetPhotoLibraryDetail();
    }
  }

  const grouped = groupPhotoLibraryRows(rows);

  grouped.forEach(group => {
    if (group.label) {
      const header = document.createElement("div");
      header.className = "photoLibraryGroupHeader";
      header.textContent = group.label;
      header.style.gridColumn = "1 / -1";
      header.style.fontWeight = "800";
      header.style.fontSize = "14px";
      header.style.opacity = "0.9";
      header.style.margin = "4px 0 0";
      grid.appendChild(header);
    }

    group.items.forEach(row => {
      const key = getPhotoSelectionKey(row);
      const card = document.createElement("div");
      card.className = "photoLibraryCard";
      if (currentPhotoLibrarySelection?.key === key) {
        card.classList.add("active");
      }

      const imageWrap = document.createElement("div");
      imageWrap.className = "photoLibraryImageWrap";

      const image = document.createElement("img");
      image.className = "photoLibraryImage";
      image.src = row.url;
      image.alt = `Store ${row.store_id} photo`;
      image.loading = "lazy";
      imageWrap.appendChild(image);

      const body = document.createElement("div");
      body.className = "photoLibraryCardBody";

      const top = document.createElement("div");
      top.className = "photoLibraryCardTop";

      const store = document.createElement("div");
      store.className = "photoLibraryStore";
      store.textContent = `Store ${row.store_id}`;

      const typePill = document.createElement("div");
      typePill.className = "photoLibraryTypePill";
      typePill.textContent = row.photo_type;

      top.appendChild(store);
      top.appendChild(typePill);

      const meta = document.createElement("div");
      meta.className = "photoLibraryMeta";
      meta.textContent = [
        row.store?.full_address || "No address",
        row.store?.territory ? `Territory ${row.store.territory}` : "",
        formatPhotoDate(row.created_at)
      ].filter(Boolean).join(" • ");

      body.appendChild(top);
      body.appendChild(meta);

      card.appendChild(imageWrap);
      card.appendChild(body);

      card.addEventListener("click", () => {
        currentPhotoLibrarySelection = {
          key,
          store_id: row.store_id,
          url: row.url,
          row
        };
        populatePhotoLibraryDetail(row);
        renderPhotoLibrary();
      });

      grid.appendChild(card);
    });
  });

  if (!currentPhotoLibrarySelection && rows.length > 0) {
    const first = rows[0];
    currentPhotoLibrarySelection = {
      key: getPhotoSelectionKey(first),
      store_id: first.store_id,
      url: first.url,
      row: first
    };
    populatePhotoLibraryDetail(first);
    renderPhotoLibrary();
    return;
  }

  updateHeaderMetaAndSummaries();
}

function populatePhotoLibraryDetail(row) {
  const empty = document.getElementById("photoDetailEmptyState");
  const content = document.getElementById("photoDetailContent");
  const preview = document.getElementById("photoDetailPreview");

  if (!row) {
    resetPhotoLibraryDetail();
    return;
  }

  empty?.classList.add("hidden");
  content?.classList.remove("hidden");
  if (preview) preview.src = row.url;

  setText("photoDetailHeroTitle", `Store ${row.store_id} evidence`);
  setText("photoDetailStore", `Store ${row.store_id}`);
  setText("photoDetailAddress", row.store?.full_address || "No address");
  setText("photoDetailType", row.photo_type || "other");
  setText("photoDetailTimestamp", formatPhotoDate(row.created_at));
  setText("photoDetailTerritory", row.store?.territory || "—");
  setText("photoDetailState", row.store?.state || "—");
  setText("photoDetailHeroTypePill", row.photo_type || "other");

  updateHeaderMetaAndSummaries();
}

function resetPhotoLibraryDetail() {
  currentPhotoLibrarySelection = null;

  document.getElementById("photoDetailEmptyState")?.classList.remove("hidden");
  document.getElementById("photoDetailContent")?.classList.add("hidden");

  const preview = document.getElementById("photoDetailPreview");
  if (preview) preview.src = "";

  setText("photoDetailHeroTitle", "Store Evidence");
  setText("photoDetailHeroTypePill", "other");
  updateHeaderMetaAndSummaries();
}

function jumpToStoreFromPhoto(storeId) {
  const store = storeData.find(item => String(item.store_id) === String(storeId));
  if (!store) return;

  currentWorkspaceView = "map";
  localStorage.setItem(ACTIVE_VIEW_KEY, currentWorkspaceView);
  updateWorkspaceViewUI();

  currentSelectedStoreId = String(storeId);
  updateSelectedStorePanel(storeId);

  map.flyTo({
    center: [store.lng, store.lat],
    zoom: 14
  });
}

/* ================= MODAL / STORE DETAILS ================= */

function openStoreModal(storeId) {
  currentModalStoreId = storeId;
  updateSelectedStorePanel(storeId);

  const modal = document.getElementById("confirmModal");
  if (!modal) return;

  modal.classList.remove("hidden");
  setText("confirmStoreId", `Store ID: ${storeId}`);

  const store = storeData.find(item => String(item.store_id) === String(storeId));
  setText("confirmAddress", store?.full_address || "");

  const markActive = document.getElementById("markActive");
  const markCompleted = document.getElementById("markCompleted");
  const markClosed = document.getElementById("markClosed");
  const addNoteBtn = document.getElementById("addNoteBtn");
  const addToRouteBtn = document.getElementById("addToRouteBtn");
  const uploadPhotoBtn = document.getElementById("uploadPhotoBtn");
  const confirmCancel = document.getElementById("confirmCancel");

  if (markActive) markActive.onclick = () => updateStore(storeId, false, false);
  if (markCompleted) markCompleted.onclick = () => updateStore(storeId, true, false);
  if (markClosed) markClosed.onclick = () => updateStore(storeId, false, true);
  if (addNoteBtn) addNoteBtn.onclick = () => addNote(storeId);
  if (addToRouteBtn) addToRouteBtn.onclick = () => addStoreToRoute(storeId);
  if (uploadPhotoBtn) uploadPhotoBtn.onclick = () => uploadPhoto(storeId);
  if (confirmCancel) {
    confirmCancel.onclick = () => {
      modal.classList.add("hidden");
    };
  }

  loadNotes(storeId);
  loadPhotos(storeId);
  updateWriteAccessUI();
  updateRouteModeUI();
  clearPhotoMessage();
}

async function updateStore(storeId, completed, closed) {
  if (!isSignedIn()) {
    alert("Sign in to update store status.");
    return;
  }

  const { error } = await supabaseClient
    .from("store_status")
    .upsert({
      project_id: currentProjectId,
      store_id: storeId,
      completed,
      closed
    });

  if (error) {
    console.error(error);
    alert(error.message || "Store update failed.");
    return;
  }

  statusMap[String(storeId)] = { completed, closed };
  touchDataRefresh();

  prependActivity({
    type: completed ? "status-completed" : closed ? "status-closed" : "status-active",
    store_id: String(storeId),
    timestamp: new Date().toISOString(),
    title: completed
      ? `✔ Store ${storeId} completed`
      : closed
        ? `⚠ Store ${storeId} closed`
        : `• Store ${storeId} active`,
    detail: "Status updated"
  });

  rebuild();
  updateHeaderDashboard();
  updateScopeSummary();
  updateActivityList();
  updateIntelRail();
  updateSelectedStorePanel(storeId);
  renderPhotoLibrary();
}

async function addNote(storeId) {
  if (!isSignedIn()) {
    alert("Sign in to add notes.");
    return;
  }

  const note = document.getElementById("noteBox")?.value.trim() || "";
  if (!note) return;

  const { error } = await supabaseClient
    .from("store_notes")
    .insert({
      project_id: currentProjectId,
      store_id: storeId,
      note
    });

  if (error) {
    console.error(error);
    alert(error.message || "Adding note failed.");
    return;
  }

  const noteBox = document.getElementById("noteBox");
  if (noteBox) noteBox.value = "";

  touchDataRefresh();

  prependActivity({
    type: "note",
    store_id: String(storeId),
    timestamp: new Date().toISOString(),
    title: `📝 Note added to Store ${storeId}`,
    detail: note
  });

  updateHeaderDashboard();
  updateActivityList();
  updateIntelRail();
  await loadNotes(storeId);
}

async function loadNotes(storeId) {
  const { data, error } = await supabaseClient
    .from("store_notes")
    .select("*")
    .eq("project_id", currentProjectId)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  const container = document.getElementById("notesList");
  if (!container) return;

  container.innerHTML = "";

  if (error) {
    console.error(error);
    container.innerHTML = "Unable to load notes.";
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = "No notes yet.";
    return;
  }

  data.forEach(row => {
    const div = document.createElement("div");
    div.className = "noteItem";
    div.innerText = row.note;
    container.appendChild(div);
  });
}

/* ================= PHOTOS ================= */

function bindPhotoUI() {
  const uploadBtn = document.getElementById("uploadPhotoBtn");
  if (!uploadBtn || uploadBtn.dataset.bound) return;

  uploadBtn.addEventListener("click", () => {
    if (currentModalStoreId) uploadPhoto(currentModalStoreId);
  });

  uploadBtn.dataset.bound = "true";
}

function bindLightboxUI() {
  const lightbox = document.getElementById("photoLightbox");
  const closeBtn = document.getElementById("closeLightboxBtn");

  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.addEventListener("click", closePhotoLightbox);
    closeBtn.dataset.bound = "true";
  }

  if (lightbox && !lightbox.dataset.bound) {
    lightbox.addEventListener("click", (e) => {
      if (e.target.id === "photoLightbox") closePhotoLightbox();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePhotoLightbox();
    });

    lightbox.dataset.bound = "true";
  }
}

async function resolvePhotoBucketName() {
  if (resolvedPhotoBucket) return resolvedPhotoBucket;

  for (const bucketName of PHOTO_BUCKET_CANDIDATES) {
    try {
      const { error } = await supabaseClient.storage.from(bucketName).list("", { limit: 1 });
      if (!error) {
        resolvedPhotoBucket = bucketName;
        return resolvedPhotoBucket;
      }
    } catch (error) {
      console.warn("Bucket probe failed:", bucketName, error);
    }
  }

  resolvedPhotoBucket = PHOTO_BUCKET_CANDIDATES[0];
  return resolvedPhotoBucket;
}

function buildPhotoPath(storeId, file) {
  const safeName = sanitizeFileName(file.name);
  return `${currentProjectId}/${storeId}/${Date.now()}-${safeName}`;
}

function setPhotoMessage(message = "", isError = false) {
  const el = document.getElementById("photoUploadMessage");
  if (!el) return;

  el.textContent = message;
  el.style.color = isError ? "#ff6b6b" : "#d7f9e0";
}

function clearPhotoMessage() {
  setPhotoMessage("");
}

function clearPhotoUI() {
  const input = document.getElementById("photoInput");
  const gallery = document.getElementById("photoGallery");

  if (input) input.value = "";
  if (gallery) gallery.innerHTML = "";
  clearPhotoMessage();
}

async function compressImageFile(file, maxDimension = 1600, quality = 0.82) {
  if (!file || !file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  let targetWidth = width;
  let targetHeight = height;

  if (width > height && width > maxDimension) {
    targetWidth = maxDimension;
    targetHeight = Math.round((height / width) * maxDimension);
  } else if (height >= width && height > maxDimension) {
    targetHeight = maxDimension;
    targetWidth = Math.round((width / height) * maxDimension);
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise(resolve => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });

  if (!blob) return file;

  const compressedName = sanitizeFileName(file.name).replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], compressedName, {
    type: "image/jpeg",
    lastModified: Date.now()
  });
}

async function uploadPhoto(storeId) {
  if (!isSignedIn()) {
    alert("Sign in to upload photos.");
    return;
  }

  const input = document.getElementById("photoInput");
  const originalFile = input?.files?.[0];

  if (!originalFile) {
    setPhotoMessage("Choose a photo first.", true);
    return;
  }

  setPhotoMessage("Compressing and uploading photo...");

  let file = originalFile;
  try {
    file = await compressImageFile(originalFile);
  } catch (error) {
    console.warn("Compression failed, using original file.", error);
    file = originalFile;
  }

  const bucketName = await resolvePhotoBucketName();
  const path = buildPhotoPath(storeId, file);

  const { error: uploadError } = await supabaseClient.storage
    .from(bucketName)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false
    });

  if (uploadError) {
    console.error(uploadError);
    setPhotoMessage(uploadError.message || "Photo upload failed.", true);
    return;
  }

  const { data: publicData } = supabaseClient.storage.from(bucketName).getPublicUrl(path);
  const imageUrl = publicData?.publicUrl || "";

  const { error: rowError } = await supabaseClient
    .from("store_photos")
    .insert({
      project_id: currentProjectId,
      store_id: storeId,
      image_url: imageUrl,
      storage_path: path
    });

  if (rowError) {
    console.error(rowError);
    setPhotoMessage(rowError.message || "Photo metadata save failed.", true);
    return;
  }

  photoRowsCache.unshift({
    id: cryptoRandomKey(),
    project_id: currentProjectId,
    store_id: String(storeId),
    image_url: imageUrl,
    storage_path: path,
    created_at: new Date().toISOString(),
    photo_type: "other"
  });

  touchDataRefresh();

  prependActivity({
    type: "photo",
    store_id: String(storeId),
    timestamp: new Date().toISOString(),
    title: `📷 Photo uploaded for Store ${storeId}`,
    detail: `${formatFileSize(originalFile.size)} → ${formatFileSize(file.size)}`
  });

  if (input) input.value = "";

  updateHeaderDashboard();
  updateScopeSummary();
  updateActivityList();
  updateIntelRail();
  updateSelectedStorePanel(storeId);
  renderPhotoLibrary();
  setPhotoMessage(`Photo uploaded successfully (${formatFileSize(originalFile.size)} → ${formatFileSize(file.size)}).`);
  await loadPhotos(storeId);
}

async function loadPhotos(storeId) {
  const gallery = document.getElementById("photoGallery");
  if (!gallery) return;

  gallery.innerHTML = `<div class="photoEmptyState">Loading photos…</div>`;

  const { data, error } = await supabaseClient
    .from("store_photos")
    .select("*")
    .eq("project_id", currentProjectId)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    gallery.innerHTML = `<div class="photoEmptyState">Unable to load photos.</div>`;
    return;
  }

  if (!data || data.length === 0) {
    gallery.innerHTML = `<div class="photoEmptyState">No photos uploaded yet.</div>`;
    return;
  }

  const bucketName = await resolvePhotoBucketName();
  gallery.innerHTML = "";

  data.forEach(row => {
    let imageUrl = row.image_url || "";

    if (!imageUrl && row.storage_path) {
      const { data: publicData } = supabaseClient.storage.from(bucketName).getPublicUrl(row.storage_path);
      imageUrl = publicData?.publicUrl || "";
    }

    const card = document.createElement("div");
    card.className = "photoCard";

    const img = document.createElement("img");
    img.className = "photoThumb";
    img.alt = `Store ${storeId} photo`;
    img.src = imageUrl;
    img.loading = "lazy";

    const meta = document.createElement("div");
    meta.className = "photoMeta";
    meta.textContent = formatPhotoDate(row.created_at);

    card.appendChild(img);
    card.appendChild(meta);

    card.addEventListener("click", () => {
      if (imageUrl) openPhotoLightbox(imageUrl);
    });

    gallery.appendChild(card);
  });
}

function openPhotoLightbox(url) {
  const lightbox = document.getElementById("photoLightbox");
  const image = document.getElementById("lightboxImage");
  if (!lightbox || !image) return;

  image.src = url;
  lightbox.classList.remove("hidden");
}

function closePhotoLightbox() {
  const lightbox = document.getElementById("photoLightbox");
  const image = document.getElementById("lightboxImage");
  if (!lightbox || !image) return;

  lightbox.classList.add("hidden");
  image.src = "";
}

/* ================= SEARCH ================= */

function bindSearch() {
  const input = document.getElementById("storeSearch");
  if (!input || input.dataset.bound) return;

  input.addEventListener("input", (e) => {
    const value = e.target.value.trim();
    const match = storeData.find(store => String(store.store_id) === value);

    if (!match) return;

    currentSelectedStoreId = String(match.store_id);
    updateSelectedStorePanel(match.store_id);

    currentWorkspaceView = "map";
    localStorage.setItem(ACTIVE_VIEW_KEY, currentWorkspaceView);
    updateWorkspaceViewUI();

    map.flyTo({
      center: [match.lng, match.lat],
      zoom: 14
    });

    if (window.innerWidth <= 900) {
      document.body.classList.remove("sidebar-open");
    }
  });

  input.dataset.bound = "true";
}

/* ================= ACTIVITY ================= */

function updateActivityList() {
  const container = document.getElementById("activityList");
  const countPill = document.getElementById("activityCountPill");
  if (!container) return;

  container.innerHTML = "";

  const filteredIds = new Set(getFilteredStores().map(store => String(store.store_id)));
  const items = activityFeed
    .filter(item => filteredIds.has(String(item.store_id)))
    .slice(0, 12);

  if (countPill) countPill.textContent = items.length;

  if (items.length === 0) {
    container.innerHTML = `<div class="activity-empty">No recent activity yet.</div>`;
    return;
  }

  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "activityItem";

    if (item.type === "status-completed") div.style.borderLeftColor = "#2ecc71";
    else if (item.type === "status-closed") div.style.borderLeftColor = "#ff9900";
    else if (item.type === "photo") div.style.borderLeftColor = "#64b5f6";
    else if (item.type === "note") div.style.borderLeftColor = "#d4a5ff";

    const time = document.createElement("div");
    time.className = "activityTime";
    time.textContent = formatActivityTime(item.timestamp);

    const title = document.createElement("div");
    title.className = "activityTitle";
    title.textContent = item.title;

    const detail = document.createElement("div");
    detail.className = "activityDetail";
    detail.textContent = item.detail || "";

    div.appendChild(time);
    div.appendChild(title);
    div.appendChild(detail);

    div.onclick = () => {
      const match = storeData.find(store => String(store.store_id) === String(item.store_id));
      if (!match) return;

      currentSelectedStoreId = String(match.store_id);
      updateSelectedStorePanel(match.store_id);

      currentWorkspaceView = "map";
      localStorage.setItem(ACTIVE_VIEW_KEY, currentWorkspaceView);
      updateWorkspaceViewUI();

      map.flyTo({
        center: [match.lng, match.lat],
        zoom: 14
      });

      if (window.innerWidth <= 900) {
        document.body.classList.remove("sidebar-open");
      }
    };

    container.appendChild(div);
  });
}

/* ================= ROUTE BUILDER ================= */

function restoreRouteState() {
  try {
    routeModeEnabled = localStorage.getItem(routeModeKey()) === "true";
    const saved = JSON.parse(localStorage.getItem(routeStopsKey()) || "[]");
    selectedRouteStops = saved.filter(storeId =>
      storeData.some(store => String(store.store_id) === String(storeId))
    );
  } catch (error) {
    console.error("Route restore failed:", error);
    routeModeEnabled = false;
    selectedRouteStops = [];
  }
}

function persistRouteState() {
  localStorage.setItem(routeModeKey(), String(routeModeEnabled));
  localStorage.setItem(routeStopsKey(), JSON.stringify(selectedRouteStops));
}

function bindRouteBuilder() {
  const routeModeToggle = document.getElementById("routeModeToggle");
  const addRouteStoreBtn = document.getElementById("addRouteStoreBtn");
  const clearRouteBtn = document.getElementById("clearRouteBtn");
  const openRouteBtn = document.getElementById("openRouteBtn");
  const routeStoreInput = document.getElementById("routeStoreInput");

  if (routeModeToggle && !routeModeToggle.dataset.bound) {
    routeModeToggle.addEventListener("change", () => {
      routeModeEnabled = routeModeToggle.checked;
      persistRouteState();
      updateRouteModeUI();
    });
    routeModeToggle.dataset.bound = "true";
  }

  if (addRouteStoreBtn && !addRouteStoreBtn.dataset.bound) {
    addRouteStoreBtn.addEventListener("click", () => {
      const storeId = routeStoreInput?.value.trim() || "";
      if (!storeId) return;
      addStoreToRoute(storeId);
      if (routeStoreInput) routeStoreInput.value = "";
    });
    addRouteStoreBtn.dataset.bound = "true";
  }

  if (routeStoreInput && !routeStoreInput.dataset.bound) {
    routeStoreInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addRouteStoreBtn?.click();
      }
    });
    routeStoreInput.dataset.bound = "true";
  }

  if (clearRouteBtn && !clearRouteBtn.dataset.bound) {
    clearRouteBtn.addEventListener("click", () => {
      selectedRouteStops = [];
      persistRouteState();
      renderRouteStops();
    });
    clearRouteBtn.dataset.bound = "true";
  }

  if (openRouteBtn && !openRouteBtn.dataset.bound) {
    openRouteBtn.addEventListener("click", () => {
      const url = buildGoogleMapsRouteUrl();
      if (url) window.open(url, "_blank");
    });
    openRouteBtn.dataset.bound = "true";
  }
}

function updateRouteModeUI() {
  const routeModeToggle = document.getElementById("routeModeToggle");
  const addRouteStoreBtn = document.getElementById("addRouteStoreBtn");
  const routeStoreInput = document.getElementById("routeStoreInput");
  const addToRouteBtn = document.getElementById("addToRouteBtn");

  if (routeModeToggle) routeModeToggle.checked = routeModeEnabled;
  if (addRouteStoreBtn) addRouteStoreBtn.disabled = !routeModeEnabled;
  if (routeStoreInput) routeStoreInput.disabled = !routeModeEnabled;

  if (addToRouteBtn) {
    addToRouteBtn.disabled = !routeModeEnabled;
    addToRouteBtn.textContent = routeModeEnabled ? "Add to Route" : "Enable Route Mode";
  }
}

function addStoreToRoute(storeId) {
  if (!routeModeEnabled) {
    alert("Turn on Route Mode first.");
    return;
  }

  const normalized = String(storeId);
  const store = storeData.find(item => String(item.store_id) === normalized);

  if (!store) {
    alert("Store ID not found in current project.");
    return;
  }

  if (selectedRouteStops.includes(normalized)) {
    alert("That store is already in the route.");
    return;
  }

  if (selectedRouteStops.length >= 10) {
    alert("For reliability, the route is currently capped at 10 stops.");
    return;
  }

  selectedRouteStops.push(normalized);
  persistRouteState();
  renderRouteStops();
}

function removeRouteStop(storeId) {
  selectedRouteStops = selectedRouteStops.filter(id => id !== storeId);
  persistRouteState();
  renderRouteStops();
}

function moveRouteStop(storeId, direction) {
  const currentIndex = selectedRouteStops.indexOf(storeId);
  if (currentIndex === -1) return;

  const newIndex = currentIndex + direction;
  if (newIndex < 0 || newIndex >= selectedRouteStops.length) return;

  const updated = [...selectedRouteStops];
  const [item] = updated.splice(currentIndex, 1);
  updated.splice(newIndex, 0, item);
  selectedRouteStops = updated;
  persistRouteState();
  renderRouteStops();
}

function createRouteMiniButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "routeMiniBtn";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderRouteStops() {
  const list = document.getElementById("selectedStopsList");
  const empty = document.getElementById("selectedStopsEmpty");
  const openRouteBtn = document.getElementById("openRouteBtn");
  const clearRouteBtn = document.getElementById("clearRouteBtn");

  if (!list || !empty || !openRouteBtn || !clearRouteBtn) return;

  list.innerHTML = "";

  if (selectedRouteStops.length === 0) {
    empty.style.display = "block";
    openRouteBtn.disabled = true;
    clearRouteBtn.disabled = true;
    updateRouteMetrics();
    return;
  }

  empty.style.display = "none";
  openRouteBtn.disabled = false;
  clearRouteBtn.disabled = false;

  selectedRouteStops.forEach((storeId, index) => {
    const store = storeData.find(item => String(item.store_id) === String(storeId));
    if (!store) return;

    const item = document.createElement("div");
    item.className = "routeStopItem";

    const top = document.createElement("div");
    top.className = "routeStopTop";

    const title = document.createElement("div");
    title.className = "routeStopTitle";
    title.textContent = `${index + 1}. Store ${storeId}`;
    top.appendChild(title);

    const address = document.createElement("div");
    address.className = "routeStopAddress";
    address.textContent = store.full_address || "No address found";

    const actions = document.createElement("div");
    actions.className = "routeStopActions";

    const flyBtn = createRouteMiniButton("View", () => {
      currentSelectedStoreId = String(storeId);
      updateSelectedStorePanel(storeId);

      currentWorkspaceView = "map";
      localStorage.setItem(ACTIVE_VIEW_KEY, currentWorkspaceView);
      updateWorkspaceViewUI();

      map.flyTo({ center: [store.lng, store.lat], zoom: 14 });

      if (window.innerWidth <= 900) {
        document.body.classList.remove("sidebar-open");
      }
    });

    const upBtn = createRouteMiniButton("↑", () => moveRouteStop(String(storeId), -1));
    upBtn.disabled = index === 0;

    const downBtn = createRouteMiniButton("↓", () => moveRouteStop(String(storeId), 1));
    downBtn.disabled = index === selectedRouteStops.length - 1;

    const removeBtn = createRouteMiniButton("Remove", () => removeRouteStop(String(storeId)));

    actions.appendChild(flyBtn);
    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    actions.appendChild(removeBtn);

    item.appendChild(top);
    item.appendChild(address);
    item.appendChild(actions);

    list.appendChild(item);
  });

  updateRouteMetrics();
}

function buildGoogleMapsRouteUrl() {
  if (selectedRouteStops.length === 0) {
    alert("Add at least one stop to build a route.");
    return "";
  }

  const coords = selectedRouteStops
    .map(storeId => storeData.find(store => String(store.store_id) === String(storeId)))
    .filter(Boolean)
    .map(store => `${store.lat},${store.lng}`);

  if (coords.length === 0) return "";

  if (coords.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coords[0])}&travelmode=driving`;
  }

  const origin = coords[0];
  const destination = coords[coords.length - 1];
  const waypoints = coords.slice(1, -1).join("|");

  let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  if (waypoints.length > 0) {
    url += `&waypoints=${encodeURIComponent(waypoints)}`;
  }
  return url;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * (Math.PI / 180);
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

function estimateOptimalRouteMiles(routeStores) {
  if (routeStores.length < 2) return 0;
  if (routeStores.length === 2) {
    return haversineMiles(
      routeStores[0].lat,
      routeStores[0].lng,
      routeStores[1].lat,
      routeStores[1].lng
    );
  }

  const remaining = routeStores.slice(1);
  const ordered = [routeStores[0]];
  let current = routeStores[0];

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    remaining.forEach((candidate, index) => {
      const distance = haversineMiles(current.lat, current.lng, candidate.lat, candidate.lng);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    const [nextStore] = remaining.splice(nearestIndex, 1);
    ordered.push(nextStore);
    current = nextStore;
  }

  let total = 0;
  for (let i = 1; i < ordered.length; i++) {
    total += haversineMiles(
      ordered[i - 1].lat,
      ordered[i - 1].lng,
      ordered[i].lat,
      ordered[i].lng
    );
  }

  return total;
}

function updateRouteMetrics() {
  const routeStores = selectedRouteStops
    .map(storeId => storeData.find(store => String(store.store_id) === String(storeId)))
    .filter(Boolean);

  const stops = routeStores.length;
  let miles = 0;

  for (let i = 1; i < routeStores.length; i++) {
    miles += haversineMiles(
      routeStores[i - 1].lat,
      routeStores[i - 1].lng,
      routeStores[i].lat,
      routeStores[i].lng
    );
  }

  const optimalMiles = estimateOptimalRouteMiles(routeStores);

  let efficiency = "—";
  let detail = "Add stops to calculate route efficiency.";

  if (stops >= 2) {
    const score = miles > 0 && optimalMiles > 0
      ? Math.max(1, Math.min(100, Math.round((optimalMiles / miles) * 100)))
      : 100;

    efficiency = `${score}%`;
    detail = "Approx route order efficiency based on straight-line stop sequencing.";
  }

  setText("routeMetricStops", String(stops));
  setText("routeMetricMiles", stops >= 2 ? miles.toFixed(1) : "0");
  setText("routeMetricScore", efficiency);
  setText("routeMetricDetail", detail);
}