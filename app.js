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

const getEl = id => document.getElementById(id);

map.on("load", async () => {
  await hydrate();
  buildMap();
  bindSearch();
  updateProgress();
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
      if (statusMap.hasOwnProperty(key)) {
        statusMap[key] = {
          completed: row.completed === true,
          closed: row.closed === true,
          note: row.note || ""
        };
      }
    });
  }
}

/* ================= BUILD MAP ================= */

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

  /* CLUSTERS */
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "stores",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#c8102e",
      "circle-radius": 24,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff"
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
    }
  });

  /* STORE POINTS */
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

  /* X SYMBOL FOR CLOSED */
  map.addLayer({
    id: "closed-x",
    type: "symbol",
    source: "stores",
    filter: ["==", ["get", "closed"], true],
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

  const store = storeData.find(
    s => String(s.store_id) === String(key)
  );

  const modal = getEl("confirmModal");
  const title = getEl("confirmTitle");
  const idLine = getEl("confirmStoreId");
  const addrLine = getEl("confirmAddressLine");
  const cityLine = getEl("confirmCityLine");
  const cancel = getEl("confirmCancel");
  const ok = getEl("confirmOk");

  title.innerText = "Update Store Status";
  idLine.innerText = `Store ID: ${key}`;

  if (store && store.full_address) {
    const cleaned = store.full_address.replace(/\s+/g, " ").trim();
    const parts = cleaned.split(",");
    addrLine.innerText = parts[0]?.trim() || "";
    cityLine.innerText = `${parts[1]?.trim() || ""}, ${parts[2]?.trim() || ""}`;
  }

  /* Add textarea dynamically */
  let noteBox = document.getElementById("noteBox");
  if (!noteBox) {
    noteBox = document.createElement("textarea");
    noteBox.id = "noteBox";
    noteBox.placeholder = "Leave note (optional)...";
    noteBox.style.marginTop = "12px";
    noteBox.style.width = "100%";
    noteBox.style.borderRadius = "8px";
    noteBox.style.padding = "8px";
    modal.querySelector(".modalContent").appendChild(noteBox);
  }

  noteBox.value = state.note || "";

  modal.classList.remove("hidden");

  cancel.onclick = () => modal.classList.add("hidden");

  ok.onclick = async () => {

    const newCompleted = !state.completed;
    const newClosed = noteBox.value.toLowerCase().includes("closed");

    statusMap[key] = {
      completed: newCompleted,
      closed: newClosed,
      note: noteBox.value
    };

    await supabaseClient
      .from("store_status")
      .upsert({
        store_id: key,
        completed: newCompleted,
        closed: newClosed,
        note: noteBox.value
      });

    rebuild();
    updateProgress();
    modal.classList.add("hidden");
  };
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

/* ================= SEARCH ================= */

function bindSearch() {
  const input = getEl("storeSearch");
  input.addEventListener("input", e => {
    const val = e.target.value.trim();
    const match = storeData.find(
      s => String(s.store_id) === val
    );
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
  const completed = Object.values(statusMap)
    .filter(v => v.completed).length;
  const total = storeData.length;

  getEl("progressText").innerText =
    `${completed} / ${total} completed`;

  getEl("progressFill").style.width =
    `${(completed / total) * 100}%`;
}
