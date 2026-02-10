/***** CONFIG – REPLACE THESE *****/
mapboxgl.accessToken = "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9.3-ZXlPJosjQ4c5bucpnWYA";

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

/***** LOAD DATA *****/
async function load() {
  const stores = await fetch("stores_with_coords.json").then(r => r.json());

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
    " / " + stores.length + " completed";

  renderMap();
}

/***** MAP RENDER *****/
function renderMap() {
  map.on("load", () => {
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
          15, 20, 20, 30, 25
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
      }
    });

    map.addLayer({
      id: "unclustered",
      type: "circle",
      source: "stores",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": 6,
        "circle-color": [
          "case",
          ["get", "completed"],
          "#2ecc71",
          "#e10600"
        ]
      }
    });

    map.on("click", "unclustered", e => {
      const p = e.features[0].properties;
      toggle(p.store_id);
    });
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

  load(); // reload source only (fast)
}

/***** SEARCH *****/
document.getElementById("storeSearch").addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const id = parseInt(e.target.value, 10);
  const f = storeFeatures.find(s => s.properties.store_id === id);
  if (!f) return alert("Store not found");
  map.flyTo({ center: f.geometry.coordinates, zoom: 14 });
});

/***** START *****/
load();
