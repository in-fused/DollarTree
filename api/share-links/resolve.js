const crypto = require("node:crypto");

const SUPABASE_REST_PATH = "/rest/v1";
const SUPABASE_TIMEOUT_MS = 15000;
const RECENT_ACTIVITY_LIMIT = 12;
const NOTES_PER_STORE_LIMIT = 5;
const PHOTOS_PER_STORE_LIMIT = 6;
const MAX_NOTE_EVIDENCE_ROWS = 2500;
const MAX_PHOTO_EVIDENCE_ROWS = 3000;
const SIGNED_PHOTO_URL_TTL_SECONDS = 60 * 60;
const SIGNED_PHOTO_URL_BATCH_SIZE = 100;
const PHOTO_BUCKET_CANDIDATES = ["store-photos", "store_photos", "photos"];

class HttpError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function getHeader(req, name) {
  const value = req?.headers?.[String(name || "").toLowerCase()];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function getConfig() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    throw new HttpError(500, "missing_server_env", `Missing required server environment variables: ${missing.join(", ")}.`);
  }

  return { supabaseUrl, serviceRoleKey };
}

function parseJsonMaybe(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
  }
}

function getPayloadMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload || fallback;
  return String(
    payload.message ||
    payload.msg ||
    payload.error_description ||
    payload.error?.message ||
    payload.error ||
    fallback
  ).trim() || fallback;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = SUPABASE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function supabaseRequest(config, path, options = {}) {
  const url = new URL(`${config.supabaseUrl}${SUPABASE_REST_PATH}/${path}`);
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    Accept: "application/json"
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.prefer) {
    headers.Prefer = options.prefer;
  }

  const response = await fetchWithTimeout(url, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const payload = parseJsonMaybe(await response.text());
  if (!response.ok) {
    throw new HttpError(
      response.status,
      "supabase_request_failed",
      getPayloadMessage(payload, "Supabase request failed."),
      payload
    );
  }

  return payload;
}

async function supabaseStorageRequest(config, path, options = {}) {
  const url = new URL(`${config.supabaseUrl}/storage/v1/${path}`);

  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    Accept: "application/json"
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetchWithTimeout(url, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const payload = parseJsonMaybe(await response.text());
  if (!response.ok) {
    throw new HttpError(
      response.status,
      "supabase_storage_request_failed",
      getPayloadMessage(payload, "Supabase Storage request failed."),
      payload
    );
  }

  return payload;
}

async function loadOne(config, table, query) {
  const rows = await supabaseRequest(config, table, {
    query: {
      ...query,
      limit: 1
    }
  });
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token || ""), "utf8")
    .digest("hex");
}

function normalizeStatusCode(value, completed = false, closed = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["active", "completed", "closed", "rescheduled"].includes(normalized)) return normalized;
  if (completed === true) return "completed";
  if (closed === true) return "closed";
  return "active";
}

function getStatusDisplayLabel(statusCode) {
  const normalized = normalizeStatusCode(statusCode);
  if (normalized === "completed") return "Completed";
  if (normalized === "closed") return "Closed";
  if (normalized === "rescheduled") return "Rescheduled";
  return "Active";
}

function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCoordinatePair(latValue, lngValue) {
  const lat = toFiniteNumberOrNull(latValue);
  const lng = toFiniteNumberOrNull(lngValue);
  const validLat = lat !== null && lat >= -90 && lat <= 90;
  const validLng = lng !== null && lng >= -180 && lng <= 180;
  if (!validLat || !validLng || (lat === 0 && lng === 0)) return { lat: null, lng: null };
  return { lat, lng };
}

