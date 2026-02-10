// ===== SUPABASE CONFIG =====
const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_KEY = "YOUR_ANON_PUBLIC_KEY";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// ===== MAP SETUP =====
const map = L.map("map").setView([27.8, -81.7], 7);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18
}).addTo(map);

// ===== IN-MEMORY STATE =====
const markerByStoreId = {};
const storeDataById = {};
let statusMap = {};

// ===== HELPERS =====
function popupHTML(store, completed) {
  return `
    <b>Store #${store.store_id}</b><br/>
    ${store.full_address}<br/><br/>
    <button onclick="toggleStatus(${store.store_id})">
      ${completed ? "Mark Incomplete" : "Mark Completed"}
    </button>
  `;
}

// ===== LOAD EVERYTHING =====
async function loadData() {
  // Load static store list
  const stores = await fetch("stores.json").then(r => r.json());
  stores.forEach(s => (storeDataById[s.store_id] = s));

  // Load completion status
  const { data } = await supabaseClient
    .from("store_status")
    .select("*");

  data?.forEach(r => {
    statusMap[r.store_id] = r.completed;
  });

  // Render stores ONE BY ONE
  for (const store of stores) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          store.full_address
        )}`
      );
      const results = await res.json();
      if (!results[0]) continue;

      const completed = statusMap[store.store_id] === true;

      const marker = L.circleMarker(
        [r]()
