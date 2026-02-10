/***** CONFIG *****/
mapboxgl.accessToken =
  "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9.3-ZXlPJosjQ4c5bucpnWYA";

const SUPABASE_URL = "https://dapjhrbfqtsgdlasuuam.supabase.co";
const SUPABASE_KEY = "sb_publishable_DF55L6u6QxGU9Tfo_9MvZw_0Rv7zsJS";

/***** CLIENTS *****/
const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

/***** MAP *****/
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-81.7, 27.8],
  zoom: 6.5
});

map.addControl(new mapboxgl.NavigationControl());

/***** STATE *****/
let storeFeatures = [];
let statusMap = {};
let storeCount = 0;

/***** LOAD DATA (ONLY DATA) *****/
async function loadData() {
  const stores = await fetch("stores_with_coords.json").then(r => r.json());
  storeCount = stores.length;

  const { data } = await supabaseClient
    .from("store_status")
    .select("*");

  data?.forEach(r => {
    statusMap[r.store_id] = r.completed;
  });

  storeFeatures = stores.map(store => ({
    type: "Feature",
    geometry: {
      type: "Point",
      // IMPORTANT: [lng, lat]
      coordinates: [store.lng, store.lat]
    },
    properties: {
      store_id: store.store_id,
      address: store.full_address,
      completed: statusMap[store.store_id] === true
    }
  }));

  document.getElementById("progressText").innerText =
    Object.values(statusMap).filter(v => v).length +
    " / " + storeCount + " completed";
}

/***** RENDER MAP (ONLY AFTER LOAD) *****/
function renderMap() {
  map.addSource("stores", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: storeFeatures
    },
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
      "circle-radius": [
        "step",
        ["get", "point_count"],
        18,
        20,
        22,
        30,
        28
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
      "text-size": 12
    },
    paint: {
      "text-color": "#ffffff"
    }
  });

  map.addLayer({
    id: "unclustered",
    type: "circle",
    source: "stores",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": 7,
      "circle-color": [
        "case",
        ["get", "completed"],
        "#2ecc71",
        "#e10600"
      ]
    }
  });

  map.on("click", "unclustered", e => {
    const props = e.features[0].properties;
    toggle(parseInt(props.store_id, 10));
  });

  map.on("mouseenter", "unclustered", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "unclustered", () => {
    map.getCanvas().style.cursor = "";
  });
}

/***** TOGGLE *****/
async function toggle(storeId) {
  const next = !(statusMap[storeId] === true);
  statusMap[storeId] = next;

  await supabaseClient.from("store_status").upsert({
    store_id: storeId,
    completed: next,
    updated_at: new Date()
  });

  // Update source in-place (fast, no reload)
  const source = map.getSource("stores");
  const data = source._data;

  data.features.forEach(f => {
    if (f.properties.store_id === storeId) {
      f.properties.completed = next;
    }
  });

  source.setData(data);

  document.getElementById("progressText").innerText =
    Object.values(statusMap).filter(v => v).length +
    " / " + storeCount + " completed";
}

/***** SEARCH *****/
document.getElementById("storeSearch").addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const id = parseInt(e.target.value, 10);
  const f = storeFeatures.find(s => s.properties.store_id === id);
  if (!f) return alert("Store not found");
  map.flyTo({ center: f.geometry.coordinates, zoom: 14 });
});

/***** START (ORDER MATTERS) *****/
map.on("load", async () => {
  await loadData();
  renderMap();
});
