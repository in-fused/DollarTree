/* ================= DATA LAYER ================= */

const dataLayer = {
  _projectBrandingColumnsAvailable: null,
  _devJsonFallbackFlagKey: "dt:enableDevJsonFallback",
  _storePostalColumnName: undefined,
  _storeMaintenanceTextFields: [
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
  ],
  _storePostalColumnCandidates: ["postal_code", "zip"],

  async getSession() {
    return await supabaseClient.auth.getSession();
  },

  onAuthStateChange(callback) {
    return supabaseClient.auth.onAuthStateChange(callback);
  },

  async signIn(email, password) {
    return await supabaseClient.auth.signInWithPassword({ email, password });
  },

  async signUp(email, password) {
    return await supabaseClient.auth.signUp({ email, password });
  },

  async signOut() {
    return await supabaseClient.auth.signOut();
  },

  async getProfileRole(userId) {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("role, email, display_name, phone")
      .eq("user_id", userId)
      .single();

    return { data, error };
  },

  async upsertMyProfile({ displayName = "", phone = "" } = {}) {
    const normalizedDisplayName = String(displayName || "").trim();
    const normalizedPhone = normalizePhoneForStorage(phone);
    return await supabaseClient.rpc("upsert_my_profile", {
      p_display_name: normalizedDisplayName || null,
      p_phone: normalizedPhone || null
    });
  },

  async loadProjectMembershipsForUser(userId) {
    return await supabaseClient
      .from("project_memberships")
      .select("project_id, user_id, role, created_at")
      .eq("user_id", userId);
  },

  normalizeProjectInviteStatus(row) {
    const status = String(row?.status || "").trim().toLowerCase();
    if (row?.accepted_at || row?.accepted_by_user_id || status === "accepted") return "accepted";
    if (
      row?.revoked_at ||
      status === "revoked" ||
      status === "canceled" ||
      status === "cancelled"
    ) {
      return "revoked";
    }
    return "pending";
  },

  isPendingProjectInviteRow(row) {
    return this.normalizeProjectInviteStatus(row) === "pending";
  },

  getProjectInviteTargetTypeFromRow(row = {}) {
    const explicitType = String(row?.invite_target_type || "").trim().toLowerCase();
    if (explicitType === "phone") return "phone";
    if (explicitType === "email") return "email";
    const phone = normalizePhoneForStorage(String(row?.target_phone || row?.phone || "").trim());
    return phone ? "phone" : "email";
  },

  getProjectInviteTargetValue(row = {}, targetType = "") {
    const normalizedTargetType = String(targetType || this.getProjectInviteTargetTypeFromRow(row)).trim().toLowerCase() === "phone"
      ? "phone"
      : "email";

    if (normalizedTargetType === "phone") {
      return normalizePhoneForStorage(String(row?.target_phone || row?.phone || "").trim());
    }

    return String(row?.target_email || row?.email || "").trim().toLowerCase();
  },

  normalizeProjectInviteDeliveryStatus(row = {}) {
    const rawStatus = String(row?.delivery_status || "").trim().toLowerCase();
    if (rawStatus === "sent") return "sent";
    if (rawStatus === "failed") return "failed";
    if (rawStatus === "recorded_only" || rawStatus === "recorded-only") return "recorded_only";
    if (rawStatus === "pending" || rawStatus === "pending_delivery") return "not_sent";
    if (rawStatus === "not_sent" || !rawStatus) return "not_sent";
    return "not_sent";
  },

  normalizeProjectInviteDeliveryChannel(row = {}, targetType = "") {
    const channel = String(row?.delivery_channel || "").trim().toLowerCase();
    if (channel === "sms" || channel === "email") return channel;
    return String(targetType || this.getProjectInviteTargetTypeFromRow(row)).trim().toLowerCase() === "phone"
      ? "sms"
      : "email";
  },

  getFriendlyProjectInviteDeliveryError(value, channel = "email") {
    const message = String(value || "").trim();
    if (!message) return null;

    const normalizedChannel = String(channel || "").trim().toLowerCase() === "sms" ? "SMS" : "Email";
    const lower = message.toLowerCase();

    if (
      lower.includes("missing_provider_env") ||
      lower.includes("missing required") ||
      lower.includes("environment variable")
    ) {
      return `${normalizedChannel} delivery is not configured.`;
    }

    if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("abort")) {
      return `${normalizedChannel} provider timed out.`;
    }

    if (lower.includes("resend") || lower.includes("twilio") || lower.includes("provider rejected")) {
      return `${normalizedChannel} provider rejected delivery.`;
    }

    if (
      lower.includes("duplicate key") ||
      lower.includes("unique constraint") ||
      lower.includes("project_invites") ||
      lower.includes("constraint") ||
      lower.includes("token")
    ) {
      return `${normalizedChannel} delivery could not be confirmed.`;
    }

    const redacted = message
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[redacted]")
      .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]");

    return redacted.length > 160 ? `${redacted.slice(0, 157).trim()}...` : redacted;
  },

  normalizeProjectInviteRow(row = {}, options = {}) {
    const targetType = this.getProjectInviteTargetTypeFromRow(row);
    const targetValue = this.getProjectInviteTargetValue(row, targetType);
    const projectId = String(row?.project_id || "").trim();
    const role = normalizeProjectRole(row?.role);
    const lifecycleStatus = this.normalizeProjectInviteStatus(row);
    const deliveryStatus = this.normalizeProjectInviteDeliveryStatus(row);
    const deliveryChannel = this.normalizeProjectInviteDeliveryChannel(row, targetType);
    const deliveryProvider = String(
      row?.delivery_provider ||
      this.getProjectInviteDeliveryProvider(targetType)
    ).trim().toLowerCase();
    const deliveryError = this.getFriendlyProjectInviteDeliveryError(row?.delivery_error || row?.error || "", deliveryChannel);
    const privateInviteId = String(row?.id || row?.invite_id || "").trim();
    const inviteRef = String(row?.invite_ref || row?._invite_ref || "").trim()
      || (
        privateInviteId && typeof registerInviteActionRef === "function"
          ? registerInviteActionRef(privateInviteId)
          : ""
      );

    const normalizedRow = {
      ...row,
      project_id: projectId,
      project_name: String(row?.project_name || row?.projects?.name || "").trim(),
      role,
      status: lifecycleStatus,
      invite_target_type: targetType,
      target_email: targetType === "email" ? targetValue : null,
      email: targetType === "email" ? targetValue : null,
      target_phone: targetType === "phone" ? targetValue : null,
      phone: targetType === "phone" ? targetValue : null,
      delivery_channel: deliveryChannel,
      delivery_status: deliveryStatus,
      delivery_error: deliveryError,
      delivery_provider: deliveryProvider || null,
      provider_message_id: undefined,
      sent_at: row?.sent_at || null,
      created_at: row?.created_at || null,
      accepted_at: row?.accepted_at || null,
      revoked_at: row?.revoked_at || null
    };

    if (inviteRef) {
      normalizedRow.invite_ref = inviteRef;
      normalizedRow._invite_ref = inviteRef;
    }

    if (options.includePrivateIds === true) {
      normalizedRow.id = privateInviteId;
      normalizedRow.invite_id = privateInviteId;
      return normalizedRow;
    }

    delete normalizedRow.id;
    delete normalizedRow.invite_id;
    delete normalizedRow.provider_message_id;
    return normalizedRow;
  },

  getProjectInviteDedupeKey(row = {}) {
    const normalizedRow = row?.invite_target_type && row?.status
      ? row
      : this.normalizeProjectInviteRow(row);
    const targetType = String(normalizedRow?.invite_target_type || "email").trim().toLowerCase();
    const targetValue = this.getProjectInviteTargetValue(normalizedRow, targetType);
    const projectId = String(normalizedRow?.project_id || "").trim();
    if (projectId && targetType && targetValue) return `${projectId}|${targetType}|${targetValue}`;
    return String(normalizedRow?.invite_ref || normalizedRow?._invite_ref || normalizedRow?.id || normalizedRow?.invite_id || "").trim();
  },

  sortProjectInviteRows(rows = []) {
    return [...rows].sort((a, b) => {
      const aStatus = this.normalizeProjectInviteStatus(a);
      const bStatus = this.normalizeProjectInviteStatus(b);
      const priority = { pending: 0, revoked: 1, accepted: 2 };
      const priorityDelta = (priority[aStatus] ?? 9) - (priority[bStatus] ?? 9);
      if (priorityDelta !== 0) return priorityDelta;
      return getTimestampValue(b?.sent_at || b?.created_at) - getTimestampValue(a?.sent_at || a?.created_at);
    });
  },

  normalizeProjectInviteRows(rows, options = {}) {
    const pendingOnly = options.pendingOnly !== false;
    const sortedRows = this.sortProjectInviteRows(Array.isArray(rows) ? rows : []);
    const uniqueRows = [];
    const seen = new Set();

    sortedRows.forEach(row => {
      const normalizedRow = this.normalizeProjectInviteRow(row, {
        includePrivateIds: options.includePrivateIds === true
      });
      if (pendingOnly && !this.isPendingProjectInviteRow(normalizedRow)) return;
      const dedupeKey = this.getProjectInviteDedupeKey(normalizedRow);
      if (!dedupeKey || seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      uniqueRows.push(normalizedRow);
    });

    return uniqueRows;
  },

  filterPendingProjectInviteRows(rows) {
    return this.normalizeProjectInviteRows(rows, { pendingOnly: true });
  },

  async loadPendingProjectInvitesForCurrentUser() {
    const rpcResult = await supabaseClient.rpc("list_my_pending_project_invites");

    if (!rpcResult.error) {
      return {
        data: this.normalizeProjectInviteRows(rpcResult.data, { pendingOnly: true }),
        error: null
      };
    }

    const fallbackEmail = String(currentUser?.email || "").trim().toLowerCase();
    const fallbackPhone = normalizePhoneForStorage(currentProfile?.phone || "");
    const fallbackRows = [];
    let fallbackError = null;

    const loadRowsByTarget = async (column, value) => {
      const scopedValue = String(value || "").trim();
      if (!scopedValue) return;

      let result = await supabaseClient
        .from("project_invites")
        .select("*")
        .eq(column, scopedValue)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });

      if (result.error) {
        if (this.isMissingColumnError(result.error, column)) return;
        fallbackError = fallbackError || result.error;
        result = await supabaseClient
          .from("project_invites")
          .select("*")
          .eq(column, scopedValue)
          .order("created_at", { ascending: false });
        if (result.error) {
          if (this.isMissingColumnError(result.error, column)) return;
          fallbackError = fallbackError || result.error;
          return;
        }
      }

      if (Array.isArray(result.data)) {
        fallbackRows.push(...result.data);
      }
    };

    await loadRowsByTarget("target_email", fallbackEmail);
    await loadRowsByTarget("email", fallbackEmail);
    await loadRowsByTarget("target_phone", fallbackPhone);
    await loadRowsByTarget("phone", fallbackPhone);

    const normalizedFallbackRows = this.normalizeProjectInviteRows(fallbackRows, { pendingOnly: true });
    return {
      data: normalizedFallbackRows,
      error: normalizedFallbackRows.length > 0 ? null : (fallbackError || rpcResult.error)
    };
  },

  async acceptProjectInvite({ inviteId = "", projectId = "" } = {}) {
    const normalizedInviteId = String(inviteId || "").trim();
    const normalizedProjectId = String(projectId || "").trim();

    if (normalizedInviteId) {
      const v2Result = await supabaseClient.rpc("accept_project_invite_v2", {
        p_invite_id: normalizedInviteId
      });
      if (!v2Result.error) return v2Result;
      if (normalizedProjectId) {
        const fallbackResult = await supabaseClient.rpc("accept_project_invite", {
          project_id: normalizedProjectId
        });
        if (!fallbackResult.error) return fallbackResult;
        return {
          data: null,
          error: new Error(this.getFriendlyProjectInviteErrorMessage(fallbackResult.error, "Unable to accept invite."))
        };
      }
      return {
        data: null,
        error: new Error(this.getFriendlyProjectInviteErrorMessage(v2Result.error, "Unable to accept invite."))
      };
    }

    if (!normalizedProjectId) {
      return { data: null, error: new Error("Missing invite id or project id.") };
    }

    const result = await supabaseClient.rpc("accept_project_invite", {
      project_id: normalizedProjectId
    });
    if (!result.error) return result;
    return {
      data: null,
      error: new Error(this.getFriendlyProjectInviteErrorMessage(result.error, "Unable to accept invite."))
    };
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

  normalizeProjectIdForWrite(projectId) {
    return String(projectId || "").trim().toLowerCase();
  },

  isValidProjectIdForWrite(projectId) {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(projectId || "").trim());
  },

  async projectExists(projectId) {
    const normalizedProjectId = this.normalizeProjectIdForWrite(projectId);
    if (!normalizedProjectId) {
      return { data: { exists: false, project: null }, error: null };
    }

    const result = await this.withSupabaseTimeout(
      supabaseClient
        .from("projects")
        .select("project_id, name, created_at, is_archived, archived_at, brand_color, brand_logo_url")
        .eq("project_id", normalizedProjectId)
        .limit(1),
      12000,
      `Checking project ${normalizedProjectId}`
    );

    if (result?.error) {
      const brandingColumnsMissing = this.isMissingColumnError(result.error, "brand_color")
        || this.isMissingColumnError(result.error, "brand_logo_url");
      if (!brandingColumnsMissing) {
        return { data: null, error: result.error };
      }

      const fallbackResult = await this.withSupabaseTimeout(
        supabaseClient
          .from("projects")
          .select("project_id, name, created_at, is_archived, archived_at")
          .eq("project_id", normalizedProjectId)
          .limit(1),
        12000,
        `Checking project ${normalizedProjectId}`
      );

      if (fallbackResult?.error) return { data: null, error: fallbackResult.error };
      const fallbackRows = Array.isArray(fallbackResult.data) ? fallbackResult.data : [];
      return {
        data: {
          exists: fallbackRows.length > 0,
          project: fallbackRows[0] || null
        },
        error: null
      };
    }

    const rows = Array.isArray(result?.data) ? result.data : [];
    return {
      data: {
        exists: rows.length > 0,
        project: rows[0] || null
      },
      error: null
    };
  },

  async ensureProjectCreatorMembership(projectId, userId) {
    const normalizedProjectId = this.normalizeProjectIdForWrite(projectId);
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedProjectId || !normalizedUserId) {
      return { data: null, error: new Error("Project ID and user ID are required for project membership.") };
    }

    const existingResult = await this.withSupabaseTimeout(
      supabaseClient
        .from("project_memberships")
        .select("project_id,user_id,role")
        .eq("project_id", normalizedProjectId)
        .eq("user_id", normalizedUserId)
        .limit(1),
      12000,
      `Checking creator membership for ${normalizedProjectId}`
    );

    if (existingResult?.error) return { data: null, error: existingResult.error };

    const existingRows = Array.isArray(existingResult.data) ? existingResult.data : [];
    if (existingRows.length > 0) {
      const existing = existingRows[0];
      if (normalizeProjectRole(existing.role) === "admin") {
        return { data: existing, error: null };
      }

      return await this.withSupabaseTimeout(
        supabaseClient
          .from("project_memberships")
          .update({ role: "admin" })
          .eq("project_id", normalizedProjectId)
          .eq("user_id", normalizedUserId)
          .select("project_id,user_id,role")
          .limit(1),
        12000,
        `Updating creator membership for ${normalizedProjectId}`
      );
    }

    const insertResult = await this.withSupabaseTimeout(
      supabaseClient
        .from("project_memberships")
        .insert({
          project_id: normalizedProjectId,
          user_id: normalizedUserId,
          role: "admin"
        })
        .select("project_id,user_id,role")
        .limit(1),
      12000,
      `Creating creator membership for ${normalizedProjectId}`
    );

    if (insertResult?.error && this.isUniqueViolation(insertResult.error)) {
      return { data: { project_id: normalizedProjectId, user_id: normalizedUserId, role: "admin" }, error: null };
    }

    return insertResult;
  },

  async createProjectMetadata(input = {}) {
    const payload = input && typeof input === "object" ? input : {};
    const normalizedProjectId = this.normalizeProjectIdForWrite(payload.projectId || payload.project_id);
    const normalizedName = this.normalizeMaintenanceTextValue(payload.name || payload.projectName);
    const createdBy = String(payload.createdBy || payload.created_by || "").trim();

    if (!normalizedProjectId || !normalizedName) {
      return { data: null, error: new Error("Project Name and Project ID are required.") };
    }

    if (!this.isValidProjectIdForWrite(normalizedProjectId)) {
      return { data: null, error: new Error("Project ID must use lowercase letters, numbers, and single hyphens only.") };
    }

    const existsResult = await this.projectExists(normalizedProjectId);
    if (existsResult?.error) return existsResult;
    if (existsResult?.data?.exists) {
      return { data: null, error: new Error(`Project ID "${normalizedProjectId}" already exists.`) };
    }

    let insertResult = await this.withSupabaseTimeout(
      supabaseClient
        .from("projects")
        .insert({
          project_id: normalizedProjectId,
          name: normalizedName,
          is_archived: false,
          archived_at: null
        })
        .select("project_id, name, created_at, is_archived, archived_at, brand_color, brand_logo_url")
        .limit(1),
      15000,
      `Creating project ${normalizedProjectId}`
    );

    if (insertResult?.error && this.isUniqueViolation(insertResult.error)) {
      return { data: null, error: new Error(`Project ID "${normalizedProjectId}" already exists.`) };
    }

    if (insertResult?.error && (
      this.isMissingColumnError(insertResult.error, "brand_color") ||
      this.isMissingColumnError(insertResult.error, "brand_logo_url") ||
      this.isMissingColumnError(insertResult.error, "is_archived") ||
      this.isMissingColumnError(insertResult.error, "archived_at")
    )) {
      const postInsertCheck = await this.projectExists(normalizedProjectId);
      if (!postInsertCheck?.error && postInsertCheck?.data?.exists) {
        insertResult = {
          data: [postInsertCheck.data.project || {
            project_id: normalizedProjectId,
            name: normalizedName
          }],
          error: null
        };
      } else {
        insertResult = await this.withSupabaseTimeout(
          supabaseClient
            .from("projects")
            .insert({
              project_id: normalizedProjectId,
              name: normalizedName
            })
            .select("project_id, name, created_at")
            .limit(1),
          15000,
          `Creating project ${normalizedProjectId}`
        );

        if (insertResult?.error && this.isUniqueViolation(insertResult.error)) {
          return { data: null, error: new Error(`Project ID "${normalizedProjectId}" already exists.`) };
        }
      }
    }

    if (insertResult?.error) return { data: null, error: insertResult.error };

    const insertedRows = Array.isArray(insertResult.data) ? insertResult.data : [];
    const insertedProject = insertedRows[0] || {
      project_id: normalizedProjectId,
      name: normalizedName,
      is_archived: false,
      archived_at: null,
      brand_color: "",
      brand_logo_url: ""
    };

    let membershipWarning = "";
    if (createdBy) {
      const membershipResult = await this.ensureProjectCreatorMembership(normalizedProjectId, createdBy);
      if (membershipResult?.error) {
        membershipWarning = "Project was created, but creator membership could not be written. Global admins can still access the project.";
        console.warn("Creator membership write failed:", membershipResult.error);
      }
    }

    return {
      data: {
        ...insertedProject,
        project_id: normalizedProjectId,
        name: normalizedName,
        is_archived: insertedProject.is_archived === true,
        archived_at: insertedProject.archived_at || null,
        brand_color: insertedProject.brand_color || "",
        brand_logo_url: insertedProject.brand_logo_url || "",
        store_file: `data/${normalizedProjectId}/stores_with_coords.json`,
        membershipWarning
      },
      error: null
    };
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
    const normalizedProjectId = String(projectId || "").trim();
    if (!normalizedProjectId) {
      return { data: null, error: new Error("Missing project id for branding update."), brandingUnavailable: false };
    }

    const result = await this.withSupabaseTimeout(
      supabaseClient
        .from("projects")
        .update({
          brand_color: brandColor,
          brand_logo_url: brandLogoUrl
        })
        .eq("project_id", normalizedProjectId),
      12000,
      "Saving branding"
    );

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
        .select("user_id, email, display_name, phone, role")
        .in("user_id", userIds);

      if (!profileResult.error && Array.isArray(profileResult.data)) {
        const profileByUserId = {};
        profileResult.data.forEach(row => {
          const userId = String(row.user_id || "").trim();
          if (!userId) return;
          emailByUserId[userId] = row.email || "";
          profileByUserId[userId] = row;
        });

        return {
          data: membershipsResult.data.map(row => {
            const userId = String(row.user_id || "").trim();
            const profile = profileByUserId[userId] || {};
            return {
              ...row,
              email: String(profile.email || emailByUserId[userId] || "").trim(),
              display_name: String(profile.display_name || "").trim(),
              phone: String(profile.phone || "").trim(),
              global_role: normalizeRole(profile.role)
            };
          }),
          error: null
        };
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

    if (!result.error) {
      return {
        ...result,
        data: this.filterPendingProjectInviteRows(result.data)
      };
    }

    result = await supabaseClient
      .from("project_invites")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (!result.error) {
      return {
        ...result,
        data: this.filterPendingProjectInviteRows(result.data)
      };
    }

    return result;
  },

  getProjectInviteDeliveryChannel(targetType) {
    return String(targetType || "").trim().toLowerCase() === "phone" ? "sms" : "email";
  },

  getProjectInviteDeliveryProvider(targetType) {
    return String(targetType || "").trim().toLowerCase() === "phone" ? "twilio" : "resend";
  },

  isMissingInviteDeliveryColumn(error) {
    return [
      "delivery_channel",
      "delivery_status",
      "delivery_error",
      "delivery_provider",
      "provider_message_id",
      "sent_at"
    ].some(columnName => this.isMissingColumnError(error, columnName));
  },

  isRawProjectInviteError(errorOrMessage) {
    const payload = errorOrMessage && typeof errorOrMessage === "object" ? errorOrMessage : {};
    const haystack = [
      typeof errorOrMessage === "string" ? errorOrMessage : "",
      payload?.message,
      payload?.details,
      payload?.hint,
      payload?.code,
      payload?.error,
      payload?.error?.message,
      payload?.error?.details,
      payload?.error?.hint,
      payload?.error?.code,
      payload?.payload?.message,
      payload?.payload?.error?.message,
      payload?.payload?.error?.code
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const mentionsInviteTargetConstraint = (
      haystack.includes("project_invites") &&
      haystack.includes("project_id") &&
      haystack.includes("key") &&
      (haystack.includes("email") || haystack.includes("phone") || haystack.includes("target"))
    );

    return (
      haystack.includes("23505") ||
      haystack.includes("duplicate key") ||
      haystack.includes("unique constraint") ||
      mentionsInviteTargetConstraint
    );
  },

  getFriendlyProjectInviteErrorMessage(errorOrPayload, fallbackMessage = "Unable to send invite.") {
    const payload = errorOrPayload && typeof errorOrPayload === "object" ? errorOrPayload : {};
    const errorPayload = payload.error && typeof payload.error === "object" ? payload.error : {};
    const code = String(
      payload.code ||
      payload.error_code ||
      errorPayload.code ||
      payload.payload?.code ||
      payload.payload?.error?.code ||
      ""
    ).trim();

    if (code === "invite_already_accepted") {
      return "This invite has already been accepted. The user may already be a member of this project.";
    }

    if (code === "invite_duplicate" || this.isRawProjectInviteError(errorOrPayload)) {
      return "An invite for this email or phone already exists. Refresh pending invites and try again.";
    }

    const message = String(
      typeof errorOrPayload === "string"
        ? errorOrPayload
        : (
            payload.message ||
            errorPayload.message ||
            payload.error ||
            fallbackMessage
          )
    ).trim();

    return message || fallbackMessage;
  },

  normalizeProjectInviteApiResult(response, basePayload) {
    const invite = response?.invite && typeof response.invite === "object" ? response.invite : {};
    const deliveryChannel = String(
      response?.delivery_channel ||
      invite.delivery_channel ||
      this.getProjectInviteDeliveryChannel(basePayload.invite_target_type)
    ).trim().toLowerCase();
    const deliveryProvider = String(
      response?.delivery_provider ||
      invite.delivery_provider ||
      this.getProjectInviteDeliveryProvider(basePayload.invite_target_type)
    ).trim().toLowerCase();
    const deliveryStatus = String(
      response?.delivery_status ||
      invite.delivery_status ||
      "not_sent"
    ).trim().toLowerCase();
    const deliveryError = response?.error && typeof response.error === "object"
      ? String(response.error.message || "").trim()
      : String(response?.error || invite.delivery_error || "").trim();

    const normalizedInvite = this.normalizeProjectInviteRow({
        ...basePayload,
        ...invite,
        delivery_channel: deliveryChannel,
        delivery_status: deliveryStatus,
        delivery_error: deliveryError || null,
        delivery_provider: deliveryProvider || null,
        sent_at: invite.sent_at || null,
        delivery_warning: response?.warning || null
      },
      { includePrivateIds: false }
    );
    normalizedInvite.delivery_warning = response?.warning || null;

    return {
      data: normalizedInvite,
      error: null
    };
  },

  getProjectInviteApiErrorMessage(payload, fallbackMessage = "Unable to send invite.") {
    if (!payload) return fallbackMessage;
    return this.getFriendlyProjectInviteErrorMessage(payload, fallbackMessage);
  },

  shouldFallbackToRecordedOnlyInvite(error) {
    if (!this.isLocalDevRuntime()) return false;

    const status = Number(error?.status || 0);
    const code = String(error?.code || "").trim();
    return (
      status === 404 ||
      status === 405 ||
      code === "NETWORK_ERROR" ||
      code === "INVALID_JSON" ||
      error?.name === "TypeError"
    );
  },

  async loadProjectInviteRowsForTarget(basePayload = {}) {
    const projectId = String(basePayload?.project_id || "").trim();
    const targetType = String(basePayload?.invite_target_type || "").trim().toLowerCase() === "phone"
      ? "phone"
      : "email";
    const targetValue = targetType === "phone"
      ? normalizePhoneForStorage(basePayload?.target_phone || basePayload?.phone || "")
      : String(basePayload?.target_email || basePayload?.email || "").trim().toLowerCase();

    if (!projectId || !targetValue) return { data: [], error: null };

    const targetColumns = targetType === "phone"
      ? ["target_phone", "phone"]
      : ["target_email", "email"];
    const rows = [];
    let firstError = null;

    for (const column of targetColumns) {
      const result = await supabaseClient
        .from("project_invites")
        .select("*")
        .eq("project_id", projectId)
        .eq(column, targetValue)
        .order("created_at", { ascending: false })
        .limit(20);

      if (result.error) {
        if (this.isMissingColumnError(result.error, column)) continue;
        firstError = firstError || result.error;
        continue;
      }

      if (Array.isArray(result.data)) {
        rows.push(...result.data);
      }
    }

    if (rows.length === 0 && firstError) {
      return { data: [], error: firstError };
    }

    return {
      data: this.sortProjectInviteRows(rows.map(row => this.normalizeProjectInviteRow(row, { includePrivateIds: true }))),
      error: null
    };
  },

  selectReusableProjectInviteRow(rows = []) {
    const sortedRows = this.sortProjectInviteRows(Array.isArray(rows) ? rows : []);
    const acceptedInvite = sortedRows.find(row => this.normalizeProjectInviteStatus(row) === "accepted");
    if (acceptedInvite) {
      return {
        data: null,
        error: new Error("This invite has already been accepted. The user may already be a member of this project.")
      };
    }

    return {
      data: sortedRows.find(row => this.normalizeProjectInviteStatus(row) === "pending")
        || sortedRows.find(row => this.normalizeProjectInviteStatus(row) === "revoked")
        || null,
      error: null
    };
  },

  async fetchProjectInviteSend(payload, accessToken, timeoutMs = 12000) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timeoutId = null;

    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || 12000));
    }

    try {
      let response;
      try {
        response = await fetch("/api/project-invites/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify(payload),
          signal: controller?.signal
        });
      } catch (error) {
        const networkError = new Error(error?.name === "AbortError"
          ? "Sending invite timed out. Please try again."
          : "Invite API route is unavailable.");
        networkError.code = error?.name === "AbortError" ? "ACTION_TIMEOUT" : "NETWORK_ERROR";
        networkError.status = 0;
        throw networkError;
      }

      const text = await response.text();
      let parsed = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch (_) {
          const parseError = new Error("Invite API returned an invalid response.");
          parseError.code = "INVALID_JSON";
          parseError.status = response.status;
          throw parseError;
        }
      }

      if (!response.ok) {
        const message = this.getProjectInviteApiErrorMessage(parsed, "Unable to send invite.");
        const apiError = new Error(message);
        apiError.status = response.status;
        apiError.code = parsed?.error?.code || parsed?.code || "INVITE_API_ERROR";
        apiError.payload = parsed;
        throw apiError;
      }

      return parsed || {};
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  },

  getShareLinkApiErrorMessage(payload, fallbackMessage = "Unable to create share link.") {
    if (!payload) return fallbackMessage;
    if (typeof payload === "string") return payload || fallbackMessage;
    if (payload.error && typeof payload.error === "object") {
      return String(payload.error.message || fallbackMessage).trim() || fallbackMessage;
    }
    return String(payload.message || payload.error || fallbackMessage).trim() || fallbackMessage;
  },

  async createProjectShareLink(projectId, durationDays = 7, timeoutMs = 18000) {
    const normalizedProjectId = String(projectId || "").trim();
    if (!normalizedProjectId) {
      return { data: null, error: new Error("Missing project id for share link.") };
    }

    const safeTimeoutMs = Math.max(1, Number(timeoutMs) || 18000);
    let sessionResult;
    try {
      sessionResult = await this.withSupabaseTimeout(
        this.getSession(),
        safeTimeoutMs,
        "Reading session"
      );
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Unable to read the current session.")
      };
    }

    if (sessionResult?.error) {
      return { data: null, error: sessionResult.error };
    }

    const accessToken = String(sessionResult?.data?.session?.access_token || "").trim();
    if (!accessToken) {
      return { data: null, error: new Error("Sign in again before creating a share link.") };
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timeoutId = null;

    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          if (controller) controller.abort();
          const timeoutError = new Error("Creating share link timed out. Please try again.");
          timeoutError.code = "ACTION_TIMEOUT";
          timeoutError.status = 0;
          reject(timeoutError);
        }, safeTimeoutMs);
      });

      const requestPromise = (async () => {
        let response;
        try {
          response = await fetch("/api/share-links/create", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify({
              projectId: normalizedProjectId,
              durationDays
            }),
            signal: controller?.signal
          });
        } catch (error) {
          const networkError = new Error(error?.name === "AbortError"
            ? "Creating share link timed out. Please try again."
            : "Share link API route is unavailable.");
          networkError.code = error?.name === "AbortError" ? "ACTION_TIMEOUT" : "NETWORK_ERROR";
          networkError.status = 0;
          throw networkError;
        }

        const text = await response.text();
        let parsed = null;
        if (text) {
          try {
            parsed = JSON.parse(text);
          } catch (_) {
            const parseError = new Error("Share link API returned an invalid response.");
            parseError.code = "INVALID_JSON";
            parseError.status = response.status;
            throw parseError;
          }
        }

        if (!response.ok || parsed?.ok !== true) {
          const message = this.getShareLinkApiErrorMessage(parsed, "Unable to create share link.");
          const apiError = new Error(message);
          apiError.status = response.status;
          apiError.code = parsed?.error?.code || parsed?.code || "SHARE_LINK_API_ERROR";
          apiError.payload = parsed;
          throw apiError;
        }

        return {
          data: parsed.share || null,
          error: null
        };
      })();

      return await Promise.race([requestPromise, timeoutPromise]);
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error(String(error?.message || "Unable to create share link."))
      };
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  },

  async createRecordedOnlyProjectInvite(basePayload, deliveryMessage) {
    const deliveryChannel = this.getProjectInviteDeliveryChannel(basePayload.invite_target_type);
    const deliveryProvider = this.getProjectInviteDeliveryProvider(basePayload.invite_target_type);
    const deliveryPayload = {
      ...basePayload,
      delivery_channel: deliveryChannel,
      delivery_status: "recorded_only",
      delivery_error: deliveryMessage,
      delivery_provider: deliveryProvider,
      provider_message_id: null,
      sent_at: null
    };

    const existingRowsResult = await this.loadProjectInviteRowsForTarget(basePayload);
    if (existingRowsResult?.error) return existingRowsResult;

    const reusableResult = this.selectReusableProjectInviteRow(existingRowsResult?.data || []);
    if (reusableResult.error) return reusableResult;
    const reusableInvite = reusableResult.data;

    const buildWrite = (payload) => {
      if (reusableInvite?.id) {
        return supabaseClient
          .from("project_invites")
          .update(payload)
          .eq("id", reusableInvite.id)
          .select("*")
          .limit(1);
      }

      return supabaseClient
        .from("project_invites")
        .insert(payload)
        .select("*")
        .limit(1);
    };

    let writeResult = await this.withSupabaseTimeout(
      buildWrite(deliveryPayload),
      15000,
      "Recording invite"
    );

    if (writeResult?.error && this.isMissingInviteDeliveryColumn(writeResult.error)) {
      writeResult = await this.withSupabaseTimeout(
        buildWrite(basePayload),
        15000,
        "Recording invite"
      );
    }

    if (writeResult?.error) {
      return writeResult;
    }

    const writtenInvite = Array.isArray(writeResult?.data) && writeResult.data.length > 0
      ? writeResult.data[0]
      : {};

    return {
      data: this.normalizeProjectInviteRow({
        ...deliveryPayload,
        ...writtenInvite,
        delivery_channel: deliveryChannel,
        delivery_status: "recorded_only",
        delivery_error: deliveryMessage,
        delivery_provider: deliveryProvider,
        provider_message_id: null
      }),
      error: null
    };
  },

  async createProjectInvite(input = {}) {
    const invite = input && typeof input === "object" ? input : {};
    const inviteTarget = invite.target && typeof invite.target === "object" ? invite.target : {};
    const timeoutMs = Math.max(1, Number(invite.timeoutMs) || 12000);

    const normalizedProjectId = String(invite.projectId || "").trim();
    const rawTargetType = invite.targetType || inviteTarget.type || "";
    const rawTargetValue = String(invite.targetValue || inviteTarget.value || "").trim();
    const normalizedTargetType = String(rawTargetType || detectInviteTargetType(rawTargetValue)).trim().toLowerCase() === "phone"
      ? "phone"
      : "email";
    const normalizedRole = normalizeProjectRole(invite.role);
    const normalizedTargetValue = normalizedTargetType === "phone"
      ? normalizePhoneForStorage(rawTargetValue)
      : rawTargetValue.toLowerCase();
    const normalizedInvitedBy = String(invite.invitedBy || "").trim() || null;

    if (!normalizedProjectId || !normalizedTargetValue) {
      return { data: null, error: new Error("Invite target is required.") };
    }

    const targetEmail = normalizedTargetType === "email" ? normalizedTargetValue : null;
    const targetPhone = normalizedTargetType === "phone" ? normalizedTargetValue : null;
    const deliveryChannel = this.getProjectInviteDeliveryChannel(normalizedTargetType);

    const basePayload = {
      project_id: normalizedProjectId,
      role: normalizedRole,
      invited_by: normalizedInvitedBy,
      invite_target_type: normalizedTargetType,
      target_email: targetEmail,
      target_phone: targetPhone,
      email: targetEmail,
      status: "pending",
      accepted_by_user_id: null,
      accepted_at: null,
      revoked_at: null
    };

    const sessionResult = await this.withSupabaseTimeout(
      supabaseClient.auth.getSession(),
      timeoutMs,
      "Reading session"
    );
    if (sessionResult?.error) {
      return { data: null, error: sessionResult.error };
    }

    const accessToken = String(sessionResult?.data?.session?.access_token || "").trim();
    if (!accessToken) {
      return { data: null, error: new Error("Sign in again before sending an invite.") };
    }

    try {
      const response = await this.fetchProjectInviteSend({
        projectId: normalizedProjectId,
        targetType: normalizedTargetType,
        targetValue: normalizedTargetValue,
        role: normalizedRole
      }, accessToken, timeoutMs);

      return this.normalizeProjectInviteApiResult(response, basePayload);
    } catch (error) {
      if (!this.shouldFallbackToRecordedOnlyInvite(error)) {
        return {
          data: null,
          error: error instanceof Error ? error : new Error("Unable to send invite.")
        };
      }

      const recordedOnlyResult = await this.createRecordedOnlyProjectInvite(
        basePayload,
        `Invite API route unavailable in local dev; ${deliveryChannel === "sms" ? "SMS" : "email"} was not sent.`
      );
      if (recordedOnlyResult?.error && this.isRawProjectInviteError(recordedOnlyResult.error)) {
        return {
          data: null,
          error: new Error(this.getFriendlyProjectInviteErrorMessage(recordedOnlyResult.error))
        };
      }

      return recordedOnlyResult;
    }
  },
  async revokeProjectInvite(inviteId) {
    const revokedAt = new Date().toISOString();
    const normalizeRevokeResult = (result) => {
      if (result?.error) return result;
      if (Array.isArray(result?.data) && result.data.length === 0) {
        return {
          data: null,
          error: new Error("Invite is no longer pending.")
        };
      }
      return result;
    };

    let updateResult = await supabaseClient
      .from("project_invites")
      .update({ revoked_at: revokedAt, status: "revoked" })
      .eq("id", inviteId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .select("project_id, role, status, revoked_at")
      .limit(1);

    if (!updateResult.error) return normalizeRevokeResult(updateResult);

    if (this.isMissingColumnError(updateResult.error, "status")) {
      updateResult = await supabaseClient
        .from("project_invites")
        .update({ revoked_at: revokedAt })
        .eq("id", inviteId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .select("project_id, role, revoked_at")
        .limit(1);
      if (!updateResult.error) return normalizeRevokeResult(updateResult);
    }

    const deleteResult = await supabaseClient
      .from("project_invites")
      .delete()
      .eq("id", inviteId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .select("project_id")
      .limit(1);
    if (deleteResult.error) {
      return {
        data: null,
        error: new Error(this.getFriendlyProjectInviteErrorMessage(deleteResult.error, "Unable to cancel invite."))
      };
    }
    return normalizeRevokeResult(deleteResult);
  },

  async loadOrgOversightAccounts() {
    return await supabaseClient.rpc("org_list_accounts");
  },

  async loadOrgOversightInvites() {
    const result = await supabaseClient.rpc("org_list_project_invites");
    if (!result.error) {
      return {
        ...result,
        data: this.filterPendingProjectInviteRows(result.data)
      };
    }

    const fallbackResult = await supabaseClient
      .from("project_invites")
      .select("*, projects(name)")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    if (fallbackResult.error) {
      return {
        data: null,
        error: new Error("Unable to load invites.")
      };
    }

    return {
      data: this.filterPendingProjectInviteRows(fallbackResult.data),
      error: null
    };
  },

  async updateGlobalRole(userId, role) {
    return await supabaseClient.rpc("org_update_global_role", {
      p_user_id: userId,
      p_role: normalizeRole(role)
    });
  },

  normalizeMaintenanceTextValue(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
  },

  normalizeStoreMaintenanceStoreId(value) {
    return String(value ?? "").trim();
  },

  appendUniqueAddressParts(fullAddress, parts = []) {
    const address = this.normalizeMaintenanceTextValue(fullAddress);
    return (Array.isArray(parts) ? parts : [])
      .map(value => this.normalizeMaintenanceTextValue(value))
      .filter(Boolean)
      .reduce((current, value) => {
        if (!current) return value;
        if (current.toLowerCase().includes(value.toLowerCase())) return current;
        return `${current}, ${value}`;
      }, address);
  },

  buildStoreMaintenanceAddress(input = {}) {
    const fullAddress = this.normalizeMaintenanceTextValue(input.full_address || input.address || input.address_line_1);
    const addressLine2 = this.normalizeMaintenanceTextValue(input.address_line_2 || input.address2);
    const city = this.normalizeMaintenanceTextValue(input.city);
    const state = this.normalizeMaintenanceTextValue(input.state).toUpperCase();
    const postalCode = this.normalizeMaintenanceTextValue(input.postal_code || input.zip || input.postalCode);

    const addressBase = [fullAddress, addressLine2].filter(Boolean).join(", ");
    return this.appendUniqueAddressParts(addressBase, [city, state, postalCode]);
  },

  normalizeStoreMaintenancePayload(input = {}) {
    try {
      const storeId = this.normalizeStoreMaintenanceStoreId(input.store_id || input.storeId);
      const city = this.normalizeMaintenanceTextValue(input.city);
      const state = this.normalizeMaintenanceTextValue(input.state).toUpperCase();
      const fullAddress = this.buildStoreMaintenanceAddress({
        ...input,
        city,
        state
      });

      if (!storeId) {
        return { data: null, error: new Error("Store ID is required.") };
      }
      if (!fullAddress) {
        return { data: null, error: new Error("Address or full address is required.") };
      }
      if (!city) {
        return { data: null, error: new Error("City is required.") };
      }
      if (!state) {
        return { data: null, error: new Error("State is required.") };
      }

      const normalized = {
        store_id: storeId,
        store_name: this.normalizeMaintenanceTextValue(input.store_name || input.storeName),
        customer_id: this.normalizeMaintenanceTextValue(input.customer_id || input.customerId),
        full_address: fullAddress,
        city,
        state,
        postal_code: this.normalizeMaintenanceTextValue(input.postal_code || input.zip || input.postalCode),
        region: this.normalizeMaintenanceTextValue(input.region),
        territory: this.normalizeMaintenanceTextValue(input.territory),
        district: this.normalizeMaintenanceTextValue(input.district),
        division: this.normalizeMaintenanceTextValue(input.division),
        market: this.normalizeMaintenanceTextValue(input.market)
      };

      const coordinates = normalizeStoreCoordinatePair(input.lat, input.lng);
      if (coordinates.lat !== null && coordinates.lng !== null) {
        normalized.lat = coordinates.lat;
        normalized.lng = coordinates.lng;
      }

      return { data: normalized, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Unable to normalize store maintenance payload.")
      };
    }
  },

  getMapboxAccessToken() {
    if (typeof mapboxgl !== "undefined" && mapboxgl?.accessToken) {
      return String(mapboxgl.accessToken || "").trim();
    }
    if (typeof window !== "undefined" && window?.MAPBOX_TOKEN) {
      return String(window.MAPBOX_TOKEN || "").trim();
    }
    return "";
  },

  async geocodeStoreAddress(addressParts = {}, timeoutMs = 15000) {
    const query = this.buildStoreMaintenanceAddress(addressParts);
    if (!query) {
      return { data: null, error: new Error("Address is required for geocoding.") };
    }

    const token = this.getMapboxAccessToken();
    if (!token) {
      return { data: null, error: new Error("Mapbox token is unavailable for geocoding.") };
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timeoutId = null;

    try {
      if (controller) {
        timeoutId = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || 15000));
      }

      const url = "https://api.mapbox.com/search/geocode/v6/forward?" + new URLSearchParams({
        q: query,
        access_token: token,
        limit: "1",
        autocomplete: "false",
        country: "US",
        permanent: "true"
      }).toString();

      const response = await fetch(url, {
        method: "GET",
        signal: controller?.signal
      });

      if (!response.ok) {
        return { data: null, error: new Error(`Geocode failed with status ${response.status}.`) };
      }

      const json = await response.json();
      const coords = json?.features?.[0]?.geometry?.coordinates;
      const lng = Number(Array.isArray(coords) ? coords[0] : NaN);
      const lat = Number(Array.isArray(coords) ? coords[1] : NaN);
      const normalized = normalizeStoreCoordinatePair(lat, lng);

      if (normalized.lat === null || normalized.lng === null) {
        return { data: null, error: new Error("Geocode returned invalid coordinates.") };
      }

      return {
        data: {
          lat: normalized.lat,
          lng: normalized.lng,
          query
        },
        error: null
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Geocode request failed.")
      };
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  },

  async detectStorePostalColumn() {
    if (this._storePostalColumnName !== undefined) {
      return { data: this._storePostalColumnName, error: null };
    }

    for (const column of this._storePostalColumnCandidates) {
      const result = await this.withSupabaseTimeout(
        supabaseClient
          .from("stores")
          .select(column)
          .limit(1),
        8000,
        `Checking stores.${column}`
      );

      if (!result?.error) {
        this._storePostalColumnName = column;
        return { data: column, error: null };
      }

      if (!this.isMissingColumnError(result.error, column)) {
        console.warn(`Postal column probe for ${column} failed:`, result.error);
      }
    }

    this._storePostalColumnName = null;
    return { data: null, error: null };
  },

  buildStoreMaintenanceStorePayload(projectId, payload = {}, options = {}) {
    const normalizedProjectId = String(projectId || "").trim();
    const normalizedStoreId = this.normalizeStoreMaintenanceStoreId(payload.store_id);
    const includeStoreId = options.includeStoreId !== false;
    const includeCoordinates = options.includeCoordinates !== false;
    const includeEmptyText = options.includeEmptyText === true;
    const postalColumn = String(options.postalColumn || "").trim();

    const storePayload = {};
    if (normalizedProjectId) storePayload.project_id = normalizedProjectId;
    if (includeStoreId && normalizedStoreId) storePayload.store_id = normalizedStoreId;

    this._storeMaintenanceTextFields.forEach(field => {
      if (!Object.prototype.hasOwnProperty.call(payload, field)) return;
      const value = this.normalizeMaintenanceTextValue(payload[field]);
      if (value || includeEmptyText) {
        storePayload[field] = value;
      }
    });

    if (postalColumn && Object.prototype.hasOwnProperty.call(payload, "postal_code")) {
      const postalCode = this.normalizeMaintenanceTextValue(payload.postal_code);
      if (postalCode || includeEmptyText) {
        storePayload[postalColumn] = postalCode;
      }
    }

    if (includeCoordinates && Object.prototype.hasOwnProperty.call(payload, "lat") && Object.prototype.hasOwnProperty.call(payload, "lng")) {
      const coordinates = normalizeStoreCoordinatePair(payload.lat, payload.lng);
      if (coordinates.lat === null || coordinates.lng === null) {
        return { data: null, error: new Error("Invalid store coordinates.") };
      }
      storePayload.lat = coordinates.lat;
      storePayload.lng = coordinates.lng;
    }

    return { data: storePayload, error: null };
  },

  isUniqueViolation(error) {
    const code = String(error?.code || "").trim();
    if (code === "23505") return true;

    const haystack = [
      error?.message,
      error?.details,
      error?.hint
    ].filter(Boolean).join(" ").toLowerCase();

    return haystack.includes("duplicate key") || haystack.includes("unique constraint");
  },

  async findStoreByProjectAndStoreId(projectId, storeId) {
    try {
      const normalizedProjectId = String(projectId || "").trim();
      const normalizedStoreId = this.normalizeStoreMaintenanceStoreId(storeId);
      if (!normalizedProjectId || !normalizedStoreId) {
        return { data: null, error: new Error("Project ID and Store ID are required.") };
      }

      const postalResult = await this.detectStorePostalColumn();
      const postalColumn = postalResult?.data || "";
      const selectColumns = [
        "project_id",
        "store_id",
        "store_name",
        "customer_id",
        "lat",
        "lng",
        "full_address",
        "region",
        "territory",
        "state",
        "city",
        "district",
        "division",
        "market",
        "is_removed",
        "removed_at",
        postalColumn
      ].filter(Boolean).join(", ");

      const result = await this.withSupabaseTimeout(
        supabaseClient
          .from("stores")
          .select(selectColumns)
          .eq("project_id", normalizedProjectId)
          .eq("store_id", normalizedStoreId),
        12000,
        `Finding store ${normalizedStoreId}`
      );

      if (result?.error) return { data: null, error: result.error };

      const matches = (Array.isArray(result.data) ? result.data : []).map(row => ({
        ...normalizeStoreRecord(row),
        project_id: String(row.project_id || normalizedProjectId).trim(),
        is_removed: row.is_removed === true,
        removed_at: row.removed_at || null
      }));

      return {
        data: {
          store: matches[0] || null,
          matches,
          duplicateCount: Math.max(0, matches.length - 1)
        },
        error: null
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Unable to find store.")
      };
    }
  },

  async addStoreToProject(projectId, payload = {}) {
    try {
      const normalizedProjectId = String(projectId || "").trim();
      const normalized = this.normalizeStoreMaintenancePayload(payload);
      if (normalized.error) return normalized;
      const storePayloadInput = normalized.data;

      const coordinates = normalizeStoreCoordinatePair(storePayloadInput.lat, storePayloadInput.lng);
      if (coordinates.lat === null || coordinates.lng === null) {
        return { data: null, error: new Error("Invalid store coordinates.") };
      }

      const existing = await this.findStoreByProjectAndStoreId(normalizedProjectId, storePayloadInput.store_id);
      if (existing.error) return { data: null, error: existing.error };
      if (existing.data?.store) {
        return {
          data: {
            duplicate: true,
            store: existing.data.store
          },
          error: null,
          duplicate: true
        };
      }

      const postalResult = await this.detectStorePostalColumn();
      const postalColumn = postalResult?.data || "";
      const builtPayload = this.buildStoreMaintenanceStorePayload(normalizedProjectId, storePayloadInput, {
        includeStoreId: true,
        includeCoordinates: true,
        includeEmptyText: false,
        postalColumn
      });

      if (builtPayload.error) return builtPayload;

      let result = await this.withSupabaseTimeout(
        supabaseClient
          .from("stores")
          .insert(builtPayload.data)
          .select("*")
          .limit(1),
        15000,
        `Adding store ${storePayloadInput.store_id}`
      );

      if (result?.error && postalColumn && this.isMissingColumnError(result.error, postalColumn)) {
        this._storePostalColumnName = null;
        const retryPayload = { ...builtPayload.data };
        delete retryPayload[postalColumn];
        result = await this.withSupabaseTimeout(
          supabaseClient
            .from("stores")
            .insert(retryPayload)
            .select("*")
            .limit(1),
          15000,
          `Adding store ${storePayloadInput.store_id}`
        );
      }

      if (result?.error) {
        if (this.isUniqueViolation(result.error)) {
          const duplicateResult = await this.findStoreByProjectAndStoreId(normalizedProjectId, storePayloadInput.store_id);
          return {
            data: {
              duplicate: true,
              store: duplicateResult?.data?.store || null
            },
            error: null,
            duplicate: true
          };
        }
        return { data: null, error: result.error };
      }

      const inserted = Array.isArray(result.data) ? result.data[0] : result.data;
      return {
        data: {
          duplicate: false,
          store: inserted ? normalizeStoreRecord(inserted) : normalizeStoreRecord(storePayloadInput)
        },
        error: null
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Unable to add store.")
      };
    }
  },

  async updateStoreMetadata(projectId, storeId, payload = {}) {
    try {
      const normalizedProjectId = String(projectId || "").trim();
      const normalizedStoreId = this.normalizeStoreMaintenanceStoreId(storeId);
      if (!normalizedProjectId || !normalizedStoreId) {
        return { data: null, error: new Error("Project ID and Store ID are required.") };
      }

      const normalized = this.normalizeStoreMaintenancePayload({
        ...payload,
        store_id: normalizedStoreId
      });
      if (normalized.error) return normalized;

      const existing = await this.findStoreByProjectAndStoreId(normalizedProjectId, normalizedStoreId);
      if (existing.error) return { data: null, error: existing.error };
      if (!existing.data?.store) {
        return { data: null, error: new Error("Store was not found in this project.") };
      }
      if (existing.data.duplicateCount > 0) {
        return { data: null, error: new Error(`Action blocked: duplicate store rows exist for Store ${normalizedStoreId}. Correct the source data so exactly one store row exists for this project and Store ID before editing metadata.`) };
      }

      const postalResult = await this.detectStorePostalColumn();
      const postalColumn = postalResult?.data || "";
      const includeCoordinates = Object.prototype.hasOwnProperty.call(normalized.data, "lat")
        && Object.prototype.hasOwnProperty.call(normalized.data, "lng");
      const builtPayload = this.buildStoreMaintenanceStorePayload(normalizedProjectId, normalized.data, {
        includeStoreId: false,
        includeCoordinates,
        includeEmptyText: true,
        postalColumn
      });

      if (builtPayload.error) return builtPayload;
      delete builtPayload.data.project_id;
      delete builtPayload.data.store_id;

      if (Object.keys(builtPayload.data).length === 0) {
        return { data: null, error: new Error("No editable store fields were provided.") };
      }

      let result = await this.withSupabaseTimeout(
        supabaseClient
          .from("stores")
          .update(builtPayload.data)
          .eq("project_id", normalizedProjectId)
          .eq("store_id", normalizedStoreId)
          .select("*")
          .limit(1),
        15000,
        `Updating store ${normalizedStoreId}`
      );

      if (result?.error && postalColumn && this.isMissingColumnError(result.error, postalColumn)) {
        this._storePostalColumnName = null;
        const retryPayload = { ...builtPayload.data };
        delete retryPayload[postalColumn];
        result = await this.withSupabaseTimeout(
          supabaseClient
            .from("stores")
            .update(retryPayload)
            .eq("project_id", normalizedProjectId)
            .eq("store_id", normalizedStoreId)
            .select("*")
            .limit(1),
          15000,
          `Updating store ${normalizedStoreId}`
        );
      }

      if (result?.error) return { data: null, error: result.error };
      const updated = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!updated) return { data: null, error: new Error("Store was not found in this project.") };

      return {
        data: {
          store: normalizeStoreRecord(updated)
        },
        error: null
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Unable to update store metadata.")
      };
    }
  },

  async ensureBaselineStoreStatus(projectId, storeId) {
    try {
      const normalizedProjectId = String(projectId || "").trim();
      const normalizedStoreId = this.normalizeStoreMaintenanceStoreId(storeId);
      if (!normalizedProjectId || !normalizedStoreId) {
        return { data: null, error: new Error("Project ID and Store ID are required for baseline status.") };
      }

      let statusRowsResult = await this.withSupabaseTimeout(
        supabaseClient
          .from("store_status")
          .select("project_id,store_id,status_code,completed,closed")
          .eq("project_id", normalizedProjectId)
          .eq("store_id", normalizedStoreId),
        12000,
        `Checking baseline status for ${normalizedStoreId}`
      );

      if (statusRowsResult?.error && this.isMissingColumnError(statusRowsResult.error, "status_code")) {
        statusRowsResult = await this.withSupabaseTimeout(
          supabaseClient
            .from("store_status")
            .select("project_id,store_id,completed,closed")
            .eq("project_id", normalizedProjectId)
            .eq("store_id", normalizedStoreId),
          12000,
          `Checking baseline status for ${normalizedStoreId}`
        );
      }

      if (statusRowsResult?.error) return { data: null, error: statusRowsResult.error };
      const statusRows = Array.isArray(statusRowsResult.data) ? statusRowsResult.data : [];
      if (statusRows.length > 1) {
        return { data: null, error: new Error(`Action blocked: duplicate status rows exist for Store ${normalizedStoreId}. Correct store_status so exactly one status row exists for this project and Store ID before seeding baseline status.`) };
      }

      if (statusRows.length === 1) {
        const existingStatus = typeof getStatusStateFromRow === "function"
          ? getStatusStateFromRow(statusRows[0])
          : {
              status_code: normalizeStatusCode(statusRows[0]?.status_code || deriveLegacyStatusCode(statusRows[0]?.completed === true, statusRows[0]?.closed === true)),
              completed: statusRows[0]?.completed === true,
              closed: statusRows[0]?.closed === true
            };

        return {
          data: {
            store_id: normalizedStoreId,
            status_code: existingStatus.status_code,
            completed: existingStatus.completed === true,
            closed: existingStatus.closed === true,
            alreadyExisted: true
          },
          error: null
        };
      }

      const result = await this.withSupabaseTimeout(
        this.updateStoreStatus(normalizedProjectId, normalizedStoreId, false, false, "active", ""),
        12000,
        `Saving baseline status for ${normalizedStoreId}`
      );

      if (result?.error) return { data: null, error: result.error };

      return {
        data: {
          store_id: normalizedStoreId,
          status_code: "active",
          completed: false,
          closed: false,
          alreadyExisted: statusRows.length === 1
        },
        error: null
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Unable to ensure baseline status.")
      };
    }
  },

  async createManualStoreActivityEvent(projectId, storeId, eventType, metadata = {}) {
    try {
      const normalizedProjectId = String(projectId || "").trim();
      const normalizedStoreId = this.normalizeStoreMaintenanceStoreId(storeId);
      const normalizedEventType = String(eventType || "").trim();
      const allowedTypes = new Set(["store-added", "store-edited", "store-removed", "store-reactivated"]);

      if (!normalizedProjectId || !normalizedStoreId || !allowedTypes.has(normalizedEventType)) {
        return { data: null, error: new Error("A valid manual store activity event is required.") };
      }

      const safeMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? { ...metadata }
        : {};
      safeMetadata.source = "manual_admin";
      if (!safeMetadata.actor_user_id && typeof currentUser !== "undefined" && currentUser?.id) {
        safeMetadata.actor_user_id = currentUser.id;
      }

      return await this.withSupabaseTimeout(
        this.createActivityEvent({
          type: normalizedEventType,
          project_id: normalizedProjectId,
          store_id: normalizedStoreId,
          metadata: safeMetadata,
          created_at: new Date().toISOString()
        }),
        10000,
        `Recording ${normalizedEventType}`
      );
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Unable to record store activity.")
      };
    }
  },

  buildStoreMaintenanceHealthSnapshot(projectId, stores = [], statusRows = []) {
    const normalizedProjectId = String(projectId || "").trim();
    const sourceStores = Array.isArray(stores) ? stores : [];
    const sourceStatuses = Array.isArray(statusRows) ? statusRows : [];

    const storeCounts = new Map();
    const statusCounts = new Map();

    sourceStores.forEach(row => {
      const storeId = this.normalizeStoreMaintenanceStoreId(row?.store_id);
      if (!storeId) return;
      storeCounts.set(storeId, (storeCounts.get(storeId) || 0) + 1);
    });

    sourceStatuses.forEach(row => {
      const storeId = this.normalizeStoreMaintenanceStoreId(row?.store_id);
      if (!storeId) return;
      statusCounts.set(storeId, (statusCounts.get(storeId) || 0) + 1);
    });

    const duplicateStoreIds = Array.from(storeCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([store_id, count]) => ({ store_id, count }));
    const duplicateStatusIds = Array.from(statusCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([store_id, count]) => ({ store_id, count }));

    const missingStatusStores = sourceStores
      .filter(row => {
        const storeId = this.normalizeStoreMaintenanceStoreId(row?.store_id);
        return storeId && !statusCounts.has(storeId);
      })
      .map(row => this.normalizeStoreMaintenanceStoreId(row?.store_id));

    const orphanStatusRows = sourceStatuses
      .filter(row => {
        const storeId = this.normalizeStoreMaintenanceStoreId(row?.store_id);
        return storeId && !storeCounts.has(storeId);
      })
      .map(row => this.normalizeStoreMaintenanceStoreId(row?.store_id));

    const invalidCoordinateStores = sourceStores
      .filter(row => {
        const coordinates = normalizeStoreCoordinatePair(row?.lat, row?.lng);
        return coordinates.lat === null || coordinates.lng === null;
      })
      .map(row => this.normalizeStoreMaintenanceStoreId(row?.store_id));

    const removedStoreIds = sourceStores
      .filter(row => row?.is_removed === true)
      .map(row => this.normalizeStoreMaintenanceStoreId(row?.store_id));

    const counts = {
      missingStatus: missingStatusStores.length,
      orphanStatusRows: orphanStatusRows.length,
      duplicateStores: duplicateStoreIds.length,
      duplicateStatusRows: duplicateStatusIds.length,
      invalidCoordinates: invalidCoordinateStores.length,
      removedStores: removedStoreIds.length
    };

    return {
      projectId: normalizedProjectId,
      generatedAt: new Date().toISOString(),
      counts,
      totalIssueCount: Object.values(counts).reduce((sum, count) => sum + (Number(count) || 0), 0),
      details: {
        missingStatusStores,
        orphanStatusRows,
        duplicateStores: duplicateStoreIds,
        duplicateStatusRows: duplicateStatusIds,
        invalidCoordinateStores,
        removedStoreIds
      }
    };
  },

  async getStoreMaintenanceHealth(projectId) {
    try {
      const normalizedProjectId = String(projectId || "").trim();
      if (!normalizedProjectId) {
        return { data: null, error: new Error("Project ID is required for store maintenance diagnostics.") };
      }

      let storesResult = await this.withSupabaseTimeout(
        supabaseClient
          .from("stores")
          .select("project_id,store_id,lat,lng,is_removed,removed_at")
          .eq("project_id", normalizedProjectId),
        12000,
        "Refreshing store diagnostics"
      );

      if (storesResult?.error && (
        this.isMissingColumnError(storesResult.error, "is_removed")
        || this.isMissingColumnError(storesResult.error, "removed_at")
      )) {
        storesResult = await this.withSupabaseTimeout(
          supabaseClient
            .from("stores")
            .select("project_id,store_id,lat,lng")
            .eq("project_id", normalizedProjectId),
          12000,
          "Refreshing store diagnostics"
        );
      }

      if (storesResult?.error) return { data: null, error: storesResult.error };

      const statusResult = await this.withSupabaseTimeout(
        supabaseClient
          .from("store_status")
          .select("project_id,store_id")
          .eq("project_id", normalizedProjectId),
        12000,
        "Refreshing status diagnostics"
      );

      if (statusResult?.error) return { data: null, error: statusResult.error };

      return {
        data: this.buildStoreMaintenanceHealthSnapshot(
          normalizedProjectId,
          storesResult.data || [],
          statusResult.data || []
        ),
        error: null
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Unable to refresh store maintenance diagnostics.")
      };
    }
  },

  async loadStoresForProject(projectId, projectMeta) {
    if (!isSignedIn()) {
      if (projectMeta && typeof projectMeta === "object") {
        projectMeta.sourceLabel = "Sign in required";
      }
      return [];
    }

    const postalResult = await this.detectStorePostalColumn();
    const postalColumn = postalResult?.data || "";
    const storeSelectColumns = [
      "store_id",
      "store_name",
      "customer_id",
      "lat",
      "lng",
      "full_address",
      "region",
      "territory",
      "state",
      "city",
      "district",
      "division",
      "market",
      "is_removed",
      "removed_at",
      postalColumn
    ].filter(Boolean).join(", ");

    let { data, error } = await supabaseClient
      .from("stores")
      .select(storeSelectColumns)
      .eq("project_id", projectId);

    if (error && postalColumn && this.isMissingColumnError(error, postalColumn)) {
      this._storePostalColumnName = null;
      const retrySelectColumns = storeSelectColumns
        .split(",")
        .map(column => column.trim())
        .filter(column => column && column !== postalColumn)
        .join(", ");
      ({ data, error } = await supabaseClient
        .from("stores")
        .select(retrySelectColumns)
        .eq("project_id", projectId));
    }

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
    const normalizedProjectId = String(projectId || "").trim();
    const normalizedStoreId = String(storeId || "").trim();
    if (!normalizedProjectId || !normalizedStoreId) {
      return { data: null, error: new Error("Project ID and Store ID are required.") };
    }

    const existing = await this.findStoreByProjectAndStoreId(normalizedProjectId, normalizedStoreId);
    if (existing.error) return { data: null, error: existing.error };
    if (!existing.data?.store) {
      return { data: null, error: new Error(`Store ${normalizedStoreId} was not found in this project.`) };
    }
    if (existing.data.duplicateCount > 0) {
      return {
        data: null,
        error: new Error(`Action blocked: duplicate store rows exist for Store ${normalizedStoreId}. Correct the source data so exactly one store row exists for this project and Store ID before lifecycle changes.`)
      };
    }

    const result = await this.withSupabaseTimeout(
      supabaseClient
        .from("stores")
        .update({
          is_removed: isRemoved === true,
          removed_at: isRemoved === true ? new Date().toISOString() : null
        })
        .eq("project_id", normalizedProjectId)
        .eq("store_id", normalizedStoreId)
        .select("project_id,store_id,is_removed,removed_at")
        .limit(1),
      12000,
      isRemoved === true ? `Removing store ${normalizedStoreId}` : `Reactivating store ${normalizedStoreId}`
    );

    if (result?.error) return { data: null, error: result.error };
    const updated = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!updated) {
      return { data: null, error: new Error(`Store ${normalizedStoreId} was not updated. Confirm exactly one matching store row exists.`) };
    }

    return { data: updated, error: null };
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

  shouldFallbackInviteWrite(error) {
    if (!error) return false;
    if (this.isPermissionDeniedError(error)) return false;

    const code = String(error?.code || "").trim().toLowerCase();
    if (code === "42883" || code === "pgrst202") {
      return true;
    }

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
      haystack.includes("create_project_invite_v2") &&
      (
        haystack.includes("does not exist")
        || haystack.includes("could not find")
        || haystack.includes("schema cache")
        || haystack.includes("not found")
      )
    );
  },

  async withSupabaseTimeout(promise, timeoutMs = 12000, actionLabel = "This action") {
    const safeTimeoutMs = Math.max(1, Number(timeoutMs) || 12000);

    let timeoutId = null;
    const timeoutPromise = new Promise(resolve => {
      timeoutId = setTimeout(() => {
        const timeoutError = new Error(`${actionLabel} timed out after ${Math.round(safeTimeoutMs / 1000)}s. Please try again.`);
        timeoutError.name = "TimeoutError";
        timeoutError.code = "ACTION_TIMEOUT";
        resolve({ data: null, error: timeoutError });
      }, safeTimeoutMs);
    });

    try {
      const settled = await Promise.race([
        Promise.resolve(promise).catch(error => ({
          data: null,
          error: error instanceof Error ? error : new Error(String(error?.message || `${actionLabel} failed.`))
        })),
        timeoutPromise
      ]);
      return settled;
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
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

    const existingRowsResult = await supabaseClient
      .from("store_status")
      .select("project_id,store_id")
      .eq("project_id", scopedProjectId)
      .eq("store_id", scopedStoreId);

    if (existingRowsResult.error) return existingRowsResult;

    const existingRows = Array.isArray(existingRowsResult.data) ? existingRowsResult.data : [];
    if (existingRows.length > 1) {
      return {
        data: null,
        error: new Error(`Action blocked: duplicate status rows exist for Store ${scopedStoreId}. Correct store_status so exactly one status row exists for this project and Store ID before updating status.`)
      };
    }

    if (existingRows.length === 0) {
      return await supabaseClient
        .from("store_status")
        .insert(payload)
        .select("project_id,store_id")
        .limit(1);
    }

    const updateResult = await supabaseClient
      .from("store_status")
      .update(updatePayload)
      .eq("project_id", scopedProjectId)
      .eq("store_id", scopedStoreId)
      .select("project_id,store_id")
      .limit(1);

    return updateResult;
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
