mapboxgl.accessToken = "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9.3-ZXlPJosjQ4c5bucpnWYA";

const SUPABASE_URL = "https://dapjhrbfqtsgdlasuuam.supabase.co";
const SUPABASE_KEY = "sb_publishable_DF55L6u6QxGU9Tfo_9MvZw_0Rv7zsJS";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const DEFAULT_PROJECT_ID = "central-fl-dollar-tree";
const PROJECTS_FILE = "data/projects.json";
const ACTIVE_PROJECT_KEY = "activeProjectId";
const EXECUTIVE_MODE_KEY = "executiveModeEnabled";

const PHOTO_BUCKET_CANDIDATES = ["store-photos", "store_photos", "photos"];
let resolvedPhotoBucket = null;

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-81.7, 27.8],
  zoom: 6.5
});

let storeData = [];
let statusMap = {};
let geojsonData;
let currentModalStoreId = null;
let routeModeEnabled = false;
let selectedRouteStops = [];
let projectList = [];
let currentProjectId = DEFAULT_PROJECT_ID;
let currentProjectMeta = null;

let currentSession = null;
let currentUser = null;
let currentRole = "viewer";

let activityFeed = [];
let recentPhotoCount = 0;
let statusRowsCache = [];
let executiveModeEnabled = false;

function routeModeKey() {
  return `routeModeEnabled:${currentProjectId}`;
}

function routeStopsKey() {
  return `selectedRouteStops:${currentProjectId}`;
}

function isSignedIn() {
  return !!currentUser;
}

function isAdmin() {
  return currentRole === "admin";
}

map.on("load", async () => {
  currentProjectId = localStorage.getItem(ACTIVE_PROJECT_KEY) || DEFAULT_PROJECT_ID;
  executiveModeEnabled = localStorage.getItem(EXECUTIVE_MODE_KEY) === "true";

  await initializeAuth();
  bindAuthUI();
  bindExecutiveModeUI();
  bindMobileSidebarUI();

  await loadProjects();
  bindProjectSelector();
  await loadActiveProject();
  bindSearch();
  bindRouteBuilder();
  bindPhotoUI();
  bindLightboxUI();

  updateAuthUI();
  updateRouteModeUI();
  updateExecutiveModeUI();
});

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
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;

  setAuthMessage("");

  if (!email || !password) {
    setAuthMessage("Email and password are required.", "error");
    return;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

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
  const authUserDisplay = document.getElementById("authUserDisplay");
  const authRoleDisplay = document.getElementById("authRoleDisplay");
  const importLink = document.getElementById("importProjectLink");

  if (isSignedIn()) {
    loggedOut.classList.add("hidden");
    loggedIn.classList.remove("hidden");
    authUserDisplay.textContent = currentUser.email || "Signed in";
    authRoleDisplay.textContent = `Role: ${currentRole}`;
  } else {
    loggedOut.classList.remove("hidden");
    loggedIn.classList.add("hidden");
    authUserDisplay.textContent = "";
    authRoleDisplay.textContent = "";
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
  const writeMessage = document.getElementById("writeAccessMessage");
  const markActive = document.getElementById("markActive");
  const markCompleted = document.getElementById("markCompleted");
  const markClosed = document.getElementById("markClosed");
  const addNoteBtn = document.getElementById("addNoteBtn");
  const noteBox = document.getElementById("noteBox");
  const photoInput = document.getElementById("photoInput");
  const uploadPhotoBtn = document.getElementById("uploadPhotoBtn");

  const writeEnabled = isSignedIn();

  if (markActive) markActive.disabled = !writeEnabled;
  if (markCompleted) markCompleted.disabled = !writeEnabled;
  if (markClosed) markClosed.disabled = !writeEnabled;
  if (addNoteBtn) addNoteBtn.disabled = !writeEnabled;
  if (noteBox) noteBox.disabled = !writeEnabled;
  if (photoInput) photoInput.disabled = !writeEnabled;
  if (uploadPhotoBtn) uploadPhotoBtn.disabled = !writeEnabled;

  if (writeMessage) {
    writeMessage.textContent = writeEnabled
      ? ""
      : "Sign in to update store status, add notes, and upload photos.";
  }
}

/* ================= EXECUTIVE MODE / MOBILE SIDEBAR ================= */

function bindExecutiveModeUI() {
  const toggle = document.getElementById("executiveModeToggle");
  const floatingExit = document.getElementById("floatingExecutiveExit");

  if (toggle && !toggle.dataset.bound) {
    toggle.addEventListener("change", () => {
      executiveModeEnabled = toggle.checked;
      localStorage.setItem(EXECUTIVE_MODE_KEY, String(executiveModeEnabled));
      updateExecutiveModeUI();
    });
    toggle.dataset.bound = "true";
  }

  if (floatingExit && !floatingExit.dataset.bound) {
    floatingExit.addEventListener("click", () => {
      executiveModeEnabled = false;
      localStorage.setItem(EXECUTIVE_MODE_KEY, "false");
      updateExecutiveModeUI();
    });
    floatingExit.dataset.bound = "true";
  }
}

function updateExecutiveModeUI() {
  document.body.classList.toggle("executive-mode", executiveModeEnabled);

  const toggle = document.getElementById("executiveModeToggle");
  const floatingExit = document.getElementById("floatingExecutiveExit");

  if (toggle) {
    toggle.checked = executiveModeEnabled;
  }

  if (floatingExit) {
    floatingExit.classList.toggle("hidden", !executiveModeEnabled);
  }

  if (executiveModeEnabled) {
    document.body.classList.remove("sidebar-open");
  }

  setTimeout(() => map.resize(), 180);
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
    setTimeout(() => map.resize(), 120);
  });
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

  await hydrate();
  await hydrateActivityFeed();
  restoreRouteState();

  if (map.getSource("stores")) {
    rebuildFullMap();
  } else {
    buildMap();
  }

  updateHeaderDashboard();
  updateActivityList();
  renderRouteStops();
  updateRouteModeUI();
  updateProjectSourceTag();

  if (currentModalStoreId) {
    currentModalStoreId = null;
    clearPhotoUI();
  }
}

