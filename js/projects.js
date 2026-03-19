/* ================= PROJECTS / HYDRATION ================= */

function projectArchiveToggleKey() {
  return "showArchivedProjects";
}

function removedStoresToggleKey() {
  return `showRemovedStores:${currentProjectId}`;
}

function isProjectArchived(project) {
  return project?.is_archived === true;
}

function isStoreRemoved(store) {
  return store?.is_removed === true;
}

function canManageProjectLifecycle() {
  return isAdmin() && currentProjectMeta?.sourceLabel === "Supabase";
}

function canManageStoreLifecycle() {
  return isAdmin() && currentProjectMeta?.sourceLabel === "Supabase";
}

function getStoreById(storeId, { includeRemoved = false } = {}) {
  const source = includeRemoved ? allStoreData : storeData;
  return source.find(store => String(store.store_id) === String(storeId)) || null;
}

function persistArchiveToggleState() {
  localStorage.setItem(projectArchiveToggleKey(), showArchivedProjects ? "true" : "false");
}

function restoreArchiveToggleState() {
  showArchivedProjects = localStorage.getItem(projectArchiveToggleKey()) === "true";
}

function persistRemovedStoresToggleState() {
  localStorage.setItem(removedStoresToggleKey(), showRemovedStores ? "true" : "false");
}

function restoreRemovedStoresToggleState() {
  showRemovedStores = localStorage.getItem(removedStoresToggleKey()) === "true";
}

function shouldShowProjectInSelector(project) {
  return !isProjectArchived(project) || showArchivedProjects || project.project_id === currentProjectId;
}

function applyStoreVisibility() {
  storeData = (Array.isArray(allStoreData) ? allStoreData : []).filter(store =>
    showRemovedStores || !isStoreRemoved(store)
  );

  if (currentSelectedStoreId && !storeData.some(store => String(store.store_id) === String(currentSelectedStoreId))) {
    currentSelectedStoreId = null;
  }

  selectedRouteStops = selectedRouteStops.filter(storeId =>
    storeData.some(store => String(store.store_id) === String(storeId))
  );
}

function refreshOperationalViews() {
  populateFilterOptions();

  if (map.getSource("stores")) {
    rebuildFullMap();
  }

  updateProjectSourceTag();
  updateHeaderDashboard();
  updateScopeSummary();
  updateFilterSummary();
  updateDataHealthPanel();
  setMapModeTags();
  updateIntelRail();
  updateActivityList();
  renderRouteStops();
  updateRouteModeUI();
  updateMapViewportForMode();
  renderPhotoLibrary();
  updateWorkspaceViewUI();

  if (!currentSelectedStoreId) {
    resetSelectedStorePanel();
  }
}

function ensureProjectAdminUI() {
  const projectPanel = document.querySelector(".panelProject");
  if (!projectPanel) return;

  if (!document.getElementById("showArchivedProjectsWrap")) {
    const archivedWrap = document.createElement("label");
    archivedWrap.id = "showArchivedProjectsWrap";
    archivedWrap.className = "routeToggleLabel";
    archivedWrap.style.display = "inline-flex";
    archivedWrap.style.marginTop = "12px";

    const archivedToggle = document.createElement("input");
    archivedToggle.type = "checkbox";
    archivedToggle.id = "showArchivedProjectsToggle";

    const archivedLabel = document.createElement("span");
    archivedLabel.textContent = "Show Archived Projects";

    archivedWrap.appendChild(archivedToggle);
    archivedWrap.appendChild(archivedLabel);

    const importLink = document.getElementById("importProjectLink");
    if (importLink) {
      projectPanel.insertBefore(archivedWrap, importLink);
    } else {
      projectPanel.appendChild(archivedWrap);
    }

    archivedToggle.addEventListener("change", async () => {
      showArchivedProjects = archivedToggle.checked;
      persistArchiveToggleState();
      await loadProjects();
      updateProjectArchiveUI();
    });
  }

  if (!document.getElementById("showRemovedStoresWrap")) {
    const removedWrap = document.createElement("label");
    removedWrap.id = "showRemovedStoresWrap";
    removedWrap.className = "routeToggleLabel";
    removedWrap.style.display = "inline-flex";
    removedWrap.style.marginTop = "10px";

    const removedToggle = document.createElement("input");
    removedToggle.type = "checkbox";
    removedToggle.id = "showRemovedStoresToggle";

    const removedLabel = document.createElement("span");
    removedLabel.textContent = "Show Removed Stores";

    removedWrap.appendChild(removedToggle);
    removedWrap.appendChild(removedLabel);

    const anchor = document.getElementById("showArchivedProjectsWrap");
    if (anchor?.nextSibling) {
      projectPanel.insertBefore(removedWrap, anchor.nextSibling);
    } else if (anchor) {
      projectPanel.appendChild(removedWrap);
    } else {
      projectPanel.appendChild(removedWrap);
    }

    removedToggle.addEventListener("change", () => {
      showRemovedStores = removedToggle.checked;
      persistRemovedStoresToggleState();
      applyStoreVisibility();
      restoreRouteState();
      refreshOperationalViews();
    });
  }

  if (!document.getElementById("projectArchiveStatus")) {
    const status = document.createElement("div");
    status.id = "projectArchiveStatus";
    status.className = "projectSourceTag";
    projectPanel.appendChild(status);
  }

  if (!document.getElementById("projectArchiveBtn")) {
    const button = document.createElement("button");
    button.id = "projectArchiveBtn";
    button.type = "button";
    button.className = "btnSecondary";
    button.addEventListener("click", async () => {
      if (isProjectArchived(currentProjectMeta)) {
        await restoreCurrentProject();
      } else {
        await archiveCurrentProject();
      }
    });
    projectPanel.appendChild(button);
  }
}

