/* ================= PROJECTS / HYDRATION ================= */
let activeProjectHydrationToken = 0;
let projectSwitchHighlightTimer = null;
const DEFAULT_PROJECT_ACCENT_HEX = "#c8102e";
const DEFAULT_PROJECT_ACCENT_RGB = "200, 16, 46";

function normalizeProjectBrandColor(value) {
  const input = String(value || "").trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(input)) return "";

  if (input.length === 4) {
    const r = input[1];
    const g = input[2];
    const b = input[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  return input.toLowerCase();
}

function getHexRgbTriplet(hexColor) {
  const normalized = normalizeProjectBrandColor(hexColor);
  if (!normalized) return DEFAULT_PROJECT_ACCENT_RGB;

  const hex = normalized.slice(1);
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);

  if (![red, green, blue].every(Number.isFinite)) return DEFAULT_PROJECT_ACCENT_RGB;
  return `${red}, ${green}, ${blue}`;
}

function normalizeProjectBrandLogoUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) {
    return raw;
  }

  try {
    const parsed = new URL(raw, window.location.origin);
    const protocol = parsed.protocol.toLowerCase();
    if (!["http:", "https:", "data:", "blob:"].includes(protocol)) return "";
    return parsed.href;
  } catch (_) {
    return "";
  }
}

function applyProjectBranding(projectMeta = currentProjectMeta) {
  const rootStyle = document.documentElement?.style;
  if (!rootStyle) return;

  const brandColor = normalizeProjectBrandColor(projectMeta?.brand_color) || DEFAULT_PROJECT_ACCENT_HEX;
  const brandColorRgb = getHexRgbTriplet(brandColor);
  const logoUrl = normalizeProjectBrandLogoUrl(projectMeta?.brand_logo_url);
  const projectName = String(projectMeta?.name || projectMeta?.project_id || "Project").trim();

  rootStyle.setProperty("--project-accent", brandColor);
  rootStyle.setProperty("--project-accent-rgb", brandColorRgb);

  const headerLogoEl = document.getElementById("projectBrandLogoHeader");
  if (headerLogoEl) {
    const defaultHeaderLogoSrc = String(headerLogoEl.dataset.defaultSrc || "").trim();
    const defaultHeaderLogoAlt = String(headerLogoEl.dataset.defaultAlt || "Project logo").trim();

    if (logoUrl) {
      headerLogoEl.src = logoUrl;
      headerLogoEl.alt = `${projectName} logo`;
      headerLogoEl.classList.add("is-project-logo");
      headerLogoEl.classList.remove("hidden");
      headerLogoEl.onerror = () => {
        if (!defaultHeaderLogoSrc) return;
        headerLogoEl.src = defaultHeaderLogoSrc;
        headerLogoEl.alt = defaultHeaderLogoAlt;
        headerLogoEl.classList.remove("is-project-logo");
        headerLogoEl.onerror = null;
      };
    } else if (defaultHeaderLogoSrc) {
      headerLogoEl.src = defaultHeaderLogoSrc;
      headerLogoEl.alt = defaultHeaderLogoAlt;
      headerLogoEl.classList.remove("is-project-logo");
      headerLogoEl.classList.remove("hidden");
      headerLogoEl.onerror = null;
    } else {
      headerLogoEl.removeAttribute("src");
      headerLogoEl.alt = "";
      headerLogoEl.classList.remove("is-project-logo");
      headerLogoEl.classList.add("hidden");
      headerLogoEl.onerror = null;
    }
  }

  const adminLogoEl = document.getElementById("projectBrandLogoAdmin");
  if (adminLogoEl) {
    if (!logoUrl) {
      adminLogoEl.removeAttribute("src");
      adminLogoEl.alt = "";
      adminLogoEl.classList.add("hidden");
    } else {
      adminLogoEl.src = logoUrl;
      adminLogoEl.alt = `${projectName} logo`;
      adminLogoEl.classList.remove("hidden");
    }
  }
}

function setProjectHydrationVisualState(isHydrating, nextProjectName = "") {
  document.body?.classList.toggle("project-is-refreshing", Boolean(isHydrating));

  const nameEl = document.getElementById("dashboardProjectName");
  const sublineEl = document.getElementById("dashboardProjectSubline");
  const statusEl = document.getElementById("headerOperationalSummary");

  if (isHydrating) {
    if (nameEl) {
      if (nextProjectName) {
        nameEl.textContent = nextProjectName;
      }
      nameEl.classList.add("is-project-switching");
    }
    if (sublineEl && nextProjectName) {
      sublineEl.textContent = `Refreshing project context • ${nextProjectName}`;
    }
    if (statusEl) {
      statusEl.textContent = "Refreshing project…";
    }
    return;
  }

  if (nameEl) {
    nameEl.classList.remove("is-project-switching");
  }
}

