/* ================= DATA LAYER ================= */

const dataLayer = {
  _projectBrandingColumnsAvailable: null,
  _devJsonFallbackFlagKey: "dt:enableDevJsonFallback",

  async getSession() {
    return await supabaseClient.auth.getSession();
  },

  onAuthStateChange(callback) {
    return supabaseClient.auth.onAuthStateChange(callback);
  },

  async signIn(email, password) {
    return await supabaseClient.auth.signInWithPassword({ email, password });
  },

  async signOut() {
    return await supabaseClient.auth.signOut();
  },

  async getProfileRole(userId) {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("role, email")
      .eq("user_id", userId)
      .single();

    return { data, error };
  },

  async loadProjectMembershipsForUser(userId) {
    return await supabaseClient
      .from("project_memberships")
      .select("project_id, user_id, role, created_at")
      .eq("user_id", userId);
  },

  async loadPendingProjectInvitesByEmail(email) {
    if (!email) return { data: [], error: null };

    let result = await supabaseClient
      .from("project_invites")
      .select("*")
      .eq("email", email)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    if (!result.error) return result;

    result = await supabaseClient
      .from("project_invites")
      .select("*")
      .eq("email", email)
      .order("created_at", { ascending: false });

    return result;
  },

  async acceptProjectInvite(projectId) {
    return await supabaseClient.rpc("accept_project_invite", {
      project_id: projectId
    });
  },

  async loadProjects() {
    if (!isSignedIn()) {
      return [];
    }

    let supabaseError = null;
    try {
      let result = await supabaseClient
        .from("projects")
        .select("project_id, name, created_at, is_archived, archived_at, brand_color, brand_logo_url")
        .order("created_at", { ascending: true });

      if (result?.error) {
        const brandingColumnsMissing = this.isMissingColumnError(result.error, "brand_color")
          || this.isMissingColumnError(result.error, "brand_logo_url");
        if (brandingColumnsMissing) {
          this._projectBrandingColumnsAvailable = false;
        }
        result = await supabaseClient
          .from("projects")
          .select("project_id, name, created_at, is_archived, archived_at")
          .order("created_at", { ascending: true });
      } else {
        this._projectBrandingColumnsAvailable = true;
      }

      const { data, error } = result;
      supabaseError = error || null;

      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map(project => ({
          project_id: project.project_id,
          name: project.name,
          created_at: project.created_at,
          is_archived: project.is_archived === true,
          archived_at: project.archived_at || null,
          brand_color: project.brand_color || "",
          brand_logo_url: project.brand_logo_url || "",
          store_file: `data/${project.project_id}/stores_with_coords.json`
        }));
      }
    } catch (error) {
      supabaseError = error;
      console.warn("Supabase project load failed:", error);
    }

    if (!this.shouldAttemptDevJsonFallback(supabaseError)) {
      return [];
    }

    try {
      const res = await fetch(PROJECTS_FILE, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load ${PROJECTS_FILE}`);
      const fileProjects = await res.json();

      if (Array.isArray(fileProjects) && fileProjects.length > 0) {
        return fileProjects.map(project => ({
          ...project,
          is_archived: project.is_archived === true,
          archived_at: project.archived_at || null,
          brand_color: project.brand_color || "",
          brand_logo_url: project.brand_logo_url || ""
        }));
      }
    } catch (error) {
      console.warn("Dev JSON project fallback failed:", error);
    }

    return [];
  },

  async updateProjectLifecycle(projectId, isArchived) {
    return await supabaseClient
      .from("projects")
      .update({
        is_archived: isArchived === true,
        archived_at: isArchived === true ? new Date().toISOString() : null
      })
      .eq("project_id", projectId);
  },

  async updateProjectBranding(projectId, brandColor, brandLogoUrl) {
    const result = await supabaseClient
      .from("projects")
      .update({
        brand_color: brandColor,
        brand_logo_url: brandLogoUrl
      })
      .eq("project_id", projectId);

    if (!result?.error) {
      this._projectBrandingColumnsAvailable = true;
      return {
        ...result,
        brandingUnavailable: false
      };
    }

    const brandingColumnsMissing = this.isMissingColumnError(result.error, "brand_color")
      || this.isMissingColumnError(result.error, "brand_logo_url");

    if (brandingColumnsMissing) {
      this._projectBrandingColumnsAvailable = false;
      return {
        data: result?.data ?? null,
        error: null,
        brandingUnavailable: true,
        brandingMessage: "Branding storage is not available yet for this environment. Other admin features continue to work.",
        rawError: result.error
      };
    }

    return {
      ...result,
      brandingUnavailable: false
    };
  },

  isProjectBrandingStorageAvailable() {
    return this._projectBrandingColumnsAvailable !== false;
  },

  async loadProjectMembers(projectId) {
    const membershipsResult = await supabaseClient
      .from("project_memberships")
      .select("project_id, user_id, role, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (membershipsResult.error || !Array.isArray(membershipsResult.data)) {
      return membershipsResult;
    }

    const userIds = [...new Set(
      membershipsResult.data
        .map(row => String(row.user_id || "").trim())
        .filter(Boolean)
    )];

    const emailByUserId = {};
    if (userIds.length > 0) {
      const profileResult = await supabaseClient
        .from("profiles")
        .select("user_id, email")
        .in("user_id", userIds);

      if (!profileResult.error && Array.isArray(profileResult.data)) {
        profileResult.data.forEach(row => {
          const userId = String(row.user_id || "").trim();
          if (!userId) return;
          emailByUserId[userId] = row.email || "";
        });
      }
    }

    return {
      data: membershipsResult.data.map(row => ({
        ...row,
        email: emailByUserId[String(row.user_id || "").trim()] || ""
      })),
      error: null
    };
  },

  async updateProjectMembershipRole(projectId, userId, role) {
    return await supabaseClient
      .from("project_memberships")
      .update({ role })
      .eq("project_id", projectId)
      .eq("user_id", userId);
  },

  async removeProjectMembership(projectId, userId) {
    return await supabaseClient
      .from("project_memberships")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId);
  },

  async loadProjectInvites(projectId) {
    let result = await supabaseClient
      .from("project_invites")
      .select("*")
      .eq("project_id", projectId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    if (!result.error) return result;

    result = await supabaseClient
      .from("project_invites")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    return result;
  },

  async createProjectInvite(projectId, email, role, invitedBy) {
    const payload = {
      project_id: projectId,
      email,
      role,
      invited_by: invitedBy || null
    };

    return await supabaseClient
      .from("project_invites")
      .upsert(payload, { onConflict: "project_id,email" });
  },

  async revokeProjectInvite(inviteId) {
    const updateResult = await supabaseClient
      .from("project_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", inviteId);

    if (!updateResult.error) return updateResult;

    return await supabaseClient
      .from("project_invites")
      .delete()
      .eq("id", inviteId);
  },

  async loadStoresForProject(projectId, projectMeta) {
    if (!isSignedIn()) {
      if (projectMeta && typeof projectMeta === "object") {
        projectMeta.sourceLabel = "Sign in required";
      }
      return [];
    }

    const { data, error } = await supabaseClient
      .from("stores")
      .select("store_id, store_name, customer_id, lat, lng, full_address, region, territory, state, city, district, division, market, is_removed, removed_at")
      .eq("project_id", projectId);

    if (!error) {
      projectMeta.sourceLabel = "Supabase";
      return (Array.isArray(data) ? data : []).map(store => ({
        ...normalizeStoreRecord(store),
        is_removed: store.is_removed === true,
        removed_at: store.removed_at || null
      }));
    }

    if (this.isPermissionDeniedError(error)) {
      projectMeta.sourceLabel = "Access denied";
      return [];
    }

    if (!this.shouldAttemptDevJsonFallback(error)) {
      projectMeta.sourceLabel = "Supabase unavailable";
      return [];
    }

    const fallbackPaths = [
      projectMeta?.store_file,
      `data/${projectId}/stores_with_coords.json`,
      "stores_with_coords.json"
    ].filter(Boolean);

    for (const path of fallbackPaths) {
      try {
        const res = await fetch(path, { cache: "no-store" });
        if (!res.ok) continue;
        const json = await res.json();
        if (Array.isArray(json) && json.length > 0) {
          projectMeta.sourceLabel = "JSON fallback (dev)";
          return json.map(store => ({
            ...normalizeStoreRecord(store),
            is_removed: store.is_removed === true,
            removed_at: store.removed_at || null
          }));
        }
      } catch (err) {
        console.warn("Store file fallback failed:", path, err);
      }
    }

    projectMeta.sourceLabel = "No stores found";
    return [];
  },

  async updateStoreLifecycle(projectId, storeId, isRemoved) {
    return await supabaseClient
      .from("stores")
      .update({
        is_removed: isRemoved === true,
        removed_at: isRemoved === true ? new Date().toISOString() : null
      })
      .eq("project_id", projectId)
      .eq("store_id", storeId);
  },

  async loadStoreStatus(projectId) {
    return await supabaseClient
      .from("store_status")
      .select("*")
      .eq("project_id", projectId);
  },

  async loadStoreNotes(projectId, limit = 50) {
    return await supabaseClient
      .from("store_notes")
      .select("store_id, note, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(limit);
  },

  async loadNotesForStore(projectId, storeId) {
    return await supabaseClient
      .from("store_notes")
      .select("*")
      .eq("project_id", projectId)
      .eq("store_id", storeId)
      .order("created_at", { ascending: false });
  },

  async insertNote(projectId, storeId, note) {
    return await supabaseClient
      .from("store_notes")
      .insert({
        project_id: projectId,
        store_id: storeId,
        note
      });
  },

  async loadStorePhotos(projectId) {
    return await supabaseClient
      .from("store_photos")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
  },

  async loadPhotosForStore(projectId, storeId) {
    return await supabaseClient
      .from("store_photos")
      .select("*")
      .eq("project_id", projectId)
      .eq("store_id", storeId)
      .order("created_at", { ascending: false });
  },

  async insertPhotoRow(projectId, storeId, imageUrl, storagePath) {
    return await supabaseClient
      .from("store_photos")
      .insert({
        project_id: projectId,
        store_id: storeId,
        image_url: imageUrl,
        storage_path: storagePath
      });
  },

  deriveLegacyStatusCode(completed, closed) {
    if (closed === true) return "closed";
    if (completed === true) return "completed";
    return "active";
  },

  normalizeStatusWritePayload(projectId, storeId, completed, closed, statusCode, statusReason) {
    const normalizedStatusCode = typeof statusCode === "string" && statusCode.trim()
      ? statusCode.trim()
      : this.deriveLegacyStatusCode(completed, closed);

    return {
      project_id: projectId,
      store_id: storeId,
      status_code: normalizedStatusCode,
      status_reason: typeof statusReason === "string" && statusReason.trim()
        ? statusReason.trim()
        : null,
      completed,
      closed
    };
  },

  isMissingColumnError(error, columnName) {
    const haystack = [
      error?.message,
      error?.details,
      error?.hint,
      error?.code
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!haystack) return false;

    const normalizedColumn = String(columnName || "").toLowerCase();
    return haystack.includes(normalizedColumn) && (
      haystack.includes("column") ||
      haystack.includes("schema cache") ||
      haystack.includes("could not find") ||
      haystack.includes("does not exist")
    );
  },

  async writeStoreStatusScoped(payload) {
    const scopedProjectId = String(payload?.project_id || "").trim();
    const scopedStoreId = String(payload?.store_id || "").trim();

    if (!scopedProjectId || !scopedStoreId) {
      return { data: null, error: new Error("Missing project_id or store_id for scoped status write.") };
    }

    const updatePayload = { ...payload };
    delete updatePayload.project_id;
    delete updatePayload.store_id;

    const updateResult = await supabaseClient
      .from("store_status")
      .update(updatePayload)
      .eq("project_id", scopedProjectId)
      .eq("store_id", scopedStoreId)
      .select("project_id,store_id")
      .limit(1);

    if (updateResult.error) return updateResult;
    if (Array.isArray(updateResult.data) && updateResult.data.length > 0) return updateResult;

    return await supabaseClient
      .from("store_status")
      .insert(payload)
      .select("project_id,store_id")
      .limit(1);
  },

  async updateStoreStatus(projectId, storeId, completed, closed, statusCode = null, statusReason = null) {
    const fullPayload = this.normalizeStatusWritePayload(
      projectId,
      storeId,
      completed,
      closed,
      statusCode,
      statusReason
    );

    const fullResult = await this.writeStoreStatusScoped(fullPayload);

    if (!fullResult.error) {
      return fullResult;
    }

    const missingStatusReason = this.isMissingColumnError(fullResult.error, "status_reason");
    const missingStatusCode = this.isMissingColumnError(fullResult.error, "status_code");

    if (missingStatusReason && !missingStatusCode) {
      return await this.writeStoreStatusScoped({
        project_id: fullPayload.project_id,
        store_id: fullPayload.store_id,
        status_code: fullPayload.status_code,
        completed: fullPayload.completed,
        closed: fullPayload.closed
      });
    }

    if (missingStatusCode) {
      return await this.writeStoreStatusScoped({
        project_id: fullPayload.project_id,
        store_id: fullPayload.store_id,
        completed: fullPayload.completed,
        closed: fullPayload.closed
      });
    }

    return fullResult;
  },

  async loadActivityEvents(projectId, limit = 200) {
    return await supabaseClient
      .from("activity_events")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(limit);
  },

  async createActivityEvent(event = {}) {
    const normalizedType = String(event?.type || "").trim();
    const normalizedProjectId = String(event?.project_id || "").trim();
    if (!normalizedType || !normalizedProjectId) {
      return { data: null, error: new Error("Missing activity event type or project_id.") };
    }

    const normalizedCreatedAt = String(event?.created_at || "").trim() || new Date().toISOString();
    const normalizedStoreId = event?.store_id === null || event?.store_id === undefined || event?.store_id === ""
      ? null
      : String(event.store_id).trim();
    const normalizedMetadata = event?.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
      ? event.metadata
      : {};

    const baseInsert = {
      event_type: normalizedType,
      project_id: normalizedProjectId,
      store_id: normalizedStoreId,
      payload: normalizedMetadata,
      created_at: normalizedCreatedAt
    };

    let result = await supabaseClient
      .from("activity_events")
      .insert(baseInsert)
      .select("*")
      .limit(1);

    if (!result.error) return result;

    if (this.isMissingColumnError(result.error, "created_at")) {
      const withoutCreatedAt = { ...baseInsert };
      delete withoutCreatedAt.created_at;
      result = await supabaseClient
        .from("activity_events")
        .insert(withoutCreatedAt)
        .select("*")
        .limit(1);
      if (!result.error) return result;
    }

    if (this.isMissingColumnError(result.error, "payload")) {
      const metadataInsert = {
        event_type: normalizedType,
        project_id: normalizedProjectId,
        store_id: normalizedStoreId,
        metadata: normalizedMetadata,
        created_at: normalizedCreatedAt
      };

      result = await supabaseClient
        .from("activity_events")
        .insert(metadataInsert)
        .select("*")
        .limit(1);

      if (!result.error) return result;
    }

    return result;
  },

  async resolvePhotoBucketName() {
    if (resolvedPhotoBucket) return resolvedPhotoBucket;

    for (const bucketName of PHOTO_BUCKET_CANDIDATES) {
      try {
        const { error } = await supabaseClient.storage.from(bucketName).list("", { limit: 1 });
        if (!error) {
          resolvedPhotoBucket = bucketName;
          return resolvedPhotoBucket;
        }
      } catch (error) {
        console.warn("Bucket probe failed:", bucketName, error);
      }
    }

    resolvedPhotoBucket = PHOTO_BUCKET_CANDIDATES[0];
    return resolvedPhotoBucket;
  },

  async uploadPhotoFile(bucketName, path, file) {
    return await supabaseClient.storage
      .from(bucketName)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false
      });
  },

  getPublicPhotoUrl(bucketName, path) {
    const { data } = supabaseClient.storage.from(bucketName).getPublicUrl(path);
    return data?.publicUrl || "";
  },

  isPermissionDeniedError(error) {
    if (!error) return false;

    const status = Number(error?.status || error?.statusCode || 0);
    if (status === 401 || status === 403) return true;

    const code = String(error?.code || "").toLowerCase();
    if (code === "42501" || code === "pgrst301") return true;

    const haystack = [
      error?.message,
      error?.details,
      error?.hint
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!haystack) return false;
    return (
      haystack.includes("permission denied") ||
      haystack.includes("row-level security") ||
      haystack.includes("not authorized") ||
      haystack.includes("access denied")
    );
  },

  isLocalDevRuntime() {
    try {
      const locationRef = window?.location;
      const protocol = String(locationRef?.protocol || "").toLowerCase();
      const host = String(locationRef?.hostname || "").toLowerCase();

      if (protocol === "file:") return true;
      if (!host) return false;
      return host === "localhost" || host === "127.0.0.1" || host === "::1";
    } catch (_) {
      return false;
    }
  },

  isDevJsonFallbackEnabled() {
    if (!this.isLocalDevRuntime()) return false;

    const explicitWindowFlag = window?.__DT_ENABLE_DEV_JSON_FALLBACK__ === true;
    let explicitStorageFlag = false;

    try {
      explicitStorageFlag = window?.localStorage?.getItem(this._devJsonFallbackFlagKey) === "true";
    } catch (_) {
      explicitStorageFlag = false;
    }

    return explicitWindowFlag || explicitStorageFlag;
  },

  shouldAttemptDevJsonFallback(error = null) {
    if (!isSignedIn()) return false;
    if (!this.isDevJsonFallbackEnabled()) return false;
    if (error && this.isPermissionDeniedError(error)) return false;
    return true;
  },

  async createSignedPhotoUrl(bucketName, path, expiresInSeconds = 3600) {
    const normalizedBucketName = String(bucketName || "").trim();
    const normalizedPath = String(path || "").trim();
    if (!normalizedBucketName || !normalizedPath) return "";

    const { data, error } = await supabaseClient.storage
      .from(normalizedBucketName)
      .createSignedUrl(normalizedPath, expiresInSeconds);

    if (error) {
      console.warn("Signed photo URL generation failed:", normalizedPath, error);
      return "";
    }

    return String(data?.signedUrl || "");
  },

  async createSignedPhotoUrlMap(bucketName, storagePaths, expiresInSeconds = 3600) {
    const normalizedBucketName = String(bucketName || "").trim();
    const uniquePaths = [...new Set(
      (Array.isArray(storagePaths) ? storagePaths : [])
        .map(path => String(path || "").trim())
        .filter(Boolean)
    )];

    const signedUrlByPath = {};
    if (!normalizedBucketName || uniquePaths.length === 0) return signedUrlByPath;

    const bucket = supabaseClient.storage.from(normalizedBucketName);
    if (typeof bucket.createSignedUrls === "function") {
      try {
        const { data, error } = await bucket.createSignedUrls(uniquePaths, expiresInSeconds);
        if (!error && Array.isArray(data)) {
          data.forEach(row => {
            const path = String(row?.path || row?.key || "").trim();
            const signedUrl = String(row?.signedUrl || row?.signed_url || "").trim();
            if (path && signedUrl) {
              signedUrlByPath[path] = signedUrl;
            }
          });
        }
      } catch (error) {
        console.warn("Batch signed photo URL generation failed:", error);
      }
    }

    for (const path of uniquePaths) {
      if (signedUrlByPath[path]) continue;
      signedUrlByPath[path] = await this.createSignedPhotoUrl(normalizedBucketName, path, expiresInSeconds);
    }

    return signedUrlByPath;
  },

  resolvePhotoRowUrl(row, signedUrlByPath = {}) {
    const storagePath = String(row?.storage_path || "").trim();
    if (storagePath && signedUrlByPath[storagePath]) {
      return signedUrlByPath[storagePath];
    }

    const resolvedImageUrl = String(row?.resolved_image_url || "").trim();
    if (resolvedImageUrl) {
      return resolvedImageUrl;
    }

    const isSafeSignedUrl = (value) => {
      const url = String(value || "").trim();
      if (!url) return false;
      if (/^blob:/i.test(url)) return true;
      if (!/^https?:\/\//i.test(url)) return false;
      return (
        /[?&]token=/i.test(url)
        || /[?&]signature=/i.test(url)
        || /[?&]x-amz-signature=/i.test(url)
        || /[?&]x-amz-credential=/i.test(url)
        || /[?&]expires=/i.test(url)
        || /[?&]x-amz-expires=/i.test(url)
      );
    };

    const signedUrl = String(row?.signed_url || "").trim();
    if (isSafeSignedUrl(signedUrl)) {
      return signedUrl;
    }

    const explicitSafeUrl = String(row?.url || "").trim();
    if (isSafeSignedUrl(explicitSafeUrl)) {
      return explicitSafeUrl;
    }

    return "";
  },

  async resolvePhotoRenderRows(rows, expiresInSeconds = 3600) {
    const normalizedRows = Array.isArray(rows) ? rows : [];
    if (normalizedRows.length === 0) return [];

    const bucketName = await this.resolvePhotoBucketName();
    const storagePaths = normalizedRows
      .map(row => String(row?.storage_path || "").trim())
      .filter(Boolean);
    const signedUrlByPath = await this.createSignedPhotoUrlMap(bucketName, storagePaths, expiresInSeconds);

    return normalizedRows.map(row => ({
      ...row,
      resolved_image_url: this.resolvePhotoRowUrl(row, signedUrlByPath)
    }));
  },

  async hydrateProject(projectId, projectMeta) {
    const stores = await this.loadStoresForProject(projectId, projectMeta);

    const [statusResult, notesResult, photosResult, activityEventsResult] = await Promise.all([
      this.loadStoreStatus(projectId),
      this.loadStoreNotes(projectId),
      this.loadStorePhotos(projectId),
      this.loadActivityEvents(projectId)
    ]);

    const rawPhotoRows = Array.isArray(photosResult.data) ? photosResult.data : [];
    const resolvedPhotoRows = await this.resolvePhotoRenderRows(rawPhotoRows);

    return {
      stores,
      statusRows: Array.isArray(statusResult.data) ? statusResult.data : [],
      statusError: statusResult.error || null,
      noteRows: Array.isArray(notesResult.data) ? notesResult.data : [],
      noteError: notesResult.error || null,
      photoRows: resolvedPhotoRows,
      photoError: photosResult.error || null,
      activityEventRows: Array.isArray(activityEventsResult.data) ? activityEventsResult.data : [],
      activityEventError: activityEventsResult.error || null
    };
  }
};
