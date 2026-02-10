const SUPABASE_URL = window.ENV.SUPABASE_URL;
const SUPABASE_KEY = window.ENV.SUPABASE_KEY;

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// Initialize map (Florida-wide)
const map = L.map("map").setView([27.8, -81.7], 7);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18
}).addTo(map);

async function loadData() {
  const stores = await fetch("stores.json").then(r => r.json());

  const { data: statusRows, error } = await supabaseClient
    .from("store_status")
    .select("*");

  if (error) {
    console.error("Supabase error:", error);
    return;
  }

  const statusMap = {};
  statusRows.forEach(r => {
    statusMap[r.store_id] = r.completed;
  });

  for (const store of stores) {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        store.full_address
      )}`
    );
    const results = await res.json();
    if (!results[0]) continue;

    const completed = statusMap[store.store_id] === true;

    const marker = L.circleMarker(
      [results[0].lat, results[0].lon],
      {
        radius: 7,
        color: completed ? "green" : "red"
      }
    ).addTo(map);

    marker.bindPopup(`
      <b>Store #${store.store_id}</b><br/>
      ${store.full_address}<br/><br/>
      <button onclick="toggleStatus(${store.store_id}, ${completed})">
        ${completed ? "Mark Incomplete" : "Mark Completed"}
      </button>
    `);
  }
}

async function toggleStatus(storeId, current) {
  const { error } = await supabaseClient.from("store_status").upsert({
    store_id: storeId,
    completed: !current,
    updated_at: new Date()
  });

  if (error) {
    alert("Failed to update status");
    console.error(error);
    return;
  }

  location.reload();
}

loadData();
