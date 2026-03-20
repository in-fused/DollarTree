/* ================= ACTIVITY ================= */

function updateActivityList() {
  const container = document.getElementById("activityList");
  const countPill = document.getElementById("activityCountPill");
  if (!container) return;

  container.innerHTML = "";

  const filteredIds = new Set(getFilteredStores().map(store => String(store.store_id)));
  const items = activityFeed
    .filter(item => {
      if (item.type === "project-archived" || item.type === "project-restored") {
        return String(item.project_id || currentProjectId) === String(currentProjectId);
      }

      if (item.type === "store-removed" || item.type === "store-restored") {
        return String(item.project_id || currentProjectId) === String(currentProjectId);
      }

      return filteredIds.has(String(item.store_id));
    })
    .slice(0, 12);

  if (countPill) countPill.textContent = items.length;

  if (items.length === 0) {
    container.innerHTML = `<div class="activity-empty">No recent activity yet.</div>`;
    return;
  }

  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "activityItem";

    if (item.type === "status-completed") div.style.borderLeftColor = "#2ecc71";
    else if (item.type === "status-closed") div.style.borderLeftColor = "#ff2d2d";
    else if (item.type === "status-rescheduled") div.style.borderLeftColor = "#ff9900";
    else if (item.type === "status-active") div.style.borderLeftColor = "#64b5f6";
    else if (item.type === "photo") div.style.borderLeftColor = "#64b5f6";
    else if (item.type === "note") div.style.borderLeftColor = "#d4a5ff";
    else if (item.type === "store-created") div.style.borderLeftColor = "#9fd1ff";
    else if (item.type === "store-removed") div.style.borderLeftColor = "#ff6b6b";
    else if (item.type === "store-restored") div.style.borderLeftColor = "#8ee0a1";
    else if (item.type === "project-archived") div.style.borderLeftColor = "#f5c26b";
    else if (item.type === "project-restored") div.style.borderLeftColor = "#9fd1ff";

    const time = document.createElement("div");
    time.className = "activityTime";
    time.textContent = formatActivityTime(item.timestamp);

    const title = document.createElement("div");
    title.className = "activityTitle";
    title.textContent = item.title;

    const detail = document.createElement("div");
    detail.className = "activityDetail";
    detail.textContent = item.detail || "";

    div.appendChild(time);
    div.appendChild(title);
    div.appendChild(detail);

    div.onclick = () => {
      if (!item.store_id) return;

      const match = storeData.find(store => String(store.store_id) === String(item.store_id));
      if (!match) return;

      currentSelectedStoreId = String(match.store_id);
      updateSelectedStorePanel(match.store_id);

      currentWorkspaceView = "map";
      localStorage.setItem(ACTIVE_VIEW_KEY, currentWorkspaceView);
      updateWorkspaceViewUI();

      map.flyTo({
        center: [match.lng, match.lat],
        zoom: 14
      });

      if (window.innerWidth <= 900) {
        document.body.classList.remove("sidebar-open");
      }
    };

    container.appendChild(div);
  });
}