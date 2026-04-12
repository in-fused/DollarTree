/* ================= PHOTO LIBRARY ================= */

function bindPhotoLibraryUI() {
  const typeFilter = document.getElementById("photoTypeFilter");
  const sortFilter = document.getElementById("photoSortFilter");
  const groupFilter = document.getElementById("photoGroupFilter");
  const searchInput = document.getElementById("photoSearchInput");
  const openLightboxBtn = document.getElementById("photoDetailOpenLightboxBtn");
  const jumpToStoreBtn = document.getElementById("photoDetailJumpToStoreBtn");

  if (typeFilter && !typeFilter.dataset.bound) {
    typeFilter.addEventListener("change", () => {
      photoLibraryFilters.type = typeFilter.value;
      renderPhotoLibrary();
    });
    typeFilter.dataset.bound = "true";
  }

  if (sortFilter && !sortFilter.dataset.bound) {
    sortFilter.addEventListener("change", () => {
      photoLibraryFilters.sort = sortFilter.value;
      renderPhotoLibrary();
    });
    sortFilter.dataset.bound = "true";
  }

  if (groupFilter && !groupFilter.dataset.bound) {
    groupFilter.addEventListener("change", () => {
      photoLibraryFilters.group = groupFilter.value;
      renderPhotoLibrary();
    });
    groupFilter.dataset.bound = "true";
  }

  if (searchInput && !searchInput.dataset.bound) {
    searchInput.addEventListener("input", () => {
      photoLibraryFilters.search = searchInput.value.trim();
      renderPhotoLibrary();
    });
    searchInput.dataset.bound = "true";
  }

  if (openLightboxBtn && !openLightboxBtn.dataset.bound) {
    openLightboxBtn.addEventListener("click", () => {
      if (currentPhotoLibrarySelection?.url) {
        openPhotoLightbox(currentPhotoLibrarySelection.url);
      }
    });
    openLightboxBtn.dataset.bound = "true";
  }

  if (jumpToStoreBtn && !jumpToStoreBtn.dataset.bound) {
    jumpToStoreBtn.addEventListener("click", () => {
      if (currentPhotoLibrarySelection?.store_id) {
        jumpToStoreFromPhoto(currentPhotoLibrarySelection.store_id);
      }
    });
    jumpToStoreBtn.dataset.bound = "true";
  }
}

function getPhotoUrlFromRow(row) {
  if (row.resolved_image_url) return row.resolved_image_url;
  if (row.signed_url) return row.signed_url;
  if (row.image_url) return row.image_url;
  if (row.url) return row.url;
  if (row.public_url) return row.public_url;

  return "";
}

function getScopedPhotoRows() {
  const filteredStores = getFilteredStores();
  const filteredIds = new Set(filteredStores.map(store => String(store.store_id)));

  return photoRowsCache
    .filter(row => filteredIds.has(String(row.store_id)))
    .map(row => {
      const store = storeData.find(s => String(s.store_id) === String(row.store_id)) || null;
      const photoType = normalizePhotoType(row.photo_type || row.type || "");
      const url = getPhotoUrlFromRow(row);

      return {
        ...row,
        store,
        store_id: String(row.store_id),
        photo_type: photoType,
        url,
        created_at: row.created_at || null
      };
    })
    .filter(item => !!item.url);
}

