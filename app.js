mapboxgl.accessToken = "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9.3-ZXlPJosjQ4c5bucpnWYA";

const SUPABASE_URL = "https://dapjhrbfqtsgdlasuuam.supabase.co";
const SUPABASE_KEY = "sb_publishable_DF55L6u6QxGU9Tfo_9MvZw_0Rv7zsJS";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let currentStoreId = null;
let storeData = [];
let statusMap = {};
let geojsonData;

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-81.7, 27.8],
  zoom: 6.5
});

map.on("load", async () => {
  await hydrate();
  buildMap();
  updateProgress();
  bindSearch();
});

/* ================= DATA ================= */

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
    clusterRadius: 50
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "stores",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#c8102e",
      "circle-radius": 24
    }
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "stores",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}"
    }
  });

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

/* ================= SEARCH ================= */

function bindSearch() {
  const input = document.getElementById("storeSearch");
  input.addEventListener("input", e => {
    const val = e.target.value.trim();
    const match = storeData.find(s => String(s.store_id) === val);
    if (match) {
      map.flyTo({
        center: [match.lng, match.lat],
        zoom: 15
      });
    }
  });
}

/* ================= MODAL ================= */

function handleClick(e) {
  const feature = e.features[0];
  const key = feature.properties.store_id;
  currentStoreId = key;

  document.getElementById("confirmModal").classList.remove("hidden");
  document.getElementById("confirmStoreId").innerText = `Store ID: ${key}`;

  const store = storeData.find(s => String(s.store_id) === key);
  if (store) {
    document.getElementById("confirmAddress").innerText =
      store.full_address;
  }

  loadNotes(key);
  loadPhotos(key);
}

document.getElementById("confirmCancel").onclick =
  () => document.getElementById("confirmModal").classList.add("hidden");

/* ================= PHOTO UPLOAD ================= */

document.getElementById("uploadPhotoBtn").onclick = async () => {

  const fileInput = document.getElementById("photoInput");
  const file = fileInput.files[0];
  if (!file || !currentStoreId) return;

  const filePath =
    `${currentStoreId}/${Date.now()}-${file.name}`;

  const { error } = await supabaseClient
    .storage
    .from("store-photos")
    .upload(filePath, file);

  if (error) {
    alert("Upload failed.");
    return;
  }

  const { data } = supabaseClient
    .storage
    .from("store-photos")
    .getPublicUrl(filePath);

  await supabaseClient
    .from("store_photos")
    .insert({
      store_id: currentStoreId,
      image_url: data.publicUrl,
      storage_path: filePath
    });

  fileInput.value = "";
  loadPhotos(currentStoreId);
};

/* ================= LOAD PHOTOS ================= */

async function loadPhotos(storeId) {

  const { data } = await supabaseClient
    .from("store_photos")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  const container = document.getElementById("photoGallery");
  container.innerHTML = "";

  if (!data || data.length === 0) return;

  data.forEach(photo => {

    const wrapper = document.createElement("div");

    const img = document.createElement("img");
    img.src = photo.image_url;

    const del = document.createElement("button");
    del.innerText = "Delete";
    del.className = "deletePhotoBtn";

    del.onclick = async () => {

      await supabaseClient
        .storage
        .from("store-photos")
        .remove([photo.storage_path]);

      await supabaseClient
        .from("store_photos")
        .delete()
        .eq("id", photo.id);

      loadPhotos(storeId);
    };

    wrapper.appendChild(img);
    wrapper.appendChild(del);

    container.appendChild(wrapper);
  });
}