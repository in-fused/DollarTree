/* ================= ACTIVITY ================= */

function getActivityAccentColor(type) {
  if (type === "status-completed") return "#2ecc71";
  if (type === "status-closed") return "#ff2d2d";
  if (type === "status-rescheduled") return "#ff9900";
  if (type === "status-active") return "#64b5f6";
  if (type === "photo") return "#64b5f6";
  if (type === "note") return "#d4a5ff";
  if (type === "store-created") return "#9fd1ff";
  if (type === "store-added") return "#9fd1ff";
  if (type === "store-edited") return "#ffd57a";
  if (type === "store-removed") return "#ff6b6b";
  if (type === "store-reactivated") return "#8ee0a1";
  if (type === "store-restored") return "#8ee0a1";
  if (type === "project-archived") return "#f5c26b";
  if (type === "project-restored") return "#9fd1ff";
  if (type === "member-role-updated") return "#ffd57a";
  if (type === "member-removed") return "#ff9f9f";
  if (type === "invite-sent") return "#9fd1ff";
  if (type === "invite-revoked") return "#ffb86b";
  return "rgba(255,255,255,0.12)";
}

function getActivityStoreLabel(item) {
  const storeId = String(item.store_id || "").trim();
  return storeId ? `Store ${storeId}` : "Project";
}

function buildActivityDisplay(item) {
  const type = String(item.type || "").trim();
  const detailText = String(item.detail || "").trim();
  const storeLabel = getActivityStoreLabel(item);

  if (type === "status-completed") {
    return {
      title: item.title || `${storeLabel} marked completed`,
      detail: detailText || "Completion recorded."
    };
  }

  if (type === "status-closed") {
    return {
      title: item.title || `${storeLabel} marked closed`,
      detail: detailText || "Closure recorded."
    };
  }

  if (type === "status-rescheduled") {
    return {
      title: item.title || `${storeLabel} marked rescheduled`,
      detail: detailText || "Reschedule reason updated."
    };
  }

  if (type === "status-active") {
    return {
      title: item.title || `${storeLabel} marked active`,
      detail: detailText || "Store returned to active status."
    };
  }

  if (type === "note") {
    return {
      title: item.title || `${storeLabel} note added`,
      detail: detailText || "Operational note added."
    };
  }

  if (type === "photo") {
    return {
      title: item.title || `${storeLabel} photo uploaded`,
      detail: detailText || "Photo evidence added."
    };
  }

  if (type === "store-added") {
    return {
      title: item.title || `${storeLabel} added to project`,
      detail: detailText || "Manual admin store add recorded."
    };
  }

  if (type === "store-edited") {
    return {
      title: item.title || `${storeLabel} metadata updated`,
      detail: detailText || "Manual admin store edit recorded."
    };
  }

  if (type === "store-removed") {
    return {
      title: item.title || `${storeLabel} removed from project scope`,
      detail: detailText || "Store hidden from active project scope."
    };
  }

  if (type === "store-reactivated") {
    return {
      title: item.title || `${storeLabel} reactivated`,
      detail: detailText || "Store returned to active project scope."
    };
  }

  if (type === "store-restored") {
    return {
      title: item.title || `${storeLabel} restored to project scope`,
      detail: detailText || "Store returned to active project scope."
    };
  }

  if (type === "project-archived") {
    return {
      title: item.title || "Project archived",
      detail: detailText || "Project moved out of active operations."
    };
  }

  if (type === "project-restored") {
    return {
      title: item.title || "Project restored",
      detail: detailText || "Project returned to active operations."
    };
  }

  if (type === "member-role-updated") {
    return {
      title: item.title || "Role updated",
      detail: detailText || "A project member role was updated."
    };
  }

  if (type === "member-removed") {
    return {
      title: item.title || "Member removed",
      detail: detailText || "A project member was removed."
    };
  }

  if (type === "invite-sent") {
    return {
      title: item.title || "Invite sent",
      detail: detailText || "A project invite was sent."
    };
  }

  if (type === "invite-revoked") {
    return {
      title: item.title || "Invite revoked",
      detail: detailText || "A pending project invite was revoked."
    };
  }

  return {
    title: item.title || "Operational update",
    detail: detailText || "Recent activity recorded."
  };
}

function updateActivityList() {
  const container = document.getElementById("activityList");
  const countPill = document.getElementById("activityCountPill");
  if (!container) return;

  container.innerHTML = "";

  const filteredIds = new Set(getFilteredStores().map(store => String(store.store_id)));
  const projectScopedActivityTypes = new Set([
    "project-archived",
    "project-restored",
    "store-added",
    "store-edited",
    "store-removed",
    "store-reactivated",
    "store-restored",
    "member-role-updated",
    "member-removed",
    "invite-sent",
    "invite-revoked"
  ]);
  const items = activityFeed
    .filter(item => {
      if (projectScopedActivityTypes.has(String(item.type || "").trim())) {
        return String(item.project_id || currentProjectId) === String(currentProjectId);
      }

      return filteredIds.has(String(item.store_id));
    })
    .slice(0, 12);

  if (countPill) countPill.textContent = items.length;

  if (items.length === 0) {
    container.innerHTML = `<div class="activity-empty">No recent field activity in the current scope.</div>`;
    return;
  }

  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "activityItem";
    div.style.borderLeftColor = getActivityAccentColor(item.type);

    const time = document.createElement("div");
    time.className = "activityTime";
    time.textContent = formatActivityTime(item.timestamp);

    const display = buildActivityDisplay(item);

    const title = document.createElement("div");
    title.className = "activityTitle";
    title.textContent = display.title;

    const detail = document.createElement("div");
    detail.className = "activityDetail";
    detail.textContent = display.detail;

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

      if (hasValidCoordinatePair(match.lat, match.lng)) {
        map.flyTo({
          center: [match.lng, match.lat],
          zoom: 14
        });
      }

      if (window.innerWidth <= 900) {
        document.body.classList.remove("sidebar-open");
      }
    };

    container.appendChild(div);
  });
}