function getFilteredPhotoLibraryRows() {
  return getScopedPhotoRows().filter(row => {
    if (photoLibraryFilters.type && row.photo_type !== photoLibraryFilters.type) return false;

    if (photoLibraryFilters.search) {
      const needle = photoLibraryFilters.search.toLowerCase();
      const haystack = [
        row.store_id,
        row.store?.full_address || "",
        row.store?.territory || "",
        row.store?.state || ""
      ].join(" ").toLowerCase();

      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
}

function sortPhotoLibraryRows(rows) {
  const sorted = [...rows];

  if (photoLibraryFilters.sort === "oldest") {
    sorted.sort((a, b) => getTimestampValue(a.created_at) - getTimestampValue(b.created_at));
  } else if (photoLibraryFilters.sort === "store_asc") {
    sorted.sort((a, b) => a.store_id.localeCompare(b.store_id, undefined, { numeric: true }));
  } else if (photoLibraryFilters.sort === "store_desc") {
    sorted.sort((a, b) => b.store_id.localeCompare(a.store_id, undefined, { numeric: true }));
  } else {
    sorted.sort((a, b) => getTimestampValue(b.created_at) - getTimestampValue(a.created_at));
  }

  return sorted;
}

function buildGroupedRows(rows, labelGetter) {
  const grouped = new Map();

  rows.forEach(row => {
    const label = labelGetter(row);
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label).push(row);
  });

  return [...grouped.entries()].map(([label, items]) => ({ label, items }));
}

function groupPhotoLibraryRows(rows) {
  if (photoLibraryFilters.group === "store") {
    return buildGroupedRows(rows, row => `Store ${row.store_id}`);
  }

  if (photoLibraryFilters.group === "date") {
    return buildGroupedRows(rows, row => {
      const date = new Date(row.created_at || "");
      if (Number.isNaN(date.getTime())) return "Unknown Date";
      return date.toLocaleDateString();
    });
  }

  if (photoLibraryFilters.group === "territory") {
    return buildGroupedRows(rows, row => row.store?.territory || "Unassigned Territory");
  }

  return [{ label: "", items: rows }];
}

function renderPhotoLibrary() {
  const grid = document.getElementById("photoLibraryGrid");
  const emptyShell = document.getElementById("photoLibraryEmptyShell");
  const photoView = document.getElementById("photoLibraryWorkspaceView");

  if (!grid || currentWorkspaceView !== "photos") return;

  if (photoView) {
    photoView.style.overflowY = "auto";
    photoView.style.webkitOverflowScrolling = "touch";
  }

  const rows = sortPhotoLibraryRows(getFilteredPhotoLibraryRows());

  setText("photoLibraryResultCount", `${rows.length.toLocaleString()} photos in current scope`);

  if (rows.length === 0) {
    grid.innerHTML = "";
    emptyShell?.classList.remove("hidden");
    resetPhotoLibraryDetail();
    updateHeaderMetaAndSummaries();
    return;
  }

  emptyShell?.classList.add("hidden");
  grid.innerHTML = "";

  if (currentPhotoLibrarySelection) {
    const exists = rows.some(row => getPhotoSelectionKey(row) === currentPhotoLibrarySelection.key);
    if (!exists) {
      currentPhotoLibrarySelection = null;
      resetPhotoLibraryDetail();
    }
  }

  const grouped = groupPhotoLibraryRows(rows);

  grouped.forEach(group => {
    if (group.label) {
      const header = document.createElement("div");
      header.className = "photoLibraryGroupHeader";
      header.textContent = group.label;
      header.style.gridColumn = "1 / -1";
      header.style.fontWeight = "800";
      header.style.fontSize = "14px";
      header.style.opacity = "0.9";
      header.style.margin = "4px 0 0";
      grid.appendChild(header);
    }

    group.items.forEach(row => {
      const key = getPhotoSelectionKey(row);
      const card = document.createElement("div");
      card.className = "photoLibraryCard";
      if (currentPhotoLibrarySelection?.key === key) {
        card.classList.add("active");
      }

      const imageWrap = document.createElement("div");
      imageWrap.className = "photoLibraryImageWrap";

      const image = document.createElement("img");
      image.className = "photoLibraryImage";
      image.src = row.url;
      image.alt = `Store ${row.store_id} photo`;
      image.loading = "lazy";
      imageWrap.appendChild(image);

      const body = document.createElement("div");
      body.className = "photoLibraryCardBody";

      const top = document.createElement("div");
      top.className = "photoLibraryCardTop";

      const store = document.createElement("div");
      store.className = "photoLibraryStore";
      store.textContent = `Store ${row.store_id}`;

      const typePill = document.createElement("div");
      typePill.className = "photoLibraryTypePill";
      typePill.textContent = row.photo_type;

      top.appendChild(store);
      top.appendChild(typePill);

      const meta = document.createElement("div");
      meta.className = "photoLibraryMeta";
      meta.textContent = [
        row.store?.full_address || "No address",
        row.store?.territory ? `Territory ${row.store.territory}` : "",
        formatPhotoDate(row.created_at)
      ].filter(Boolean).join(" • ");

      body.appendChild(top);
      body.appendChild(meta);

      card.appendChild(imageWrap);
      card.appendChild(body);

      card.addEventListener("click", () => {
        currentPhotoLibrarySelection = {
          key,
          store_id: row.store_id,
          url: row.url,
          row
        };
        populatePhotoLibraryDetail(row);
        renderPhotoLibrary();
      });

      grid.appendChild(card);
    });
  });

  if (!currentPhotoLibrarySelection && rows.length > 0) {
    const first = rows[0];
    currentPhotoLibrarySelection = {
      key: getPhotoSelectionKey(first),
      store_id: first.store_id,
      url: first.url,
      row: first
    };
    populatePhotoLibraryDetail(first);
    renderPhotoLibrary();
    return;
  }

  updateHeaderMetaAndSummaries();
}

function populatePhotoLibraryDetail(row) {
  const empty = document.getElementById("photoDetailEmptyState");
  const content = document.getElementById("photoDetailContent");
  const preview = document.getElementById("photoDetailPreview");

  if (!row) {
    resetPhotoLibraryDetail();
    return;
  }

  empty?.classList.add("hidden");
  content?.classList.remove("hidden");
  if (preview) preview.src = row.url;

  setText("photoDetailHeroTitle", `Store ${row.store_id} evidence`);
  setText("photoDetailStore", `Store ${row.store_id}`);
  setText("photoDetailAddress", row.store?.full_address || "No address");
  setText("photoDetailType", row.photo_type || "other");
  setText("photoDetailTimestamp", formatPhotoDate(row.created_at));
  setText("photoDetailTerritory", row.store?.territory || "—");
  setText("photoDetailState", row.store?.state || "—");
  setText("photoDetailHeroTypePill", row.photo_type || "other");

  updateHeaderMetaAndSummaries();
}

function resetPhotoLibraryDetail() {
  currentPhotoLibrarySelection = null;

  document.getElementById("photoDetailEmptyState")?.classList.remove("hidden");
  document.getElementById("photoDetailContent")?.classList.add("hidden");

  const preview = document.getElementById("photoDetailPreview");
  if (preview) preview.src = "";

  setText("photoDetailHeroTitle", "Store Evidence");
  setText("photoDetailHeroTypePill", "other");
  updateHeaderMetaAndSummaries();
}

function jumpToStoreFromPhoto(storeId) {
  const store = storeData.find(item => String(item.store_id) === String(storeId));
  if (!store) return;

  currentWorkspaceView = "map";
  localStorage.setItem(ACTIVE_VIEW_KEY, currentWorkspaceView);
  updateWorkspaceViewUI();

  currentSelectedStoreId = String(storeId);
  updateSelectedStorePanel(storeId);

  map.flyTo({
    center: [store.lng, store.lat],
    zoom: 14
  });
}