function updateProjectArchiveUI() {
  ensureProjectAdminUI();

  const archivedToggle = document.getElementById("showArchivedProjectsToggle");
  const removedToggle = document.getElementById("showRemovedStoresToggle");
  const archiveBtn = document.getElementById("projectArchiveBtn");
  const archiveStatus = document.getElementById("projectArchiveStatus");

  if (archivedToggle) archivedToggle.checked = showArchivedProjects;
  if (removedToggle) removedToggle.checked = showRemovedStores;

  if (archiveBtn) {
    archiveBtn.textContent = isProjectArchived(currentProjectMeta) ? "Restore Project" : "Archive Project";
    archiveBtn.disabled = !canManageProjectLifecycle();
  }

  if (archiveStatus) {
    archiveStatus.textContent = isProjectArchived(currentProjectMeta)
      ? `Archived project${currentProjectMeta?.archived_at ? ` • ${formatActivityTime(currentProjectMeta.archived_at)}` : ""}`
      : "Project active";
  }
}

async function fetchProjectArchiveMetadata(projectIds) {
  const ids = (Array.isArray(projectIds) ? projectIds : []).filter(Boolean);
  if (ids.length === 0) return new Map();

  try {
    const { data, error } = await supabaseClient
      .from("projects")
      .select("project_id, is_archived, archived_at")
      .in("project_id", ids);

    if (error) throw error;

    return new Map(
      (Array.isArray(data) ? data : []).map(row => [
        String(row.project_id),
        {
          is_archived: row.is_archived === true,
          archived_at: row.archived_at || null
        }
      ])
    );
  } catch (error) {
    console.warn("Project archive metadata unavailable:", error);
    return new Map();
  }
}

async function fetchRemovedStoreMetadata(projectId, storeIds) {
  const ids = (Array.isArray(storeIds) ? storeIds : []).filter(Boolean);
  if (ids.length === 0 || currentProjectMeta?.sourceLabel !== "Supabase") {
    return new Map();
  }

  try {
    const { data, error } = await supabaseClient
      .from("stores")
      .select("store_id, is_removed, removed_at")
      .eq("project_id", projectId)
      .in("store_id", ids);

    if (error) throw error;

    return new Map(
      (Array.isArray(data) ? data : []).map(row => [
        String(row.store_id),
        {
          is_removed: row.is_removed === true,
          removed_at: row.removed_at || null
        }
      ])
    );
  } catch (error) {
    console.warn("Store removal metadata unavailable:", error);
    return new Map();
  }
}

