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
  if (normalized === "owner") return "owner";
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
  if (role === "owner") return 4;
  if (role === "admin") return 3;
  if (role === "editor") return 2;
  return 1;
}

function getCurrentRole() {
  return normalizeRole(currentRole);
}

function isGlobalAdmin() {
  const role = getCurrentRole();
  return role === "owner" || role === "admin";
}

function isOrgOwner() {
  return getCurrentRole() === "owner";
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
  if (!isSignedIn()) return false;
  if (!projectMembershipsLoaded) return false;
  if (projectMembershipsLoadError) return false;
  return !!projectMembershipByProjectId?.[projectId];
}

function canViewApp() {
  return true;
}

function canEditStores() {
  const role = getEffectiveProjectRole();
  return role === "editor" || role === "admin" || role === "owner";
}

function canManageStoreLifecycle() {
  const role = getEffectiveProjectRole();
  return role === "admin" || role === "owner";
}

function canManageProjectLifecycle() {
  const role = getEffectiveProjectRole();
  return role === "admin" || role === "owner";
}

function normalizePhoneForStorage(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let hasPlusPrefix = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  let normalizedDigits = digits;
  if (!hasPlusPrefix) {
    if (digits.length === 10) {
      normalizedDigits = `1${digits}`;
      hasPlusPrefix = true;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      normalizedDigits = digits;
      hasPlusPrefix = true;
    }
  }

  if (!hasPlusPrefix && normalizedDigits.length >= 8 && normalizedDigits.length <= 15) {
    hasPlusPrefix = true;
  }

  if (hasPlusPrefix) {
    return `+${normalizedDigits}`;
  }

  return normalizedDigits;
}

