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

  async loadProjects() {
    try {
      const { data, error } = await supabaseClient
        .from("projects")
        .select("project_id, name, created_at")
        .order("created_at", { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map(project => ({
          project_id: project.project_id,
          name: project.name,
          created_at: project.created_at,
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
        return fileProjects;
      }
    } catch (error) {
      console.warn("Using default project list fallback:", error);
    }

    return [{
      project_id: DEFAULT_PROJECT_ID,
      name: "Central FL Dollar Tree",
      store_file: "data/central-fl-dollar-tree/stores_with_coords.json"
    }];
  },

  async loadStoresForProject(projectId, projectMeta) {
    const { data, error } = await supabaseClient
      .from("stores")
      .select("store_id, store_name, customer_id, lat, lng, full_address, region, territory, state, city, district, division, market")
      .eq("project_id", projectId);

    if (!error && Array.isArray(data) && data.length > 0) {
      projectMeta.sourceLabel = "Supabase";
      return data.map(normalizeStoreRecord);
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
          return json.map(normalizeStoreRecord);
        }
      } catch (err) {
        console.warn("Store file fallback failed:", path, err);
      }
    }

    projectMeta.sourceLabel = "No stores found";
    return [];
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

  async updateStoreStatus(projectId, storeId, completed, closed) {
    return await supabaseClient
      .from("store_status")
      .upsert({
        project_id: projectId,
        store_id: storeId,
        completed,
        closed
      });
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
