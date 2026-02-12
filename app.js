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

  storeData.forEach(s=>{
    statusMap[String(s.store_id)] = {completed:false,closed:false};
  });

  const {data} = await supabaseClient.from("store_status").select("*");
  if(data){
    data.forEach(row=>{
      const key = String(row.store_id);
      statusMap[key] = {
        completed: row.completed === true,
        closed: row.closed === true
      };
    });
  }
}

/* MAP */
function buildMap(){

  geojsonData = {
    type:"FeatureCollection",
    features: storeData.map(s=>({
      type:"Feature",
      properties:{
        store_id:String(s.store_id),
        completed:statusMap[String(s.store_id)].completed,
        closed:statusMap[String(s.store_id)].closed
      },
      geometry:{
        type:"Point",
        coordinates:[s.lng,s.lat]
      }
    }))
  };

  map.addSource("stores",{
    type:"geojson",
    data:geojsonData,
    cluster:true,
    clusterRadius:50
  });

  map.addLayer({
    id:"clusters",
    type:"circle",
    source:"stores",
    filter:["has","point_count"],
    paint:{
      "circle-radius":24,
      "circle-color":"#d0021b"
    }
  });

  map.addLayer({
    id:"cluster-count",
    type:"symbol",
    source:"stores",
    filter:["has","point_count"],
    layout:{
      "text-field":"{point_count_abbreviated}",
      "text-size":16
    }
  });

  map.addLayer({
    id:"points",
    type:"circle",
    source:"stores",
    filter:["!","has","point_count"],
    paint:{
      "circle-radius":8,
      "circle-color":[
        "case",
        ["==",["get","closed"],true],"#ff9900",
        ["==",["get","completed"],true],"#2ecc71",
        "#d0021b"
      ]
    }
  });

  map.on("click","points",handleClick);
}

/* SEARCH */
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

/* ACTIVITY FEED */
function updateActivityList(){
  const container=document.getElementById("activityList");
  container.innerHTML="";

  Object.entries(statusMap).forEach(([id,state])=>{
    if(state.completed || state.closed){
      const div=document.createElement("div");
      div.innerText="Store "+id;

      if(state.completed) div.className="activity-complete";
      else if(state.closed) div.className="activity-closed";
      else div.className="activity-active";

      div.onclick=()=>{
        const match=storeData.find(s=>String(s.store_id)===id);
        if(match){
          map.flyTo({center:[match.lng,match.lat],zoom:14});
        }
      };

      container.appendChild(div);
    }
  });
}

/* UPDATE STORE */
async function updateStore(id,completed,closed){
  await supabaseClient.from("store_status").upsert({
    store_id:id,
    completed,
    closed
  });

  statusMap[id]={completed,closed};
  rebuild();
  updateProgress();
  updateActivityList();
}

/* REBUILD */
function rebuild(){
  geojsonData.features.forEach(f=>{
    const id=f.properties.store_id;
    f.properties.completed=statusMap[id].completed;
    f.properties.closed=statusMap[id].closed;
  });
  map.getSource("stores").setData(geojsonData);
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

  const percent=((completed/(storeData.length-closed))*100)||0;
  document.getElementById("progressFill").style.width=percent+"%";
  document.getElementById("progressText").innerText=percent.toFixed(1)+"% complete";
}
