/* ================= PROJECTS / HYDRATION ================= */

function getStoreById(storeId, options = {}) {
  const includeRemoved = options.includeRemoved === true;
  const normalizedStoreId = String(storeId);

  return (storeData || []).find(store => {
    if (String(store.store_id) !== normalizedStoreId) return false;
    if (!includeRemoved && store.is_removed === true) return false;
    return true;
  }) || null;
}

function updateProjectLifecycleControls() {
  const removedToggleBtn = document.getElementById("toggleRemovedStoresBtn");
  const archivedToggleBtn = document.getElementById("toggleArchivedProjectsBtn");
  const archiveBtn = document.getElementById("archiveProjectBtn");
  const restoreBtn = document.getElementById("restoreProjectBtn");
  const isCurrentProjectArchived = currentProjectMeta?.is_archived === true;

  if (removedToggleBtn) {
    removedToggleBtn.classList.toggle("hidden", !canManageProjectLifecycle());
    removedToggleBtn.textContent = showRemovedStores ? "Hide Removed Stores" : "Show Removed Stores";
  }

  if (archivedToggleBtn) {
    archivedToggleBtn.classList.toggle("hidden", !canManageProjectLifecycle());
    archivedToggleBtn.textContent = showArchivedProjects ? "Hide Archived Projects" : "Show Archived Projects";
  }

  if (archiveBtn) {
    archiveBtn.classList.toggle("hidden", !canManageProjectLifecycle() || isCurrentProjectArchived);
  }

  if (restoreBtn) {
    restoreBtn.classList.toggle("hidden", !canManageProjectLifecycle() || !isCurrentProjectArchived);
  }
}

function ensureProjectLifecycleControls() {
  const projectPanel = document.querySelector(".panelProject");
  const importLink = document.getElementById("importProjectLink");
  if (!projectPanel || !importLink) return;

  let controls = document.getElementById("projectLifecycleControls");
  if (!controls) {
    controls = document.createElement("div");
    controls.id = "projectLifecycleControls";
    controls.className = "filterGrid";

    const toggleRemovedBtn = document.createElement("button");
    toggleRemovedBtn.id = "toggleRemovedStoresBtn";
    toggleRemovedBtn.type = "button";
    toggleRemovedBtn.className = "btnSecondary";
    toggleRemovedBtn.textContent = "Show Removed Stores";

    const toggleArchivedBtn = document.createElement("button");
    toggleArchivedBtn.id = "toggleArchivedProjectsBtn";
    toggleArchivedBtn.type = "button";
    toggleArchivedBtn.className = "btnSecondary";
    toggleArchivedBtn.textContent = "Show Archived Projects";

    const archiveBtn = document.createElement("button");
    archiveBtn.id = "archiveProjectBtn";
    archiveBtn.type = "button";
    archiveBtn.className = "btnClosed";
    archiveBtn.textContent = "Archive Project";

    const restoreBtn = document.createElement("button");
    restoreBtn.id = "restoreProjectBtn";
    restoreBtn.type = "button";
    restoreBtn.className = "btnComplete";
    restoreBtn.textContent = "Restore Project";

    controls.appendChild(toggleRemovedBtn);
    controls.appendChild(toggleArchivedBtn);
    controls.appendChild(archiveBtn);
    controls.appendChild(restoreBtn);

    importLink.insertAdjacentElement("afterend", controls);
  }

  const toggleRemovedBtn = document.getElementById("toggleRemovedStoresBtn");
  const toggleArchivedBtn = document.getElementById("toggleArchivedProjectsBtn");
  const archiveBtn = document.getElementById("archiveProjectBtn");
  const restoreBtn = document.getElementById("restoreProjectBtn");

  if (toggleRemovedBtn && !toggleRemovedBtn.dataset.bound) {
    toggleRemovedBtn.addEventListener("click", () => {
      if (!canManageProjectLifecycle()) return;
      showRemovedStores = !showRemovedStores;
      updateProjectLifecycleControls();
      handleFilterChange();
      updateProjectSourceTag();
    });
    toggleRemovedBtn.dataset.bound = "true";
  }

  if (toggleArchivedBtn && !toggleArchivedBtn.dataset.bound) {
    toggleArchivedBtn.addEventListener("click", async () => {
      if (!canManageProjectLifecycle()) return;
      showArchivedProjects = !showArchivedProjects;
      updateProjectLifecycleControls();
      await loadProjects();
      await loadActiveProject();
    });
    toggleArchivedBtn.dataset.bound = "true";
  }

  if (archiveBtn && !archiveBtn.dataset.bound) {
    archiveBtn.addEventListener("click", async () => {
      if (!canManageProjectLifecycle()) return;

      const { error } = await dataLayer.updateProjectLifecycle(currentProjectId, true);
      if (error) {
        console.error(error);
        alert(error.message || "Archiving project failed.");
        return;
      }

      await loadProjects();
      await loadActiveProject();
    });
    archiveBtn.dataset.bound = "true";
  }

  if (restoreBtn && !restoreBtn.dataset.bound) {
    restoreBtn.addEventListener("click", async () => {
      if (!canManageProjectLifecycle()) return;

      const { error } = await dataLayer.updateProjectLifecycle(currentProjectId, false);
      if (error) {
        console.error(error);
        alert(error.message || "Restoring project failed.");
        return;
      }

      await loadProjects();
      await loadActiveProject();
    });
    restoreBtn.dataset.bound = "true";
  }

  updateProjectLifecycleControls();
}

