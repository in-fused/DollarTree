mapboxgl.accessToken = "eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9";

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
let markers = [];

const getEl = (id) => document.getElementById(id);

// ================= INIT =================

map.on("load", async () => {
  await loadData();
});

// ================= LOAD DATA =================

async function loadData() {

  // 1️⃣ Load store list
  const res = await fetch("stores_with_coords.json");
  storeData = await res.json();

  // Normalize all store numbers to STRING
  storeData.forEach(store => {
    store.store_number = String(store.store_number);
    statusMap[store.store_number] = false;
  });

  // 2️⃣ Load completion state from Supabase
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

  // 3️⃣ Now render markers AFTER hydration
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

// ================= MODAL =================

function openConfirmModal(store, markerEl) {

  const modal = getEl("confirmModal");
  const title = getEl("confirmTitle");
  const cancelBtn = getEl("confirmCancel");
  const okBtn = getEl("confirmOk");

  if (!modal) return;

  const currentState = statusMap[store.store_number];

  title.innerText = currentState
    ? `Mark Store ${store.store_number} as NOT completed?`
    : `Mark Store ${store.store_number} as completed?`;

  modal.classList.remove("hidden");

  cancelBtn.onclick = () => {
    modal.classList.add("hidden");
  };

  okBtn.onclick = async () => {

    const newState = !currentState;
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
  searchInput.addEventListener("
