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

/* HYDRATE */

async function hydrate() {

  const res = await fetch("stores_with_coords.json");
  storeData = await res.json();

  storeData.forEach(store => {
    statusMap[String(store.store_id)] = false;
  });

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
}

/* MAP BUILD */

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

  map.on("click", "points", handleClick);
}

/* MODAL */

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

  if (store && store.full_address) {
    const cleaned = store.full_address.replace(/\s+/g, " ").trim();
    const parts = cleaned.split(",");
    addrLine.innerText = parts[0]?.trim() || "";
    cityLine.innerText = `${parts[1]?.trim() || ""}, ${parts[2]?.trim() || ""}`;
  }

  modal.classList.remove("hidden");

  cancel.onclick = () => modal.classList.add("hidden");

  ok.onclick = async () => {

    statusMap[key] = !current;

    await supabaseClient
      .from("store_status")
      .upsert({
        store_id: key,
        completed: statusMap[key]
      });

    rebuild();
    updateProgress();
    modal.classList.add("hidden");
  };
}

/* REBUILD */

function rebuild() {
  geojsonData.features.forEach(f => {
    const key = f.properties.store_id;
    f.properties.completed = statusMap[key] === true;
  });
  map.getSource("stores").setData(geojsonData);
}

/* SEARCH */

function bindSearch() {
  const input = getEl("storeSearch");
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

/* PROGRESS */

function updateProgress() {
  const completed = Object.values(statusMap).filter(v => v).length;
  const total = storeData.length;

  getEl("progressText").innerText =
    `${completed} / ${total} completed`;

  getEl("progressFill").style.width =
    `${(completed / total) * 100}%`;
}