function updateProjectSourceTag() {
  const tag = document.getElementById("projectSourceTag");
  if (!tag) return;
  tag.innerText = `${currentProjectMeta?.name || currentProjectId} · ${currentProjectMeta?.sourceLabel || "Project ready"}`;
}

/* ================= HYDRATE ================= */

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
    console.error("Supabase error:", error);
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
  recentPhotoCount = 0;

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
    .limit(20);

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
    .select("store_id, created_at")
    .eq("project_id", currentProjectId)
    .order("created_at", { ascending: false });

  recentPhotoCount = (photoRows || []).length;

  (photoRows || []).forEach(row => {
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
}

async function loadStoresForProject(projectId) {
  const { data, error } = await supabaseClient
    .from("stores")
    .select("store_id, lat, lng, full_address")
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
    full_address: String(store.full_address || "").trim()
  };
}

/* ================= MAP ================= */

function buildMap() {
  geojsonData = createGeoJson();

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

  map.on("click", "points", handleClick);
  map.on("click", "clusters", handleClusterClick);
}

function createGeoJson() {
  return {
    type: "FeatureCollection",
    features: storeData.map(store => ({
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

function rebuildFullMap() {
  geojsonData = createGeoJson();
  map.getSource("stores").setData(geojsonData);
}

/* ================= HEADER DASHBOARD ================= */

function updateHeaderDashboard() {
  const values = Object.values(statusMap);
  const totalStores = storeData.length;
  const completed = values.filter(v => v.completed).length;
  const closed = values.filter(v => v.closed).length;
  const active = totalStores - completed - closed;

  const actionableTotal = totalStores - closed;
  const percent = actionableTotal > 0 ? (completed / actionableTotal) * 100 : 0;

  const completedEvents = activityFeed.filter(item => item.type === "status-completed");
  const completedToday = completedEvents.filter(item => isToday(item.timestamp)).length;
  const avgPerDay = calculateAverageCompletedPerDay(completedEvents);
  const etaDays = avgPerDay > 0 ? active / avgPerDay : null;

  setText("dashboardProjectName", currentProjectMeta?.name || currentProjectId);
  setText("dashboardProjectSubline", `Operational visibility • ${currentProjectMeta?.sourceLabel || "Project ready"}`);
  setText("dashboardTotalStores", totalStores.toLocaleString());
  setText("dashboardCompletedStores", completed.toLocaleString());
  setText("dashboardActiveStores", active.toLocaleString());
  setText("dashboardClosedStores", closed.toLocaleString());
  setText("dashboardStoresToday", completedToday.toLocaleString());
  setText("dashboardAvgPerDay", avgPerDay > 0 ? avgPerDay.toFixed(1) : "—");
  setText("dashboardPhotoCount", recentPhotoCount.toLocaleString());
  setText("dashboardEta", etaDays !== null ? formatEta(etaDays) : "—");
  setText("dashboardProgressLabel", `${percent.toFixed(1)}% complete`);

  const fill = document.getElementById("dashboardProgressFill");
  if (fill) fill.style.width = `${percent}%`;
}

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

function formatEta(days) {
  if (!Number.isFinite(days) || days <= 0) return "0 days";
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return `${hours}h`;
  }
  return `${days.toFixed(1)} days`;
}

/* ================= MODAL ================= */

function handleClick(e) {
  const feature = e.features[0];
  const key = feature.properties.store_id;
  currentModalStoreId = key;

  const modal = document.getElementById("confirmModal");
  modal.classList.remove("hidden");

  setText("confirmStoreId", `Store ID: ${key}`);

  const store = storeData.find(s => String(s.store_id) === key);
  if (store) {
    setText("confirmAddress", store.full_address);
  }

  loadNotes(key);
  loadPhotos(key);

  document.getElementById("markActive").onclick = () => updateStore(key, false, false);
  document.getElementById("markCompleted").onclick = () => updateStore(key, true, false);
  document.getElementById("markClosed").onclick = () => updateStore(key, false, true);
  document.getElementById("addNoteBtn").onclick = () => addNote(key);
  document.getElementById("addToRouteBtn").onclick = () => addStoreToRoute(key);
  document.getElementById("uploadPhotoBtn").onclick = () => uploadPhoto(key);
  document.getElementById("confirmCancel").onclick = () => modal.classList.add("hidden");

  updateRouteModeUI();
  updateWriteAccessUI();
  clearPhotoMessage();
}

/* ================= STORE STATUS ================= */

async function updateStore(key, completed, closed) {
  if (!isSignedIn()) {
    alert("Sign in to update store status.");
    return;
  }

  const { error } = await supabaseClient
    .from("store_status")
    .upsert({
      project_id: currentProjectId,
      store_id: key,
      completed,
      closed
    });

  if (error) {
    console.error(error);
    alert(error.message || "Store update failed.");
    return;
  }

  statusMap[key] = { completed, closed };

  if (completed || closed) {
    prependActivity({
      type: completed ? "status-completed" : "status-closed",
      store_id: String(key),
      timestamp: new Date().toISOString(),
      title: completed ? `✔ Store ${key} completed` : `⚠ Store ${key} closed`,
      detail: "Status updated"
    });
  }

  rebuild();
  updateHeaderDashboard();
  updateActivityList();
}

/* ================= NOTES ================= */

async function addNote(storeId) {
  if (!isSignedIn()) {
    alert("Sign in to add notes.");
    return;
  }

  const note = document.getElementById("noteBox").value.trim();
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

  document.getElementById("noteBox").value = "";

  prependActivity({
    type: "note",
    store_id: String(storeId),
    timestamp: new Date().toISOString(),
    title: `📝 Note added to Store ${storeId}`,
    detail: note
  });

  updateActivityList();
  loadNotes(storeId);
}

async function loadNotes(storeId) {
  const { data } = await supabaseClient
    .from("store_notes")
    .select("*")
    .eq("project_id", currentProjectId)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  const container = document.getElementById("notesList");
  if (!container) return;

  container.innerHTML = "";

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

function sanitizeFileName(name) {
  return String(name || "photo")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

function buildPhotoPath(storeId, file) {
  const safeName = sanitizeFileName(file.name);
  const timestamp = Date.now();
  return `${currentProjectId}/${storeId}/${timestamp}-${safeName}`;
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

  if (input) input.value = "";
  recentPhotoCount += 1;

  prependActivity({
    type: "photo",
    store_id: String(storeId),
    timestamp: new Date().toISOString(),
    title: `📷 Photo uploaded for Store ${storeId}`,
    detail: `${formatFileSize(originalFile.size)} → ${formatFileSize(file.size)}`
  });

  updateHeaderDashboard();
  updateActivityList();
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

function formatPhotoDate(value) {
  if (!value) return "Uploaded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Uploaded";
  return date.toLocaleString();
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

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/* ================= SEARCH ================= */

function bindSearch() {
  const input = document.getElementById("storeSearch");
  if (!input || input.dataset.bound) return;

  input.addEventListener("input", e => {
    const val = e.target.value.trim();
    const match = storeData.find(s => String(s.store_id) === val);
    if (match) {
      map.flyTo({
        center: [match.lng, match.lat],
        zoom: 14
      });

      if (window.innerWidth <= 900) {
        document.body.classList.remove("sidebar-open");
      }
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

  const recentItems = activityFeed.slice(0, 12);
  if (countPill) countPill.textContent = recentItems.length;

  if (recentItems.length === 0) {
    container.innerHTML = `<div class="activity-empty">No recent activity yet.</div>`;
    return;
  }

  recentItems.forEach(item => {
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
      const match = storeData.find(s => String(s.store_id) === String(item.store_id));
      if (match) {
        map.flyTo({
          center: [match.lng, match.lat],
          zoom: 14
        });

        if (window.innerWidth <= 900) {
          document.body.classList.remove("sidebar-open");
        }
      }
    };

    container.appendChild(div);
  });
}

function prependActivity(event) {
  activityFeed.unshift(event);
  activityFeed = activityFeed
    .sort((a, b) => getTimestampValue(b.timestamp) - getTimestampValue(a.timestamp))
    .slice(0, 100);
}

function formatActivityTime(timestamp) {
  if (!timestamp) return "Recent";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Recent";
  return date.toLocaleString();
}

function getTimestampValue(timestamp) {
  if (!timestamp) return 0;
  const date = new Date(timestamp);
  const value = date.getTime();
  return Number.isNaN(value) ? 0 : value;
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

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/* ================= REBUILD ================= */

function rebuild() {
  geojsonData.features.forEach(f => {
    const key = f.properties.store_id;
    f.properties.completed = statusMap[key].completed;
    f.properties.closed = statusMap[key].closed;
  });
  map.getSource("stores").setData(geojsonData);
}

/* ================= ROUTE BUILDER ================= */

function restoreRouteState() {
  try {
    routeModeEnabled = localStorage.getItem(routeModeKey()) === "true";
    const savedStops = JSON.parse(localStorage.getItem(routeStopsKey()) || "[]");
    selectedRouteStops = savedStops.filter(stopId =>
      storeData.some(store => String(store.store_id) === String(stopId))
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
      const storeId = routeStoreInput.value.trim();
      if (!storeId) return;
      addStoreToRoute(storeId);
      routeStoreInput.value = "";
    });
    addRouteStoreBtn.dataset.bound = "true";
  }

  if (routeStoreInput && !routeStoreInput.dataset.bound) {
    routeStoreInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addRouteStoreBtn.click();
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
      const routeUrl = buildGoogleMapsRouteUrl();
      if (routeUrl) window.open(routeUrl, "_blank");
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

  const normalizedStoreId = String(storeId);
  const store = storeData.find(item => String(item.store_id) === normalizedStoreId);

  if (!store) {
    alert("Store ID not found in current project.");
    return;
  }

  if (selectedRouteStops.includes(normalizedStoreId)) {
    alert("That store is already in the route.");
    return;
  }

  if (selectedRouteStops.length >= 10) {
    alert("For reliability, the route is currently capped at 10 stops.");
    return;
  }

  selectedRouteStops.push(normalizedStoreId);
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

function createRouteMiniButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "routeMiniBtn";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
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

  if (coords.length === 0) {
    alert("No valid route stops found.");
    return "";
  }

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

  setText("routeMetricStops", stops.toString());
  setText("routeMetricMiles", stops >= 2 ? miles.toFixed(1) : "0");
  setText("routeMetricScore", efficiency);
  setText("routeMetricDetail", detail);
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