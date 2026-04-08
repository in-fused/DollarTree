/* ================= KEYS / HELPERS ================= */

function routeModeKey() {
  return `routeModeEnabled:${currentProjectId}`;
}

function routeStopsKey() {
  return `selectedRouteStops:${currentProjectId}`;
}

function filtersKey() {
  return `activeFilters:${currentProjectId}`;
}

function isSignedIn() {
  return !!currentUser;
}

function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin") return "admin";
  if (normalized === "editor") return "editor";
  return "viewer";
}

function normalizeProjectRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin") return "admin";
  if (normalized === "editor") return "editor";
  return "viewer";
}

function roleRank(role) {
  if (role === "admin") return 3;
  if (role === "editor") return 2;
  return 1;
}

function getCurrentRole() {
  return normalizeRole(currentRole);
}

function isGlobalAdmin() {
  return getCurrentRole() === "admin";
}

function getProjectMembershipRole(projectId = currentProjectId) {
  if (!projectId) return "viewer";
  return normalizeProjectRole(projectMembershipByProjectId?.[projectId]?.role);
}

function getCurrentProjectRole() {
  return normalizeProjectRole(currentProjectRole);
}

function refreshCurrentProjectRole() {
  currentProjectRole = isGlobalAdmin() ? "admin" : getProjectMembershipRole(currentProjectId);
  return currentProjectRole;
}

function getEffectiveProjectRole() {
  const globalRole = getCurrentRole();
  const projectRole = getCurrentProjectRole();
  return roleRank(globalRole) >= roleRank(projectRole) ? globalRole : projectRole;
}

function canAccessProject(projectId) {
  if (!projectId) return false;
  if (isGlobalAdmin()) return true;
  if (!isSignedIn()) return true;
  if (!projectMembershipsLoaded) return false;
  if (projectMembershipsLoadError) return false;
  return !!projectMembershipByProjectId?.[projectId];
}

function canViewApp() {
  return true;
}

function canEditStores() {
  const role = getEffectiveProjectRole();
  return role === "editor" || role === "admin";
}

function canManageStoreLifecycle() {
  return getEffectiveProjectRole() === "admin";
}

function canManageProjectLifecycle() {
  return getEffectiveProjectRole() === "admin";
}

function canUploadPhotos() {
  return canEditStores();
}

function canAddNotes() {
  return canEditStores();
}

function canManageRoutes() {
  return canEditStores();
}

function canUseExecutiveControls() {
  return canViewApp();
}

function isAdmin() {
  return canManageProjectLifecycle();
}

function isMobileViewport() {
  return window.innerWidth <= 900;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getTimestampValue(timestamp) {
  if (!timestamp) return 0;
  const date = new Date(timestamp);
  const value = date.getTime();
  return Number.isNaN(value) ? 0 : value;
}

function formatActivityTime(timestamp) {
  if (!timestamp) return "Recent";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Recent";
  return date.toLocaleString();
}

function formatPhotoDate(timestamp) {
  if (!timestamp) return "Uploaded";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Uploaded";
  return date.toLocaleString();
}

function formatLastUpdated(timestamp) {
  if (!timestamp) return "Live";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Live";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function isToday(timestamp) {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function formatEta(days) {
  if (!Number.isFinite(days) || days <= 0) return "0 days";
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return `${hours}h`;
  }
  return `${days.toFixed(1)} days`;
}

function uniqueSortedValues(values) {
  return [...new Set(
    values
      .map(value => String(value || "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function prependActivity(event) {
  activityFeed.unshift(event);
  activityFeed = activityFeed
    .sort((a, b) => getTimestampValue(b.timestamp) - getTimestampValue(a.timestamp))
    .slice(0, 100);
}

function normalizePhotoType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "before") return "before";
  if (normalized === "after") return "after";
  return "other";
}

function cryptoRandomKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeFileName(name) {
  return String(name || "photo")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function touchDataRefresh() {
  lastDataRefreshAt = new Date().toISOString();
}

function getPhotoSelectionKey(row) {
  return String(row.id || row.storage_path || row.url || `${row.store_id}-${row.created_at}`);
}

function normalizeStoreRecord(store) {
  return {
    store_id: String(store.store_id),
    store_name: String(store.store_name || "").trim(),
    customer_id: String(store.customer_id || "").trim(),
    lat: Number(store.lat),
    lng: Number(store.lng),
    full_address: String(store.full_address || "").trim(),
    region: String(store.region || "").trim(),
    territory: String(store.territory || "").trim(),
    state: String(store.state || "").trim(),
    city: String(store.city || "").trim(),
    district: String(store.district || "").trim(),
    division: String(store.division || "").trim(),
    market: String(store.market || "").trim()
  };
}

function buildPhotoPath(storeId, file) {
  const safeName = sanitizeFileName(file.name);
  return `${currentProjectId}/${storeId}/${Date.now()}-${safeName}`;
}

function mapActivityEventRow(row) {
  const storeId = String(row.store_id || "");
  const payload = row.payload || {};
  const timestamp = row.created_at || row.updated_at || null;

  if (row.event_type === "store_created") {
    return {
      type: "store-created",
      store_id: storeId,
      timestamp,
      title: `➕ Store ${storeId} added to project`,
      detail: payload.store_name || payload.customer_id || "Imported into project"
    };
  }

  return null;
}
