console.log("APP VERSION 5 - HARD LOCKED FLOW");

mapboxgl.accessToken = "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9.3-ZXlPJosjQ4c5bucpnWYA";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-81.7, 27.8],
  zoom: 6.5
});

const SUPABASE_URL = "https://dapjhrbfqtsgdlasuuam.supabase.co";
const SUPABASE_KEY = "sb_publishable_DF55L6u6QxGU9Tfo_9MvZw_0Rv7zsJS";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let storeData = [];
let statusMap = {};
let geojsonData = null;

const getEl = id => document.getElementById(id);

map.on("load", async () => {
  await hydrate();
  build();
  updateProgress();
  attachSearch();
});

/* ================= HYDRATE FIRST ================= */

async function hydrate() {

  const res = await fetch("stores_with_coords.json");
  storeData = await res.json();

  // Default false
  storeData.forEach(store => {
    statusMap[String(store.store_number)] = false;
  });

  try {
    const { data } = await supabaseClient
      .from("store_status")
      .select("*");

    if (Array.isArray(data)) {
      data.forEach(row => {
        const key = String(row.store_number);
        if (statusMap.hasOwnProperty(key)) {
          statusMap[key] = row.completed === true;
        }
      });
    }
  } catch (e) {
    console.warn("Supabase read failed.");
  }

  console.log("Hydration complete. True count:",
    Object.values(statusMap).filter(v => v === true).length
  );
}

/* ================= BUILD AFTER HYDRATION ================= */

function build() {

  geojsonData = {
    type: "FeatureCollection",
    features: storeData.map(store => {
      const key = String(store.store_number);
      return {
        type: "Feature",
        properties: {
          store_number: key,
          completed: statusMap[key] === true
        },
        geometry: {
          type: "Point",
          coordinates: [store.lng, store.lat]
        }
      };
    })
  };

  map.addSource("stores", {
    type: "geojson",
    data: geojsonData,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "stores",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#333",
      "circle-radius": 20
    }
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "stores",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-size": 13
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
      ["==", ["get", "completed"], true],
      "#2ecc71",
      "#e10600"
    ],
    "circle-radius": 6
  }
});


/* ================= CLICK ================= */

function handleClick(e) {

  const feature = e.features[0];
  const key = feature.properties.store_number;
  const current = statusMap[key];

  const modal = getEl("confirmModal");
  const title = getEl("confirmTitle");
  const cancel = getEl("confirmCancel");
  const ok = getEl("confirmOk");

  title.innerText = current
    ? `Mark Store ${key} as NOT completed?`
    : `Mark Store ${key} as completed?`;

  modal.classList.remove("hidden");

  cancel.onclick = () => modal.classList.add("hidden");

  ok.onclick = async () => {

    statusMap[key] = !current;

    try {
      await supabaseClient
        .from("store_status")
        .upsert({
          store_number: key,
          completed: statusMap[key]
        });
    } catch {}

    rebuildSource();
    updateProgress();
    modal.classList.add("hidden");
  };
}

/* ================= REBUILD ================= */

function rebuildSource() {

  geojsonData.features.forEach(f => {
    const key = f.properties.store_number;
    f.properties.completed = statusMap[key] === true;
  });

  map.getSource("stores").setData(geojsonData);
}

/* ================= SEARCH ================= */

function attachSearch() {

  const input = getEl("storeSearch");
  if (!input) return;

  input.addEventListener("input", e => {

    const val = e.target.value.trim();
    if (!val) return;

    const match = storeData.find(
      s => String(s.store_number) === val
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
    .filter(v => v === true).length;

  const total = storeData.length;

  getEl("progressText").innerText =
    `${completed} / ${total} completed`;

  getEl("progressFill").style.width =
    `${(completed / total) * 100}%`;
}

/* ================= SIDEBAR ================= */

const toggle = getEl("sidebarToggle");
const sidebar = getEl("sidebar");

if (toggle && sidebar) {
  toggle.onclick = () => {
    sidebar.classList.toggle("sidebar-open");
  };
}
