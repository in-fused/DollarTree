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

/* ================= INIT ================= */

map.on("load", async () => {
  currentProjectId = localStorage.getItem(ACTIVE_PROJECT_KEY) || DEFAULT_PROJECT_ID;

  await initializeAuth();
  bindAuthUI();

  await loadProjects();
  bindProjectSelector();
  await loadActiveProject();
  bindSearch();
  bindRouteBuilder();
  bindPhotoUI();
  bindLightboxUI();
  updateRouteModeUI();
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

/* ================= PROJECTS ================= */

async function loadProjects() {
  let loadedProjects = [];

  try {
    const { data, error } = await supabaseClient
      .from("projects")
      .select("project_id, name")
      .order("created_at", { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      loadedProjects = data.map(project => ({
        project_id: project.project_id,
        name: project.name,
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
  restoreRouteState();

  if (map.getSource("stores")) {
    rebuildFullMap();
  } else {
    buildMap();
  }

  updateProgress();
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
    return;
  }

  if (Array.isArray(data)) {
    data.forEach(row => {
      const key = String(row.store_id);
      if (statusMap[key]) {
        statusMap[key].completed = row.completed === true;
        statusMap[key].closed = row.closed === true;
      }
    });
  }

  console.log("Hydrate complete. Project:", currentProjectId, "Total stores:", storeData.length);
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
      "circle-radius": 26,
      "circle-color": [
        "case",
        [
          ">=",
          ["/", ["get", "completedCount"], ["get", "totalCount"]],
          0.75
        ],
        "#2ecc71",
        [
          ">=",
          ["/", ["get", "completedCount"], ["get", "totalCount"]],
          0.4
        ],
        "#ff9900",
        "#ff2d2d"
      ]
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
        ["==", ["get", "closed"], true],
        "#ff9900",
        ["==", ["get", "completed"], true],
        "#2ecc71",
        "#ff2d2d"
      ]
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

/* ================= MODAL ================= */

function handleClick(e) {
  const feature = e.features[0];
  const key = feature.properties.store_id;
  currentModalStoreId = key;

  const modal = document.getElementById("confirmModal");
  modal.classList.remove("hidden");

  document.getElementById("confirmStoreId").innerText = `Store ID: ${key}`;

  const store = storeData.find(s => String(s.store_id) === key);
  if (store) {
    document.getElementById("confirmAddress").innerText = store.full_address;
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

/* ================= UPDATE ================= */

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

  rebuild();
  updateProgress();
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
    if (!currentModalStoreId) return;
    uploadPhoto(currentModalStoreId);
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
      if (e.target.id === "photoLightbox") {
        closePhotoLightbox();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closePhotoLightbox();
      }
    });

    lightbox.dataset.bound = "true";
  }
}

async function resolvePhotoBucketName() {
  if (resolvedPhotoBucket) return resolvedPhotoBucket;

  for (const bucketName of PHOTO_BUCKET_CANDIDATES) {
    try {
      const { error } = await supabaseClient
        .storage
        .from(bucketName)
        .list("", { limit: 1 });

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

async function uploadPhoto(storeId) {
  if (!isSignedIn()) {
    alert("Sign in to upload photos.");
    return;
  }

  const input = document.getElementById("photoInput");
  const file = input?.files?.[0];

  if (!file) {
    setPhotoMessage("Choose a photo first.", true);
    return;
  }

  setPhotoMessage("Uploading photo...");

  const bucketName = await resolvePhotoBucketName();
  const path = buildPhotoPath(storeId, file);

  const { error: uploadError } = await supabaseClient
    .storage
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

  const { data: publicData } = supabaseClient
    .storage
    .from(bucketName)
    .getPublicUrl(path);

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

  input.value = "";
  setPhotoMessage("Photo uploaded successfully.");
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
      const { data: publicData } = supabaseClient
        .storage
        .from(bucketName)
        .getPublicUrl(row.storage_path);

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

/* ================= SEARCH ================= */

function bindSearch() {
  const input = document.getElementById("storeSearch");
  if (!input.dataset.bound) {
    input.addEventListener("input", e => {
      const val = e.target.value.trim();
      const match = storeData.find(s => String(s.store_id) === val);
      if (match) {
        map.flyTo({
          center: [match.lng, match.lat],
          zoom: 14
        });
      }
    });
    input.dataset.bound = "true";
  }
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

/* ================= PROGRESS ================= */

function updateProgress() {
  const values = Object.values(statusMap);

  const completed = values.filter(v => v.completed).length;
  const closed = values.filter(v => v.closed).length;
  const active = storeData.length - completed - closed;

  document.getElementById("completedCount").innerText = completed;
  document.getElementById("activeCount").innerText = active;
  document.getElementById("closedCount").innerText = closed;

  const actionableTotal = storeData.length - closed;
  const percent = actionableTotal > 0
    ? (completed / actionableTotal) * 100
    : 0;

  document.getElementById("progressFill").style.width = `${percent}%`;
  document.getElementById("progressText").innerText = `${percent.toFixed(1)}% complete`;
}

/* ================= ACTIVITY ================= */

function updateActivityList() {
  const container = document.getElementById("activityList");
  if (!container) return;

  container.innerHTML = "";

  const entries = Object.entries(statusMap)
    .filter(([_, val]) => val.completed || val.closed);

  if (entries.length === 0) {
    container.innerHTML = "<div style='opacity:.6;'>No updates yet.</div>";
    return;
  }

  entries.forEach(([storeId, state]) => {
    const div = document.createElement("div");
    div.className = "activityItem";

    if (state.completed) {
      div.style.background = "rgba(46, 204, 113, 0.18)";
      div.style.borderLeft = "4px solid #2ecc71";
    } else if (state.closed) {
      div.style.background = "rgba(255, 153, 0, 0.18)";
      div.style.borderLeft = "4px solid #ff9900";
    }

    div.style.padding = "8px 10px";
    div.style.marginBottom = "6px";
    div.style.borderRadius = "6px";
    div.style.cursor = "pointer";
    div.style.fontSize = "13px";
    div.style.transition = "background 0.2s ease";

    const label = document.createElement("div");
    label.innerText = `Store ${storeId}`;
    label.style.fontWeight = "600";

    div.appendChild(label);

    div.onclick = () => {
      const match = storeData.find(s => String(s.store_id) === storeId);
      if (match) {
        map.flyTo({
          center: [match.lng, match.lat],
          zoom: 14
        });
      }
    };

    container.appendChild(div);
  });
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

  if (!routeModeToggle.dataset.bound) {
    routeModeToggle.addEventListener("change", () => {
      routeModeEnabled = routeModeToggle.checked;
      persistRouteState();
      updateRouteModeUI();
    });
    routeModeToggle.dataset.bound = "true";
  }

  if (!addRouteStoreBtn.dataset.bound) {
    addRouteStoreBtn.addEventListener("click", () => {
      const storeId = routeStoreInput.value.trim();
      if (!storeId) return;
      addStoreToRoute(storeId);
      routeStoreInput.value = "";
    });
    addRouteStoreBtn.dataset.bound = "true";
  }

  if (!routeStoreInput.dataset.bound) {
    routeStoreInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addRouteStoreBtn.click();
      }
    });
    routeStoreInput.dataset.bound = "true";
  }

  if (!clearRouteBtn.dataset.bound) {
    clearRouteBtn.addEventListener("click", () => {
      selectedRouteStops = [];
      persistRouteState();
      renderRouteStops();
    });
    clearRouteBtn.dataset.bound = "true";
  }

  if (!openRouteBtn.dataset.bound) {
    openRouteBtn.addEventListener("click", () => {
      const routeUrl = buildGoogleMapsRouteUrl();
      if (!routeUrl) return;
      window.open(routeUrl, "_blank");
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