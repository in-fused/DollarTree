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

map.addControl(new mapboxgl.NavigationControl());

let storeFeatures = [];
let statusMap = {};
let storeCount = 0;
let pendingStoreId = null;

/* UI */
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const modal = document.getElementById("confirmModal");
const confirmTitle = document.getElementById("confirmTitle");

/* Load Data */
async function loadData() {
  const stores = await fetch("stores_with_coords.json").then(r => r.json());
  storeCount = stores.length;

  const { data } = await supabaseClient
    .from("store_status")
    .select("*");

  data?.forEach(r => {
    statusMap[r.store_id] = r.completed;
  });

  storeFeatures = stores.map(s => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    properties: {
      store_id: s.store_id,
      completed: statusMap[s.store_id] === true
    }
  }));

  updateProgress();
}

/* Render Map */
function renderMap() {
  map.addSource("stores", {
    type: "geojson",
    data: { type: "FeatureCollection", features: storeFeatures },
    cluster: true
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "stores",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#c8102e",
      "circle-radius": 18
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

  map.on("mouseenter", "clusters", () => map.getCanvas().style.cursor = "pointer");
  map.on("mouseenter", "unclustered", () => map.getCanvas().style.cursor = "pointer");
  map.on("mouseleave", "clusters", () => map.getCanvas().style.cursor = "");
  map.on("mouseleave", "unclustered", () => map.getCanvas().style.cursor = "");

  map.on("click", "unclustered", e => {
    const id = e.features[0].properties.store_id;
    if (!statusMap[id]) openConfirm(id);
  });
}

/* Confirmation Modal */
const searchInput = document.getElementById("storeSearch");

searchInput.addEventListener("input", (e) => {
  const val = e.target.value.trim();
  if (!val) return;

  const match = storeData.find(s => s.store_number == val);
  if (match) {
    map.flyTo({
      center: [match.lng, match.lat],
      zoom: 14
    });
  }
});


function openConfirm(storeId) {
  pendingStoreId = storeId;
  confirmTitle.innerText = `Mark Store #${storeId} completed?`;
  modal.classList.remove("hidden");
}

document.getElementById("confirmCancel").onclick = () => {
  pendingStoreId = null;
  modal.classList.add("hidden");
};

document.getElementById("confirmOk").onclick = async () => {
  modal.classList.add("hidden");
  await toggle(pendingStoreId);
  pendingStoreId = null;
};

/* Toggle */
async function toggle(storeId) {
  statusMap[storeId] = true;

  await supabaseClient.from("store_status").upsert({
    store_id: storeId,
    completed: true,
    updated_at: new Date()
  });

  const source = map.getSource("stores");
  const data = source._data;

  data.features.forEach(f => {
    if (f.properties.store_id == storeId) {
      f.properties.completed = true;
    }
  });

  source.setData(data);
  updateProgress();
}

/* Progress */
function updateProgress() {
  const completed = Object.values(statusMap).filter(v => v).length;
  const total = storeData.length;

  const progressTextEl = document.getElementById("progressText");
  const progressFillEl = document.getElementById("progressFill");

  if (progressTextEl) {
    progressTextEl.innerText = `${completed} / ${total} completed`;
  }

  if (progressFillEl && total > 0) {
    progressFillEl.style.width = `${(completed / total) * 100}%`;
  }
}


/* Sidebar Toggle */
document.getElementById("sidebarToggle").onclick = () => {
  document.getElementById("sidebar").classList.toggle("collapsed");
};

/* Locate Me */
document.getElementById("locateBtn").onclick = () => {
  navigator.geolocation.getCurrentPosition(pos => {
    map.flyTo({
      center: [pos.coords.longitude, pos.coords.latitude],
      zoom: 14
    });
  });
};

/* Start */
map.on("load", async () => {
  await loadData();
  renderMap();
});
