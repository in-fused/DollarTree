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
let markers = [];

const getEl = id => document.getElementById(id);

map.on("load", async () => {
  await loadData();
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

  renderStores();
  updateProgress();
}

function renderStores() {

  storeData.forEach(store => {

    const key = String(store.store_number);

    const el = document.createElement("div");
    el.style.width = "14px";
    el.style.height = "14px";
    el.style.borderRadius = "50%";
    el.style.cursor = "pointer";

    el.style.background = statusMap[key]
      ? "#2ecc71"
      : "#e10600";

    el.onclick = () => openConfirmModal(store, el);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([store.lng, store.lat])
      .addTo(map);

    markers.push(marker);
  });
}

function openConfirmModal(store, markerEl) {

  const modal = getEl("confirmModal");
  const title = getEl("confirmTitle");
  const cancelBtn = getEl("confirmCancel");
  const okBtn = getEl("confirmOk");

  const key = String(store.store_number);
  const currentState = statusMap[key];

  title.innerText = currentState
    ? `Mark Store ${key} as NOT completed?`
    : `Mark Store ${key} as completed?`;

  modal.classList.remove("hidden");

  cancelBtn.onclick = () => modal.classList.add("hidden");

  okBtn.onclick = async () => {

    const newState = !currentState;
    statusMap[key] = newState;

    markerEl.style.background = newState
      ? "#2ecc71"
      : "#e10600";

    await supabaseClient
      .from("store_status")
      .upsert({
        store_number: key,
        completed: newState
      });

    updateProgress();
    modal.classList.add("hidden");
  };
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