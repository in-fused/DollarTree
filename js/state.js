mapboxgl.accessToken = "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9.3-ZXlPJosjQ4c5bucpnWYA";

const SUPABASE_URL = "https://dapjhrbfqtsgdlasuuam.supabase.co";
const SUPABASE_KEY = "sb_publishable_DF55L6u6QxGU9Tfo_9MvZw_0Rv7zsJS";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const DEFAULT_PROJECT_ID = "central-fl-dollar-tree";
const PROJECTS_FILE = "data/projects.json";
const ACTIVE_PROJECT_KEY = "activeProjectId";
const EXECUTIVE_MODE_KEY = "executiveModeEnabled";
const NATIONAL_OVERVIEW_KEY = "nationalOverviewEnabled";
const ACTIVE_VIEW_KEY = "activeWorkspaceView";

const DEFAULT_LOCAL_CENTER = [-81.7, 27.8];
const DEFAULT_LOCAL_ZOOM = 6.5;
const NATIONAL_CENTER = [-96, 38];
const NATIONAL_ZOOM = 3.2;

const PHOTO_BUCKET_CANDIDATES = ["store-photos", "store_photos", "photos"];

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: DEFAULT_LOCAL_CENTER,
  zoom: DEFAULT_LOCAL_ZOOM
});

/* ================= APP STATE ================= */

let resolvedPhotoBucket = null;

let storeData = [];
let statusMap = {};
let geojsonData = { type: "FeatureCollection", features: [] };

let currentModalStoreId = null;
let currentSelectedStoreId = null;
let currentProjectId = DEFAULT_PROJECT_ID;
let currentProjectMeta = null;
let currentWorkspaceView = localStorage.getItem(ACTIVE_VIEW_KEY) || "map";

let currentSession = null;
let currentUser = null;
let currentRole = "viewer";

let projectList = [];
let statusRowsCache = [];
let noteRowsCache = [];
let photoRowsCache = [];
let activityEventRowsCache = [];
let activityFeed = [];

let routeModeEnabled = false;
let selectedRouteStops = [];
let executiveModeEnabled = false;
let nationalOverviewEnabled = false;
let currentPhotoLibrarySelection = null;
let lastDataRefreshAt = null;
let mobileExecutiveSummaryExpanded = false;

let activeFilters = {
  region: "",
  territory: "",
  state: ""
};

let photoLibraryFilters = {
  type: "",
  sort: "newest",
  group: "none",
  search: ""
};
