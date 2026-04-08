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
const SUPPORTED_STORE_STATUS_CODES = ["active", "completed", "closed", "rescheduled"];

function normalizeStatusCode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (SUPPORTED_STORE_STATUS_CODES.includes(normalized)) return normalized;
  return "active";
}

function deriveLegacyStatusCode(completed, closed) {
  if (completed === true) return "completed";
  if (closed === true) return "closed";
  return "active";
}

function getStatusState(statusInput, statusReason = "") {
  if (statusInput && typeof statusInput === "object") {
    const completed = statusInput.completed === true;
    const closed = statusInput.closed === true;
    const normalizedStatusCode = normalizeStatusCode(
      statusInput.status_code,
      completed,
      closed
    );
    const normalizedStatusReason = String(
      statusInput.status_reason ?? statusReason ?? ""
    ).trim();

    return {
      status_code: normalizedStatusCode,
      status_reason: normalizedStatusReason,
      completed: normalizedStatusCode === "completed",
      closed: normalizedStatusCode === "closed"
    };
  }

  const normalizedStatusCode = normalizeStatusCode(statusInput, false, false);

  return {
    status_code: normalizedStatusCode,
    status_reason: String(statusReason || "").trim(),
    completed: normalizedStatusCode === "completed",
    closed: normalizedStatusCode === "closed"
  };
}

function getStatusStateFromRow(row) {
  const code = row?.status_code
    ? normalizeStatusCode(row.status_code)
    : deriveLegacyStatusCode(row?.completed === true, row?.closed === true);

  return getStatusState(code, row?.status_reason || "");
}

function getStatusDisplayLabel(statusCode) {
  const normalized = normalizeStatusCode(statusCode);
  if (normalized === "completed") return "Completed";
  if (normalized === "closed") return "Closed";
  if (normalized === "rescheduled") return "Rescheduled";
  return "Active";
}

function getStatusActivityType(statusCode) {
  return `status-${normalizeStatusCode(statusCode)}`;
}

function buildStatusActivityTitle(storeId, statusCode) {
  const normalized = normalizeStatusCode(statusCode);
  if (normalized === "completed") return `✔ Store ${storeId} completed`;
  if (normalized === "closed") return `✖ Store ${storeId} closed`;
  if (normalized === "rescheduled") return `↺ Store ${storeId} rescheduled`;
  return `• Store ${storeId} active`;
}

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: DEFAULT_LOCAL_CENTER,
  zoom: DEFAULT_LOCAL_ZOOM
});

/* ================= APP STATE ================= */

let resolvedPhotoBucket = null;

let allStoreData = [];
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
let currentProjectRole = "viewer";
let projectMemberships = [];
let projectMembershipByProjectId = {};
let profileEmailByUserId = {};
let pendingProjectInvites = [];
let projectMembershipsLoaded = false;
let projectMembershipsLoadError = null;

let allProjectList = [];
let projectList = [];
let statusRowsCache = [];
let persistedStatusStoreIds = new Set();
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

let showArchivedProjects = false;
let showRemovedStores = false;

let activePointPulseAnimationId = null;
let activePointPulseStartedAt = 0;

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
