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
  await loadData();
  setupGeoJSON();
  setupLayers();
  updateProgress();
});

/* LOAD DATA */

async function loadData() {

  const res = await fetch("stores_with_coords.json");
  storeData = await res.json();

  storeData.forEach(store => {
    statusMap[String(store.store_number)] = false;
  });

  try {
    const { data, error } = await supabaseClient
      .from("store_status")
      .select("*");

    if (data && !error) {
      data.forEach(row => {
        const key = String(row.store_number);
        if (statusMap.hasOwnProperty(key)) {
          statusMap[key] = row.completed === true;
        }
      });
    }
  } catch (err) {
    console.warn("Supabase failed:", err);
  }
}

function setupGeoJSON() {

  geojsonData = {
    type: "FeatureCollection",
    features: storeData.map(store => ({
      type: "Feature",
      properties: {
        store_number: String(store.store_number),
        completed: Boolean(statusMap[String(store.store_number)])
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
}

/* MAP LAYERS */

function setupLayers() {

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "stores",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#444",
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

  map.on("click", "clusters", e => {
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
  });

  map.on("click", "unclustered-point", e => {
    openConfirmModal(e.features[0]);
  });
}

/* CONFIRM MODAL */

function openConfirmModal(feature) {

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
      console.warn("Supabase write failed:", err);
    }

    refreshGeoJSON();
    updateProgress();
    modal.classList.add("hidden");
  };
}

/* REFRESH GEOJSON */

function refreshGeoJSON() {

  geojsonData.features.forEach(feature => {
    const key = feature.properties.store_number;
    feature.properties.completed = Boolean(statusMap[key]);
  });

  map.getSource("stores").setData(geojsonData);
}

/* PROGRESS */

function updateProgress() {

  const completed = Object.values(statusMap).filter(v => v).length;
  const total = storeData.length;

  const textEl = getEl("progressText");
  const fillEl = getEl("progressFill");

  if (textEl) {
    textEl.innerText = `${completed} / ${total} completed`;
  }

  if (fillEl) {
    fillEl.style.width = `${(completed / total) * 100}%`;
  }
}

/* SIDEBAR TOGGLE */

const sidebarToggle = getEl("sidebarToggle");
const sidebar = getEl("sidebar");

if (sidebarToggle && sidebar) {
  sidebarToggle.onclick = () => {
    sidebar.classList.toggle("sidebar-open");
  };
}
