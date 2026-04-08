/* ================= DATA LAYER ================= */

const dataLayer = {
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
    try {
      const { data, error } = await supabaseClient
        .from("projects")
        .select("project_id, name, created_at, is_archived, archived_at")
        .order("created_at", { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map(project => ({
          project_id: project.project_id,
          name: project.name,
          created_at: project.created_at,
          is_archived: project.is_archived === true,
          archived_at: project.archived_at || null,
          store_file: `data/${project.project_id}/stores_with_coords.json`
        }));
      }
    } catch (error) {
      console.warn("Supabase project load failed:", error);
    }

    try {
      const res = await fetch(PROJECTS_FILE, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load ${PROJECTS_FILE}`);
      const fileProjects = await res.json();

      if (Array.isArray(fileProjects) && fileProjects.length > 0) {
        return fileProjects.map(project => ({
          ...project,
          is_archived: project.is_archived === true,
          archived_at: project.archived_at || null
        }));
      }
    } catch (error) {
      console.warn("Using default project list fallback:", error);
    }

    return [{
      project_id: DEFAULT_PROJECT_ID,
      name: "Central FL Dollar Tree",
      is_archived: false,
      archived_at: null,
      store_file: "data/central-fl-dollar-tree/stores_with_coords.json"
    }];
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
    const { data, error } = await supabaseClient
      .from("stores")
      .select("store_id, store_name, customer_id, lat, lng, full_address, region, territory, state, city, district, division, market, is_removed, removed_at")
      .eq("project_id", projectId);

    if (!error && Array.isArray(data) && data.length > 0) {
      projectMeta.sourceLabel = "Supabase";
      return data.map(store => ({
        ...normalizeStoreRecord(store),
        is_removed: store.is_removed === true,
        removed_at: store.removed_at || null
      }));
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
          projectMeta.sourceLabel = "JSON fallback";
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

  async updateStoreStatus(projectId, storeId, completed, closed, statusCode = null, statusReason = null) {
    const fullPayload = this.normalizeStatusWritePayload(
      projectId,
      storeId,
      completed,
      closed,
      statusCode,
      statusReason
    );

    const fullResult = await supabaseClient
      .from("store_status")
      .upsert(fullPayload);

    if (!fullResult.error) {
      return fullResult;
    }

    const missingStatusReason = this.isMissingColumnError(fullResult.error, "status_reason");
    const missingStatusCode = this.isMissingColumnError(fullResult.error, "status_code");

    if (missingStatusReason && !missingStatusCode) {
      return await supabaseClient
        .from("store_status")
        .upsert({
          project_id: fullPayload.project_id,
          store_id: fullPayload.store_id,
          status_code: fullPayload.status_code,
          completed: fullPayload.completed,
          closed: fullPayload.closed
        });
    }

    if (missingStatusCode) {
      return await supabaseClient
        .from("store_status")
        .upsert({
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

  async hydrateProject(projectId, projectMeta) {
    const stores = await this.loadStoresForProject(projectId, projectMeta);

    const [statusResult, notesResult, photosResult, activityEventsResult] = await Promise.all([
      this.loadStoreStatus(projectId),
      this.loadStoreNotes(projectId),
      this.loadStorePhotos(projectId),
      this.loadActivityEvents(projectId)
    ]);

    return {
      stores,
      statusRows: Array.isArray(statusResult.data) ? statusResult.data : [],
      statusError: statusResult.error || null,
      noteRows: Array.isArray(notesResult.data) ? notesResult.data : [],
      noteError: notesResult.error || null,
      photoRows: Array.isArray(photosResult.data) ? photosResult.data : [],
      photoError: photosResult.error || null,
      activityEventRows: Array.isArray(activityEventsResult.data) ? activityEventsResult.data : [],
      activityEventError: activityEventsResult.error || null
    };
  }
};
