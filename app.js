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

/* ================= INIT ================= */

map.on("load", async () => {
  await hydrate();
  buildMap();
  bindSearch();
  updateProgress();
  updateActivityList();
});

/* ================= HYDRATE ================= */

async function hydrate() {

  const res = await fetch("stores_with_coords.json");
  storeData = await res.json();

  storeData.forEach(store => {
    statusMap[String(store.store_id)] = {
      completed: false,
      closed: false
    };
  });

  const { data } = await supabaseClient
    .from("store_status")
    .select("*");

  if (data) {
    data.forEach(row => {
      const key = String(row.store_id);
      if (statusMap[key]) {
        statusMap[key] = {
          completed: row.completed === true,
          closed: row.closed === true
        };
      }
    });
  }
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
}

/* ================= MODAL ================= */

function handleClick(e) {

  const feature = e.features[0];
  const key = feature.properties.store_id;

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

  document.getElementById("confirmCancel").onclick =
    () => modal.classList.add("hidden");
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
  container.innerHTML = "";

  const entries = Object.entries(statusMap)
    .filter(([_, val]) => val.completed || val.closed);

  entries.forEach(([storeId, state]) => {

    const div = document.createElement("div");
    div.className = "activityItem";

    if (state.completed) div.classList.add("completeItem");
    if (state.closed) div.classList.add("closedItem");

    div.innerText = `Store ${storeId}`;

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