function getTimestampValue(timestamp) {
  if (!timestamp) return 0;
  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function truncate(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function getEvidenceFetchLimit(storeCount, perStoreLimit, maxRows) {
  const normalizedStoreCount = Math.max(0, Number(storeCount) || 0);
  if (normalizedStoreCount === 0) return 0;
  return Math.min(maxRows, Math.max(perStoreLimit, normalizedStoreCount * perStoreLimit));
}

function isSafeHttpUrl(value) {
  const url = String(value || "").trim();
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function normalizeStoragePath(value) {
  const path = String(value || "").trim().replace(/^\/+/, "");
  if (
    !path
    || /^https?:\/\//i.test(path)
    || path.includes("\0")
    || path.includes("\\")
    || path.split("/").some(segment => segment === "." || segment === "..")
  ) return "";
  return path;
}

function isStoragePathScopedToStore(value, projectId, storeId) {
  const path = normalizeStoragePath(value);
  const safeProjectId = String(projectId || "").trim();
  const safeStoreId = String(storeId || "").trim();
  if (!path || !safeProjectId || !safeStoreId) return false;
  return path.startsWith(`${safeProjectId}/${safeStoreId}/`);
}

function normalizeSignedStorageUrl(config, value) {
  const signedUrl = String(value || "").trim();
  if (!signedUrl) return "";
  if (/^https?:\/\//i.test(signedUrl)) return signedUrl;
  if (signedUrl.startsWith("/storage/v1/")) return `${config.supabaseUrl}${signedUrl}`;
  if (signedUrl.startsWith("/")) return `${config.supabaseUrl}/storage/v1${signedUrl}`;
  return `${config.supabaseUrl}/storage/v1/${signedUrl.replace(/^\/+/, "")}`;
}

function normalizePhotoType(value) {
  return truncate(String(value || "").trim().toLowerCase(), 40);
}

function chunkArray(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function sanitizeProject(project) {
  return {
    project_id: String(project?.project_id || "").trim(),
    name: String(project?.name || project?.project_id || "Project Overview").trim(),
    brand_color: String(project?.brand_color || "").trim(),
    brand_logo_url: String(project?.brand_logo_url || "").trim()
  };
}

function sanitizeStore(store, statusState, hasPersistedStatus) {
  const coordinates = normalizeCoordinatePair(store?.lat, store?.lng);
  const statusCode = normalizeStatusCode(statusState?.status_code, statusState?.completed === true, statusState?.closed === true);
  const statusReason = String(statusState?.status_reason || "").trim();

  return {
    store_id: String(store?.store_id || "").trim(),
    store_name: String(store?.store_name || "").trim(),
    full_address: String(store?.full_address || "").trim(),
    city: String(store?.city || "").trim(),
    state: String(store?.state || "").trim(),
    region: String(store?.region || "").trim(),
    territory: String(store?.territory || "").trim(),
    lat: coordinates.lat,
    lng: coordinates.lng,
    status_code: statusCode,
    status_label: getStatusDisplayLabel(statusCode),
    status_reason: statusCode === "rescheduled" ? statusReason : "",
    has_persisted_status: hasPersistedStatus === true
  };
}

function sanitizeNoteEvidence(row, safeStoreIds) {
  const storeId = String(row?.store_id || "").trim();
  if (!storeId || !safeStoreIds.has(storeId)) return null;

  const note = truncate(row?.note, 2000);
  if (!note) return null;

  return {
    store_id: storeId,
    note,
    created_at: row?.created_at || null
  };
}

function sanitizePhotoEvidence(row, safeStoreIds, signedUrlByPath) {
  const storeId = String(row?.store_id || "").trim();
  if (!storeId || !safeStoreIds.has(storeId)) return null;

  const storagePath = normalizeStoragePath(row?.storage_path);
  const publicImageUrl = String(row?.image_url || row?.resolved_image_url || row?.url || "").trim();
  const signedImageUrl = storagePath ? String(signedUrlByPath[storagePath] || "").trim() : "";
  const imageUrl = isSafeHttpUrl(publicImageUrl) ? publicImageUrl : signedImageUrl;

  if (!isSafeHttpUrl(imageUrl)) return null;

  const photoType = normalizePhotoType(row?.photo_type || row?.type);
  const payload = {
    store_id: storeId,
    image_url: imageUrl,
    created_at: row?.created_at || null
  };

  if (photoType) payload.photo_type = photoType;
  return payload;
}

function buildStatusMap(statusRows) {
  const map = new Map();
  (Array.isArray(statusRows) ? statusRows : []).forEach(row => {
    const storeId = String(row?.store_id || "").trim();
    if (!storeId) return;
    const statusCode = normalizeStatusCode(row?.status_code, row?.completed === true, row?.closed === true);
    map.set(storeId, {
      status_code: statusCode,
      status_reason: String(row?.status_reason || "").trim(),
      completed: statusCode === "completed",
      closed: statusCode === "closed",
      created_at: row?.created_at || null,
      updated_at: row?.updated_at || null
    });
  });
  return map;
}

function buildSummary(stores, statusMap) {
  const summary = {
    total: stores.length,
    completed: 0,
    active: 0,
    rescheduled: 0,
    closed: 0,
    percent_complete: 0,
    open_work: 0,
    attention_count: 0,
    missing_coordinate_count: 0,
    missing_status_count: 0,
    missing_region_count: 0,
    missing_territory_count: 0,
    missing_state_count: 0
  };

  const shouldAuditRegion = stores.some(store => String(store?.region || "").trim());
  const shouldAuditTerritory = stores.some(store => String(store?.territory || "").trim());
  const shouldAuditState = stores.some(store => String(store?.state || "").trim());

  stores.forEach(store => {
    const storeId = String(store?.store_id || "").trim();
    const status = statusMap.get(storeId) || { status_code: "active" };
    const statusCode = normalizeStatusCode(status.status_code, status.completed === true, status.closed === true);
    const coordinates = normalizeCoordinatePair(store?.lat, store?.lng);

    if (statusCode === "completed") summary.completed += 1;
    else if (statusCode === "closed") summary.closed += 1;
    else if (statusCode === "rescheduled") summary.rescheduled += 1;
    else summary.active += 1;

    if (coordinates.lat === null || coordinates.lng === null) summary.missing_coordinate_count += 1;
    if (!statusMap.has(storeId)) summary.missing_status_count += 1;
    if (shouldAuditRegion && !String(store?.region || "").trim()) summary.missing_region_count += 1;
    if (shouldAuditTerritory && !String(store?.territory || "").trim()) summary.missing_territory_count += 1;
    if (shouldAuditState && !String(store?.state || "").trim()) summary.missing_state_count += 1;

    const statusReason = String(status?.status_reason || "").trim();
    if (statusCode === "rescheduled" && !statusReason) summary.attention_count += 1;
    if (!statusMap.has(storeId)) summary.attention_count += 1;
    if (coordinates.lat === null || coordinates.lng === null) summary.attention_count += 1;
  });

  const actionableTotal = Math.max(0, summary.total - summary.closed);
  summary.open_work = summary.active + summary.rescheduled;
  summary.percent_complete = actionableTotal > 0 ? Number(((summary.completed / actionableTotal) * 100).toFixed(1)) : 0;
  summary.data_health_issue_count = summary.missing_coordinate_count
    + summary.missing_status_count
    + summary.missing_region_count
    + summary.missing_territory_count
    + summary.missing_state_count;

  return summary;
}

function buildGeography(stores) {
  const buildBreakdown = (key) => {
    const counts = new Map();
    stores.forEach(store => {
      const value = String(store?.[key] || "").trim();
      if (!value) return;
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };

  return {
    states: buildBreakdown("state"),
    regions: buildBreakdown("region"),
    territories: buildBreakdown("territory"),
    plotted_count: stores.filter(store => {
      const coordinates = normalizeCoordinatePair(store?.lat, store?.lng);
      return coordinates.lat !== null && coordinates.lng !== null;
    }).length
  };
}

function isSafeActivityEventType(eventType) {
  const normalized = String(eventType || "").trim().toLowerCase();
  return [
    "store_created",
    "store-added",
    "store-edited",
    "store-removed",
    "store-reactivated",
    "status-active",
    "status-completed",
    "status-closed",
    "status-rescheduled",
    "note",
    "note_added",
    "photo",
    "photo_uploaded"
  ].includes(normalized);
}

function sanitizeActivityEvent(row) {
  const eventType = String(row?.event_type || row?.type || "").trim().toLowerCase();
  if (!isSafeActivityEventType(eventType)) return null;

  const storeId = String(row?.store_id || "").trim();
  const timestamp = row?.created_at || row?.updated_at || null;
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};

  if (eventType === "store_created") {
    return {
      type: "store-created",
      store_id: storeId,
      timestamp,
      title: storeId ? `Store ${storeId} added to project` : "Store added to project",
      detail: "Project scope updated"
    };
  }

  if (eventType === "store-added") {
    return {
      type: "store-added",
      store_id: storeId,
      timestamp,
      title: storeId ? `Store ${storeId} added to project` : "Store added to project",
      detail: "Manual admin store add recorded"
    };
  }

  if (eventType === "store-edited") {
    return {
      type: "store-edited",
      store_id: storeId,
      timestamp,
      title: storeId ? `Store ${storeId} metadata updated` : "Store metadata updated",
      detail: "Project store metadata updated"
    };
  }

  if (eventType === "store-removed") {
    return {
      type: "store-removed",
      store_id: storeId,
      timestamp,
      title: storeId ? `Store ${storeId} removed from active scope` : "Store removed from active scope",
      detail: "Store hidden from active project scope"
    };
  }

  if (eventType === "store-reactivated") {
    return {
      type: "store-reactivated",
      store_id: storeId,
      timestamp,
      title: storeId ? `Store ${storeId} reactivated` : "Store reactivated",
      detail: "Store returned to active project scope"
    };
  }

  if (eventType === "note" || eventType === "note_added") {
    return {
      type: "note",
      store_id: storeId,
      timestamp,
      title: storeId ? `Note added to Store ${storeId}` : "Note added",
      detail: "Field note recorded"
    };
  }

  if (eventType === "photo" || eventType === "photo_uploaded") {
    return {
      type: "photo",
      store_id: storeId,
      timestamp,
      title: storeId ? `Photo uploaded for Store ${storeId}` : "Photo uploaded",
      detail: "Field photo evidence recorded"
    };
  }

  const statusCode = eventType.replace(/^status-/, "");
  return {
    type: eventType,
    store_id: storeId,
    timestamp,
    title: storeId ? `Store ${storeId} ${getStatusDisplayLabel(statusCode).toLowerCase()}` : "Status updated",
    detail: truncate(payload.status_reason || "Status updated", 120)
  };
}

function buildStatusActivity(statusRows) {
  return (Array.isArray(statusRows) ? statusRows : [])
    .map(row => {
      const storeId = String(row?.store_id || "").trim();
      const statusCode = normalizeStatusCode(row?.status_code, row?.completed === true, row?.closed === true);
      const timestamp = row?.updated_at || row?.created_at || null;
      const statusReason = String(row?.status_reason || "").trim();
      const created = getTimestampValue(row?.created_at);
      const updated = getTimestampValue(row?.updated_at);

      if (statusCode === "active" && !statusReason && (!created || !updated || updated <= created + 1000)) {
        return null;
      }

      return {
        type: `status-${statusCode}`,
        store_id: storeId,
        timestamp,
        title: storeId ? `Store ${storeId} ${getStatusDisplayLabel(statusCode).toLowerCase()}` : "Status updated",
        detail: statusReason || "Status updated"
      };
    })
    .filter(Boolean);
}

function buildRecentActivity(statusRows, activityRows) {
  const events = [
    ...buildStatusActivity(statusRows),
    ...(Array.isArray(activityRows) ? activityRows : []).map(sanitizeActivityEvent).filter(Boolean)
  ];

  const seen = new Set();
  return events
    .sort((a, b) => getTimestampValue(b.timestamp) - getTimestampValue(a.timestamp))
    .filter(event => {
      const key = `${event.type}|${event.store_id}|${event.timestamp}|${event.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, RECENT_ACTIVITY_LIMIT);
}

async function loadNoteEvidenceRows(config, projectId, storeCount) {
  const limit = getEvidenceFetchLimit(storeCount, NOTES_PER_STORE_LIMIT, MAX_NOTE_EVIDENCE_ROWS);
  if (!limit) return [];

  try {
    const rows = await supabaseRequest(config, "store_notes", {
      query: {
        select: "store_id,note,created_at",
        project_id: `eq.${projectId}`,
        order: "created_at.desc",
        limit
      }
    });
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.warn("Public share note evidence unavailable:", error?.message || error);
    return [];
  }
}

async function loadPhotoEvidenceRows(config, projectId, storeCount) {
  const limit = getEvidenceFetchLimit(storeCount, PHOTOS_PER_STORE_LIMIT, MAX_PHOTO_EVIDENCE_ROWS);
  if (!limit) return [];

  const selectAttempts = [
    "store_id,image_url,storage_path,created_at,photo_type,type",
    "store_id,image_url,storage_path,created_at,photo_type",
    "store_id,image_url,storage_path,created_at,type",
    "store_id,image_url,storage_path,created_at",
    "*"
  ];

  for (const select of selectAttempts) {
    try {
      const rows = await supabaseRequest(config, "store_photos", {
        query: {
          select,
          project_id: `eq.${projectId}`,
          order: "created_at.desc",
          limit
        }
      });
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      if (select === selectAttempts[selectAttempts.length - 1]) {
        console.warn("Public share photo evidence unavailable:", error?.message || error);
        return [];
      }
    }
  }

  return [];
}

async function createSignedPhotoUrlMap(config, storagePaths, expiresInSeconds = SIGNED_PHOTO_URL_TTL_SECONDS) {
  const uniquePaths = [...new Set(
    (Array.isArray(storagePaths) ? storagePaths : [])
      .map(normalizeStoragePath)
      .filter(Boolean)
  )];
  const signedUrlByPath = {};
  if (uniquePaths.length === 0) return signedUrlByPath;

  for (const bucketName of PHOTO_BUCKET_CANDIDATES) {
    const remainingPaths = uniquePaths.filter(path => !signedUrlByPath[path]);
    if (remainingPaths.length === 0) break;

    try {
      for (const batchPaths of chunkArray(remainingPaths, SIGNED_PHOTO_URL_BATCH_SIZE)) {
        const payload = await supabaseStorageRequest(config, `object/sign/${encodeURIComponent(bucketName)}`, {
          method: "POST",
          body: {
            expiresIn: expiresInSeconds,
            paths: batchPaths
          }
        });

        const rows = Array.isArray(payload)
          ? payload
          : (Array.isArray(payload?.data)
            ? payload.data
            : (Array.isArray(payload?.signedUrls) ? payload.signedUrls : []));
        rows.forEach((row, index) => {
          const path = normalizeStoragePath(row?.path || row?.name || batchPaths[index]);
          const signedUrl = normalizeSignedStorageUrl(config, row?.signedURL || row?.signedUrl || row?.signed_url);
          if (path && isSafeHttpUrl(signedUrl)) {
            signedUrlByPath[path] = signedUrl;
          }
        });
      }
    } catch (_) {
      // Try the next candidate bucket. The frontend only receives successfully signed URLs.
    }
  }

  return signedUrlByPath;
}

async function buildEvidenceByStoreId(config, projectId, stores) {
  const safeStoreIds = new Set(
    (Array.isArray(stores) ? stores : [])
      .map(store => String(store?.store_id || "").trim())
      .filter(Boolean)
  );
  const storeCount = safeStoreIds.size;
  if (storeCount === 0) return {};

  const [noteRows, photoRows] = await Promise.all([
    loadNoteEvidenceRows(config, projectId, storeCount),
    loadPhotoEvidenceRows(config, projectId, storeCount)
  ]);

  const storagePathsToSign = (Array.isArray(photoRows) ? photoRows : [])
    .filter(row => {
      const storeId = String(row?.store_id || "").trim();
      const imageUrl = String(row?.image_url || row?.resolved_image_url || row?.url || "").trim();
      return (
        storeId
        && safeStoreIds.has(storeId)
        && !isSafeHttpUrl(imageUrl)
        && isStoragePathScopedToStore(row?.storage_path, projectId, storeId)
      );
    })
    .map(row => normalizeStoragePath(row?.storage_path))
    .filter(Boolean);
  const signedUrlByPath = await createSignedPhotoUrlMap(config, storagePathsToSign);
  const evidenceByStoreId = {};

  const getEntry = (storeId) => {
    if (!evidenceByStoreId[storeId]) {
      evidenceByStoreId[storeId] = {
        notes: [],
        photos: []
      };
    }
    return evidenceByStoreId[storeId];
  };

  [...noteRows]
    .sort((a, b) => getTimestampValue(b?.created_at) - getTimestampValue(a?.created_at))
    .forEach(row => {
      const note = sanitizeNoteEvidence(row, safeStoreIds);
      if (!note) return;
      const entry = getEntry(note.store_id);
      if (entry.notes.length < NOTES_PER_STORE_LIMIT) {
        entry.notes.push(note);
      }
    });

  [...photoRows]
    .sort((a, b) => getTimestampValue(b?.created_at) - getTimestampValue(a?.created_at))
    .forEach(row => {
      const photo = sanitizePhotoEvidence(row, safeStoreIds, signedUrlByPath);
      if (!photo) return;
      const entry = getEntry(photo.store_id);
      if (entry.photos.length < PHOTOS_PER_STORE_LIMIT) {
        entry.photos.push(photo);
      }
    });

  Object.keys(evidenceByStoreId).forEach(storeId => {
    const entry = evidenceByStoreId[storeId];
    if (!entry.notes.length && !entry.photos.length) {
      delete evidenceByStoreId[storeId];
    }
  });

  return evidenceByStoreId;
}

async function recordShareAccess(config, link) {
  if (!link?.id) return;
  try {
    await supabaseRequest(config, "project_share_links", {
      method: "PATCH",
      query: {
        id: `eq.${link.id}`
      },
      body: {
        last_accessed_at: new Date().toISOString(),
        access_count: Math.max(0, Number(link.access_count) || 0) + 1
      }
    });
  } catch (_) {
    // Access metrics are non-critical; token resolution should not fail if this write is rejected.
  }
}

async function resolveLink(config, token) {
  const tokenHash = hashToken(token);
  const link = await loadOne(config, "project_share_links", {
    select: "id,project_id,token_hash,expires_at,revoked_at,last_accessed_at,access_count,scope,label,created_at",
    token_hash: `eq.${tokenHash}`
  });

  if (!link) {
    throw new HttpError(404, "share_link_not_found", "Share link not found.");
  }
  if (link.revoked_at) {
    throw new HttpError(410, "share_link_revoked", "This share link has been revoked.");
  }
  if (String(link.scope || "overview").trim().toLowerCase() !== "overview") {
    throw new HttpError(403, "unsupported_share_scope", "This share link scope is not supported.");
  }

  const expiresAtValue = getTimestampValue(link.expires_at);
  if (!expiresAtValue || expiresAtValue <= Date.now()) {
    throw new HttpError(410, "share_link_expired", "This share link has expired.");
  }

  return link;
}

function publicErrorPayload(error) {
  return {
    code: error?.code || "request_failed",
    message: error?.message || "Request failed."
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return json(res, 405, {
      ok: false,
      error: {
        code: "method_not_allowed",
        message: "Only GET and POST are supported."
      }
    });
  }

  try {
    const config = getConfig();
    const requestUrl = new URL(req.url || "", "https://local.invalid");
    const token = String(
      getHeader(req, "x-share-token")
      || requestUrl.searchParams.get("t")
      || requestUrl.searchParams.get("token")
      || ""
    ).trim();
    if (!token || token.length < 32) {
      throw new HttpError(400, "missing_token", "A valid share token is required.");
    }

    const link = await resolveLink(config, token);
    const projectId = String(link.project_id || "").trim();

    const [project, storesResult, statusRows, activityRows] = await Promise.all([
      loadOne(config, "projects", {
        select: "*",
        project_id: `eq.${projectId}`
      }),
      supabaseRequest(config, "stores", {
        query: {
          select: "*",
          project_id: `eq.${projectId}`
        }
      }),
      supabaseRequest(config, "store_status", {
        query: {
          select: "*",
          project_id: `eq.${projectId}`
        }
      }),
      supabaseRequest(config, "activity_events", {
        query: {
          select: "*",
          project_id: `eq.${projectId}`,
          order: "created_at.desc",
          limit: 80
        }
      })
    ]);

    if (!project) {
      throw new HttpError(404, "project_not_found", "Project not found.");
    }

    const statusMap = buildStatusMap(statusRows);
    const sourceStores = (Array.isArray(storesResult) ? storesResult : [])
      .filter(store => store?.is_removed !== true);
    const stores = sourceStores.map(store => {
      const storeId = String(store?.store_id || "").trim();
      return sanitizeStore(store, statusMap.get(storeId) || { status_code: "active" }, statusMap.has(storeId));
    });

    const summary = buildSummary(sourceStores, statusMap);
    const geography = buildGeography(sourceStores);
    const activity = buildRecentActivity(statusRows, activityRows);
    const evidenceByStoreId = await buildEvidenceByStoreId(config, projectId, stores);

    await recordShareAccess(config, link);

    return json(res, 200, {
      ok: true,
      scope: "overview",
      generated_at: new Date().toISOString(),
      expires_at: link.expires_at,
      project: sanitizeProject(project),
      summary,
      geography,
      stores,
      activity,
      evidenceByStoreId
    });
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    return json(res, statusCode, {
      ok: false,
      error: publicErrorPayload(error)
    });
  }
};

module.exports._test = {
  normalizeStoragePath,
  isStoragePathScopedToStore
};
