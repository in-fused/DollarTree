console.log("APP VERSION 4 - CLEAN FLOW");

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

map.on("load", initializeApp);

async function initializeApp() {

  await hydrateData();
  buildMap();
  attachSearch();
  updateProgress();
}

/* ================= HYDRATION ================= */

async function hydrateData() {

  const res = await fetch("stores_with_coords.json");
  storeData = await res.json();

  // Default everything false
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
  } catch (err) {
    console.warn("Supabase read failed — continuing.");
  }
}

/* ================= BUILD MAP ================= */

function buildMap() {

  geojsonData = {
    type: "FeatureCollection",
    features: storeData.map(store => ({
      type: "Feature",
      properties: {
        store_number: String(store.store_number),
        completed: statusMap[String(store.store_number)] === true
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
    clusterMaxZoom: 14,
    clusterRadius: 50
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "stores",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#333",
        10,
        "#c8102e",
        25,
        "#ff3b3b"
      ],
      "circle-radius": [
        "step",
        ["get", "point_count"],
        18,
        10,
        24,
        25,
        30
      ]
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
    id: "unclustered-point",
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

  map.on("click", "clusters", expandCluster);
  map.on("click", "unclustered-point", openConfirmModal);
}

/* ================= SEARCH ================= */

function attachSearch() {

  const searchInput = getEl("storeSearch");

  if (!searchInput) return;

  searchInput.addEventListener("input", (e) => {

    const value = e.target.value.trim();

    if (!value) return;

    const match = storeData.find(
      s => String(s.store_number) === value
    );

    if (match) {
      map.flyTo({
        center: [match.lng, match.lat],
        zoom: 14
      });
    }
  });
}

/* ================= CLUSTER EXPANSION ================= */

function expandCluster(e) {

  const features = map.queryRenderedFeatures(e.point, {
    layers: ["clusters"]
  });

  const clusterId = features[0].properties.cluster_id;

  map.getSource("stores").getClusterExpansionZoom(
    clusterId,
    (err, zoom) => {
      if (err) return;
      map.easeTo({
        center: features[0].geometry.coordinates,
        zoom: zoom
      });
    }
  );
}

/* ================= MODAL ================= */

function openConfirmModal(e) {

  const feature = e.features[0];
  const storeNumber = feature.properties.store_number;
  const currentState = statusMap[storeNumber];

  const modal = getEl("confirmModal");
  const title = getEl("confirmTitle");
  const cancelBtn = getEl("confirmCancel");
  const okBtn = getEl("confirmOk");

  title.innerText = currentState
    ? `Mark Store ${storeNumber} as NOT completed?`
    : `Mark Store ${storeNumber} as completed?`;

  modal.classList.remove("hidden");

  cancelBtn.onclick = () => modal.classList.add("hidden");

  okBtn.onclick = async () => {

    const newState = !currentState;
    statusMap[storeNumber] = newState;

    try {
      await supabaseClient
        .from("store_status")
        .upsert({
          store_number: storeNumber,
          completed: newState
        });
    } catch (err) {
      console.warn("Supabase write failed.");
    }

    rebuildSource();
    updateProgress();
    modal.classList.add("hidden");
  };
}

/* ================= REBUILD SOURCE ================= */

function rebuildSource() {

  geojsonData.features.forEach(feature => {
    const key = feature.properties.store_number;
    feature.properties.completed = statusMap[key] === true;
  });

  map.getSource("stores").setData(geojsonData);
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

const sidebarToggle = getEl("sidebarToggle");
const sidebar = getEl("sidebar");

if (sidebarToggle && sidebar) {
  sidebarToggle.onclick = () => {
    sidebar.classList.toggle("sidebar-open");
  };
}
