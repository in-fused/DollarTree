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

const getEl = id => document.getElementById(id);

map.on("load", async () => {
  await loadData();
  initializeMapSource();
  updateProgress();
});

async function loadData() {

  const res = await fetch("stores_with_coords.json");
  storeData = await res.json();

  storeData.forEach(store => {
    const key = String(store.store_number);
    statusMap[key] = false;
  });

  const { data } = await supabaseClient
    .from("store_status")
    .select("*");

  if (data) {
    data.forEach(row => {
      const key = String(row.store_number);
      if (statusMap.hasOwnProperty(key)) {
        statusMap[key] = row.completed === true;
      }
    });
  }
}

function initializeMapSource() {

  const geojson = {
    type: "FeatureCollection",
    features: storeData.map(store => ({
      type: "Feature",
      properties: {
        store_number: String(store.store_number),
        completed: statusMap[String(store.store_number)]
      },
      geometry: {
        type: "Point",
        coordinates: [store.lng, store.lat]
      }
    }))
  };

  map.addSource("stores", {
    type: "geojson",
    data: geojson,
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
      "circle-color": "#444",
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
      "text-size": 12
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
        ["get", "completed"],
        "#2ecc71",
        "#e10600"
      ],
      "circle-radius": 6
    }
  });

  map.on("click", "unclustered-point", (e) => {
    const feature = e.features[0];
    openConfirmModal(feature);
  });

  map.on("click", "clusters", (e) => {
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
}

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

    await supabaseClient
      .from("store_status")
      .upsert({
        store_number: storeNumber,
        completed: newState
      });

    refreshMapColors();
    updateProgress();
    modal.classList.add("hidden");
  };
}

function refreshMapColors() {

  const source = map.getSource("stores");
  const data = source._data;

  data.features.forEach(feature => {
    const key = feature.properties.store_number;
    feature.properties.completed = statusMap[key];
  });

  source.setData(data);
}

function updateProgress() {

  const completed = Object.values(statusMap).filter(v => v).length;
  const total = storeData.length;

  getEl("progressText").innerText =
    `${completed} / ${total} completed`;

  getEl("progressFill").style.width =
    `${(completed / total) * 100}%`;
}

const sidebarToggle = getEl("sidebarToggle");
const sidebar = getEl("sidebar");

if (sidebarToggle && sidebar) {
  sidebarToggle.onclick = () => {
    sidebar.classList.toggle("sidebar-open");
  };
}