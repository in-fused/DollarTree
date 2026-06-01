(function importApplyModule(globalScope) {
  "use strict";

  const IMPORT_TARGET_MODES = Object.freeze({
    CREATE_NEW_PROJECT: "create_new_project",
    MERGE_CURRENT_PROJECT: "merge_current_project"
  });
  const APPLY_MODE = IMPORT_TARGET_MODES.MERGE_CURRENT_PROJECT;
  const LOCAL_GEOCODE_CACHE_KEY = "project_import_geocode_cache";
  const GEOCODE_COUNTRY = "US";
  const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const DEFAULT_LARGE_MERGE_ROW_THRESHOLD = 100;
  const STORE_POSTAL_COLUMNS = ["postal_code", "zip"];
  const TEXT_STORE_FIELDS = [
    "store_name",
    "customer_id",
    "full_address",
    "city",
    "state",
    "region",
    "territory",
    "district",
    "division",
    "market"
  ];
  const COORDINATE_STORE_FIELDS = ["lat", "lng"];
  const CHUNK_SIZE = 500;
  const SUPABASE_OPERATION_TIMEOUT_MS = 20000;
  const GEOCODE_FETCH_TIMEOUT_MS = 15000;
  const LATITUDE_MIN = -90;
  const LATITUDE_MAX = 90;
  const LONGITUDE_MIN = -180;
  const LONGITUDE_MAX = 180;

  let cachedPostalColumn;

  function getSupabaseClient() {
    if (typeof supabaseClient !== "undefined") return supabaseClient;
    if (globalScope && globalScope.supabaseClient) return globalScope.supabaseClient;
    throw new Error("Supabase client is unavailable.");
  }

  function createTimeoutError(label, timeoutMs) {
    const seconds = Math.ceil((Number(timeoutMs) || 0) / 1000);
    const error = new Error(`${label || "Import operation"} timed out after ${seconds} seconds.`);
    error.name = "ImportOperationTimeout";
    error.code = "IMPORT_OPERATION_TIMEOUT";
    error.isImportTimeout = true;
    return error;
  }

  function isTimeoutError(error) {
    return Boolean(
      error &&
      (
        error.isImportTimeout === true ||
        error.code === "IMPORT_OPERATION_TIMEOUT" ||
        error.name === "ImportOperationTimeout"
      )
    );
  }

  function abortSafely(controller) {
    if (!controller) return;
    try {
      controller.abort();
    } catch (error) {
      // Abort is best-effort; the timeout rejection still releases the UI.
    }
  }

  function withTimeout(operation, label, timeoutMs, onTimeout) {
    const effectiveTimeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : SUPABASE_OPERATION_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;

        const timeoutError = createTimeoutError(label, effectiveTimeout);
        if (typeof onTimeout === "function") {
          try {
            onTimeout(timeoutError);
          } catch (error) {
            console.warn("Import timeout cleanup failed:", error);
          }
        }

        reject(timeoutError);
      }, effectiveTimeout);

      Promise.resolve()
        .then(() => (typeof operation === "function" ? operation() : operation))
        .then(
          (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
          },
          (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
          }
        );
    });
  }

  function withSupabaseTimeout(operation, label, timeoutMs) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;

    return withTimeout(
      () => {
        const request = typeof operation === "function"
          ? operation(controller ? controller.signal : null)
          : operation;

        if (controller && request && typeof request.abortSignal === "function") {
          return request.abortSignal(controller.signal);
        }

        return request;
      },
      label || "Supabase operation",
      timeoutMs || SUPABASE_OPERATION_TIMEOUT_MS,
      () => abortSafely(controller)
    );
  }

  async function fetchWithTimeout(url, options, label, timeoutMs) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const fetchOptions = { ...(options || {}) };
    const operationLabel = label || "Fetch operation";
    const effectiveTimeout = timeoutMs || GEOCODE_FETCH_TIMEOUT_MS;

    if (controller) {
      fetchOptions.signal = controller.signal;
    }

    try {
      return await withTimeout(
        () => fetch(url, fetchOptions),
        operationLabel,
        effectiveTimeout,
        () => abortSafely(controller)
      );
    } catch (error) {
      if (isTimeoutError(error)) {
        throw error;
      }
      if (error && error.name === "AbortError") {
        throw createTimeoutError(operationLabel, effectiveTimeout);
      }
      throw error;
    }
  }

  function isMissingColumnError(error, columnName) {
    if (typeof dataLayer !== "undefined" && dataLayer && typeof dataLayer.isMissingColumnError === "function") {
      return dataLayer.isMissingColumnError(error, columnName);
    }

    const haystack = [
      error && error.message,
      error && error.details,
      error && error.hint,
      error && error.code
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const normalizedColumn = String(columnName || "").toLowerCase();
    return Boolean(
      normalizedColumn &&
      haystack.includes(normalizedColumn) &&
      (
        haystack.includes("column") ||
        haystack.includes("schema cache") ||
        haystack.includes("could not find") ||
        haystack.includes("does not exist")
      )
    );
  }

  function isUniqueViolation(error) {
    const code = String((error && error.code) || "").trim();
    if (code === "23505") return true;

    const haystack = [
      error && error.message,
      error && error.details,
      error && error.hint
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes("duplicate key") || haystack.includes("unique constraint");
  }

  function normalizeNullLike(value) {
    if (value === undefined || value === null) return "";
    const normalized = String(value).trim();
    if (!normalized) return "";

    const nullLikes = new Set(["null", "n/a", "na", "none", "undefined", "nil", "-"]);
    return nullLikes.has(normalized.toLowerCase()) ? "" : normalized;
  }

  function toText(value) {
    return normalizeNullLike(value);
  }

  function normalizeProjectId(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isValidProjectId(value) {
    return PROJECT_ID_PATTERN.test(String(value || "").trim());
  }

  function getApplyMode(value) {
    return value === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT
      ? IMPORT_TARGET_MODES.CREATE_NEW_PROJECT
      : IMPORT_TARGET_MODES.MERGE_CURRENT_PROJECT;
  }

  function getKnownProjectIdSet(values) {
    return new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeProjectId(value))
        .filter(Boolean)
    );
  }

  function findDuplicateStoreIds(records) {
    const seen = new Set();
    const duplicates = new Set();

    (Array.isArray(records) ? records : []).forEach((record) => {
      const storeId = toText(record && record.store_id);
      if (!storeId) return;
      const key = storeId.toLowerCase();
      if (seen.has(key)) {
        duplicates.add(storeId);
      } else {
        seen.add(key);
      }
    });

    return Array.from(duplicates);
  }

  function getDataLayer() {
    if (typeof dataLayer !== "undefined" && dataLayer) return dataLayer;
    if (globalScope && globalScope.dataLayer) return globalScope.dataLayer;
    return null;
  }

  function toNumberOrNull(value) {
    const normalized = normalizeNullLike(value);
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function toCoordinateNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "string" && value.trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function isValidLatitude(value) {
    const parsed = toCoordinateNumber(value);
    return parsed !== null && parsed >= LATITUDE_MIN && parsed <= LATITUDE_MAX;
  }

  function isValidLongitude(value) {
    const parsed = toCoordinateNumber(value);
    return parsed !== null && parsed >= LONGITUDE_MIN && parsed <= LONGITUDE_MAX;
  }

  function isZeroCoordinatePair(lat, lng) {
    const parsedLat = toCoordinateNumber(lat);
    const parsedLng = toCoordinateNumber(lng);
    return parsedLat === 0 && parsedLng === 0;
  }

  function hasCoordinatePair(record) {
    const lat = record && record.lat;
    const lng = record && record.lng;
    return isValidLatitude(lat) && isValidLongitude(lng) && !isZeroCoordinatePair(lat, lng);
  }

  function clearInvalidCoordinates(record) {
    if (!record || hasCoordinatePair(record)) return record;
    record.lat = null;
    record.lng = null;
    return record;
  }

  function getUnknownFields(record) {
    const unknown = record && record.__meta && record.__meta.unknownFields;
    return unknown && typeof unknown === "object" && !Array.isArray(unknown) ? unknown : {};
  }

  function getMetaCanonicalValues(record) {
    const canonical = record && record.__meta && record.__meta.canonicalValues;
    return canonical && typeof canonical === "object" && !Array.isArray(canonical) ? canonical : {};
  }

  function readFirst(record, keys) {
    const source = record && typeof record === "object" ? record : {};
    const metaCanonical = getMetaCanonicalValues(record);
    const unknown = getUnknownFields(record);
    const normalizedKeys = Array.isArray(keys) ? keys : [keys];

    for (const key of normalizedKeys) {
      if (source[key] !== undefined && source[key] !== null && String(source[key]).trim() !== "") {
        return source[key];
      }
    }

    for (const key of normalizedKeys) {
      if (metaCanonical[key] !== undefined && metaCanonical[key] !== null && String(metaCanonical[key]).trim() !== "") {
        return metaCanonical[key];
      }
    }

    for (const key of normalizedKeys) {
      if (unknown[key] !== undefined && unknown[key] !== null && String(unknown[key]).trim() !== "") {
        return unknown[key];
      }
    }

    return "";
  }

  function appendMissingAddressParts(fullAddress, parts) {
    const address = toText(fullAddress);
    const values = (Array.isArray(parts) ? parts : []).map(toText).filter(Boolean);
    if (!values.length) return address;

    return values.reduce((current, value) => {
      if (!current) return value;
      if (current.toLowerCase().includes(value.toLowerCase())) return current;
      return `${current}, ${value}`;
    }, address);
  }

  function buildFullAddress(record) {
    const fullAddress = toText(readFirst(record, "full_address"));
    const addressLine1 = toText(readFirst(record, ["address_line_1", "address"]));
    const addressLine2 = toText(readFirst(record, ["address_line_2", "address_2"]));
    const city = toText(readFirst(record, "city"));
    const state = toText(readFirst(record, "state"));
    const postalCode = toText(readFirst(record, ["postal_code", "zip"]));

    if (fullAddress) return appendMissingAddressParts(fullAddress, [city, state, postalCode]);
    return [addressLine1, addressLine2, city, state, postalCode].filter(Boolean).join(", ");
  }

  function normalizeAcceptedRecord(record, index) {
    const normalized = {
      sourceRowIndex: Number.isInteger(record && record.source_row_index) ? record.source_row_index : index,
      store_id: toText(readFirst(record, "store_id")),
      store_name: toText(readFirst(record, "store_name")),
      customer_id: toText(readFirst(record, "customer_id")),
      full_address: buildFullAddress(record),
      city: toText(readFirst(record, "city")),
      state: toText(readFirst(record, "state")),
      postal_code: toText(readFirst(record, ["postal_code", "zip"])),
      region: toText(readFirst(record, "region")),
      territory: toText(readFirst(record, "territory")),
      district: toText(readFirst(record, "district")),
      division: toText(readFirst(record, "division")),
      market: toText(readFirst(record, "market")),
      lat: toNumberOrNull(readFirst(record, ["lat", "latitude"])),
      lng: toNumberOrNull(readFirst(record, ["lng", "longitude"]))
    };

    return clearInvalidCoordinates(normalized);
  }

  function normalizeAddressKey(address) {
    return String(address || "")
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getLocalGeocodeCache() {
    try {
      const parsed = JSON.parse(globalScope.localStorage.getItem(LOCAL_GEOCODE_CACHE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function setLocalGeocodeCache(cache) {
    try {
      globalScope.localStorage.setItem(LOCAL_GEOCODE_CACHE_KEY, JSON.stringify(cache || {}));
      return true;
    } catch (error) {
      console.warn("Geocode cache persistence skipped:", error);
      return false;
    }
  }

  async function getSupabaseGeocode(addressKey) {
    if (!addressKey) return null;

    const client = getSupabaseClient();
    let response;

    try {
      response = await withSupabaseTimeout(
        () => client
          .from("geocode_cache")
          .select("lat,lng,full_address,updated_at")
          .eq("address_key", addressKey)
          .maybeSingle(),
        "Supabase geocode cache lookup"
      );
    } catch (error) {
      console.warn("Supabase geocode lookup failed:", error);
      return null;
    }

    const { data, error } = response || {};

    if (error) {
      console.warn("Supabase geocode lookup failed:", error);
      return null;
    }

    if (!data) return null;
    if (!hasCoordinatePair(data)) return null;

    return {
      lat: Number(data.lat),
      lng: Number(data.lng),
      full_address: data.full_address || null,
      updated_at: data.updated_at || null
    };
  }

  async function setSupabaseGeocode(addressKey, lat, lng, fullAddress) {
    if (!addressKey || !hasCoordinatePair({ lat, lng })) return false;

    const client = getSupabaseClient();
    let response;

    try {
      response = await withSupabaseTimeout(
        () => client
          .from("geocode_cache")
          .upsert({
            address_key: addressKey,
            lat: Number(lat),
            lng: Number(lng),
            full_address: fullAddress || null,
            updated_at: new Date().toISOString()
          }, { onConflict: "address_key" }),
        "Supabase geocode cache write"
      );
    } catch (error) {
      console.warn("Supabase geocode write failed:", error);
      return false;
    }

    const { error } = response || {};

    if (error) {
      console.warn("Supabase geocode write failed:", error);
      return false;
    }

    return true;
  }

  function getMapboxToken() {
    if (typeof mapboxgl !== "undefined" && mapboxgl && mapboxgl.accessToken) {
      return String(mapboxgl.accessToken || "").trim();
    }

    if (globalScope && globalScope.MAPBOX_TOKEN) {
      return String(globalScope.MAPBOX_TOKEN || "").trim();
    }

    return "";
  }

  async function geocodeAddress(fullAddress) {
    const token = getMapboxToken();
    if (!token) {
      throw new Error("Mapbox token is unavailable for geocoding.");
    }

    const url = "https://api.mapbox.com/search/geocode/v6/forward?" + new URLSearchParams({
      q: fullAddress,
      access_token: token,
      limit: "1",
      autocomplete: "false",
      country: GEOCODE_COUNTRY,
      permanent: "true"
    }).toString();

    const res = await fetchWithTimeout(url, null, `Mapbox geocode request for: ${fullAddress}`, GEOCODE_FETCH_TIMEOUT_MS);
    if (!res.ok) {
      throw new Error(`Geocode failed (${res.status}) for: ${fullAddress}`);
    }

    const json = await withTimeout(
      () => res.json(),
      `Mapbox geocode response parsing for: ${fullAddress}`,
      GEOCODE_FETCH_TIMEOUT_MS
    );
    const coords = json && json.features && json.features[0] && json.features[0].geometry
      ? json.features[0].geometry.coordinates
      : null;

    if (!coords || coords.length < 2) {
      throw new Error(`No geocode result for: ${fullAddress}`);
    }

    const lng = Number(coords[0]);
    const lat = Number(coords[1]);

    if (!hasCoordinatePair({ lat, lng })) {
      throw new Error(`Invalid geocode result for: ${fullAddress}`);
    }

    return { lat, lng };
  }

  function createGeocodeFailureError(record, message) {
    const rowNumber = Number.isInteger(record && record.sourceRowIndex)
      ? record.sourceRowIndex + 2
      : null;
    const storeId = toText(record && record.store_id) || "(missing)";
    const prefix = rowNumber ? `Row ${rowNumber}, store ${storeId}` : `Store ${storeId}`;
    const error = new Error(`${prefix}: ${message}`);
    error.code = "IMPORT_GEOCODE_FAILED";
    error.isGeocodeFailure = true;
    return error;
  }

  function isGeocodeFailure(error) {
    return Boolean(error && (error.isGeocodeFailure === true || error.code === "IMPORT_GEOCODE_FAILED"));
  }

  async function resolveCoordinates(record, cacheState) {
    if (hasCoordinatePair(record)) {
      cacheState.coordsProvided += 1;
      return record;
    }

    clearInvalidCoordinates(record);

    const fullAddress = toText(record.full_address);
    if (!fullAddress) {
      throw createGeocodeFailureError(
        record,
        "valid coordinates are missing or invalid, and no usable address is available for geocoding."
      );
    }

    const addressKey = normalizeAddressKey(fullAddress);
    const batchCachedValue = addressKey ? cacheState.batchCache[addressKey] : null;
    const persistentCachedValue = addressKey ? cacheState.persistentCache[addressKey] : null;

    if (batchCachedValue && hasCoordinatePair(batchCachedValue)) {
      record.lat = Number(batchCachedValue.lat);
      record.lng = Number(batchCachedValue.lng);
      cacheState.cacheHits += 1;
      return record;
    }

    if (persistentCachedValue && hasCoordinatePair(persistentCachedValue)) {
      record.lat = Number(persistentCachedValue.lat);
      record.lng = Number(persistentCachedValue.lng);
      if (addressKey) cacheState.batchCache[addressKey] = persistentCachedValue;
      cacheState.cacheHits += 1;
      return record;
    }

    const supabaseCachedValue = addressKey ? await getSupabaseGeocode(addressKey) : null;
    if (supabaseCachedValue) {
      const cachedValue = {
        lat: Number(supabaseCachedValue.lat),
        lng: Number(supabaseCachedValue.lng),
        full_address: supabaseCachedValue.full_address || fullAddress,
        updated_at: supabaseCachedValue.updated_at || new Date().toISOString()
      };

      record.lat = cachedValue.lat;
      record.lng = cachedValue.lng;
      if (addressKey) {
        cacheState.batchCache[addressKey] = cachedValue;
        cacheState.persistentCache[addressKey] = cachedValue;
      }
      cacheState.cacheHits += 1;
      return record;
    }

    let geo;
    try {
      geo = await geocodeAddress(fullAddress);
    } catch (error) {
      throw createGeocodeFailureError(
        record,
        `geocode failed for "${fullAddress}": ${error && error.message ? error.message : String(error)}`
      );
    }

    record.lat = geo.lat;
    record.lng = geo.lng;

    if (!hasCoordinatePair(record)) {
      clearInvalidCoordinates(record);
      throw createGeocodeFailureError(record, `geocode returned invalid coordinates for "${fullAddress}".`);
    }

    cacheState.geocoded += 1;

    if (addressKey) {
      const cachedValue = {
        lat: geo.lat,
        lng: geo.lng,
        full_address: fullAddress,
        updated_at: new Date().toISOString()
      };
      cacheState.batchCache[addressKey] = cachedValue;
      cacheState.persistentCache[addressKey] = cachedValue;
      await setSupabaseGeocode(addressKey, geo.lat, geo.lng, fullAddress);
    }

    return record;
  }

  async function detectPostalCodeColumn() {
    if (cachedPostalColumn !== undefined) return cachedPostalColumn;

    const client = getSupabaseClient();
    for (const column of STORE_POSTAL_COLUMNS) {
      const { error } = await withSupabaseTimeout(
        () => client
          .from("stores")
          .select(column)
          .limit(1),
        `Apply preflight postal column probe (${column})`
      );

      if (!error) {
        cachedPostalColumn = column;
        return cachedPostalColumn;
      }

      if (!isMissingColumnError(error, column)) {
        console.warn(`Postal column probe for ${column} was inconclusive:`, error);
      }
    }

    cachedPostalColumn = null;
    return cachedPostalColumn;
  }

  async function checkProjectExists(projectId) {
    const normalizedProjectId = normalizeProjectId(projectId);
    if (!normalizedProjectId) {
      return { exists: false, project: null };
    }

    const layer = getDataLayer();
    if (layer && typeof layer.projectExists === "function") {
      const result = await layer.projectExists(normalizedProjectId);
      if (result && result.error) throw result.error;
      return {
        exists: Boolean(result && result.data && result.data.exists),
        project: result && result.data ? result.data.project || null : null
      };
    }

    const client = getSupabaseClient();
    const result = await withSupabaseTimeout(
      () => client
        .from("projects")
        .select("project_id,name")
        .eq("project_id", normalizedProjectId)
        .limit(1),
      `Check project ${normalizedProjectId}`
    );

    if (result.error) throw result.error;
    const rows = Array.isArray(result.data) ? result.data : [];
    return {
      exists: rows.length > 0,
      project: rows[0] || null
    };
  }

  async function createProjectMetadata(projectId, projectName) {
    const normalizedProjectId = normalizeProjectId(projectId);
    const normalizedProjectName = toText(projectName) || normalizedProjectId;

    const layer = getDataLayer();
    if (layer && typeof layer.createProjectMetadata === "function") {
      const result = await layer.createProjectMetadata({
        projectId: normalizedProjectId,
        name: normalizedProjectName,
        createdBy: typeof currentUser !== "undefined" && currentUser ? currentUser.id : ""
      });

      if (result && result.error) throw result.error;
      return result && result.data ? result.data : {
        project_id: normalizedProjectId,
        name: normalizedProjectName
      };
    }

    const client = getSupabaseClient();
    let result = await withSupabaseTimeout(
      () => client
        .from("projects")
        .insert({
          project_id: normalizedProjectId,
          name: normalizedProjectName,
          is_archived: false,
          archived_at: null
        })
        .select("project_id,name,created_at,is_archived,archived_at")
        .limit(1),
      `Create project ${normalizedProjectId}`
    );

    if (result.error && (
      isMissingColumnError(result.error, "is_archived") ||
      isMissingColumnError(result.error, "archived_at")
    )) {
      const postInsertCheck = await checkProjectExists(normalizedProjectId);
      if (postInsertCheck.exists) {
        return postInsertCheck.project || {
          project_id: normalizedProjectId,
          name: normalizedProjectName
        };
      }

      result = await withSupabaseTimeout(
        () => client
          .from("projects")
          .insert({
            project_id: normalizedProjectId,
            name: normalizedProjectName
          })
          .select("project_id,name,created_at")
          .limit(1),
        `Create project ${normalizedProjectId}`
      );
    }

    if (result.error) throw result.error;
    const rows = Array.isArray(result.data) ? result.data : [];
    return rows[0] || {
      project_id: normalizedProjectId,
      name: normalizedProjectName
    };
  }

  function buildStorePayload(projectId, record, postalColumn) {
    if (!hasCoordinatePair(record)) {
      throw new Error(`Store ${record && record.store_id ? record.store_id : "(missing)"} has invalid coordinates and cannot be written.`);
    }

    const payload = {
      project_id: projectId,
      store_id: record.store_id
    };

    TEXT_STORE_FIELDS.forEach((field) => {
      const value = toText(record[field]);
      if (value) payload[field] = value;
    });

    COORDINATE_STORE_FIELDS.forEach((field) => {
      const value = Number(record[field]);
      if (Number.isFinite(value)) payload[field] = value;
    });

    if (postalColumn && record.postal_code) {
      payload[postalColumn] = record.postal_code;
    }

    return payload;
  }

  function buildUpdatePayload(payload) {
    const updatePayload = {};

    Object.keys(payload || {}).forEach((key) => {
      if (key === "project_id" || key === "store_id") return;
      const value = payload[key];
      if (value === undefined || value === null) return;
      if (typeof value === "string" && value.trim() === "") return;
      updatePayload[key] = value;
    });

    return updatePayload;
  }

  async function loadExistingIdSet(tableName, projectId, storeIds) {
    const client = getSupabaseClient();
    const ids = [...new Set((Array.isArray(storeIds) ? storeIds : []).map(toText).filter(Boolean))];
    const existing = new Set();

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const { data, error } = await withSupabaseTimeout(
        () => client
          .from(tableName)
          .select("store_id")
          .eq("project_id", projectId)
          .in("store_id", chunk),
        `Apply preflight existing ${tableName} lookup`
      );

      if (error) throw error;

      (Array.isArray(data) ? data : []).forEach((row) => {
        const storeId = toText(row && row.store_id);
        if (storeId) existing.add(storeId);
      });
    }

    return existing;
  }

  async function updateExistingStore(projectId, payload, postalColumn) {
    const client = getSupabaseClient();
    const updatePayload = buildUpdatePayload(payload);

    if (!Object.keys(updatePayload).length) {
      return { action: "skipped", postalColumnDropped: false };
    }

    let updateResult = await withSupabaseTimeout(
      () => client
        .from("stores")
        .update(updatePayload)
        .eq("project_id", projectId)
        .eq("store_id", payload.store_id),
      `Update store ${payload.store_id}`
    );

    if (updateResult.error && postalColumn && isMissingColumnError(updateResult.error, postalColumn)) {
      const retryPayload = { ...updatePayload };
      delete retryPayload[postalColumn];

      if (!Object.keys(retryPayload).length) {
        cachedPostalColumn = null;
        return {
          action: "skipped",
          postalColumnDropped: true
        };
      }

      updateResult = await withSupabaseTimeout(
        () => client
          .from("stores")
          .update(retryPayload)
          .eq("project_id", projectId)
          .eq("store_id", payload.store_id),
        `Update store ${payload.store_id} without ${postalColumn}`
      );

      if (!updateResult.error) {
        cachedPostalColumn = null;
        return {
          action: "updated",
          postalColumnDropped: true
        };
      }
    }

    if (updateResult.error) throw updateResult.error;

    return {
      action: "updated",
      postalColumnDropped: false
    };
  }

  async function insertNewStore(payload, postalColumn) {
    const client = getSupabaseClient();
    let insertResult = await withSupabaseTimeout(
      () => client
        .from("stores")
        .insert(payload),
      `Insert store ${payload.store_id}`
    );

    if (insertResult.error && postalColumn && isMissingColumnError(insertResult.error, postalColumn)) {
      const retryPayload = { ...payload };
      delete retryPayload[postalColumn];
      insertResult = await withSupabaseTimeout(
        () => client
          .from("stores")
          .insert(retryPayload),
        `Insert store ${payload.store_id} without ${postalColumn}`
      );

      if (!insertResult.error) {
        cachedPostalColumn = null;
        return { inserted: true, postalColumnDropped: true };
      }
    }

    if (insertResult.error) throw insertResult.error;
    return { inserted: true, postalColumnDropped: false };
  }

  async function insertDefaultStatus(projectId, storeId) {
    const client = getSupabaseClient();
    const fullPayload = {
      project_id: projectId,
      store_id: storeId,
      completed: false,
      closed: false,
      status_code: "active",
      status_reason: null
    };

    let result = await withSupabaseTimeout(
      () => client
        .from("store_status")
        .insert(fullPayload),
      `Seed default status for store ${storeId}`
    );

    if (!result.error) return { seeded: true };
    if (isUniqueViolation(result.error)) return { seeded: false, alreadyExists: true };

    if (isMissingColumnError(result.error, "status_reason")) {
      const withoutReason = { ...fullPayload };
      delete withoutReason.status_reason;
      result = await withSupabaseTimeout(
        () => client
          .from("store_status")
          .insert(withoutReason),
        `Seed default status for store ${storeId} without status_reason`
      );

      if (!result.error) return { seeded: true };
      if (isUniqueViolation(result.error)) return { seeded: false, alreadyExists: true };
    }

    if (isMissingColumnError(result.error, "status_code")) {
      result = await withSupabaseTimeout(
        () => client
          .from("store_status")
          .insert({
            project_id: projectId,
            store_id: storeId,
            completed: false,
            closed: false
          }),
        `Seed default status for store ${storeId} with minimal payload`
      );

      if (!result.error) return { seeded: true };
      if (isUniqueViolation(result.error)) return { seeded: false, alreadyExists: true };
    }

    throw result.error;
  }

  function buildInitialResult(projectId, projectName, mode) {
    return {
      mode: getApplyMode(mode),
      projectId,
      projectName: projectName || projectId,
      projectCreated: false,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      warningCount: 0,
      geocodedCount: 0,
      geocodeFailureCount: 0,
      cacheHitCount: 0,
      coordsProvidedCount: 0,
      statusSeededCount: 0,
      warnings: [],
      errors: [],
      appliedAt: new Date().toISOString(),
      success: false
    };
  }

  function appendWarning(result, message) {
    const normalized = toText(message);
    if (!normalized) return;
    result.warnings.push(normalized);
    result.warningCount = result.warnings.length;
  }

  function appendError(result, message) {
    const normalized = toText(message);
    if (!normalized) return;
    result.errors.push(normalized);
    result.errorCount = result.errors.length;
  }

  async function applyImport(input) {
    const payload = input && typeof input === "object" ? input : {};
    const stageResult = payload.stageResult && typeof payload.stageResult === "object" ? payload.stageResult : {};
    const summary = stageResult.summary && typeof stageResult.summary === "object" ? stageResult.summary : {};
    const acceptedRecords = Array.isArray(payload.acceptedRecords)
      ? payload.acceptedRecords
      : (Array.isArray(stageResult.acceptedRecords) ? stageResult.acceptedRecords : []);
    const mode = getApplyMode(payload.targetMode || payload.mode);
    const projectId = mode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT
      ? normalizeProjectId(payload.newProjectId || payload.projectId)
      : toText(payload.currentProjectId || payload.projectId);
    const projectName = mode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT
      ? toText(payload.newProjectName || payload.projectName)
      : toText(payload.currentProjectName || payload.projectName || projectId);
    const result = buildInitialResult(projectId, projectName, mode);

    if (!projectId) {
      throw new Error(mode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT
        ? "Apply blocked: new project_id is required."
        : "Apply blocked: no current project is selected.");
    }

    if (mode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT) {
      if (payload.canCreateProject !== true) {
        throw new Error("Apply blocked: global admin or owner access is required to create projects.");
      }
      if (!projectName) {
        throw new Error("Apply blocked: new project name is required.");
      }
      if (!isValidProjectId(projectId)) {
        throw new Error("Apply blocked: project_id must use lowercase letters, numbers, and single hyphens only.");
      }
      const knownProjectIds = getKnownProjectIdSet(payload.knownProjectIds);
      if (knownProjectIds.has(projectId)) {
        throw new Error(`Apply blocked: project_id "${projectId}" already exists.`);
      }
    } else {
      if (payload.canManage !== true) {
        throw new Error("Apply blocked: project admin access is required.");
      }

      const largeMergeThreshold = Number(payload.largeMergeRowThreshold) > 0
        ? Number(payload.largeMergeRowThreshold)
        : DEFAULT_LARGE_MERGE_ROW_THRESHOLD;
      if (acceptedRecords.length >= largeMergeThreshold && toText(payload.mergeConfirmation) !== projectId) {
        throw new Error(`Apply blocked: type current project_id "${projectId}" to confirm this merge.`);
      }
    }

    if (stageResult.canProceed !== true || stageResult.isValid !== true) {
      throw new Error("Apply blocked: dry-run validation did not pass.");
    }
    if ((Number(summary.rejectedRowCount) || 0) > 0) {
      throw new Error("Apply blocked: rejected rows must be resolved before writing.");
    }
    if (!acceptedRecords.length) {
      throw new Error("Apply blocked: no accepted rows are available.");
    }

    const normalizedRecords = acceptedRecords.map(normalizeAcceptedRecord);
    const storeIds = normalizedRecords.map((record) => record.store_id).filter(Boolean);
    const missingStoreIdCount = normalizedRecords.length - storeIds.length;

    if (missingStoreIdCount > 0) {
      result.skippedCount += missingStoreIdCount;
      appendError(result, `${missingStoreIdCount} accepted row(s) were skipped because store_id was missing.`);
    }

    if (!storeIds.length) {
      result.success = false;
      return result;
    }

    if (mode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT) {
      const duplicateStoreIds = findDuplicateStoreIds(normalizedRecords);
      if (duplicateStoreIds.length) {
        throw new Error(`Apply blocked: duplicate store_id value(s) in incoming CSV: ${duplicateStoreIds.slice(0, 8).join(", ")}.`);
      }

      const projectCheck = await checkProjectExists(projectId);
      if (projectCheck.exists) {
        throw new Error(`Apply blocked: project_id "${projectId}" already exists.`);
      }

      const existingTargetStoreIds = await loadExistingIdSet("stores", projectId, storeIds);
      if (existingTargetStoreIds.size > 0) {
        throw new Error(`Apply blocked: project_id "${projectId}" already has store rows. Choose a different project_id.`);
      }

      const createdProject = await createProjectMetadata(projectId, projectName);
      result.projectCreated = true;
      if (createdProject && createdProject.membershipWarning) {
        appendWarning(result, createdProject.membershipWarning);
      }
    }

    const postalColumn = await detectPostalCodeColumn();
    const hasPostalCodes = normalizedRecords.some((record) => !!record.postal_code);
    if (hasPostalCodes && !postalColumn) {
      appendWarning(result, "The stores table does not expose zip/postal_code; postal codes were retained in full_address only.");
    }

    const existingStoreIds = mode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT
      ? new Set()
      : await loadExistingIdSet("stores", projectId, storeIds);
    let existingStatusIds = new Set();
    let canSeedStatuses = true;

    try {
      existingStatusIds = await loadExistingIdSet("store_status", projectId, storeIds);
    } catch (error) {
      canSeedStatuses = false;
      appendWarning(result, `Default status seeding was skipped because existing statuses could not be checked: ${error.message || error}`);
    }

    const cacheState = {
      persistentCache: getLocalGeocodeCache(),
      batchCache: {},
      geocoded: 0,
      cacheHits: 0,
      coordsProvided: 0
    };

    for (const record of normalizedRecords) {
      if (!record.store_id) continue;

      try {
        await resolveCoordinates(record, cacheState);

        if (!hasCoordinatePair(record)) {
          throw new Error(`Store ${record.store_id}: coordinates are required before apply.`);
        }

        const storePayload = buildStorePayload(projectId, record, postalColumn);
        const existedBeforeApply = existingStoreIds.has(record.store_id);

        if (existedBeforeApply) {
          const updateResult = await updateExistingStore(projectId, storePayload, postalColumn);
          if (updateResult.postalColumnDropped) {
            appendWarning(result, `Postal column was unavailable while updating store ${record.store_id}; full_address still includes postal code when present.`);
          }

          if (updateResult.action === "updated") {
            result.updatedCount += 1;
          } else if (updateResult.action === "missing") {
            const insertResult = await insertNewStore(storePayload, postalColumn);
            if (insertResult.postalColumnDropped) {
              appendWarning(result, `Postal column was unavailable while inserting store ${record.store_id}; full_address still includes postal code when present.`);
            }
            result.insertedCount += 1;
          } else {
            result.skippedCount += 1;
            appendWarning(result, `Store ${record.store_id} had no safe fields to update.`);
          }
        } else {
          const insertResult = await insertNewStore(storePayload, postalColumn);
          if (insertResult.postalColumnDropped) {
            appendWarning(result, `Postal column was unavailable while inserting store ${record.store_id}; full_address still includes postal code when present.`);
          }

          result.insertedCount += 1;

          if (canSeedStatuses && !existingStatusIds.has(record.store_id)) {
            const statusResult = await insertDefaultStatus(projectId, record.store_id);
            if (statusResult.seeded) {
              result.statusSeededCount += 1;
              existingStatusIds.add(record.store_id);
            }
          }
        }
      } catch (error) {
        result.skippedCount += 1;
        if (isGeocodeFailure(error)) {
          result.geocodeFailureCount += 1;
        }
        appendError(result, error && error.message ? error.message : String(error));
      }
    }

    setLocalGeocodeCache(cacheState.persistentCache);

    result.geocodedCount = cacheState.geocoded;
    result.cacheHitCount = cacheState.cacheHits;
    result.coordsProvidedCount = cacheState.coordsProvided;
    result.warningCount = result.warnings.length;
    result.errorCount = result.errors.length;
    result.success = result.errorCount === 0 && (result.insertedCount + result.updatedCount) > 0;

    return result;
  }

  const importApply = Object.freeze({
    APPLY_MODE,
    IMPORT_TARGET_MODES,
    applyImport,
    buildFullAddress,
    normalizeAcceptedRecord
  });

  if (globalScope) {
    globalScope.ImportApply = importApply;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = importApply;
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
