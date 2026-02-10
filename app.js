/***** SUPABASE CONFIG *****/
const SUPABASE_URL = "https://dapjhrbfqtsgdlasuuam.supabase.co";
const SUPABASE_KEY = "sb_publishable_DF55L6u6QxGU9Tfo_9MvZw_0Rv7zsJS";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

/***** MAP SETUP *****/
const map = L.map("map").setView([27.8, -81.7], 7);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18
}).addTo(map);

/***** IN-MEMORY STATE *****/
const markerByStoreId = {};
const storeDataById = {};
const statusMap = {};

/***** POPUP HTML (NO TEMPLATE LITERAL NESTING) *****/
function buildPopup(storeId, address, completed) {
  let buttonText = completed ? "Mark Incomplete" : "Mark Completed";

  return (
    "<b>Store #" + storeId + "</b><br/>" +
    address + "<br/><br/>" +
    "<button onclick=\"toggleStatus(" + storeId + ")\">" +
    buttonText +
    "</button>"
  );
}

/***** LOAD DATA *****/
async function loadData() {
  // Load stores
  const storesResponse = await fetch("stores.json");
  const stores = await storesResponse.json();

  for (let i = 0; i < stores.length; i++) {
    storeDataById[stores[i].store_id] = stores[i];
  }

  // Load completion status
  const statusResult = await supabaseClient
    .from("store_status")
    .select("*");

  if (statusResult.data) {
    for (let i = 0; i < statusResult.data.length; i++) {
      statusMap[statusResult.data[i].store_id] =
        statusResult.data[i].completed === true;
    }
  }

  // Render stores one by one
  for (let i = 0; i < stores.length; i++) {
    const store = stores[i];

    try {
      const query = encodeURIComponent(store.full_address);
      const url =
        "https://nominatim.openstreetmap.org/search?format=json&q=" + query;

      const geoRes = await fetch(url);
      const geoData = await geoRes.json();

      if (!geoData || !geoData[0]) {
        continue;
      }

      const lat = parseFloat(geoData[0].lat);
      const lon = parseFloat(geoData[0].lon);
      const completed = statusMap[store.store_id] === true;

      const marker = L.circleMarker([lat, lon], {
        radius: 7,
        color: completed ? "green" : "red"
      }).addTo(map);

      marker.bindPopup(
        buildPopup(
          store.store_id,
          store.full_address,
          completed
        )
      );

      markerByStoreId[store.store_id] = marker;
    } catch (err) {
      console.error("Failed to load store", store.store_id, err);
    }
  }
}

/***** TOGGLE COMPLETION (NO RELOAD) *****/
async function toggleStatus(storeId) {
  const current = statusMap[storeId] === true;
  const next = !current;

  const result = await supabaseClient
    .from("store_status")
    .upsert({
      store_id: storeId,
      completed: next,
      updated_at: new Date()
    });

  if (result.error) {
    alert("Failed to update status");
    console.error(result.error);
    return;
  }

  statusMap[storeId] = next;

  const marker = markerByStoreId[storeId];
  const store = storeDataById[storeId];

  if (marker && store) {
    marker.setStyle({
      color: next ? "green" : "red"
    });

    marker.setPopupContent(
      buildPopup(
        store.store_id,
        store.full_address,
        next
      )
    );
  }
}

/***** START *****/
loadData();
