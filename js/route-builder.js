/* ================= ROUTE BUILDER ================= */

function restoreRouteState() {
  try {
    routeModeEnabled = localStorage.getItem(routeModeKey()) === "true";
    const saved = JSON.parse(localStorage.getItem(routeStopsKey()) || "[]");
    selectedRouteStops = saved.filter(storeId =>
      storeData.some(store => String(store.store_id) === String(storeId))
    );
  } catch (error) {
    console.error("Route restore failed:", error);
    routeModeEnabled = false;
    selectedRouteStops = [];
  }
}

function persistRouteState() {
  localStorage.setItem(routeModeKey(), String(routeModeEnabled));
  localStorage.setItem(routeStopsKey(), JSON.stringify(selectedRouteStops));
}

function getRouteCandidateStores() {
  return typeof getFilteredStores === "function" ? getFilteredStores() : storeData;
}

function bindRouteBuilder() {
  const routeModeToggle = document.getElementById("routeModeToggle");
  const addRouteStoreBtn = document.getElementById("addRouteStoreBtn");
  const clearRouteBtn = document.getElementById("clearRouteBtn");
  const openRouteBtn = document.getElementById("openRouteBtn");
  const routeStoreInput = document.getElementById("routeStoreInput");

  if (routeModeToggle && !routeModeToggle.dataset.bound) {
    routeModeToggle.addEventListener("change", () => {
      if (!canManageRoutes()) {
        routeModeToggle.checked = false;
        routeModeEnabled = false;
        persistRouteState();
        updateRouteModeUI();
        return;
      }

      routeModeEnabled = routeModeToggle.checked;
      persistRouteState();
      updateRouteModeUI();
    });
    routeModeToggle.dataset.bound = "true";
  }

  if (addRouteStoreBtn && !addRouteStoreBtn.dataset.bound) {
    addRouteStoreBtn.addEventListener("click", () => {
      const storeId = routeStoreInput?.value.trim() || "";
      if (!storeId) return;
      addStoreToRoute(storeId);
      if (routeStoreInput) routeStoreInput.value = "";
    });
    addRouteStoreBtn.dataset.bound = "true";
  }

  if (routeStoreInput && !routeStoreInput.dataset.bound) {
    routeStoreInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addRouteStoreBtn?.click();
      }
    });
    routeStoreInput.dataset.bound = "true";
  }

  if (clearRouteBtn && !clearRouteBtn.dataset.bound) {
    clearRouteBtn.addEventListener("click", () => {
      if (!canManageRoutes()) return;
      selectedRouteStops = [];
      persistRouteState();
      renderRouteStops();
    });
    clearRouteBtn.dataset.bound = "true";
  }

  if (openRouteBtn && !openRouteBtn.dataset.bound) {
    openRouteBtn.addEventListener("click", () => {
      if (!canManageRoutes()) return;
      const url = buildGoogleMapsRouteUrl();
      if (url) window.open(url, "_blank");
    });
    openRouteBtn.dataset.bound = "true";
  }
}

function updateRouteModeUI() {
  const routeModeToggle = document.getElementById("routeModeToggle");
  const addRouteStoreBtn = document.getElementById("addRouteStoreBtn");
  const routeStoreInput = document.getElementById("routeStoreInput");
  const addToRouteBtn = document.getElementById("addToRouteBtn");

  const routeAccess = canManageRoutes();

  if (routeModeToggle) {
    routeModeToggle.checked = routeAccess && routeModeEnabled;
    routeModeToggle.disabled = !routeAccess;
  }

  if (addRouteStoreBtn) addRouteStoreBtn.disabled = !routeAccess || !routeModeEnabled;
  if (routeStoreInput) routeStoreInput.disabled = !routeAccess || !routeModeEnabled;

  if (addToRouteBtn) {
    addToRouteBtn.disabled = !routeAccess || !routeModeEnabled;
    addToRouteBtn.textContent = !routeAccess
      ? "Editor Access Required"
      : routeModeEnabled
        ? "Add to Route"
        : "Enable Route Mode";
  }
}

function addStoreToRoute(storeId) {
  if (!canManageRoutes()) {
    alert("Editor or admin access required for route builder.");
    return;
  }

  if (!routeModeEnabled) {
    alert("Turn on Route Mode first.");
    return;
  }

  const normalized = String(storeId);
  const candidateStores = getRouteCandidateStores();
  const store = candidateStores.find(item => String(item.store_id) === normalized);

  if (!store) {
    alert("Store ID not found in the current filtered scope.");
    return;
  }

  if (selectedRouteStops.includes(normalized)) {
    alert("That store is already in the route.");
    return;
  }

  if (selectedRouteStops.length >= 10) {
    alert("For reliability, the route is currently capped at 10 stops.");
    return;
  }

  selectedRouteStops.push(normalized);
  persistRouteState();
  renderRouteStops();
}

function removeRouteStop(storeId) {
  if (!canManageRoutes()) return;
  selectedRouteStops = selectedRouteStops.filter(id => id !== storeId);
  persistRouteState();
  renderRouteStops();
}

function moveRouteStop(storeId, direction) {
  if (!canManageRoutes()) return;

  const currentIndex = selectedRouteStops.indexOf(storeId);
  if (currentIndex === -1) return;

  const newIndex = currentIndex + direction;
  if (newIndex < 0 || newIndex >= selectedRouteStops.length) return;

  const updated = [...selectedRouteStops];
  const [item] = updated.splice(currentIndex, 1);
  updated.splice(newIndex, 0, item);
  selectedRouteStops = updated;
  persistRouteState();
  renderRouteStops();
}

function createRouteMiniButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "routeMiniBtn";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderRouteStops() {
  const list = document.getElementById("selectedStopsList");
  const empty = document.getElementById("selectedStopsEmpty");
  const openRouteBtn = document.getElementById("openRouteBtn");
  const clearRouteBtn = document.getElementById("clearRouteBtn");

  if (!list || !empty || !openRouteBtn || !clearRouteBtn) return;

  list.innerHTML = "";

  if (selectedRouteStops.length === 0) {
    empty.style.display = "block";
    openRouteBtn.disabled = true;
    clearRouteBtn.disabled = true;
    updateRouteMetrics();
    return;
  }

  empty.style.display = "none";
  openRouteBtn.disabled = !canManageRoutes();
  clearRouteBtn.disabled = !canManageRoutes();

  selectedRouteStops.forEach((storeId, index) => {
    const store = storeData.find(item => String(item.store_id) === String(storeId));
    if (!store) return;

    const item = document.createElement("div");
    item.className = "routeStopItem";

    const top = document.createElement("div");
    top.className = "routeStopTop";

    const title = document.createElement("div");
    title.className = "routeStopTitle";
    title.textContent = `${index + 1}. Store ${storeId}`;
    top.appendChild(title);

    const address = document.createElement("div");
    address.className = "routeStopAddress";
    address.textContent = store.full_address || "No address found";

    const actions = document.createElement("div");
    actions.className = "routeStopActions";

    const flyBtn = createRouteMiniButton("View", () => {
      currentSelectedStoreId = String(storeId);
      updateSelectedStorePanel(storeId);

      currentWorkspaceView = "map";
      localStorage.setItem(ACTIVE_VIEW_KEY, currentWorkspaceView);
      updateWorkspaceViewUI();

      map.flyTo({ center: [store.lng, store.lat], zoom: 14 });

      if (window.innerWidth <= 900) {
        document.body.classList.remove("sidebar-open");
      }
    });

    const upBtn = createRouteMiniButton("↑", () => moveRouteStop(String(storeId), -1));
    upBtn.disabled = index === 0 || !canManageRoutes();

    const downBtn = createRouteMiniButton("↓", () => moveRouteStop(String(storeId), 1));
    downBtn.disabled = index === selectedRouteStops.length - 1 || !canManageRoutes();

    const removeBtn = createRouteMiniButton("Remove", () => removeRouteStop(String(storeId)));
    removeBtn.disabled = !canManageRoutes();

    actions.appendChild(flyBtn);
    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    actions.appendChild(removeBtn);

    item.appendChild(top);
    item.appendChild(address);
    item.appendChild(actions);

    list.appendChild(item);
  });

  updateRouteMetrics();
}

function buildGoogleMapsRouteUrl() {
  if (selectedRouteStops.length === 0) {
    alert("Add at least one stop to build a route.");
    return "";
  }

  const coords = selectedRouteStops
    .map(storeId => storeData.find(store => String(store.store_id) === String(storeId)))
    .filter(Boolean)
    .map(store => `${store.lat},${store.lng}`);

  if (coords.length === 0) return "";

  if (coords.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coords[0])}&travelmode=driving`;
  }

  const origin = coords[0];
  const destination = coords[coords.length - 1];
  const waypoints = coords.slice(1, -1).join("|");

  let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  if (waypoints.length > 0) {
    url += `&waypoints=${encodeURIComponent(waypoints)}`;
  }
  return url;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * (Math.PI / 180);
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

function estimateOptimalRouteMiles(routeStores) {
  if (routeStores.length < 2) return 0;
  if (routeStores.length === 2) {
    return haversineMiles(
      routeStores[0].lat,
      routeStores[0].lng,
      routeStores[1].lat,
      routeStores[1].lng
    );
  }

  const remaining = routeStores.slice(1);
  const ordered = [routeStores[0]];
  let current = routeStores[0];

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    remaining.forEach((candidate, index) => {
      const distance = haversineMiles(current.lat, current.lng, candidate.lat, candidate.lng);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    const [nextStore] = remaining.splice(nearestIndex, 1);
    ordered.push(nextStore);
    current = nextStore;
  }

  let total = 0;
  for (let i = 1; i < ordered.length; i++) {
    total += haversineMiles(
      ordered[i - 1].lat,
      ordered[i - 1].lng,
      ordered[i].lat,
      ordered[i].lng
    );
  }

  return total;
}

function updateRouteMetrics() {
  const routeStores = selectedRouteStops
    .map(storeId => storeData.find(store => String(store.store_id) === String(storeId)))
    .filter(Boolean);

  const stops = routeStores.length;
  let miles = 0;

  for (let i = 1; i < routeStores.length; i++) {
    miles += haversineMiles(
      routeStores[i - 1].lat,
      routeStores[i - 1].lng,
      routeStores[i].lat,
      routeStores[i].lng
    );
  }

  const optimalMiles = estimateOptimalRouteMiles(routeStores);

  let efficiency = "—";
  let detail = "Add stops to calculate route efficiency.";

  if (stops >= 2) {
    const score = miles > 0 && optimalMiles > 0
      ? Math.max(1, Math.min(100, Math.round((optimalMiles / miles) * 100)))
      : 100;

    efficiency = `${score}%`;
    detail = "Approx route order efficiency based on straight-line stop sequencing.";
  }

  setText("routeMetricStops", String(stops));
  setText("routeMetricMiles", stops >= 2 ? miles.toFixed(1) : "0");
  setText("routeMetricScore", efficiency);
  setText("routeMetricDetail", detail);
}