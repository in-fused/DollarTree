// ================= MAPBOX =================

mapboxgl.accessToken = "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9.3-ZXlPJosjQ4c5bucpnWYA";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-81.7, 27.8],
  zoom: 6.5
});

// ================= SUPABASE =================

const SUPABASE_URL = "https://dapjhrbfqtsgdlasuuam.supabase.co";
const SUPABASE_KEY = "sb_publishable_DF55L6u6QxGU9Tfo_9MvZw_0Rv7zsJS";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// ================= STATE =================

let storeData = [];
let statusMap = {};
let markers = [];

// ================= SAFE DOM =================

const getEl = (id) => document.getElementById(id);

// ================= SIDEBAR TOGGLE =================

const sidebarToggle = getEl("sidebarToggle");
if (sidebarToggle) {
  sidebarToggle.onclick = () => {
    const sidebar = getEl("sidebar");
    if (sidebar) sidebar.classList.toggle("collapsed");
  };
}

// ================= GEOLOCATE =================

const locateBtn = getEl("locateBtn");
if (locateBtn) {
  locateBtn.onclick = () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      map.flyTo({
        center: [pos.coords.longitude, pos.coords.latitude],
        zoom: 13
      });
    });
  };
}

// ================= LOAD DATA =================

async function loadData() {

  // Load store list
  const res = await fetch("stores_with_coords.json");
  storeData = await res.json();

  // Default all to false
  storeData.forEach(store => {
    statusMap[store.store_number] = false;
  });

  // Load completion states from Supabase
  const { data } = await supabaseClient
    .from("store_status")
    .select("*");

  if (data) {
    data.forEach(row => {
      statusMap[row.store_number] = row.completed === true;
    });
  }

  renderStores();
  updateProgress();
}

// ================= RENDER STORES =================

function renderStores() {

  storeData.forEach(store => {

    const el = document.createElement("div");
    el.style.width = "14px";
    el.style.height = "14px";
    el.style.borderRadius = "50%";
    el.style.cursor = "pointer";

    const isCompleted = statusMap[store.store_number];

    el.style.background = isCompleted
      ? "#2ecc71"
      : "#e10600";

    el.onclick = () => openConfirmModal(store, el);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([store.lng, store.lat])
      .addTo(map);

    markers.push(marker);
  });
}

// ================= CONFIRM MODAL =================

function openConfirmModal(store, markerEl) {

  const modal = getEl("confirmModal");
  const title = getEl("confirmTitle");
  const cancelBtn = getEl("confirmCancel");
  const okBtn = getEl("confirmOk");

  if (!modal) return;

  const currentlyCompleted = statusMap[store.store_number];

  title.innerText = currentlyCompleted
    ? `Mark Store ${store.store_number} as NOT completed?`
    : `Mark Store ${store.store_number} as completed?`;

  modal.classList.remove("hidden");

  cancelBtn.onclick = () => {
    modal.classList.add("hidden");
  };

  okBtn.onclick = async () => {

    const newState = !currentlyCompleted;
    statusMap[store.store_number] = newState;

    markerEl.style.background = newState
      ? "#2ecc71"
      : "#e10600";

    await supabaseClient
      .from("store_status")
      .upsert({
        store_number: store.store_number,
        completed: newState
      });

    updateProgress();
    modal.classList.add("hidden");
  };
}

// ================= PROGRESS =================

function updateProgress() {
  const completed = Object.values(statusMap).filter(v => v).length;
  const total = storeData.length;

  const textEl = getEl("progressText");
  const fillEl = getEl("progressFill");

  if (textEl) {
    textEl.innerText = `${completed} / ${total} completed`;
  }

  if (fillEl && total > 0) {
    fillEl.style.width = `${(completed / total) * 100}%`;
  }
}

// ================= SEARCH =================

const searchInput = getEl("storeSearch");

if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    if (!val) return;

    const match = storeData.find(
      s => s.store_number == val
    );

    if (match) {
      map.flyTo({
        center: [match.lng, match.lat],
        zoom: 14
      });
    }
  });
}

// ================= INIT =================

map.on("load", loadData);
