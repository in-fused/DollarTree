mapboxgl.accessToken = "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9.3-ZXlPJosjQ4c5bucpnWYA";

const SUPABASE_URL = "https://dapjhrbfqtsgdlasuuam.supabase.co";
const SUPABASE_KEY = "sb_publishable_DF55L6u6QxGU9Tfo_9MvZw_0Rv7zsJS";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let pinVerified = sessionStorage.getItem("pinVerified") === "true";

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
        statusMap[key].completed = row.completed === true;
        statusMap[key].closed = row.closed === true;
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

async function handleClick(e) {

  const key = e.features[0].properties.store_id;

  const store = storeData.find(s => String(s.store_id) === key);

  document.getElementById("confirmStoreId").innerText =
    `Store ID: ${key}`;

  if (store && store.full_address) {
    const parts = store.full_address.replace(/\s+/g, " ").trim().split(",");
    document.getElementById("confirmAddressLine").innerText = parts[0] || "";
    document.getElementById("confirmCityLine").innerText = parts.slice(1).join(", ").trim() || "";
  }

  await loadNotes(key);

  const modal = document.getElementById("confirmModal");
  modal.classList.remove("hidden");

  const pinGate = document.getElementById("pinGate");
  const editSection = document.getElementById("editSection");

  if (pinVerified) {
    pinGate.classList.add("hidden");
    editSection.classList.remove("hidden");
  } else {
    pinGate.classList.remove("hidden");
    editSection.classList.add("hidden");
  }

  document.getElementById("pinSubmit").onclick = async () => {
    const input = document.getElementById("pinInput").value;

    const { data } = await supabaseClient
      .rpc("verify_pin", { input_pin: input });

    if (data === true) {
      pinVerified = true;
      sessionStorage.setItem("pinVerified", "true");
      pinGate.classList.add("hidden");
      editSection.classList.remove("hidden");
      document.getElementById("pinError").innerText = "";
    } else {
      document.getElementById("pinError").innerText = "Incorrect PIN";
    }
  };

  document.getElementById("addNoteBtn").onclick = async () => {

    const note = document.getElementById("noteBox").value.trim();
    if (!note) return;

    await supabaseClient
      .from("store_notes")
      .insert({ store_id: key, note });

    document.getElementById("noteBox").value = "";

    await loadNotes(key);
  };

  document.getElementById("confirmCancel").onclick =
    () => modal.classList.add("hidden");
}

/* ================= NOTES ================= */

async function loadNotes(storeId) {

  const { data } = await supabaseClient
    .from("store_notes")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  const container = document.getElementById("notesList");

  container.innerHTML = "";

  if (!data || data.length === 0) {
    container.innerHTML = "<div style='opacity:.6;'>No notes yet.</div>";
    return;
  }

  data.forEach(row => {
    const div = document.createElement("div");
    div.className = "noteItem";
    div.innerHTML = `
      <div>${row.note}</div>
      <div class="noteTime">${new Date(row.created_at).toLocaleString()}</div>
    `;
    container.appendChild(div);
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

  document.getElementById("progressFill").style.width = `${percent}%`;
  document.getElementById("progressText").innerText =
    `${percent.toFixed(1)}% of active stores completed`;
}}