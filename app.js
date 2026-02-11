console.log("APP VERSION STABLE CLEAN");

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
  await initialize();
});

async function initialize() {
  await hydrate();
  buildMap();
  attachSearch();
  updateProgress();
}

/* ================= HYDRATE ================= */

async function hydrate() {

  const res = await fetch("stores_with_coords.json");
  storeData = await res.json();

  storeData.forEach(store => {
    statusMap[String(store.store_id)] = false;
  });

  try {
    const { data } = await supabaseClient
      .from("store_status")
      .select("*");

    if (Array.isArray(data)) {
      data.forEach(row => {
        const key = String(row.store_id);
        if (statusMap.hasOwnProperty(key)) {
          statusMap[key] = row.completed === true;
        }
      });
    }
  } catch (err) {
    console.warn("Supabase read failed");
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
        completed: statusMap[String(store.store_id)] === true
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
      "#c8102e",
      10,
      "#ff2d2d",
      25,
      "#ff5c5c"
    ],
    "circle-radius": [
      "step",
      ["get", "point_count"],
      20,
      10,
      26,
      25,
      34
    ],
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
    "#ff2d2d"
  ],
  "circle-radius": 7,
  "circle-stroke-width": 1.5,
  "circle-stroke-color": "#ffffff"
}
  });

  map.on("click", "clusters", expandCluster);
  map.on("click", "points", handleClick);
}

/* ================= CLUSTER EXPAND ================= */

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

/* ================= CLICK HANDLER ================= */

function handleClick(e) {

  const feature = e.features[0];
  const key = feature.properties.store_id;
  const current = statusMap[key];

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

  title.innerText = current
    ? "Mark as NOT completed?"
    : "Mark as completed?";

  idLine.innerText = `Store ID: ${key}`;

  if (store) {
    addrLine.innerText = store.address || "";
    cityLine.innerText = `${store.city || ""}, FL ${store.zip || ""}`;
  }

  modal.classList.remove("hidden");

  cancel.onclick = () => {
    modal.classList.add("hidden");
  };

  ok.onclick = async () => {

    statusMap[key] = !current;

    try {
      await supabaseClient
        .from("store_status")
        .upsert({
          store_id: key,
          completed: statusMap[key]
        });
    } catch {}

    rebuild();
    updateProgress();
    modal.classList.add("hidden");
  };
}

/* ================= REBUILD SOURCE ================= */

function rebuild() {

  geojsonData.features.forEach(feature => {
    const key = feature.properties.store_id;
    feature.properties.completed = statusMap[key] === true;
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
    .filter(v => v === true).length;

  const total = storeData.length;

  const text = getEl("progressText");
  const fill = getEl("progressFill");

  if (text) {
    text.innerText = `${completed} / ${total} completed`;
  }

  if (fill) {
    fill.style.width = `${(completed / total) * 100}%`;
  }
}
