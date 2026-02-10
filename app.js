const SUPABASE_URL = "https://dapjhrbfqtsgdlasuuam.supabase.co";
const SUPABASE_KEY = "sb_publishable_DF55L6u6QxGU9Tfo_9MvZw_0Rv7zsJS";

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const map = L.map("map").setView([27.8, -81.7], 7); // All Florida
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18
}).addTo(map);

async function loadData() {
  const stores = await fetch("stores.json").then(r => r.json());
  const { data: statusRows } = await supabase.from("store_status").select("*");

  const statusMap = {};
  statusRows?.forEach(r => statusMap[r.store_id] = r.completed);

  stores.forEach(store => {
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(store.full_address)}`)
      .then(res => res.json())
      .then(results => {
        if (!results[0]) return;

        const completed = statusMap[store.store_id];
        const marker = L.circleMarker(
          [results[0].lat, results[0].lon],
          { radius: 7, color: completed ? "green" : "red" }
        ).addTo(map);

        marker.bindPopup(`
          <b>Store #${store.store_id}</b><br/>
          ${store.full_address}<br/><br/>
          <button onclick="toggle(${store.store_id}, ${completed ? "true" : "false"})">
            ${completed ? "Mark Incomplete" : "Mark Completed"}
          </button>
        `);
      });
  });
}

async function toggle(storeId, current) {
  await supabase.from("store_status").upsert({
    store_id: storeId,
    completed: !current,
    updated_at: new Date()
  });
  location.reload();
}

loadData();
