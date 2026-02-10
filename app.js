/***** CONFIG *****/
const SUPABASE_URL = "https://dapjhrbfqtsgdlasuuam.supabase.co";
const SUPABASE_KEY = "sb_publishable_DF55L6u6QxGU9Tfo_9MvZw_0Rv7zsJS";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

/***** MAP *****/
const map = L.map("map").setView([27.8, -81.7], 7);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18
}).addTo(map);

const cluster = L.markerClusterGroup();
map.addLayer(cluster);

/***** STATE *****/
const markerByStoreId = {};
const statusMap = {};

/***** POPUP *****/
function popup(store, completed) {
  return `
    <b>Store #${store.store_id}</b><br/>
    ${store.full_address}<br/><br/>
    <button onclick="toggleStatus(${store.store_id})">
      ${completed ? "Mark Incomplete" : "Mark Completed"}
    </button>
  `;
}

/***** LOAD *****/
async function load() {
  const stores = await fetch("stores.json").then(r => r.json());

  const { data: rows } = await supabaseClient
    .from("store_status")
    .select("*");

  rows?.forEach(r => {
    statusMap[r.store_id] = r;
  });

  let completedCount = 0;

  for (const store of stores) {
    let status = statusMap[store.store_id];

    // Use cached coordinates if present
    if (!status || status.lat == null || status.lng == null) {
      const q = encodeURIComponent(store.full_address);
      const res = await fetch(
        "https://nominatim.openstreetmap.org/search?format=json&q=" + q
      );
      const geo = await res.json();
      if (!geo[0]) continue;

      status = status || { store_id: store.store_id, completed: false };
      status.lat = parseFloat(geo[0].lat);
      status.lng = parseFloat(geo[0].lon);

      await supabaseClient.from("store_status").upsert(status);
    }

    if (status.completed) completedCount++;

    const marker = L.circleMarker(
      [status.lat, status.lng],
      { radius: 7, color: status.completed ? "green" : "red" }
    );

    marker.bindPopup(popup(store, status.completed));
    cluster.addLayer(marker);

    markerByStoreId[store.store_id] = marker;
  }

  document.getElementById("progressText").innerText =
    `${completedCount} / ${stores.length} completed`;

  enableSearch();
}

/***** TOGGLE *****/
async function toggleStatus(storeId) {
  const current = statusMap[storeId]?.completed === true;
  const next = !current;

  statusMap[storeId].completed = next;

  await supabaseClient.from("store_status").upsert({
    ...statusMap[storeId],
    completed: next,
    updated_at: new Date()
  });

  const marker = markerByStoreId[storeId];
  marker.setStyle({ color: next ? "green" : "red" });

  document.getElementById("progressText").innerText =
    Object.values(statusMap).filter(s => s.completed).length +
    " completed";
}

/***** SEARCH *****/
function enableSearch() {
  document
    .getElementById("storeSearch")
    .addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      const id = parseInt(e.target.value, 10);
      const marker = markerByStoreId[id];
      if (!marker) return alert("Store not found");
      map.setView(marker.getLatLng(), 15);
      marker.openPopup();
    });
}

load();
