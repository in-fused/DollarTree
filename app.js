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
      closed: false
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

  const modal = document.getElementById("confirmModal");

  const pinGate = document.getElementById("pinGate");
  const editSection = document.getElementById("editSection");
  const pinInput = document.getElementById("pinInput");
  const pinSubmit = document.getElementById("pinSubmit");
  const pinError = document.getElementById("pinError");

  document.getElementById("noteBox").value = "";

  document.getElementById("confirmStoreId").innerText =
    `Store ID: ${key}`;

  const store = storeData.find(s => String(s.store_id) === key);

  if (store && store.full_address) {
    const parts = store.full_address.replace(/\s+/g, " ").trim().split(",");
    document.getElementById("confirmAddressLine").innerText =
      parts[0] || "";
    document.getElementById("confirmCityLine").innerText =
      parts.slice(1).join(", ").trim() || "";
  }

  loadNotes(key);

  modal.classList.remove("hidden");

  if (pinVerified) {
    pinGate.classList.add("hidden");
    editSection.classList.remove("hidden");
  } else {
    pinGate.classList.remove("hidden");
    editSection.classList.add("hidden");
  }

  pinInput.value = "";
  pinError.innerText = "";

  pinSubmit.onclick = async () => {
    const { data } = await supabaseClient
      .rpc("verify_pin", { input_pin: pinInput.value });

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

  const addBtn = document.getElementById("addNoteBtn");
  if (addBtn) {
    addBtn.onclick = async () => {
      const note = document.getElementById("noteBox").value.trim();
      if (!note) return;
      await supabaseClient
        .from("store_notes")
        .insert({ store_id: key, note });
      document.getElementById("noteBox").value = "";
      loadNotes(key);
    };
  }

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

  statusMap[key] = { completed, closed };

  await supabaseClient
    .from("store_status")
    .upsert({
      store_id: key,
      completed,
      closed
    });

  rebuild();
  updateProgress();
  updateActivityList();
  document.getElementById("confirmModal").classList.add("hidden");
}

/* ================= NOTES ================= */

async function loadNotes(storeId) {

  const { data } = await supabaseClient
    .from("store_notes")
    .select("*")
    .eq("store_id", Number(storeId))
    .order("created_at", { ascending: false });

  const container = document.getElementById("notesList");

  if (!container) return;

  container.innerHTML = "";

  if (!data || data.length === 0) {
    container.innerHTML = "<div style='opacity:.6;'>No notes yet.</div>";
    return;
  }

  data.forEach(row => {

    const div = document.createElement("div");
    div.style.marginBottom = "8px";
    div.style.padding = "6px 8px";
    div.style.background = "rgba(255,255,255,0.06)";
    div.style.borderRadius = "6px";
    div.style.fontSize = "13px";

    div.innerHTML = `
      <div>${row.note}</div>
      <div style="opacity:.5;font-size:11px;margin-top:4px;">
        ${new Date(row.created_at).toLocaleString()}
      </div>
    `;

    container.appendChild(div);
  });
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
}