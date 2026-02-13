mapboxgl.accessToken = "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9.3-ZXlPJosjQ4c5bucpnWYA";

const SUPABASE_URL = "https://dapjhrbfqtsgdlasuuam.supabase.co";
const SUPABASE_KEY = "sb_publishable_DF55L6u6QxGU9Tfo_9MvZw_0Rv7zsJS";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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

  if (data) {
    data.forEach(row => {
      const key = String(row.store_id);
      if (statusMap[key]) {
        statusMap[key] = {
          completed: row.completed === true,
          closed: row.closed === true
        };
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
    clusterRadius: 50,
    clusterProperties: {
      completedCount: [
        "+",
        ["case", ["==", ["get", "completed"], true], 1, 0]
      ],
      closedCount: [
        "+",
        ["case", ["==", ["get", "closed"], true], 1, 0]
      ]
    }
  });

  /* CLUSTERS */
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "stores",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "case",
        ["==", ["get", "completedCount"], ["get", "point_count"]],
        "#2ecc71",
        [">", ["get", "closedCount"], 0],
        "#ff9900",
        "#c8102e"
      ],
      "circle-radius": 26
    }
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "stores",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count}",
      "text-size": 14
    },
    paint: {
      "text-color": "#ffffff"
    }
  });

  /* INDIVIDUAL POINTS */
  map.addLayer({
    id: "points",
    type: "circle",
    source: "stores",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "case",
        ["==", ["get", "closed"], true],
        "#ff9900",
        ["==", ["get", "completed"], true],
        "#2ecc71",
        "#ff2d2d"
      ],
      "circle-radius": 8
    }
  });

  map.on("click", "points", handleClick);
}

/* ================= UPDATE STORE ================= */

async function updateStore(key, completed, closed) {

  await supabaseClient
    .from("store_status")
    .upsert({
      store_id: key,
      completed,
      closed
    });

  statusMap[key] = { completed, closed };

  rebuild();
  updateProgress();
  updateActivityList();
}

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
  const input = document.getElementById("storeSearch");
  if (!input) return;

  input.addEventListener("input", e => {
    const val = e.target.value.trim();
    const match = storeData.find(s => String(s.store_id) === val);
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

  const values = Object.values(statusMap);

  const completed = values.filter(v => v.completed).length;
  const closed = values.filter(v => v.closed).length;
  const active = storeData.length - completed - closed;

  document.getElementById("completedCount").innerText = completed;
  document.getElementById("activeCount").innerText = active;
  document.getElementById("closedCount").innerText = closed;

  const actionableTotal = storeData.length - closed;
  const percent = actionableTotal > 0
    ? (completed / actionableTotal) * 100
    : 0;

  document.getElementById("progressFill").style.width =
    `${percent}%`;

  document.getElementById("progressText").innerText =
    `${percent.toFixed(1)}% complete`;
}

/* ================= ACTIVITY LIST ================= */

function updateActivityList() {

  const container = document.getElementById("activityList");
  if (!container) return;

  container.innerHTML = "";

  Object.entries(statusMap)
    .filter(([_, val]) => val.completed || val.closed)
    .forEach(([storeId, state]) => {

      const div = document.createElement("div");
      div.className = "activityItem";

      const icon = document.createElement("span");
      icon.className = "activityIcon";

      if (state.completed) {
        icon.innerText = "✔";
        icon.style.color = "#2ecc71";
      } else if (state.closed) {
        icon.innerText = "⚠";
        icon.style.color = "#ff9900";
      }

      div.appendChild(icon);
      div.append(` Store ${storeId}`);

      div.onclick = () => {
        const match = storeData.find(s => String(s.store_id) === storeId);
        if (match) {
          map.flyTo({
            center: [match.lng, match.lat],
            zoom: 14
          });
        }
      };

      container.appendChild(div);
    });
}