async function loadProjects() {
  ensureProjectLifecycleControls();
  bindProjectAdminUI();
  const previousProjectId = currentProjectId;

  const allProjects = await dataLayer.loadProjects();
  const visibleProjects = showArchivedProjects
    ? allProjects
    : allProjects.filter(project => project.is_archived !== true);

  const shouldFilterByMembership = isSignedIn() && !isGlobalAdmin();
  const scopedProjects = shouldFilterByMembership
    ? visibleProjects.filter(project => isProjectSelectableByCurrentUser(project.project_id))
    : visibleProjects;

  projectList = scopedProjects;
  allProjectList = allProjects;

  const hasCurrentProject = projectList.some(project => project.project_id === currentProjectId);
  if (!hasCurrentProject) {
    if (projectList.length > 0) {
      currentProjectId = projectList[0].project_id;
      localStorage.setItem(ACTIVE_PROJECT_KEY, currentProjectId);
    } else {
      currentProjectId = "";
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
  }
  if (previousProjectId !== currentProjectId) {
    setProjectAdminMessage("");
  }

  refreshCurrentProjectRole();

  const select = document.getElementById("projectSelect");
  if (!select) return;

  select.innerHTML = "";
  if (projectList.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = isSignedIn() ? "No assigned projects" : "No projects";
    select.appendChild(option);
    select.value = "";
    select.disabled = true;
  } else {
    select.disabled = false;
    projectList.forEach(project => {
      const option = document.createElement("option");
      option.value = project.project_id;
      option.textContent = project.is_archived === true
        ? `${project.name} (Archived)`
        : project.name;
      select.appendChild(option);
    });
    select.value = currentProjectId;
  }

  updateProjectLifecycleControls();
  await refreshProjectAdminPanel();
}

function bindProjectSelector() {
  const select = document.getElementById("projectSelect");
  if (!select || select.dataset.bound) return;

  select.addEventListener("change", async (e) => {
    setProjectAdminMessage("");
    currentProjectId = e.target.value;
    localStorage.setItem(ACTIVE_PROJECT_KEY, currentProjectId);
    refreshCurrentProjectRole();
    await loadActiveProject();
  });

  select.dataset.bound = "true";
}

async function hydrate() {
  const hydrated = await dataLayer.hydrateProject(currentProjectId, currentProjectMeta);

  allStoreData = (hydrated.stores || []).map(store => ({
    ...normalizeStoreRecord(store),
    is_removed: store?.is_removed === true,
    removed_at: store?.removed_at || null
  }));
  storeData = [...allStoreData];
  statusRowsCache = hydrated.statusRows;
  noteRowsCache = hydrated.noteRows;
  photoRowsCache = hydrated.photoRows;
  activityEventRowsCache = hydrated.activityEventRows;

  persistedStatusStoreIds = new Set(statusRowsCache.map(row => String(row.store_id)));
  statusMap = {};

  if (hydrated.statusError) {
    console.error("Supabase store_status error:", hydrated.statusError);
  }

  statusRowsCache.forEach(row => {
    const key = String(row.store_id);
    statusMap[key] = getStatusStateFromRow(row);
  });

  statusMap = ensureStatusIntegrity(allStoreData, statusMap);

  Object.keys(statusMap).forEach(key => {
    statusMap[key] = {
      ...getStatusState(
        statusMap[key]?.status_code || deriveLegacyStatusCode(statusMap[key]?.completed === true, statusMap[key]?.closed === true),
        statusMap[key]?.status_reason || ""
      ),
      completed: statusMap[key]?.completed === true || normalizeStatusCode(statusMap[key]?.status_code) === "completed",
      closed: statusMap[key]?.closed === true || normalizeStatusCode(statusMap[key]?.status_code) === "closed"
    };
  });

  if (hydrated.noteError) {
    console.error("Supabase store_notes error:", hydrated.noteError);
  }

  if (hydrated.photoError) {
    console.error("Supabase store_photos error:", hydrated.photoError);
  }

  if (hydrated.activityEventError) {
    console.error("Supabase activity_events error:", hydrated.activityEventError);
  }

  currentProjectMeta = {
    ...currentProjectMeta,
    backendKind: String(currentProjectMeta?.sourceLabel || "").toLowerCase().includes("supabase")
      ? "supabase"
      : "fallback"
  };
}

function getHydratedStatusEventType(row) {
  const normalizedStatusCode = normalizeStatusCode(
    row?.status_code,
    row?.completed === true,
    row?.closed === true
  );

  if (normalizedStatusCode === "completed") return "status-completed";
  if (normalizedStatusCode === "closed") return "status-closed";
  if (normalizedStatusCode === "rescheduled") return "status-rescheduled";
  return "status-active";
}

function hasRealActiveTransitionEvidence(row) {
  if (!row) return false;

  const statusReason = String(row.status_reason || "").trim();
  if (statusReason) return true;

  const createdAtValue = getTimestampValue(row.created_at || null);
  const updatedAtValue = getTimestampValue(row.updated_at || null);

  if (createdAtValue > 0 && updatedAtValue > 0 && updatedAtValue > createdAtValue + 1000) {
    return true;
  }

  const explicitFlags = [
    row.user_triggered,
    row.is_user_triggered,
    row.manual_update,
    row.is_manual_update,
    row.explicit_transition,
    row.is_explicit_transition
  ];

  return explicitFlags.some(value => value === true);
}

function isSeededBaselineActiveStatusRow(row) {
  if (!row || getHydratedStatusEventType(row) !== "status-active") {
    return false;
  }

  const seededFlags = [
    row.seeded,
    row.is_seeded,
    row.seeded_by_import,
    row.imported_default,
    row.baseline_active,
    row.is_baseline
  ];

  if (seededFlags.some(value => value === true)) {
    return true;
  }

  return !hasRealActiveTransitionEvidence(row);
}

function buildHydratedStatusEvent(row) {
  const type = getHydratedStatusEventType(row);
  const statusState = getStatusStateFromRow(row);
  const eventTime = row.updated_at || row.created_at || null;

  if (type === "status-active" && isSeededBaselineActiveStatusRow(row)) {
    return null;
  }

  if (type === "status-completed") {
    return {
      type,
      store_id: String(row.store_id),
      timestamp: eventTime,
      title: `✔ Store ${row.store_id} completed`,
      detail: "Status updated"
    };
  }

  if (type === "status-closed") {
    return {
      type,
      store_id: String(row.store_id),
      timestamp: eventTime,
      title: `⚠ Store ${row.store_id} closed`,
      detail: "Status updated"
    };
  }

  if (type === "status-rescheduled") {
    return {
      type,
      store_id: String(row.store_id),
      timestamp: eventTime,
      title: `⟳ Store ${row.store_id} rescheduled`,
      detail: statusState?.status_reason || "Status updated"
    };
  }

  return {
    type,
    store_id: String(row.store_id),
    timestamp: eventTime,
    title: `• Store ${row.store_id} active`,
    detail: statusState?.status_reason || "Status updated"
  };
}

async function hydrateActivityFeed() {
  const events = [];

  const importedEvents = (activityEventRowsCache || [])
    .map(mapActivityEventRow)
    .filter(Boolean);

  events.push(...importedEvents);

  statusRowsCache.forEach(row => {
    const event = buildHydratedStatusEvent(row);
    if (event) {
      events.push(event);
    }
  });

  noteRowsCache.forEach(row => {
    events.push({
      type: "note",
      store_id: String(row.store_id),
      timestamp: row.created_at || null,
      title: `📝 Note added to Store ${row.store_id}`,
      detail: row.note || "Note saved"
    });
  });

  photoRowsCache.forEach(row => {
    events.push({
      type: "photo",
      store_id: String(row.store_id),
      timestamp: row.created_at || null,
      title: `📷 Photo uploaded for Store ${row.store_id}`,
      detail: "Field photo evidence captured"
    });
  });

  activityFeed = events
    .sort((a, b) => getTimestampValue(b.timestamp) - getTimestampValue(a.timestamp))
    .slice(0, 100);

  touchDataRefresh();
}

async function loadActiveProject() {
  ensureProjectLifecycleControls();
  bindProjectAdminUI();
  refreshCurrentProjectRole();

  if (!currentProjectId || projectList.length === 0) {
    currentProjectMeta = {
      project_id: "",
      name: isSignedIn() ? "No Project Access" : "Project Unavailable",
      is_archived: false,
      archived_at: null,
      sourceLabel: isSignedIn() ? "No assigned projects" : "Sign in to view projects"
    };
    allStoreData = [];
    storeData = [];
    statusRowsCache = [];
    noteRowsCache = [];
    photoRowsCache = [];
    activityEventRowsCache = [];
    activityFeed = [];
    statusMap = {};

    if (map.getSource("stores")) {
      rebuildFullMap();
    } else {
      buildMap();
    }

    updateProjectSourceTag();
    updateProjectLifecycleControls();
    updateHeaderDashboard();
    updateScopeSummary();
    updateFilterSummary();
    updateDataHealthPanel();
    setMapModeTags();
    updateIntelRail();
    resetSelectedStorePanel();
    updateActivityList();
    renderRouteStops();
    updateRouteModeUI();
    updateMapViewportForMode();
    resetPhotoLibraryDetail();
    renderPhotoLibrary();
    updateWorkspaceViewUI();
    await refreshProjectAdminPanel();
    return;
  }

  currentProjectMeta = projectList.find(project => project.project_id === currentProjectId) || {
    project_id: currentProjectId,
    name: currentProjectId,
    is_archived: false,
    archived_at: null,
    store_file: `data/${currentProjectId}/stores_with_coords.json`
  };

  currentSelectedStoreId = null;
  currentPhotoLibrarySelection = null;

  restoreFilterState();
  await hydrate();
  await hydrateActivityFeed();
  restoreRouteState();
  populateFilterOptions();

  if (map.getSource("stores")) {
    rebuildFullMap();
  } else {
    buildMap();
  }

  updateProjectSourceTag();
  updateProjectLifecycleControls();
  updateHeaderDashboard();
  updateScopeSummary();
  updateFilterSummary();
  updateDataHealthPanel();
  setMapModeTags();
  updateIntelRail();
  resetSelectedStorePanel();
  updateActivityList();
  renderRouteStops();
  updateRouteModeUI();
  updateMapViewportForMode();
  resetPhotoLibraryDetail();
  renderPhotoLibrary();
  updateWorkspaceViewUI();

  if (typeof bindSnapshotExportUI === "function") {
    bindSnapshotExportUI();
  }


  if (currentModalStoreId) {
    currentModalStoreId = null;
    clearPhotoUI();
  }

  await refreshProjectAdminPanel();
}

function updateProjectSourceTag() {
  const sourceLabel = currentProjectMeta?.sourceLabel || "Project ready";
  const archiveLabel = currentProjectMeta?.is_archived === true ? " • Archived" : "";
  const removalLabel = showRemovedStores === true ? " • Removed Visible" : "";
  const updatedLabel = lastDataRefreshAt ? ` • Updated ${formatLastUpdated(lastDataRefreshAt)}` : "";
  const text = `${currentProjectMeta?.name || currentProjectId} · ${sourceLabel}${archiveLabel}${removalLabel}${updatedLabel}`;

  setText("projectSourceTag", text);
  setText("projectSourceTagInline", `${sourceLabel}${archiveLabel}`);
}

async function refreshProjectAccessAfterAuthChange() {
  await loadProjects();
  await loadActiveProject();
}

async function refreshAccessAfterMembershipMutation() {
  if (typeof reloadCurrentUserAccessAndProjectScope === "function") {
    await reloadCurrentUserAccessAndProjectScope();
    return;
  }

  refreshCurrentProjectRole();
  updateAuthUI();
  updateWriteAccessUI();
  await refreshProjectAccessAfterAuthChange();
}

const PROJECT_ROLE_OPTIONS = ["viewer", "editor", "admin"];
let projectAdminMessageClearTimer = null;
const ADMIN_ACTION_COOLDOWN_MS = 250;

function isProjectSelectableByCurrentUser(projectId) {
  return canAccessProject(projectId);
}

function getProjectAdminRoleOptions(selectedRole) {
  return PROJECT_ROLE_OPTIONS
    .map(role => `<option value="${role}"${role === selectedRole ? " selected" : ""}>${role}</option>`)
    .join("");
}

function createRoleBadge(role) {
  const badge = document.createElement("span");
  badge.className = "adminRoleBadge";
  badge.textContent = normalizeProjectRole(role);
  return badge;
}

function flashAdminActionRowFeedback(actionTarget, variant = "success") {
  const row = actionTarget?.closest?.(".adminMemberRow, .adminInviteRowItem");
  if (!row) return;

  const successClass = "adminRowFeedbackSuccess";
  const errorClass = "adminRowFeedbackError";

  row.classList.remove(successClass, errorClass);
  row.classList.add(variant === "error" ? errorClass : successClass);

  setTimeout(() => {
    row.classList.remove(successClass, errorClass);
  }, 700);
}

function logAuditEvent(type, payload = {}) {
  try {
    const createdAt = new Date().toISOString();
    const metadata = payload.metadata && typeof payload.metadata === "object"
      ? { ...payload.metadata }
      : {};
    const projectId = String(payload.project_id || currentProjectId || "").trim();
    const event = {
      type,
      project_id: projectId,
      actor_user_id: String(payload.actor_user_id || currentUser?.id || "").trim() || null,
      target_user_id: payload.target_user_id ? String(payload.target_user_id).trim() : undefined,
      invite_id: payload.invite_id ? String(payload.invite_id).trim() : undefined,
      metadata,
      timestamp: createdAt
    };
    const activityEvent = {
      type,
      store_id: null,
      project_id: projectId,
      metadata: {
        ...metadata,
        actor_user_id: event.actor_user_id,
        target_user_id: event.target_user_id || null,
        invite_id: event.invite_id || null
      },
      created_at: createdAt
    };

    console.log("[audit]", event);

    if (!activityEvent.project_id || !dataLayer?.createActivityEvent) {
      return;
    }

    Promise.resolve()
      .then(() => dataLayer.createActivityEvent(activityEvent))
      .then(result => {
        if (result?.error) {
          console.warn("Audit activity event persistence failed:", result.error);
          return;
        }

        const insertedRow = Array.isArray(result?.data) ? result.data[0] : result?.data;
        const activityRow = insertedRow && typeof insertedRow === "object"
          ? insertedRow
          : {
              event_type: activityEvent.type,
              store_id: null,
              project_id: activityEvent.project_id,
              payload: activityEvent.metadata,
              created_at: activityEvent.created_at
            };

        activityEventRowsCache = [activityRow, ...(Array.isArray(activityEventRowsCache) ? activityEventRowsCache : [])];

        hydrateActivityFeed()
          .then(() => updateActivityList())
          .catch(error => {
            console.warn("Audit activity feed refresh failed:", error);
          });
      })
      .catch(error => {
        console.warn("Audit activity event persistence failed:", error);
      });
  } catch (error) {
    console.warn("Audit log event failed:", error);
  }
}

function setProjectAdminMessage(message, type = "info") {
  const inviteMessage = document.getElementById("projectAdminMessage");
  if (!inviteMessage) return;
  if (projectAdminMessageClearTimer) {
    clearTimeout(projectAdminMessageClearTimer);
    projectAdminMessageClearTimer = null;
  }

  inviteMessage.textContent = message || "";
  inviteMessage.style.color = "";
  inviteMessage.style.fontWeight = "600";
  inviteMessage.style.padding = message ? "8px 10px" : "";
  inviteMessage.style.borderRadius = message ? "8px" : "";
  inviteMessage.style.border = "";
  inviteMessage.style.background = "";

  if (type === "success") {
    inviteMessage.style.color = "#8bd3a8";
    inviteMessage.style.border = "1px solid rgba(139,211,168,0.45)";
    inviteMessage.style.background = "rgba(31, 64, 48, 0.48)";
    projectAdminMessageClearTimer = setTimeout(() => {
      if (inviteMessage.textContent === message) {
        inviteMessage.textContent = "";
        inviteMessage.style.color = "";
        inviteMessage.style.fontWeight = "";
        inviteMessage.style.padding = "";
        inviteMessage.style.borderRadius = "";
        inviteMessage.style.border = "";
        inviteMessage.style.background = "";
      }
      projectAdminMessageClearTimer = null;
    }, 3600);
    return;
  }

  if (type === "error") {
    inviteMessage.style.color = "#ffd1d1";
    inviteMessage.style.border = "1px solid rgba(255, 119, 119, 0.56)";
    inviteMessage.style.background = "rgba(82, 20, 20, 0.48)";
    return;
  }

  if (!message) {
    inviteMessage.style.fontWeight = "";
    inviteMessage.style.padding = "";
    inviteMessage.style.borderRadius = "";
  }
}

async function refreshProjectAdminPanel() {
  const panel = document.getElementById("projectAdminPanel");
  const membersList = document.getElementById("projectMembersList");
  const membersEmpty = document.getElementById("projectMembersEmpty");
  const invitesList = document.getElementById("projectInvitesList");
  const invitesEmpty = document.getElementById("projectInvitesEmpty");
  const inviteEmailInput = document.getElementById("projectInviteEmail");
  const inviteRoleSelect = document.getElementById("projectInviteRole");
  const inviteSendBtn = document.getElementById("projectInviteSendBtn");
  const inviteMessage = document.getElementById("projectAdminMessage");

  if (!panel || !membersList || !membersEmpty || !invitesList || !invitesEmpty) return;

  const canManage = isSignedIn() && canManageProjectLifecycle() && !!currentProjectId;
  panel.classList.toggle("hidden", !canManage);
  if (!canManage) return;

  if (inviteEmailInput) inviteEmailInput.disabled = false;
  if (inviteRoleSelect) inviteRoleSelect.disabled = false;
  if (inviteSendBtn && inviteSendBtn.dataset.loading !== "true") inviteSendBtn.disabled = false;
  if (inviteMessage && !inviteMessage.textContent) inviteMessage.textContent = "";

  membersList.innerHTML = "";
  invitesList.innerHTML = "";
  const membersHeader = document.createElement("div");
  membersHeader.className = "copy";
  membersHeader.style.fontWeight = "700";
  membersHeader.style.marginBottom = "6px";
  membersHeader.textContent = "Project Members (...)";
  membersList.appendChild(membersHeader);

  const invitesHeader = document.createElement("div");
  invitesHeader.className = "copy";
  invitesHeader.style.fontWeight = "700";
  invitesHeader.style.marginBottom = "6px";
  invitesHeader.textContent = "Pending Invites (...)";
  invitesList.appendChild(invitesHeader);

  membersEmpty.classList.remove("hidden");
  invitesEmpty.classList.remove("hidden");
  membersEmpty.textContent = "Loading...";
  invitesEmpty.textContent = "Loading...";

  const [membersResult, invitesResult] = await Promise.all([
    dataLayer.loadProjectMembers(currentProjectId),
    dataLayer.loadProjectInvites(currentProjectId)
  ]);

  const members = Array.isArray(membersResult.data) ? membersResult.data : [];
  const invites = Array.isArray(invitesResult.data) ? invitesResult.data : [];

  if (!membersResult.error && Array.isArray(members) && members.length > 0) {
    members.forEach(member => {
      const userId = String(member?.user_id || "").trim();
      const email = String(member?.email || "").trim();
      if (!userId || !email) return;
      profileEmailByUserId[userId] = email;
    });
  }

  membersHeader.textContent = `Project Members (${members.length})`;
  invitesHeader.textContent = `Pending Invites (${invites.length})`;

  if (membersResult.error) {
    membersEmpty.classList.remove("hidden");
    membersEmpty.textContent = membersResult.error.message || "Unable to load project members.";
  } else if (members.length === 0) {
    membersEmpty.classList.remove("hidden");
    membersEmpty.textContent = "No members yet";
  } else {
    membersEmpty.classList.add("hidden");
    members.forEach(member => {
      const userId = String(member.user_id || "").trim();
      const role = normalizeProjectRole(member.role);
      const email = String(member.email || "").trim() || userId || "Unknown user";

      const row = document.createElement("div");
      row.className = "copy";
      row.classList.add("adminMemberRow");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "1fr auto auto auto";
      row.style.gap = "8px";
      row.style.alignItems = "center";
      row.style.padding = "8px 0";
      row.style.borderBottom = "1px solid rgba(255,255,255,.08)";

      const label = document.createElement("div");
      label.className = "adminRowLabel";
      label.style.display = "inline-flex";
      label.style.alignItems = "center";
      label.style.gap = "6px";
      label.textContent = email;
      label.style.fontWeight = "600";
      label.title = `User ID: ${userId || "unknown"}`;
      label.appendChild(createRoleBadge(role));

      const roleSelect = document.createElement("select");
      roleSelect.className = "adminRoleSelect";
      roleSelect.innerHTML = getProjectAdminRoleOptions(role);
      roleSelect.dataset.projectId = currentProjectId;
      roleSelect.dataset.userId = userId;
      roleSelect.dataset.action = "member-role-select";
      roleSelect.style.minWidth = "110px";

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btnSecondary";
      saveBtn.classList.add("adminRowActionBtn");
      saveBtn.textContent = "Save";
      saveBtn.dataset.projectId = currentProjectId;
      saveBtn.dataset.userId = userId;
      saveBtn.dataset.action = "save-member-role";

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btnClosed";
      removeBtn.classList.add("adminRowActionBtn");
      removeBtn.textContent = "Remove";
      removeBtn.dataset.projectId = currentProjectId;
      removeBtn.dataset.userId = userId;
      removeBtn.dataset.action = "remove-member";

      row.appendChild(label);
      row.appendChild(roleSelect);
      row.appendChild(saveBtn);
      row.appendChild(removeBtn);
      membersList.appendChild(row);
    });
  }

  if (invitesResult.error) {
    invitesEmpty.classList.remove("hidden");
    invitesEmpty.textContent = invitesResult.error.message || "Unable to load pending invites.";
  } else if (invites.length === 0) {
    invitesEmpty.classList.remove("hidden");
    invitesEmpty.textContent = "No pending invites";
  } else {
    invitesEmpty.classList.add("hidden");
    invites.forEach(invite => {
      const inviteId = String(invite.id || "").trim();
      const email = String(invite.email || "").trim() || "Unknown email";
      const role = normalizeProjectRole(invite.role);

      const row = document.createElement("div");
      row.className = "copy";
      row.classList.add("adminInviteRowItem");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "1fr auto";
      row.style.gap = "8px";
      row.style.alignItems = "center";
      row.style.padding = "8px 0";
      row.style.borderBottom = "1px solid rgba(255,255,255,.08)";

      const label = document.createElement("div");
      label.className = "adminRowLabel";
      label.style.display = "inline-flex";
      label.style.alignItems = "center";
      label.style.gap = "6px";
      label.textContent = `${email}`;
      label.style.fontWeight = "600";
      label.title = inviteId ? `Invite ID: ${inviteId}` : "";
      label.appendChild(createRoleBadge(role));

      const revokeBtn = document.createElement("button");
      revokeBtn.type = "button";
      revokeBtn.className = "btnSecondary";
      revokeBtn.classList.add("adminRowActionBtn");
      revokeBtn.textContent = "Revoke";
      revokeBtn.dataset.inviteId = inviteId;
      revokeBtn.dataset.action = "revoke-invite";
      revokeBtn.disabled = !inviteId;

      row.appendChild(label);
      row.appendChild(revokeBtn);
      invitesList.appendChild(row);
    });
  }
}

function bindProjectAdminUI() {
  const inviteSendBtn = document.getElementById("projectInviteSendBtn");
  const inviteEmailInput = document.getElementById("projectInviteEmail");
  const inviteRoleSelect = document.getElementById("projectInviteRole");
  const inviteMessage = document.getElementById("projectAdminMessage");

  if (inviteSendBtn && !inviteSendBtn.dataset.bound) {
    inviteSendBtn.addEventListener("click", async () => {
      if (!isSignedIn() || !canManageProjectLifecycle() || !currentProjectId) return;
      if (inviteSendBtn.dataset.loading === "true") return;
      setProjectAdminMessage("");

      const email = String(inviteEmailInput?.value || "").trim().toLowerCase();
      const role = normalizeProjectRole(inviteRoleSelect?.value || "viewer");

      if (!email) {
        setProjectAdminMessage("Invite email is required.", "error");
        return;
      }

      inviteSendBtn.dataset.loading = "true";
      inviteSendBtn.disabled = true;
      const originalLabel = inviteSendBtn.textContent;
      inviteSendBtn.textContent = "Sending…";
      if (inviteEmailInput) inviteEmailInput.disabled = true;
      if (inviteRoleSelect) inviteRoleSelect.disabled = true;

      try {
        const result = await dataLayer.createProjectInvite(currentProjectId, email, role, currentUser?.id || null);
        if (result.error) {
          setProjectAdminMessage(result.error.message || "Unable to send invite.", "error");
          return;
        }

        logAuditEvent("invite_sent", {
          project_id: currentProjectId,
          actor_user_id: currentUser?.id || null,
          invite_id: result?.data?.id || null,
          metadata: {
            email,
            role
          }
        });

        if (inviteEmailInput) inviteEmailInput.value = "";
        setProjectAdminMessage(`Invite sent to ${email} as ${role}.`, "success");
        await refreshProjectAdminPanel();
      } finally {
        await new Promise(resolve => setTimeout(resolve, ADMIN_ACTION_COOLDOWN_MS));
        inviteSendBtn.dataset.loading = "false";
        inviteSendBtn.disabled = false;
        inviteSendBtn.textContent = originalLabel || "Send Invite";
        if (inviteEmailInput) inviteEmailInput.disabled = false;
        if (inviteRoleSelect) inviteRoleSelect.disabled = false;
      }
    });
    inviteSendBtn.dataset.bound = "true";
  }

  if (document.body && !document.body.dataset.projectAdminBound) {
    document.body.addEventListener("click", async event => {
      const target = event.target?.closest?.("[data-action]");
      if (!target || !isSignedIn() || !canManageProjectLifecycle() || !currentProjectId) return;

      const action = target.dataset.action;
      if (action === "save-member-role") {
        const userId = String(target.dataset.userId || "").trim();
        if (!userId) return;
        if (target.dataset.loading === "true") return;
        setProjectAdminMessage("");

        const select = document.querySelector(
          `[data-action='member-role-select'][data-user-id='${userId}'][data-project-id='${currentProjectId}']`
        );
        const role = normalizeProjectRole(select?.value || "viewer");
        const targetEmail = profileEmailByUserId[userId] || "member";
        const originalLabel = target.textContent;
        target.dataset.loading = "true";
        target.disabled = true;
        target.textContent = "Saving…";
        if (select) select.disabled = true;

        let error = null;
        try {
          ({ error } = await dataLayer.updateProjectMembershipRole(currentProjectId, userId, role));
        } finally {
          await new Promise(resolve => setTimeout(resolve, ADMIN_ACTION_COOLDOWN_MS));
          target.dataset.loading = "false";
          target.disabled = false;
          target.textContent = originalLabel || "Save";
          if (select) select.disabled = false;
        }

        setProjectAdminMessage(
          error ? (error.message || "Unable to update role.") : `Role updated for ${targetEmail}.`,
          error ? "error" : "success"
        );
        flashAdminActionRowFeedback(target, error ? "error" : "success");
        if (!error) {
          logAuditEvent("member_role_updated", {
            project_id: currentProjectId,
            actor_user_id: currentUser?.id || null,
            target_user_id: userId,
            metadata: {
              role
            }
          });
          target.disabled = true;
          target.textContent = "✓ Saved";
          await new Promise(resolve => setTimeout(resolve, 900));
          await refreshAccessAfterMembershipMutation();
        }
        await refreshProjectAdminPanel();
        return;
      }

      if (action === "remove-member") {
        const userId = String(target.dataset.userId || "").trim();
        if (!userId) return;
        if (target.dataset.loading === "true") return;
        setProjectAdminMessage("");
        if (!window.confirm("Remove this member from the project?")) return;

        const originalLabel = target.textContent;
        target.dataset.loading = "true";
        target.disabled = true;
        target.textContent = "Removing…";
        let error = null;
        try {
          ({ error } = await dataLayer.removeProjectMembership(currentProjectId, userId));
        } finally {
          await new Promise(resolve => setTimeout(resolve, ADMIN_ACTION_COOLDOWN_MS));
          target.dataset.loading = "false";
          target.disabled = false;
          target.textContent = originalLabel || "Remove";
        }

        setProjectAdminMessage(
          error ? (error.message || "Unable to remove member.") : `Member removed (${profileEmailByUserId[userId] || userId}).`,
          error ? "error" : "success"
        );
        flashAdminActionRowFeedback(target, error ? "error" : "success");
        if (!error) {
          logAuditEvent("member_removed", {
            project_id: currentProjectId,
            actor_user_id: currentUser?.id || null,
            target_user_id: userId,
            metadata: {}
          });
          target.disabled = true;
          target.textContent = "✓ Removed";
          await new Promise(resolve => setTimeout(resolve, 900));
          await refreshAccessAfterMembershipMutation();
        }
        await refreshProjectAdminPanel();
        return;
      }

      if (action === "revoke-invite") {
        const inviteId = String(target.dataset.inviteId || "").trim();
        if (!inviteId) return;
        if (target.dataset.loading === "true") return;
        setProjectAdminMessage("");
        if (!window.confirm("Revoke this pending invite?")) return;

        const originalLabel = target.textContent;
        target.dataset.loading = "true";
        target.disabled = true;
        target.textContent = "Revoking…";
        let error = null;
        try {
          ({ error } = await dataLayer.revokeProjectInvite(inviteId));
        } finally {
          await new Promise(resolve => setTimeout(resolve, ADMIN_ACTION_COOLDOWN_MS));
          target.dataset.loading = "false";
          target.disabled = false;
          target.textContent = originalLabel || "Revoke";
        }

        setProjectAdminMessage(
          error ? (error.message || "Unable to revoke invite.") : "Pending invite revoked.",
          error ? "error" : "success"
        );
        flashAdminActionRowFeedback(target, error ? "error" : "success");
        if (!error) {
          logAuditEvent("invite_revoked", {
            project_id: currentProjectId,
            actor_user_id: currentUser?.id || null,
            invite_id: inviteId,
            metadata: {}
          });
          target.disabled = true;
          target.textContent = "✓ Revoked";
          await new Promise(resolve => setTimeout(resolve, 900));
          await refreshAccessAfterMembershipMutation();
        }
        await refreshProjectAdminPanel();
      }
    });

    document.body.dataset.projectAdminBound = "true";
  }
}
