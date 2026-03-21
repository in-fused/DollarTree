/* ================= PROJECTS / HYDRATION ================= */

function archivedProjectsKey() {
  return "archivedProjectIds";
}

function removedStoresKey(projectId = currentProjectId) {
  return `removedStoreIds:${projectId}`;
}

function getArchivedProjectIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(archivedProjectsKey()) || "[]");
    return new Set((Array.isArray(saved) ? saved : []).map(value => String(value)));
  } catch {
    return new Set();
  }
}

function persistArchivedProjectIds(ids) {
  localStorage.setItem(archivedProjectsKey(), JSON.stringify([...ids]));
}

function getRemovedStoreIds(projectId = currentProjectId) {
  try {
    const saved = JSON.parse(localStorage.getItem(removedStoresKey(projectId)) || "[]");
    return new Set((Array.isArray(saved) ? saved : []).map(value => String(value)));
  } catch {
    return new Set();
  }
}

function persistRemovedStoreIds(projectId, ids) {
  localStorage.setItem(removedStoresKey(projectId), JSON.stringify([...ids]));
}

function ensureLifecycleStateDefaults() {
  if (typeof window.showRemovedStores === "undefined") {
    window.showRemovedStores = false;
  }

  if (typeof window.showArchivedProjects === "undefined") {
    window.showArchivedProjects = false;
  }
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

  const archivedProjects = getArchivedProjectIds();
  const isCurrentProjectArchived = archivedProjects.has(String(currentProjectId));

  if (removedToggleBtn) {
    removedToggleBtn.classList.toggle("hidden", !isAdmin());
    removedToggleBtn.textContent = showRemovedStores ? "Hide Removed Stores" : "Show Removed Stores";
  }

  if (archivedToggleBtn) {
    archivedToggleBtn.classList.toggle("hidden", !isAdmin());
    archivedToggleBtn.textContent = showArchivedProjects ? "Hide Archived Projects" : "Show Archived Projects";
  }

  if (archiveBtn) {
    archiveBtn.classList.toggle("hidden", !isAdmin() || isCurrentProjectArchived);
  }

  if (restoreBtn) {
    restoreBtn.classList.toggle("hidden", !isAdmin() || !isCurrentProjectArchived);
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
      if (!isAdmin()) return;
      showRemovedStores = !showRemovedStores;
      updateProjectLifecycleControls();
      handleFilterChange();
    });
    toggleRemovedBtn.dataset.bound = "true";
  }

  if (toggleArchivedBtn && !toggleArchivedBtn.dataset.bound) {
    toggleArchivedBtn.addEventListener("click", async () => {
      if (!isAdmin()) return;
      showArchivedProjects = !showArchivedProjects;
      updateProjectLifecycleControls();
      await loadProjects();
      await loadActiveProject();
    });
    toggleArchivedBtn.dataset.bound = "true";
  }

  if (archiveBtn && !archiveBtn.dataset.bound) {
    archiveBtn.addEventListener("click", async () => {
      if (!isAdmin()) return;

      const archivedProjects = getArchivedProjectIds();
      archivedProjects.add(String(currentProjectId));
      persistArchivedProjectIds(archivedProjects);

      await loadProjects();
      await loadActiveProject();
    });
    archiveBtn.dataset.bound = "true";
  }

  if (restoreBtn && !restoreBtn.dataset.bound) {
    restoreBtn.addEventListener("click", async () => {
      if (!isAdmin()) return;

      const archivedProjects = getArchivedProjectIds();
      archivedProjects.delete(String(currentProjectId));
      persistArchivedProjectIds(archivedProjects);

      await loadProjects();
      await loadActiveProject();
    });
    restoreBtn.dataset.bound = "true";
  }

  updateProjectLifecycleControls();
}

function softRemoveStoreFromProject(storeId) {
  const removedStoreIds = getRemovedStoreIds(currentProjectId);
  removedStoreIds.add(String(storeId));
  persistRemovedStoreIds(currentProjectId, removedStoreIds);

  const match = storeData.find(store => String(store.store_id) === String(storeId));
  if (match) match.is_removed = true;
}

function restoreStoreToProject(storeId) {
  const removedStoreIds = getRemovedStoreIds(currentProjectId);
  removedStoreIds.delete(String(storeId));
  persistRemovedStoreIds(currentProjectId, removedStoreIds);

  const match = storeData.find(store => String(store.store_id) === String(storeId));
  if (match) match.is_removed = false;
}

async function loadProjects() {
  ensureLifecycleStateDefaults();
  ensureProjectLifecycleControls();

  const allProjects = await dataLayer.loadProjects();
  const archivedProjects = getArchivedProjectIds();

  projectList = showArchivedProjects
    ? allProjects
    : allProjects.filter(project => !archivedProjects.has(String(project.project_id)));

  if (projectList.length === 0) {
    projectList = allProjects;
  }

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

    const archivedLabel = archivedProjects.has(String(project.project_id)) ? " (Archived)" : "";
    option.textContent = `${project.name}${archivedLabel}`;

    select.appendChild(option);
  });

  select.value = currentProjectId;
  updateProjectLifecycleControls();
}

function bindProjectSelector() {
  const select = document.getElementById("projectSelect");
  if (!select || select.dataset.bound) return;

  select.addEventListener("change", async (e) => {
    currentProjectId = e.target.value;
    localStorage.setItem(ACTIVE_PROJECT_KEY, currentProjectId);
    mobileExecutiveSummaryExpanded = false;
    await loadActiveProject();
  });

  select.dataset.bound = "true";
}

async function hydrate() {
  const hydrated = await dataLayer.hydrateProject(currentProjectId, currentProjectMeta);

  const removedStoreIds = getRemovedStoreIds(currentProjectId);

  storeData = hydrated.stores.map(store => ({
    ...store,
    is_removed: removedStoreIds.has(String(store.store_id))
  }));

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

  statusMap = ensureStatusIntegrity(storeData, statusMap);

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
  ensureLifecycleStateDefaults();
  ensureProjectLifecycleControls();

  currentProjectMeta = projectList.find(project => project.project_id === currentProjectId) || {
    project_id: currentProjectId,
    name: currentProjectId,
    store_file: `data/${currentProjectId}/stores_with_coords.json`
  };

  currentSelectedStoreId = null;
  currentPhotoLibrarySelection = null;
  mobileExecutiveSummaryExpanded = false;

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

  if (currentModalStoreId) {
    currentModalStoreId = null;
    clearPhotoUI();
  }
}

function updateProjectSourceTag() {
  const archivedProjects = getArchivedProjectIds();
  const tags = [currentProjectMeta?.sourceLabel || "Project ready"];

  if (archivedProjects.has(String(currentProjectId))) {
    tags.push("Archived");
  }

  if (showRemovedStores === true) {
    tags.push("Removed Visible");
  }

  const text = `${currentProjectMeta?.name || currentProjectId} · ${tags.join(" • ")}`;
  setText("projectSourceTag", text);
  setText("projectSourceTagInline", tags.join(" • "));
}