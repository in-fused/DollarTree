mapboxgl.accessToken = "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9";

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
let geojson;

/* ================= INIT ================= */

map.on("load", async () => {
  await hydrate();
  buildMap();
  bindSearch();
  updateProgress();
  updateActivityList();
});

/* ================= HYDRATE ================= */

async function hydrate() {

  const res = await fetch("stores_with_coords.json");
  storeData = await res.json();

  storeData.forEach(s => {
    statusMap[String(s.store_id)] = { completed:false, closed:false };
  });

  const { data } = await supabaseClient
    .from("store_status")
    .select("*");

  if (data) {
    data.forEach(row => {
      statusMap[String(row.store_id)] = {
        completed: row.completed || false,
        closed: row.closed || false
      };
    });
  }
}

/* ================= MAP ================= */

function buildMap() {

  geojson = {
    type:"FeatureCollection",
    features: storeData.map(s => ({
      type:"Feature",
      properties:{
        store_id:String(s.store_id),
        completed:statusMap[String(s.store_id)].completed,
        closed:statusMap[String(s.store_id)].closed
      },
      geometry:{
        type:"Point",
        coordinates:[s.lng, s.lat]
      }
    }))
  };

  map.addSource("stores", {
    type:"geojson",
    data:geojson,
    cluster:true,
    clusterRadius:50
  });

  map.addLayer({
    id:"clusters",
    type:"circle",
    source:"stores",
    filter:["has","point_count"],
    paint:{
      "circle-color":"#c8102e",
      "circle-radius":24
    }
  });

  map.addLayer({
    id:"cluster-count",
    type:"symbol",
    source:"stores",
    filter:["has","point_count"],
    layout:{ "text-field":"{point_count_abbreviated}" }
  });

  map.addLayer({
    id:"points",
    type:"circle",
    source:"stores",
    filter:["!","has","point_count"],
    paint:{
      "circle-color":[
        "case",
        ["==",["get","closed"],true],"#000000",
        ["==",["get","completed"],true],"#2ecc71",
        "#ff2d2d"
      ],
      "circle-radius":8
    }
  });

  map.on("click","points",openModal);
}

/* ================= MODAL ================= */

function openModal(e){

  const feature = e.features[0];
  const id = feature.properties.store_id;

  const store = storeData.find(s=>String(s.store_id)===id);

  document.getElementById("confirmStoreId").innerText =
    "Store ID: "+id;

  if(store){
    const parts = store.full_address.split(",");
    document.getElementById("confirmAddressLine").innerText = parts[0];
    document.getElementById("confirmCityLine").innerText =
      parts.slice(1).join(",");
  }

  loadNotes(id);

  document.getElementById("confirmModal").classList.remove("hidden");

  document.getElementById("markActive").onclick=
    ()=>updateStore(id,false,false);

  document.getElementById("markCompleted").onclick=
    ()=>updateStore(id,true,false);

  document.getElementById("markClosed").onclick=
    ()=>updateStore(id,false,true);

  document.getElementById("confirmCancel").onclick=
    ()=>document.getElementById("confirmModal").classList.add("hidden");

  document.getElementById("addNoteBtn").onclick=async()=>{
    const note=document.getElementById("noteBox").value.trim();
    if(!note)return;
    await supabaseClient.from("store_notes")
      .insert({store_id:id,note});
    document.getElementById("noteBox").value="";
    loadNotes(id);
  };
}

/* ================= UPDATE ================= */

async function updateStore(id,completed,closed){

  statusMap[id]={completed,closed};

  await supabaseClient.from("store_status")
    .upsert({store_id:id,completed,closed});

  geojson.features.forEach(f=>{
    if(f.properties.store_id===id){
      f.properties.completed=completed;
      f.properties.closed=closed;
    }
  });

  map.getSource("stores").setData(geojson);

  updateProgress();
  updateActivityList();

  document.getElementById("confirmModal").classList.add("hidden");
}

/* ================= NOTES ================= */

async function loadNotes(id){

  const { data } = await supabaseClient
    .from("store_notes")
    .select("*")
    .eq("store_id",id)
    .order("created_at",{ascending:false});

  const container=document.getElementById("notesList");
  container.innerHTML="";

  if(!data||data.length===0){
    container.innerHTML="<div style='opacity:.6;'>No notes yet.</div>";
    return;
  }

  data.forEach(n=>{
    const div=document.createElement("div");
    div.className="noteItem";
    div.innerHTML=`${n.note}<div class="noteTime">${new Date(n.created_at).toLocaleString()}</div>`;
    container.appendChild(div);
  });
}

/* ================= SEARCH ================= */

function bindSearch(){
  const input=document.getElementById("storeSearch");
  input.addEventListener("input",e=>{
    const val=e.target.value.trim();
    const match=storeData.find(s=>String(s.store_id)===val);
    if(match){
      map.flyTo({center:[match.lng,match.lat],zoom:14});
    }
  });
}

/* ================= PROGRESS ================= */

function updateProgress(){

  const vals=Object.values(statusMap);

  const completed=vals.filter(v=>v.completed).length;
  const closed=vals.filter(v=>v.closed).length;
  const active=storeData.length-completed-closed;

  const actionable=storeData.length-closed;
  const percent=actionable? (completed/actionable)*100 :0;

  document.getElementById("completedCount").innerText=completed;
  document.getElementById("activeCount").innerText=active;
  document.getElementById("closedCount").innerText=closed;

  document.getElementById("progressFill").style.width=percent+"%";
  document.getElementById("progressText").innerText=
    percent.toFixed(1)+"% of active stores completed";
}

/* ================= ACTIVITY ================= */

function updateActivityList(){

  const container=document.getElementById("activityList");
  container.innerHTML="";

  Object.entries(statusMap)
    .filter(([_,v])=>v.completed||v.closed)
    .forEach(([id,v])=>{

      const div=document.createElement("div");
      div.className="activityItem";
      div.innerText=(v.completed?"✔ ":"⚠ ")+"Store "+id;

      div.onclick=()=>{
        const s=storeData.find(x=>String(x.store_id)===id);
        if(s) map.flyTo({center:[s.lng,s.lat],zoom:14});
      };

      container.appendChild(div);
    });
}