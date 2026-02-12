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
  bindSidebarToggle();
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
    clusterRadius: 50
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "stores",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#c8102e",
      "circle-radius": 24
    }
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "stores",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
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
      "circle-color": [
        "case",
        ["==", ["get", "closed"], true],
        "#ff9900",
        ["==", ["get", "completed"], true],
        "#2ecc71",
        "#ff2d2d"
      ],
      "circle-radius": 8
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
  loadPhotos(key);

  document.getElementById("markActive").onclick =
    () => updateStore(key, false, false);

  document.getElementById("markCompleted").onclick =
    () => updateStore(key, true, false);

  document.getElementById("markClosed").onclick =
    () => updateStore(key, false, true);

  document.getElementById("addNoteBtn").onclick =
    () => addNote(key);

  document.getElementById("photoUpload").onchange =
    (e) => uploadPhoto(key, e.target.files[0]);

  document.getElementById("confirmCancel").onclick =
    () => modal.classList.add("hidden");
}

/* ================= UPDATE STORE ================= */

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

/* ================= SIDEBAR TOGGLE ================= */

function bindSidebarToggle() {
  const toggleBtn = document.getElementById("sidebarToggle");
  const sidebar = document.querySelector("aside");

  toggleBtn.onclick = () => {
    sidebar.classList.toggle("collapsed");
    toggleBtn.innerText =
      sidebar.classList.contains("collapsed")
        ? "Expand"
        : "Collapse";
  };
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

  Object.entries(statusMap)
    .filter(([_, val]) => val.completed || val.closed)
    .forEach(([storeId, state]) => {

      const div = document.createElement("div");

      if (state.completed) div.className = "activity-complete";
      if (state.closed) div.className = "activity-closed";

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
    div.innerText = row.note;
    container.appendChild(div);
  });
}

/* ================= PHOTOS ================= */

async function uploadPhoto(storeId, file) {
  if (!file) return;

  const filePath = `${storeId}/${Date.now()}_${file.name}`;

  await supabaseClient.storage
    .from("store-photos")
    .upload(filePath, file);

  await supabaseClient
    .from("store_photos")
    .insert({
      store_id: storeId,
      file_path: filePath
    });

  loadPhotos(storeId);
}

async function loadPhotos(storeId) {

  const { data } = await supabaseClient
    .from("store_photos")
    .select("*")
    .eq("store_id", storeId);

  const container = document.getElementById("photoGallery");
  container.innerHTML = "";

  data?.forEach(row => {
    const { data: urlData } = supabaseClient.storage
      .from("store-photos")
      .getPublicUrl(row.file_path);

    const img = document.createElement("img");
    img.src = urlData.publicUrl;
    img.onclick = () => window.open(urlData.publicUrl, "_blank");

    container.appendChild(img);
  });
}