function flashProjectSwitchIndicator() {
  const nameEl = document.getElementById("dashboardProjectName");
  if (!nameEl) return;

  nameEl.classList.remove("project-switch-flash");
  // Force a reflow so repeated project switches retrigger the animation reliably.
  void nameEl.offsetWidth;
  nameEl.classList.add("project-switch-flash");

  if (projectSwitchHighlightTimer) {
    clearTimeout(projectSwitchHighlightTimer);
  }

  projectSwitchHighlightTimer = setTimeout(() => {
    nameEl.classList.remove("project-switch-flash");
    projectSwitchHighlightTimer = null;
  }, 1500);
}

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
    if (typeof persistFilterState === "function") {
      persistFilterState();
    }
    if (typeof persistCurrentProjectMapViewport === "function") {
      persistCurrentProjectMapViewport();
    }
    const selectedOption = e.target?.selectedOptions?.[0];
    const selectedName = String(selectedOption?.textContent || "").replace(/\s+\(Archived\)\s*$/i, "").trim();
    updateAdminPanelHeaderContext({ canManage: canManageProjectLifecycle(), isRefreshing: true, projectNameOverride: selectedName });
    setProjectHydrationVisualState(true, selectedName);
    currentProjectId = e.target.value;
    localStorage.setItem(ACTIVE_PROJECT_KEY, currentProjectId);
    applyProjectBranding(projectList.find(project => project.project_id === currentProjectId) || null);
    refreshCurrentProjectRole();
    await loadActiveProject();
  });

  select.dataset.bound = "true";
}

