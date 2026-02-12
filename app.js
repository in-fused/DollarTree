mapboxgl.accessToken = "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9.3-ZXlPJosjQ4c5bucpnWYA";

const SUPABASE_URL = "https://dapjhrbfqtsgdlasuuam.supabase.co";
const SUPABASE_KEY = "sb_publishable_DF55L6u6QxGU9Tfo_9MvZw_0Rv7zsJS";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let pinVerified = false;

if (sessionStorage.getItem("pinVerified") === "true") {
  pinVerified = true;
}

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
      closed: false,
      note: ""
    };
  });

  const { data } = await supabaseClient
    .from("store_status")
    .select("*");

  if (Array.isArray(data)) {
    data.forEach(row => {
      const key = String(row.store_id);
      if (statusMap[key]) {
        statusMap[key] = {
          completed: row.completed === true,
          closed: row.closed === true,
          note: row.note || ""
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
      "circle-radius": 24,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff"
    }
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "stores",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}"
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
        "#000000",
        ["==", ["get", "completed"], true],
        "#2ecc71",
        "#ff2d2d"
      ],
      "circle-radius": 8,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff"
    }
  });

  map.addLayer({
    id: "closed-x",
    type: "symbol",
    source: "stores",
    filter: ["all",
      ["==", ["get", "closed"], true],
      ["!", ["has", "point_count"]]
    ],
    layout: {
      "text-field": "✕",
      "text-size": 16
    },
    paint: {
      "text-color": "#ffffff"
    }
  });

  map.on("click", "points", handleClick);
}

/* ================= MODAL ================= */

function handleClick(e) {

  const feature = e.features[0];
  const key = feature.properties.store_id;
  const state = statusMap[key];
// ===== Populate Preview Info (Visible Before PIN) =====

const store = storeData.find(
  s => String(s.store_id) === String(key)
);

document.getElementById("confirmStoreId").innerText =
  `Store ID: ${key}`;
  loadNotes(key);

if (store && store.full_address) {

  const cleaned = store.full_address
    .replace(/\s+/g, " ")
    .trim();

  const parts = cleaned.split(",");

  document.getElementById("confirmAddressLine").innerText =
    parts[0] ? parts[0].trim() : "";

  document.getElementById("confirmCityLine").innerText =
    parts.slice(1).join(",").trim();
}

const addBtn = document.getElementById("addNoteBtn");
if (addBtn) {
  addBtn.onclick = async () => {

  const note = document.getElementById("noteBox").value.trim();
  if (!note) return;

  await supabaseClient
    .from("store_notes")
    .insert({
      store_id: key,
      note
    });

  document.getElementById("noteBox").value = "";
  loadNotes(key);
};

  const modal = document.getElementById("confirmModal");
  const pinGate = document.getElementById("pinGate");
  const editSection = document.getElementById("editSection");
  const pinInput = document.getElementById("pinInput");
  const pinSubmit = document.getElementById("pinSubmit");
  const pinError = document.getElementById("pinError");
  const noteBox = document.getElementById("noteBox");

  noteBox.value = state.note || "";

  modal.classList.remove("hidden");

  if (pinVerified) {
    pinGate.classList.add("hidden");
    editSection.classList.remove("hidden");
  } else {
    pinGate.classList.remove("hidden");
    editSection.classList.add("hidden");
  }

  pinSubmit.onclick = async () => {

    const input = pinInput.value;

    const { data } = await supabaseClient
      .rpc("verify_pin", { input_pin: input });

    if (data === true) {
      pinVerified = true;
      sessionStorage.setItem("pinVerified", "true");
      pinGate.classList.add("hidden");
      editSection.classList.remove("hidden");
      pinError.innerText = "";
    } else {
      pinError.innerText = "Incorrect PIN";
    }
  };

  document.getElementById("markActive").onclick =
    () => updateStore(key, false, false);

  document.getElementById("markCompleted").onclick =
    () => updateStore(key, true, false);

  document.getElementById("markClosed").onclick =
    () => updateStore(key, false, true);

  document.getElementById("confirmCancel").onclick =
    () => modal.classList.add("hidden");
}

/* ================= UPDATE ================= */

async function updateStore(key, completed, closed) {

  const note = document.getElementById("noteBox").value;

  statusMap[key] = { completed, closed, note };

  await supabaseClient
    .from("store_status")
    .upsert({
      store_id: key,
      completed,
      closed,
      note
    });

  rebuild();
  updateProgress();
  updateActivityList();
  document.getElementById("confirmModal").classList.add("hidden");
}

function rebuild() {
  geojsonData.features.forEach(f => {
    const key = f.properties.store_id;
    f.properties.completed = statusMap[key].completed;
    f.properties.closed = statusMap[key].closed;
  });
  map.getSource("stores").setData(geojsonData);
}

/* ================= SEARCH ================= */

function bindSearch() {
  const input = document.getElementById("storeSearch");
  if (!input) return;

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

/* ================= PROGRESS ================= */

function updateProgress() {

  const values = Object.values(statusMap);

  const completed = values.filter(v => v.completed).length;
  const closed = values.filter(v => v.closed).length;
  const active = storeData.length - completed - closed;

  const actionableTotal = storeData.length - closed;
  const percent = actionableTotal > 0
    ? (completed / actionableTotal) * 100
    : 0;

  document.getElementById("completedCount").innerText = completed;
  document.getElementById("activeCount").innerText = active;
  document.getElementById("closedCount").innerText = closed;

  document.getElementById("progressFill").style.width =
    `${percent}%`;

  document.getElementById("progressText").innerText =
    `${percent.toFixed(1)}% of active stores completed`;
}

/* ================= ACTIVITY ================= */

function updateActivityList() {

  const container = document.getElementById("activityList");
  if (!container) return;

  container.innerHTML = "";

  const entries = Object.entries(statusMap)
    .filter(([_, val]) => val.completed || val.closed);

  entries.forEach(([storeId, state]) => {

    const div = document.createElement("div");
    div.className = "activityItem";

    const icon = document.createElement("span");
    icon.className = "activityIcon";

    if (state.completed) {
      icon.classList.add("iconComplete");
      icon.innerText = "✔";
    } else if (state.closed) {
      icon.classList.add("iconClosed");
      icon.innerText = "⚠";
    }

    div.appendChild(icon);
    div.append(` Store ${storeId}`);

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
  
  /* ================= NOTES ================= */

async function loadNotes(storeId) {

  const { data } = await supabaseClient
    .from("store_notes")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  const notesContainer = document.getElementById("notesList");
  if (!notesContainer) return;

  notesContainer.innerHTML = "";

  if (!Array.isArray(data) || data.length === 0) {
    notesContainer.innerHTML =
      "<div style='opacity:.6;font-size:13px;'>No notes yet.</div>";
    return;
  }

  data.forEach(row => {
    const div = document.createElement("div");
    div.style.marginBottom = "6px";
    div.style.fontSize = "13px";
    div.style.opacity = "0.85";
    div.innerText = row.note;
    notesContainer.appendChild(div);
  });
}
}