async function setCurrentProjectArchivedState(nextArchived) {
  if (!canManageProjectLifecycle()) {
    alert("Project archive controls are only available for admin users on Supabase-backed projects.");
    return;
  }

  const nextArchivedAt = nextArchived ? new Date().toISOString() : null;

  try {
    const { error } = await supabaseClient
      .from("projects")
      .update({
        is_archived: nextArchived,
        archived_at: nextArchivedAt
      })
      .eq("project_id", currentProjectId);

    if (error) throw error;
  } catch (error) {
    console.error(error);
    alert(error.message || "Project archive update failed.");
    return;
  }

  if (nextArchived) {
    showArchivedProjects = true;
    persistArchiveToggleState();
  }

  allProjectList = allProjectList.map(project =>
    project.project_id === currentProjectId
      ? { ...project, is_archived: nextArchived, archived_at: nextArchivedAt }
      : project
  );

  currentProjectMeta = {
    ...currentProjectMeta,
    is_archived: nextArchived,
    archived_at: nextArchivedAt
  };

  touchDataRefresh();

  prependActivity({
    type: nextArchived ? "project-archived" : "project-restored",
    project_id: currentProjectId,
    store_id: "",
    timestamp: new Date().toISOString(),
    title: nextArchived
      ? `🗂 Project ${currentProjectMeta?.name || currentProjectId} archived`
      : `📂 Project ${currentProjectMeta?.name || currentProjectId} restored`,
    detail: nextArchived ? "Archived project hidden from default selector." : "Archived project returned to active selector."
  });

  await loadProjects();
  updateProjectSourceTag();
  updateProjectArchiveUI();
  updateHeaderDashboard();
  updateActivityList();
}

async function archiveCurrentProject() {
  if (!confirm(`Archive project "${currentProjectMeta?.name || currentProjectId}"? This will hide it from the default selector but keep all data intact.`)) {
    return;
  }

  await setCurrentProjectArchivedState(true);
}

async function restoreCurrentProject() {
  if (!confirm(`Restore project "${currentProjectMeta?.name || currentProjectId}"?`)) {
    return;
  }

  await setCurrentProjectArchivedState(false);
}

async function loadProjects() {
  ensureProjectAdminUI();
  restoreArchiveToggleState();

  const loadedProjects = await dataLayer.loadProjects();
  const archiveMeta = await fetchProjectArchiveMetadata(loadedProjects.map(project => project.project_id));

  allProjectList = loadedProjects.map(project => {
    const meta = archiveMeta.get(String(project.project_id)) || {};
    return {
      ...project,
      is_archived: meta.is_archived === true,
      archived_at: meta.archived_at || null
    };
  });

  if (!allProjectList.some(project => project.project_id === currentProjectId) && allProjectList.length > 0) {
    currentProjectId = allProjectList[0].project_id;
    localStorage.setItem(ACTIVE_PROJECT_KEY, currentProjectId);
  }

  projectList = allProjectList.filter(shouldShowProjectInSelector);

  if (!projectList.some(project => project.project_id === currentProjectId) && projectList.length > 0) {
    currentProjectId = projectList[0].project_id;
    localStorage.setItem(ACTIVE_PROJECT_KEY, currentProjectId);
  }

  const select = document.getElementById("projectSelect");
  if (!select) return;

  select.innerHTML = "";
  projectList.forEach(project => {
    const option = document.createElement("option");
    option.value = project.project_id;
    option.textContent = isProjectArchived(project) ? `${project.name} [Archived]` : project.name;
    select.appendChild(option);
  });

  select.value = currentProjectId;
  updateProjectArchiveUI();
}

function bindProjectSelector() {
  ensureProjectAdminUI();

  const select = document.getElementById("projectSelect");
  if (!select || select.dataset.bound) return;

  select.addEventListener("change", async (e) => {
    currentProjectId = e.target.value;
    localStorage.setItem(ACTIVE_PROJECT_KEY, currentProjectId);
    mobileExecutiveSummaryExpanded = false;
    showRemovedStores = false;
    persistRemovedStoresToggleState();
    await loadActiveProject();
  });

  select.dataset.bound = "true";
}

