mapboxgl.accessToken = "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9.3-ZXlPJosjQ4c5bucpnWYA";

const SUPABASE_URL = "https://dapjhrbfqtsgdlasuuam.supabase.co";
const SUPABASE_KEY = "sb_publishable_DF55L6u6QxGU9Tfo_9MvZw_0Rv7zsJS";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

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

const ROUTE_MODE_KEY = "routeModeEnabled";
const ROUTE_STOPS_KEY = "selectedRouteStops";

/* ================= INIT ================= */

map.on("load", async () => {
  await hydrate();
  restoreRouteState();
  buildMap();
  bindSearch();
  bindRouteBuilder();
  updateProgress();
  updateActivityList();
  renderRouteStops();
  updateRouteModeUI();
});

/* ================= HYDRATE ================= */

async function hydrate() {

  // Load store coordinates
  const res = await fetch("stores_with_coords.json");
  storeData = await res.json();

  // Initialize ALL stores as active
  statusMap = {};
  storeData.forEach(store => {
    statusMap[String(store.store_id)] = {
      completed: false,
      closed: false
    };
  });

  // Pull saved statuses from Supabase
  const { data, error } = await supabaseClient
    .from("store_status")
    .select("*");

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

  console.log("Hydrate complete. Total stores:", storeData.length);
}

/* ================= MAP ================= */

function buildMap() {

  geojsonData = {
    type: "FeatureCollection",
    features: storeData.map(store => ({
      type: "Feature",
      properties: {
        store_id: String(store.store_id),
        completed: statusMap[String(store.store_id)].completed,
        closed: statusMap[String(store.store_id)].closed
      },
      geometry: {
        type: "Point",
        coordinates: [store.lng, store.lat]
      }
    }))
  };

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

  /* Cluster Circle */
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

  /* Cluster Count */
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

  /* Individual Points */
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

/* ================= MODAL ================= */

function handleClick(e) {

  const feature = e.features[0];
  const key = feature.properties.store_id;
  currentModalStoreId = key;

  const modal = document.getElementById("confirmModal");
  modal.classList.remove("hidden");

  document.getElementById("confirmStoreId").innerText =
    `Store ID: ${key}`;

  const store = storeData.find(s => String(s.store_id) === key);
  if (store) {
    document.getElementById("confirmAddress").innerText =
      store.full_address;
  }

  loadNotes(key);

  document.getElementById("markActive").onclick =
    () => updateStore(key, false, false);

  document.getElementById("markCompleted").onclick =
    () => updateStore(key, true, false);

  document.getElementById("markClosed").onclick =
    () => updateStore(key, false, true);

  document.getElementById("addNoteBtn").onclick =
    () => addNote(key);

  document.getElementById("addToRouteBtn").onclick =
    () => addStoreToRoute(key);

  document.getElementById("confirmCancel").onclick =
    () => modal.classList.add("hidden");

  updateRouteModeUI();
}

/* ================= UPDATE ================= */

async function updateStore(key, completed, closed) {

  await supabaseClient
    .from("store_status")
    .upsert({
      store_id: key,
      completed,
      closed
    });

  statusMap[key] = { completed, closed };

  rebuild();
  updateProgress();
  updateActivityList();
}

/* ================= NOTES ================= */

async function addNote(storeId) {

  const note = document.getElementById("noteBox").value.trim();
  if (!note) return;

  await supabaseClient
    .from("store_notes")
    .insert({ store_id: storeId, note });

  document.getElementById("noteBox").value = "";
  loadNotes(storeId);
}

async function loadNotes(storeId) {

  const { data } = await supabaseClient
    .from("store_notes")
    .select("*")
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

/* ================= SEARCH ================= */

function bindSearch() {
  const input = document.getElementById("storeSearch");
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

  document.getElementById("progressFill").style.width =
    `${percent}%`;

  document.getElementById("progressText").innerText =
    `${percent.toFixed(1)}% complete`;
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

    // Color logic
    if (state.completed) {
      div.style.background = "rgba(46, 204, 113, 0.18)";
      div.style.borderLeft = "4px solid #2ecc71";
    }
    else if (state.closed) {
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

    // Fly to store on click
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
    routeModeEnabled = localStorage.getItem(ROUTE_MODE_KEY) === "true";
    const savedStops = JSON.parse(localStorage.getItem(ROUTE_STOPS_KEY) || "[]");
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
  localStorage.setItem(ROUTE_MODE_KEY, String(routeModeEnabled));
  localStorage.setItem(ROUTE_STOPS_KEY, JSON.stringify(selectedRouteStops));
}

function bindRouteBuilder() {
  const routeModeToggle = document.getElementById("routeModeToggle");
  const addRouteStoreBtn = document.getElementById("addRouteStoreBtn");
  const clearRouteBtn = document.getElementById("clearRouteBtn");
  const openRouteBtn = document.getElementById("openRouteBtn");
  const routeStoreInput = document.getElementById("routeStoreInput");

  routeModeToggle.checked = routeModeEnabled;

  routeModeToggle.addEventListener("change", () => {
    routeModeEnabled = routeModeToggle.checked;
    persistRouteState();
    updateRouteModeUI();
  });

  addRouteStoreBtn.addEventListener("click", () => {
    const storeId = routeStoreInput.value.trim();
    if (!storeId) return;
    addStoreToRoute(storeId);
    routeStoreInput.value = "";
  });

  routeStoreInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addRouteStoreBtn.click();
    }
  });

  clearRouteBtn.addEventListener("click", () => {
    selectedRouteStops = [];
    persistRouteState();
    renderRouteStops();
  });

  openRouteBtn.addEventListener("click", () => {
    const routeUrl = buildGoogleMapsRouteUrl();
    if (!routeUrl) return;
    window.open(routeUrl, "_blank");
  });
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
      map.flyTo({
        center: [store.lng, store.lat],
        zoom: 14
      });
    });

    const upBtn = createRouteMiniButton("â", () => moveRouteStop(String(storeId), -1));
    upBtn.disabled = index === 0;

    const downBtn = createRouteMiniButton("â", () => moveRouteStop(String(storeId), 1));
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
