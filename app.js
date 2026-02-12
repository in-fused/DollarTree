mapboxgl.accessToken = "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9.3-ZXlPJosjQ4c5bucpnWYA";

const SUPABASE_URL = "https://dapjhrbfqtsgdlasuuam.supabase.co";
const SUPABASE_KEY = "sb_publishable_DF55L6u6QxGU9Tfo_9MvZw_0Rv7zsJS";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-81.7, 27.8],
  zoom: 6.5
});

let storeData = [];
let statusMap = {};
let geojsonData;

/* INIT */
map.on("load", async () => {
  await hydrate();
  buildMap();
  bindSearch();
  updateProgress();
  updateActivityList();
});

/* HYDRATE */
async function hydrate() {
  const res = await fetch("stores_with_coords.json");
  storeData = await res.json();

  storeData.forEach(s => {
    statusMap[String(s.store_id)] = { completed:false, closed:false };
  });

  const { data } = await supabaseClient.from("store_status").select("*");
  if (data) {
    data.forEach(row => {
      const k = String(row.store_id);
      if (statusMap[k]) {
        statusMap[k] = {
          completed: row.completed,
          closed: row.closed
        };
      }
    });
  }
}

/* MAP */
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
      "circle-color": [
        "step",
        ["get","point_count"],
        "#ff2d2d",
        10,"#ff9900",
        50,"#2ecc71"
      ],
      "circle-radius": 20
    }
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "stores",
    filter: ["has","point_count"],
    layout: {
      "text-field":"{point_count_abbreviated}",
      "text-size":14
    },
    paint:{
      "text-color":"white"
    }
  });

  map.addLayer({
    id:"points",
    type:"circle",
    source:"stores",
    filter:["!",["has","point_count"]],
    paint:{
      "circle-color":[
        "case",
        ["==",["get","closed"],true],"#ff9900",
        ["==",["get","completed"],true],"#2ecc71",
        "#ff2d2d"
      ],
      "circle-radius":8
    }
  });

  map.on("click","points",handleClick);
}

/* SEARCH */
function bindSearch() {
  const input = document.getElementById("storeSearch");
  input.addEventListener("input",e=>{
    const val=e.target.value.trim();
    const match=storeData.find(s=>String(s.store_id)===val);
    if(match){
      map.flyTo({
        center:[match.lng,match.lat],
        zoom:14
      });
    }
  });
}

/* PROGRESS */
function updateProgress(){
  const values=Object.values(statusMap);
  const completed=values.filter(v=>v.completed).length;
  const closed=values.filter(v=>v.closed).length;
  const active=storeData.length-completed-closed;

  document.getElementById("completedCount").innerText=completed;
  document.getElementById("activeCount").innerText=active;
  document.getElementById("closedCount").innerText=closed;

  const actionable=storeData.length-closed;
  const percent=actionable>0?(completed/actionable)*100:0;

  document.getElementById("progressFill").style.width=`${percent}%`;
  document.getElementById("progressText").innerText=`${percent.toFixed(1)}% complete`;
}

/* ACTIVITY */
function updateActivityList(){
  const container=document.getElementById("activityList");
  container.innerHTML="";

  Object.entries(statusMap)
  .filter(([_,v])=>v.completed||v.closed)
  .forEach(([id,state])=>{
    const div=document.createElement("div");
    div.className="activityItem";
    div.innerText=`Store ${id}`;
    div.onclick=()=>{
      const match=storeData.find(s=>String(s.store_id)===id);
      if(match){
        map.flyTo({center:[match.lng,match.lat],zoom:14});
      }
    };
    container.appendChild(div);
  });
}

/* MODAL */
function handleClick(e){
  const key=e.features[0].properties.store_id;
  const modal=document.getElementById("confirmModal");
  modal.classList.remove("hidden");

  document.getElementById("confirmStoreId").innerText=`Store ID: ${key}`;
  const store=storeData.find(s=>String(s.store_id)===key);
  document.getElementById("confirmAddress").innerText=store?.full_address||"";

  loadNotes(key);
  loadPhotos(key);

  document.getElementById("markActive").onclick=()=>updateStore(key,false,false);
  document.getElementById("markCompleted").onclick=()=>updateStore(key,true,false);
  document.getElementById("markClosed").onclick=()=>updateStore(key,false,true);
  document.getElementById("addNoteBtn").onclick=()=>addNote(key);
  document.getElementById("uploadPhotoBtn").onclick=()=>uploadPhoto(key);
  document.getElementById("confirmCancel").onclick=()=>modal.classList.add("hidden");
}

/* UPDATE STORE */
async function updateStore(key,completed,closed){
  await supabaseClient.from("store_status").upsert({
    store_id:key,
    completed,
    closed
  });
  statusMap[key]={completed,closed};
  rebuild();
  updateProgress();
  updateActivityList();
}

/* REBUILD */
function rebuild(){
  geojsonData.features.forEach(f=>{
    const key=f.properties.store_id;
    f.properties.completed=statusMap[key].completed;
    f.properties.closed=statusMap[key].closed;
  });
  map.getSource("stores").setData(geojsonData);
}

/* NOTES */
async function addNote(storeId){
  const note=document.getElementById("noteBox").value.trim();
  if(!note)return;
  await supabaseClient.from("store_notes").insert({store_id:storeId,note});
  document.getElementById("noteBox").value="";
  loadNotes(storeId);
}

async function loadNotes(storeId){
  const {data}=await supabaseClient
  .from("store_notes")
  .select("*")
  .eq("store_id",storeId)
  .order("created_at",{ascending:false});

  const container=document.getElementById("notesList");
  container.innerHTML="";

  if(!data||data.length===0){
    container.innerHTML="No notes yet.";
    return;
  }

  data.forEach(row=>{
    const div=document.createElement("div");
    div.innerHTML=`<div>${row.note}</div>
    <div style="opacity:.6;font-size:11px">${new Date(row.created_at).toLocaleString()}</div>`;
    container.appendChild(div);
  });
}

/* PHOTOS */
async function uploadPhoto(storeId){
  const file=document.getElementById("photoInput").files[0];
  if(!file)return;

  const filePath=`${storeId}/${Date.now()}-${file.name}`;

  await supabaseClient.storage.from("store-photos").upload(filePath,file);

  await supabaseClient.from("store_photos").insert({
    store_id:storeId,
    file_path:filePath
  });

  loadPhotos(storeId);
}

async function loadPhotos(storeId){
  const {data}=await supabaseClient
  .from("store_photos")
  .select("*")
  .eq("store_id",storeId)
  .order("created_at",{ascending:false});

  const gallery=document.getElementById("photoGallery");
  gallery.innerHTML="";

  if(!data)return;

  data.forEach(photo=>{
    const {data:urlData}=supabaseClient
      .storage
      .from("store-photos")
      .getPublicUrl(photo.file_path);

    const img=document.createElement("img");
    img.src=urlData.publicUrl;

    const del=document.createElement("button");
    del.innerText="Delete";
    del.onclick=async()=>{
      await supabaseClient.storage.from("store-photos").remove([photo.file_path]);
      await supabaseClient.from("store_photos").delete().eq("id",photo.id);
      loadPhotos(storeId);
    };

    gallery.appendChild(img);
    gallery.appendChild(del);
  });
}