async function hydrate(projectIdOverride = currentProjectId, hydrationToken = null) {
  const scopedProjectId = String(projectIdOverride || currentProjectId || "").trim();
  const hydrated = await dataLayer.hydrateProject(scopedProjectId, currentProjectMeta);

  const tokenIsStale = hydrationToken !== null && hydrationToken !== activeProjectHydrationToken;
  const projectChanged = String(currentProjectId || "").trim() !== scopedProjectId;

  if (tokenIsStale || projectChanged) {
    return { stale: true };
  }

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

  return { stale: false };
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
  const scopedProjectId = String(currentProjectId || "").trim();
  const hydrationToken = ++activeProjectHydrationToken;
  setProjectHydrationVisualState(true, currentProjectMeta?.name || scopedProjectId || "No project selected");

  if (!scopedProjectId || projectList.length === 0) {
    currentProjectMeta = {
      project_id: "",
      name: isSignedIn() ? "No Project Access" : "Project Unavailable",
      is_archived: false,
      archived_at: null,
      sourceLabel: isSignedIn() ? "No assigned projects" : "Sign in to view projects",
      brand_color: "",
      brand_logo_url: ""
    };
    applyProjectBranding(currentProjectMeta);
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
    if (typeof restoreMapViewportForProject === "function") {
      const restored = restoreMapViewportForProject(scopedProjectId, { animate: false });
      if (!restored) updateMapViewportForMode();
    } else {
      updateMapViewportForMode();
    }
    resetPhotoLibraryDetail();
    renderPhotoLibrary();
    updateWorkspaceViewUI();
    setProjectHydrationVisualState(false);
    flashProjectSwitchIndicator();
    await refreshProjectAdminPanel();
    return;
  }

  currentProjectMeta = projectList.find(project => project.project_id === scopedProjectId) || {
    project_id: scopedProjectId,
    name: scopedProjectId,
    is_archived: false,
    archived_at: null,
    brand_color: "",
    brand_logo_url: "",
    store_file: `data/${scopedProjectId}/stores_with_coords.json`
  };
  applyProjectBranding(currentProjectMeta);

  currentSelectedStoreId = null;
  currentPhotoLibrarySelection = null;

  restoreFilterState();
  const hydrateResult = await hydrate(scopedProjectId, hydrationToken);
  if (hydrateResult?.stale) {
    setProjectHydrationVisualState(false);
    return;
  }
  await hydrateActivityFeed();
  if (hydrationToken !== activeProjectHydrationToken || String(currentProjectId || "").trim() !== scopedProjectId) {
    setProjectHydrationVisualState(false);
    return;
  }
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
  if (typeof restoreMapViewportForProject === "function") {
    const restored = restoreMapViewportForProject(scopedProjectId, { animate: false });
    if (!restored) updateMapViewportForMode();
  } else {
    updateMapViewportForMode();
  }
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

  if (hydrationToken !== activeProjectHydrationToken || String(currentProjectId || "").trim() !== scopedProjectId) {
    setProjectHydrationVisualState(false);
    return;
  }
  setProjectHydrationVisualState(false);
  flashProjectSwitchIndicator();
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
const PROJECT_BRANDING_SAVE_TIMEOUT_MS = 14000;
const PROJECT_BRANDING_UNAVAILABLE_MESSAGE = "Branding storage is not available yet for this environment. Other admin actions still work.";
const projectBrandingUnavailableByProjectId = {};
const PROJECT_ROLE_DISPLAY_META = {
  viewer: { label: "Viewer", hint: "read-only" },
  editor: { label: "Editor", hint: "can update" },
  admin: { label: "Admin", hint: "manages access" }
};

function isProjectSelectableByCurrentUser(projectId) {
  return canAccessProject(projectId);
}

function getProjectAdminRoleOptions(selectedRole) {
  return PROJECT_ROLE_OPTIONS
    .map(role => {
      const meta = PROJECT_ROLE_DISPLAY_META[role] || { label: role, hint: "" };
      const optionLabel = meta.hint ? `${meta.label} (${meta.hint})` : meta.label;
      return `<option value="${role}"${role === selectedRole ? " selected" : ""}>${optionLabel}</option>`;
    })
    .join("");
}

function createRoleBadge(role) {
  const badge = document.createElement("span");
  const normalizedRole = normalizeProjectRole(role);
  const roleMeta = PROJECT_ROLE_DISPLAY_META[normalizedRole] || { label: normalizedRole, hint: "" };
  badge.className = "adminRoleBadge";
  badge.dataset.role = normalizedRole;
  badge.textContent = roleMeta.label;
  badge.title = roleMeta.hint ? `${roleMeta.label}: ${roleMeta.hint}` : roleMeta.label;
  return badge;
}

function markProjectBrandingUnavailable(projectId, isUnavailable) {
  const scopedProjectId = String(projectId || "").trim();
  if (!scopedProjectId) return;
  projectBrandingUnavailableByProjectId[scopedProjectId] = isUnavailable === true;
}

function isProjectBrandingUnavailable(projectId) {
  const scopedProjectId = String(projectId || "").trim();
  if (!scopedProjectId) return false;
  return projectBrandingUnavailableByProjectId[scopedProjectId] === true;
}

function shouldRestoreAdminActionControls(scopedProjectId) {
  const normalizedCurrentProjectId = String(currentProjectId || "").trim();
  const normalizedScopedProjectId = String(scopedProjectId || "").trim();
  const hasMatchingProject = normalizedCurrentProjectId && normalizedCurrentProjectId === normalizedScopedProjectId;
  return Boolean(
    isSignedIn()
    && canManageProjectLifecycle()
    && hasMatchingProject
  );
}

function normalizeActionError(error, fallbackMessage) {
  if (!error) return null;
  if (error instanceof Error) return error;
  const message = String(error?.message || fallbackMessage || "Action failed.").trim();
  return new Error(message || fallbackMessage || "Action failed.");
}

function createActionTimeoutError(actionLabel, timeoutMs) {
  const seconds = Math.max(1, Math.round(Number(timeoutMs || 0) / 1000));
  const error = new Error(`${actionLabel || "This action"} timed out after ${seconds}s. Please try again.`);
  error.name = "TimeoutError";
  error.code = "ACTION_TIMEOUT";
  return error;
}

function withTimeout(promise, timeoutMs, timeoutErrorFactory) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const safeTimeoutMs = Math.max(1, Number(timeoutMs) || 1);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const timeoutError = typeof timeoutErrorFactory === "function"
        ? timeoutErrorFactory()
        : createActionTimeoutError("This action", safeTimeoutMs);
      reject(timeoutError);
    }, safeTimeoutMs);

    Promise.resolve(promise).then(
      value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function getBrandingSaveErrorMessage(error) {
  if (!error) return "Unable to save branding.";

  const baseMessage = String(error.message || "").trim();
  const normalizedCode = String(error.code || error.error_code || "").trim();
  const detail = String(error.details || error.detail || "").trim();
  const hint = String(error.hint || "").trim();
  const status = String(error.status || error.statusCode || "").trim();

  if (normalizedCode === "ACTION_TIMEOUT") {
    return baseMessage || "Saving branding timed out. Please try again.";
  }

  const details = [];
  if (status) details.push(`status ${status}`);
  if (normalizedCode) details.push(`code ${normalizedCode}`);
  if (detail) details.push(detail);
  if (hint) details.push(`Hint: ${hint}`);

  const lead = baseMessage || "Unable to save branding.";
  return details.length > 0 ? `${lead} (${details.join(" • ")})` : lead;
}

function updateAdminPanelHeaderContext({ canManage = false, isRefreshing = false, projectNameOverride = "", brandingUnavailable = false } = {}) {
  const projectNameEl = document.getElementById("adminPanelProjectName");
  const helperTextEl = document.getElementById("adminPanelHelperText");
  const shell = document.querySelector("#projectAdminPanel .adminPanelShell");

  const hasProject = !!String(currentProjectId || "").trim();
  const projectName = String(
    projectNameOverride
      || currentProjectMeta?.name
      || currentProjectId
      || (isSignedIn() ? "No project selected" : "Sign in required")
  ).trim();

  if (projectNameEl) {
    projectNameEl.textContent = projectName || "No project selected";
  }

  if (helperTextEl) {
    if (isRefreshing && hasProject) {
      helperTextEl.textContent = "Refreshing admin details for this project…";
    } else if (canManage && brandingUnavailable) {
      helperTextEl.textContent = "Branding fields are unavailable in this backend schema. Invite and member actions remain active.";
    } else if (canManage) {
      helperTextEl.textContent = "Manage invites and roles for this current project.";
    } else if (!hasProject) {
      helperTextEl.textContent = "No manageable project selected. Choose a project to continue.";
    } else {
      helperTextEl.textContent = "You can view this project, but admin role is required for access management.";
    }
  }

  if (shell) {
    shell.classList.toggle("is-refreshing", isRefreshing);
  }
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

function syncProjectLogoLibrarySelectFromManifest(selectEl, logoUrlValue) {
  if (!selectEl) return;
  if (typeof window.syncProjectLogoLibrarySelectFromManifest !== "function") return;
  window.syncProjectLogoLibrarySelectFromManifest(selectEl, logoUrlValue);
}

async function refreshProjectAdminPanel() {
  const panel = document.getElementById("projectAdminPanel");
  const actions = document.getElementById("projectAdminActions");
  const inactiveState = document.getElementById("projectAdminInactiveState");
  const inactiveText = document.getElementById("projectAdminInactiveText");
  const membersList = document.getElementById("projectMembersList");
  const membersEmpty = document.getElementById("projectMembersEmpty");
  const invitesList = document.getElementById("projectInvitesList");
  const invitesEmpty = document.getElementById("projectInvitesEmpty");
  const inviteTargetInput = document.getElementById("projectInviteTarget");
  const inviteTargetTypeSelect = document.getElementById("projectInviteTargetType");
  const inviteRoleSelect = document.getElementById("projectInviteRole");
  const inviteSendBtn = document.getElementById("projectInviteSendBtn");
  const brandColorInput = document.getElementById("projectBrandColorInput");
  const brandLogoUrlInput = document.getElementById("projectBrandLogoUrlInput");
  const logoLibrarySelect = document.getElementById("projectBrandLogoLibrarySelect");
  const brandingSaveBtn = document.getElementById("projectBrandingSaveBtn");
  const inviteMessage = document.getElementById("projectAdminMessage");

  if (!panel || !membersList || !membersEmpty || !invitesList || !invitesEmpty) return;

  const hasProject = !!String(currentProjectId || "").trim();
  const canManage = isSignedIn() && canManageProjectLifecycle() && hasProject;
  if (canManage && typeof dataLayer?.isProjectBrandingStorageAvailable === "function") {
    markProjectBrandingUnavailable(currentProjectId, !dataLayer.isProjectBrandingStorageAvailable());
  }
  const brandingUnavailable = canManage && isProjectBrandingUnavailable(currentProjectId);
  const normalizedBrandColor = normalizeProjectBrandColor(currentProjectMeta?.brand_color) || DEFAULT_PROJECT_ACCENT_HEX;
  const normalizedBrandLogoUrl = normalizeProjectBrandLogoUrl(currentProjectMeta?.brand_logo_url);

  panel.classList.remove("hidden");
  actions?.classList.toggle("hidden", !canManage);
  inactiveState?.classList.toggle("hidden", canManage);
  updateAdminPanelHeaderContext({ canManage, isRefreshing: false, brandingUnavailable });

  if (brandColorInput) {
    brandColorInput.value = normalizedBrandColor;
    brandColorInput.disabled = !canManage || brandingUnavailable;
  }
  if (brandLogoUrlInput) {
    brandLogoUrlInput.value = normalizedBrandLogoUrl;
    brandLogoUrlInput.disabled = !canManage || brandingUnavailable;
  }
  if (logoLibrarySelect) {
    syncProjectLogoLibrarySelectFromManifest(logoLibrarySelect, normalizedBrandLogoUrl);
    logoLibrarySelect.disabled = !canManage || brandingUnavailable;
  }
  if (brandingSaveBtn) {
    brandingSaveBtn.disabled = !canManage || brandingUnavailable || brandingSaveBtn.dataset.loading === "true";
  }

  if (!canManage) {
    if (inactiveText) {
      if (!isSignedIn()) {
        inactiveText.textContent = "Sign in and select a manageable project to manage members and invites.";
      } else if (!hasProject) {
        inactiveText.textContent = "No manageable project selected. Pick a project you can manage to access admin actions.";
      } else {
        inactiveText.textContent = "You do not have project admin access for this project. Switch to a manageable project.";
      }
    }

    if (inviteTargetInput) inviteTargetInput.disabled = true;
    if (inviteTargetTypeSelect) inviteTargetTypeSelect.disabled = true;
    if (inviteRoleSelect) inviteRoleSelect.disabled = true;
    if (inviteSendBtn) inviteSendBtn.disabled = true;
    if (typeof refreshOrgOversightPanel === "function") {
      await refreshOrgOversightPanel();
    }
    return;
  }

  if (inviteTargetInput) inviteTargetInput.disabled = false;
  if (inviteTargetTypeSelect) inviteTargetTypeSelect.disabled = false;
  if (inviteRoleSelect) inviteRoleSelect.disabled = false;
  if (inviteSendBtn && inviteSendBtn.dataset.loading !== "true") inviteSendBtn.disabled = false;
  if (inviteMessage) {
    if (brandingUnavailable) {
      setProjectAdminMessage(PROJECT_BRANDING_UNAVAILABLE_MESSAGE, "info");
    } else if (!inviteMessage.textContent) {
      inviteMessage.textContent = "";
    }
  }

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
  updateAdminPanelHeaderContext({ canManage: true, isRefreshing: true });

  let membersResult;
  let invitesResult;
  try {
    [membersResult, invitesResult] = await Promise.all([
      dataLayer.loadProjectMembers(currentProjectId),
      dataLayer.loadProjectInvites(currentProjectId)
    ]);
  } finally {
    updateAdminPanelHeaderContext({ canManage: true, isRefreshing: false });
  }

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
      const targetType = String(invite.invite_target_type || (invite.phone ? "phone" : "email")).trim().toLowerCase() === "phone"
        ? "phone"
        : "email";
      const targetValue = targetType === "phone"
        ? String(invite.phone || invite.target_phone || "").trim()
        : String(invite.email || invite.target_email || "").trim();
      const role = normalizeProjectRole(invite.role);

      const row = document.createElement("div");
      row.className = "copy";
      row.classList.add("adminInviteRowItem");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "1fr auto auto";
      row.style.gap = "8px";
      row.style.alignItems = "center";
      row.style.padding = "8px 0";
      row.style.borderBottom = "1px solid rgba(255,255,255,.08)";

      const label = document.createElement("div");
      label.className = "adminRowLabel";
      label.style.display = "inline-flex";
      label.style.alignItems = "center";
      label.style.gap = "6px";
      const targetLabel = targetValue || (targetType === "phone" ? "Unknown phone" : "Unknown email");
      label.textContent = `${targetLabel}`;
      label.style.fontWeight = "600";
      label.title = inviteId ? `Invite ID: ${inviteId}` : "";
      label.dataset.targetType = targetType;
      label.appendChild(createRoleBadge(role));

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "btnSecondary";
      copyBtn.classList.add("adminRowActionBtn");
      copyBtn.textContent = targetType === "phone" ? "Copy Share" : "Copy";
      copyBtn.dataset.action = "copy-invite-target";
      copyBtn.dataset.targetValue = targetLabel;
      copyBtn.dataset.targetType = targetType;

      const revokeBtn = document.createElement("button");
      revokeBtn.type = "button";
      revokeBtn.className = "btnSecondary";
      revokeBtn.classList.add("adminRowActionBtn");
      revokeBtn.textContent = "Revoke";
      revokeBtn.dataset.inviteId = inviteId;
      revokeBtn.dataset.action = "revoke-invite";
      revokeBtn.disabled = !inviteId;

      row.appendChild(label);
      row.appendChild(copyBtn);
      row.appendChild(revokeBtn);
      invitesList.appendChild(row);
    });
  }

  if (typeof refreshOrgOversightPanel === "function") {
    await refreshOrgOversightPanel();
  }
}

