/* ================= PROJECTS / HYDRATION ================= */

async function loadProjects() {
  projectList = await dataLayer.loadProjects();

  if (!projectList.some(project => project.project_id === currentProjectId)) {
    currentProjectId = projectList[0].project_id;
    localStorage.setItem(ACTIVE_PROJECT_KEY, currentProjectId);
  }

  const select = document.getElementById("projectSelect");
  if (!select) return;

  select.innerHTML = "";
  projectList.forEach(project => {
    const option = document.createElement("option");
    option.value = project.project_id;
    option.textContent = project.name;
    select.appendChild(option);
  });

  select.value = currentProjectId;
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

  storeData = hydrated.stores;
  statusRowsCache = hydrated.statusRows;
  noteRowsCache = hydrated.noteRows;
  photoRowsCache = hydrated.photoRows;
  activityEventRowsCache = hydrated.activityEventRows;

  statusMap = {};

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
        timestamp: eventTime,
        title: `✔ Store ${row.store_id} completed`,
        detail: "Status updated"
      });
    } else if (row.closed === true) {
      events.push({
        type: "status-closed",
        store_id: String(row.store_id),
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
  const text = `${currentProjectMeta?.name || currentProjectId} · ${currentProjectMeta?.sourceLabel || "Project ready"}`;
  setText("projectSourceTag", text);
  setText("projectSourceTagInline", currentProjectMeta?.sourceLabel || "Project ready");
}