async function hydrate() {
  const hydrated = await dataLayer.hydrateProject(currentProjectId, currentProjectMeta);

  statusRowsCache = hydrated.statusRows;
  noteRowsCache = hydrated.noteRows;
  photoRowsCache = hydrated.photoRows;
  activityEventRowsCache = hydrated.activityEventRows;

  persistedStatusStoreIds = new Set(statusRowsCache.map(row => String(row.store_id)));
  statusMap = {};

  const hydratedStores = Array.isArray(hydrated.stores)
    ? hydrated.stores.map(store => ({
        ...store,
        is_removed: false,
        removed_at: null
      }))
    : [];

  const removedMeta = await fetchRemovedStoreMetadata(
    currentProjectId,
    hydratedStores.map(store => String(store.store_id))
  );

  allStoreData = hydratedStores.map(store => {
    const meta = removedMeta.get(String(store.store_id)) || {};
    return {
      ...store,
      is_removed: meta.is_removed === true,
      removed_at: meta.removed_at || null
    };
  });

  applyStoreVisibility();

  if (hydrated.statusError) {
    console.error("Supabase store_status error:", hydrated.statusError);
  }

  statusRowsCache.forEach(row => {
    const key = String(row.store_id);
    statusMap[key] = {
      completed: row.completed === true,
      closed: row.closed === true
    };
  });

  statusMap = ensureStatusIntegrity(allStoreData, statusMap);

  if (hydrated.noteError) {
    console.error("Supabase store_notes error:", hydrated.noteError);
  }

  if (hydrated.photoError) {
    console.error("Supabase store_photos error:", hydrated.photoError);
  }

  if (hydrated.activityEventError) {
    console.error("Supabase activity_events error:", hydrated.activityEventError);
  }
}

async function hydrateActivityFeed() {
  const events = [];

  const importedEvents = (activityEventRowsCache || [])
    .map(mapActivityEventRow)
    .filter(Boolean);

  events.push(...importedEvents);

  statusRowsCache.forEach(row => {
    const eventTime = row.updated_at || row.created_at || null;

    if (row.completed === true) {
      events.push({
        type: "status-completed",
        store_id: String(row.store_id),
        project_id: currentProjectId,
        timestamp: eventTime,
        title: `✔ Store ${row.store_id} completed`,
        detail: "Status updated"
      });
    } else if (row.closed === true) {
      events.push({
        type: "status-closed",
        store_id: String(row.store_id),
        project_id: currentProjectId,
        timestamp: eventTime,
        title: `⚠ Store ${row.store_id} closed`,
        detail: "Status updated"
      });
    }
  });

  noteRowsCache.forEach(row => {
    events.push({
      type: "note",
      store_id: String(row.store_id),
      project_id: currentProjectId,
      timestamp: row.created_at || null,
      title: `📝 Note added to Store ${row.store_id}`,
      detail: row.note || "Note saved"
    });
  });

  photoRowsCache.forEach(row => {
    events.push({
      type: "photo",
      store_id: String(row.store_id),
      project_id: currentProjectId,
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
  currentProjectMeta = allProjectList.find(project => project.project_id === currentProjectId)
    || projectList.find(project => project.project_id === currentProjectId)
    || {
      project_id: currentProjectId,
      name: currentProjectId,
      store_file: `data/${currentProjectId}/stores_with_coords.json`,
      is_archived: false,
      archived_at: null
    };

  currentSelectedStoreId = null;
  currentPhotoLibrarySelection = null;
  mobileExecutiveSummaryExpanded = false;

  restoreRemovedStoresToggleState();
  restoreFilterState();
  await hydrate();
  await hydrateActivityFeed();
  restoreRouteState();
  ensureProjectAdminUI();

  if (map.getSource("stores")) {
    rebuildFullMap();
  } else {
    buildMap();
  }

  updateProjectSourceTag();
  updateProjectArchiveUI();
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

  if (currentModalStoreId) {
    currentModalStoreId = null;
    clearPhotoUI();
  }
}

function updateProjectSourceTag() {
  const archiveLabel = isProjectArchived(currentProjectMeta) ? " • Archived" : "";
  const removalLabel = showRemovedStores ? " • Showing Removed Stores" : "";
  const text = `${currentProjectMeta?.name || currentProjectId} · ${currentProjectMeta?.sourceLabel || "Project ready"}${archiveLabel}${removalLabel}`;
  setText("projectSourceTag", text);
  setText("projectSourceTagInline", `${currentProjectMeta?.sourceLabel || "Project ready"}${archiveLabel}`);
}