function isLikelyEmail(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function detectInviteTargetType(value) {
  return isLikelyEmail(value) ? "email" : "phone";
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

function uniqueSortedValues(values) {
  return [...new Set(
    values
      .map(value => String(value || "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStoreCoordinatePair(latValue, lngValue) {
  const lat = toFiniteNumberOrNull(latValue);
  const lng = toFiniteNumberOrNull(lngValue);
  const validLat = lat !== null && lat >= -90 && lat <= 90;
  const validLng = lng !== null && lng >= -180 && lng <= 180;
  const zeroPair = lat === 0 && lng === 0;

  if (!validLat || !validLng || zeroPair) {
    return { lat: null, lng: null };
  }

  return { lat, lng };
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

const inviteActionRefs = {};

function registerInviteActionRef(inviteId) {
  const normalizedInviteId = String(inviteId || "").trim();
  if (!normalizedInviteId) return "";
  const ref = cryptoRandomKey();
  inviteActionRefs[ref] = normalizedInviteId;
  return ref;
}

function resolveInviteActionRef(ref) {
  return inviteActionRefs[String(ref || "").trim()] || "";
}

function getInviteActionRef(invite = {}) {
  const existingRef = String(invite?.invite_ref || invite?._invite_ref || "").trim();
  if (existingRef) return existingRef;
  return registerInviteActionRef(invite?.id || invite?.invite_id || "");
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
  const coordinates = normalizeStoreCoordinatePair(store?.lat, store?.lng);

  return {
    store_id: String(store.store_id),
    store_name: String(store.store_name || "").trim(),
    customer_id: String(store.customer_id || "").trim(),
    lat: coordinates.lat,
    lng: coordinates.lng,
    full_address: String(store.full_address || "").trim(),
    postal_code: String(store.postal_code || store.zip || "").trim(),
    region: String(store.region || "").trim(),
    territory: String(store.territory || "").trim(),
    state: String(store.state || "").trim(),
    city: String(store.city || "").trim(),
    district: String(store.district || "").trim(),
    division: String(store.division || "").trim(),
    market: String(store.market || "").trim()
  };
}

function buildPhotoPath(storeId, file, projectId = currentProjectId) {
  const safeName = sanitizeFileName(file.name);
  const scopedProjectId = String(projectId || "").trim();
  return `${scopedProjectId}/${storeId}/${Date.now()}-${safeName}`;
}

function resolveActivityActorLabel(actorUserId) {
  const normalizedActorUserId = String(actorUserId || "").trim();
  if (!normalizedActorUserId) return "";

  const profileEmail = String(profileEmailByUserId?.[normalizedActorUserId] || "").trim();
  if (profileEmail) return profileEmail;

  const currentUserId = String(currentUser?.id || "").trim();
  if (currentUserId && currentUserId === normalizedActorUserId) {
    const currentUserEmail = String(currentUser?.email || "").trim();
    if (currentUserEmail) return currentUserEmail;
  }

  return normalizedActorUserId;
}

function appendActorToDetail(detailText, actorLabel) {
  const normalizedDetail = String(detailText || "").trim();
  const normalizedActor = String(actorLabel || "").trim();
  if (!normalizedActor) return normalizedDetail;
  if (!normalizedDetail) return `by ${normalizedActor}`;
  return `${normalizedDetail} by ${normalizedActor}`;
}

function getSafeInviteActivityActorLabel(actorLabel) {
  const normalizedActor = String(actorLabel || "").trim();
  if (!normalizedActor) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedActor)) {
    return "";
  }
  if (/^[a-z0-9_-]{24,}$/i.test(normalizedActor) && !normalizedActor.includes("@")) {
    return "";
  }
  return normalizedActor;
}

function appendInviteActorToDetail(detailText, actorLabel) {
  return appendActorToDetail(detailText, getSafeInviteActivityActorLabel(actorLabel));
}

function mapActivityEventRow(row) {
  const storeId = String(row.store_id || "");
  const payload = row.payload || row.metadata || {};
  const eventType = String(row.event_type || row.type || "").trim();
  const timestamp = row.created_at || row.updated_at || null;
  const actorUserId = String(payload.actor_user_id || row.actor_user_id || "").trim();
  const actorLabel = resolveActivityActorLabel(actorUserId);

  if (eventType === "store_created") {
    return {
      type: "store-created",
      store_id: storeId,
      project_id: String(row.project_id || ""),
      timestamp,
      title: `➕ Store ${storeId} added to project`,
      detail: payload.store_name || payload.customer_id || "Imported into project"
    };
  }

  if (eventType === "store-added") {
    return {
      type: "store-added",
      store_id: storeId,
      project_id: String(row.project_id || ""),
      timestamp,
      title: `Store ${storeId} added to project`,
      detail: appendActorToDetail(payload.full_address || payload.store_name || "Manual admin add", actorLabel)
    };
  }

  if (eventType === "store-edited") {
    return {
      type: "store-edited",
      store_id: storeId,
      project_id: String(row.project_id || ""),
      timestamp,
      title: `Store ${storeId} metadata updated`,
      detail: appendActorToDetail(payload.re_geocoded ? "Metadata updated and geocoded" : "Metadata updated", actorLabel)
    };
  }

  if (eventType === "store-removed") {
    return {
      type: "store-removed",
      store_id: storeId,
      project_id: String(row.project_id || ""),
      timestamp,
      title: `Store ${storeId} removed from active scope`,
      detail: appendActorToDetail(payload.full_address || "Store hidden from active project scope", actorLabel)
    };
  }

  if (eventType === "store-reactivated") {
    return {
      type: "store-reactivated",
      store_id: storeId,
      project_id: String(row.project_id || ""),
      timestamp,
      title: `Store ${storeId} reactivated`,
      detail: appendActorToDetail(payload.full_address || "Store returned to active project scope", actorLabel)
    };
  }

  if (eventType === "member_role_updated") {
    return {
      type: "member-role-updated",
      store_id: "",
      project_id: String(row.project_id || ""),
      timestamp,
      title: "Role updated",
      detail: appendActorToDetail(
        payload.role ? `New role: ${payload.role}` : "Project member role changed",
        actorLabel
      )
    };
  }

  if (eventType === "member_removed") {
    return {
      type: "member-removed",
      store_id: "",
      project_id: String(row.project_id || ""),
      timestamp,
      title: "Member removed",
      detail: appendActorToDetail(
        payload.email || payload.target_user_id || "Project member removed",
        actorLabel
      )
    };
  }

  if (eventType === "invite_sent") {
    return {
      type: "invite-sent",
      store_id: "",
      project_id: String(row.project_id || ""),
      timestamp,
      title: "Invite sent",
      detail: appendInviteActorToDetail("Invite sent", actorLabel)
    };
  }

  if (eventType === "invite_revoked") {
    return {
      type: "invite-revoked",
      store_id: "",
      project_id: String(row.project_id || ""),
      timestamp,
      title: "Invite canceled",
      detail: appendInviteActorToDetail("Invite canceled", actorLabel)
    };
  }

  if (eventType === "invite_accepted") {
    return {
      type: "invite-accepted",
      store_id: "",
      project_id: String(row.project_id || ""),
      timestamp,
      title: "Invite accepted",
      detail: appendInviteActorToDetail("Invite accepted", actorLabel)
    };
  }

  return null;
}