function bindProjectAdminUI() {
  const inviteSendBtn = document.getElementById("projectInviteSendBtn");
  const inviteTargetInput = document.getElementById("projectInviteTarget");
  const inviteTargetTypeSelect = document.getElementById("projectInviteTargetType");
  const inviteRoleSelect = document.getElementById("projectInviteRole");
  const brandColorInput = document.getElementById("projectBrandColorInput");
  const brandLogoUrlInput = document.getElementById("projectBrandLogoUrlInput");
  const logoLibrarySelect = document.getElementById("projectBrandLogoLibrarySelect");
  const brandingSaveBtn = document.getElementById("projectBrandingSaveBtn");
  const inviteMessage = document.getElementById("projectAdminMessage");

  if (logoLibrarySelect && typeof window.refreshProjectLogoLibrarySelectFromManifest === "function") {
    window.refreshProjectLogoLibrarySelectFromManifest(logoLibrarySelect, brandLogoUrlInput);
  }

  if (inviteSendBtn && !inviteSendBtn.dataset.bound) {
    inviteSendBtn.addEventListener("click", async () => {
      if (!isSignedIn() || !canManageProjectLifecycle() || !currentProjectId) return;
      if (inviteSendBtn.dataset.loading === "true") return;
      setProjectAdminMessage("");
      const scopedProjectId = String(currentProjectId || "").trim();

      const inviteTargetType = String(inviteTargetTypeSelect?.value || detectInviteTargetType(inviteTargetInput?.value || "email")).trim().toLowerCase() === "phone"
        ? "phone"
        : "email";
      const inviteTargetRaw = String(inviteTargetInput?.value || "").trim();
      const inviteTargetValue = inviteTargetType === "phone"
        ? normalizePhoneForStorage(inviteTargetRaw)
        : inviteTargetRaw.toLowerCase();
      const role = normalizeProjectRole(inviteRoleSelect?.value || "viewer");

      if (!inviteTargetValue) {
        setProjectAdminMessage(inviteTargetType === "phone" ? "Invite phone is required." : "Invite email is required.", "error");
        return;
      }
      if (inviteTargetType === "email" && !isLikelyEmail(inviteTargetValue)) {
        setProjectAdminMessage("Enter a valid invite email.", "error");
        return;
      }
      if (inviteTargetType === "phone") {
        const phoneDigits = inviteTargetValue.replace(/\D/g, "");
        if (phoneDigits.length < 8 || phoneDigits.length > 15) {
          setProjectAdminMessage("Enter a valid invite phone.", "error");
          return;
        }
      }

      inviteSendBtn.dataset.loading = "true";
      inviteSendBtn.disabled = true;
      const originalLabel = inviteSendBtn.textContent;
      inviteSendBtn.textContent = "Sending…";
      if (inviteTargetInput) inviteTargetInput.disabled = true;
      if (inviteTargetTypeSelect) inviteTargetTypeSelect.disabled = true;
      if (inviteRoleSelect) inviteRoleSelect.disabled = true;

      try {
        let result;
        try {
          result = await dataLayer.createProjectInvite({
            projectId: scopedProjectId,
            targetType: inviteTargetType,
            targetValue: inviteTargetValue,
            role,
            invitedBy: currentUser?.id || null
          });
        } catch (error) {
          result = { data: null, error: normalizeActionError(error, "Unable to send invite.") };
        }
        if (result.error) {
          setProjectAdminMessage(result.error.message || "Unable to send invite.", "error");
          return;
        }

        logAuditEvent("invite_sent", {
          project_id: currentProjectId,
          actor_user_id: currentUser?.id || null,
          invite_id: result?.data?.id || null,
          metadata: {
            target_type: inviteTargetType,
            invite_target: inviteTargetValue,
            role
          }
        });

        if (inviteTargetInput) inviteTargetInput.value = "";
        if (inviteTargetType === "phone") {
          setProjectAdminMessage(`Phone invite recorded for ${inviteTargetValue}. Share this invite manually via SMS or chat.`, "success");
        } else {
          setProjectAdminMessage(`Invite sent to ${inviteTargetValue} as ${role}.`, "success");
        }
        await refreshProjectAdminPanel();
      } finally {
        await new Promise(resolve => setTimeout(resolve, ADMIN_ACTION_COOLDOWN_MS));
        inviteSendBtn.dataset.loading = "false";
        const shouldEnable = shouldRestoreAdminActionControls(scopedProjectId);
        inviteSendBtn.disabled = !shouldEnable;
        inviteSendBtn.textContent = originalLabel || "Send Invite";
        if (inviteTargetInput) inviteTargetInput.disabled = !shouldEnable;
        if (inviteTargetTypeSelect) inviteTargetTypeSelect.disabled = !shouldEnable;
        if (inviteRoleSelect) inviteRoleSelect.disabled = !shouldEnable;
      }
    });
    inviteSendBtn.dataset.bound = "true";
  }

  if (brandingSaveBtn && !brandingSaveBtn.dataset.bound) {
    brandingSaveBtn.addEventListener("click", async () => {
      if (!isSignedIn() || !canManageProjectLifecycle() || !currentProjectId) return;
      if (isProjectBrandingUnavailable(currentProjectId)) {
        setProjectAdminMessage(PROJECT_BRANDING_UNAVAILABLE_MESSAGE, "info");
        return;
      }
      if (brandingSaveBtn.dataset.loading === "true") return;
      setProjectAdminMessage("");
      const scopedProjectId = String(currentProjectId || "").trim();

      const enteredColor = String(brandColorInput?.value || "").trim();
      const enteredLogoUrl = String(brandLogoUrlInput?.value || "").trim();
      const normalizedColor = normalizeProjectBrandColor(enteredColor);
      const normalizedLogoUrl = normalizeProjectBrandLogoUrl(enteredLogoUrl);

      if (!normalizedColor) {
        setProjectAdminMessage("Enter a valid hex color.", "error");
        return;
      }
      if (enteredLogoUrl && !normalizedLogoUrl) {
        setProjectAdminMessage("Enter a valid logo URL.", "error");
        return;
      }

      const originalLabel = brandingSaveBtn.textContent;
      brandingSaveBtn.dataset.loading = "true";
      brandingSaveBtn.disabled = true;
      brandingSaveBtn.textContent = "Saving…";
      if (brandColorInput) brandColorInput.disabled = true;
      if (brandLogoUrlInput) brandLogoUrlInput.disabled = true;
      if (logoLibrarySelect) logoLibrarySelect.disabled = true;

      try {
        let result;
        try {
          result = await withTimeout(
            dataLayer.updateProjectBranding(
              scopedProjectId,
              normalizedColor,
              normalizedLogoUrl || null
            ),
            PROJECT_BRANDING_SAVE_TIMEOUT_MS,
            () => createActionTimeoutError("Saving branding", PROJECT_BRANDING_SAVE_TIMEOUT_MS)
          );
        } catch (error) {
          result = { data: null, error: normalizeActionError(error, "Unable to save branding."), brandingUnavailable: false };
        }

        if (result?.brandingUnavailable) {
          markProjectBrandingUnavailable(scopedProjectId, true);
          setProjectAdminMessage(
            String(result?.brandingMessage || PROJECT_BRANDING_UNAVAILABLE_MESSAGE),
            "info"
          );
          await refreshProjectAdminPanel();
          return;
        }

        if (result?.error) {
          markProjectBrandingUnavailable(scopedProjectId, false);
          setProjectAdminMessage(getBrandingSaveErrorMessage(result.error), "error");
          return;
        }
        markProjectBrandingUnavailable(scopedProjectId, false);

        currentProjectMeta = {
          ...currentProjectMeta,
          brand_color: normalizedColor,
          brand_logo_url: normalizedLogoUrl
        };

        projectList = (projectList || []).map(project => (
          project.project_id === currentProjectId
            ? { ...project, brand_color: normalizedColor, brand_logo_url: normalizedLogoUrl }
            : project
        ));
        allProjectList = (allProjectList || []).map(project => (
          project.project_id === currentProjectId
            ? { ...project, brand_color: normalizedColor, brand_logo_url: normalizedLogoUrl }
            : project
        ));

        applyProjectBranding(currentProjectMeta);
        setProjectAdminMessage("Project branding updated.", "success");
      } finally {
        await new Promise(resolve => setTimeout(resolve, ADMIN_ACTION_COOLDOWN_MS));
        brandingSaveBtn.dataset.loading = "false";
        const shouldEnableBranding = shouldRestoreAdminActionControls(scopedProjectId) && !isProjectBrandingUnavailable(scopedProjectId);
        brandingSaveBtn.disabled = !shouldEnableBranding;
        brandingSaveBtn.textContent = originalLabel || "Save Branding";
        if (brandColorInput) brandColorInput.disabled = !shouldEnableBranding;
        if (brandLogoUrlInput) brandLogoUrlInput.disabled = !shouldEnableBranding;
        if (logoLibrarySelect) logoLibrarySelect.disabled = !shouldEnableBranding;
      }
    });
    brandingSaveBtn.dataset.bound = "true";
  }

  if (logoLibrarySelect && !logoLibrarySelect.dataset.bound) {
    logoLibrarySelect.addEventListener("change", () => {
      const selectedLogoPath = String(logoLibrarySelect.value || "").trim();
      if (!selectedLogoPath || !brandLogoUrlInput) return;
      brandLogoUrlInput.value = selectedLogoPath;
      brandLogoUrlInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    logoLibrarySelect.dataset.bound = "true";
  }

  if (brandLogoUrlInput && !brandLogoUrlInput.dataset.logoLibraryBound) {
    brandLogoUrlInput.addEventListener("input", () => {
      syncProjectLogoLibrarySelectFromManifest(logoLibrarySelect, brandLogoUrlInput.value);
    });
    brandLogoUrlInput.dataset.logoLibraryBound = "true";
  }

  if (document.body && !document.body.dataset.projectAdminBound) {
    document.body.addEventListener("click", async event => {
      const target = event.target?.closest?.("[data-action]");
      if (!target || !isSignedIn() || !canManageProjectLifecycle() || !currentProjectId) return;

      const action = target.dataset.action;
      if (action === "save-member-role") {
        const scopedProjectId = String(currentProjectId || "").trim();
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
          ({ error } = await dataLayer.updateProjectMembershipRole(scopedProjectId, userId, role));
        } catch (caughtError) {
          error = normalizeActionError(caughtError, "Unable to update role.");
        } finally {
          await new Promise(resolve => setTimeout(resolve, ADMIN_ACTION_COOLDOWN_MS));
          target.dataset.loading = "false";
          target.disabled = !shouldRestoreAdminActionControls(scopedProjectId);
          target.textContent = originalLabel || "Save";
          if (select) select.disabled = !shouldRestoreAdminActionControls(scopedProjectId);
        }

        if (!shouldRestoreAdminActionControls(scopedProjectId)) {
          return;
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
        const scopedProjectId = String(currentProjectId || "").trim();
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
          ({ error } = await dataLayer.removeProjectMembership(scopedProjectId, userId));
        } catch (caughtError) {
          error = normalizeActionError(caughtError, "Unable to remove member.");
        } finally {
          await new Promise(resolve => setTimeout(resolve, ADMIN_ACTION_COOLDOWN_MS));
          target.dataset.loading = "false";
          target.disabled = !shouldRestoreAdminActionControls(scopedProjectId);
          target.textContent = originalLabel || "Remove";
        }

        if (!shouldRestoreAdminActionControls(scopedProjectId)) {
          return;
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
        const scopedProjectId = String(currentProjectId || "").trim();
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
        } catch (caughtError) {
          error = normalizeActionError(caughtError, "Unable to revoke invite.");
        } finally {
          await new Promise(resolve => setTimeout(resolve, ADMIN_ACTION_COOLDOWN_MS));
          target.dataset.loading = "false";
          target.disabled = !shouldRestoreAdminActionControls(scopedProjectId);
          target.textContent = originalLabel || "Revoke";
        }

        if (!shouldRestoreAdminActionControls(scopedProjectId)) {
          return;
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
        return;
      }

      if (action === "copy-invite-target") {
        const targetValue = String(target.dataset.targetValue || "").trim();
        if (!targetValue) return;
        const targetType = String(target.dataset.targetType || "").trim();
        const originalLabel = target.textContent;
        try {
          if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(targetValue);
            setProjectAdminMessage(
              targetType === "phone"
                ? "Phone invite copied. Share it via your SMS app."
                : "Invite email copied.",
              "success"
            );
          } else {
            setProjectAdminMessage("Clipboard is unavailable on this device.", "error");
          }
        } catch (error) {
          setProjectAdminMessage("Unable to copy invite target.", "error");
        } finally {
          target.textContent = "Copied";
          setTimeout(() => {
            target.textContent = originalLabel || (targetType === "phone" ? "Copy Share" : "Copy");
          }, 900);
        }
      }
    });

    document.body.dataset.projectAdminBound = "true";
  }
}
