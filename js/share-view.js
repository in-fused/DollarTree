(function () {
  "use strict";

  const MAPBOX_TOKEN = "pk.eyJ1IjoiaW4tZnVzZWQiLCJhIjoiY21sZ2E2ZzV4MGFmaTNjb2NydW04eXVpaCJ9.3-ZXlPJosjQ4c5bucpnWYA";
  const STATUS_OPTIONS = [
    { value: "", label: "All Statuses" },
    { value: "active", label: "Active" },
    { value: "completed", label: "Completed" },
    { value: "closed", label: "Closed" },
    { value: "rescheduled", label: "Rescheduled" }
  ];

  const state = {
    payload: null,
    map: null,
    filters: {
      region: "",
      territory: "",
      state: "",
      status: ""
    },
    selectedStoreId: "",
    selectedEvidencePhotos: [],
    activeTab: "overview"
  };

  function getEl(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const el = getEl(id);
    if (el) el.textContent = value;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  function formatTimestamp(value) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function formatLongTimestamp(value) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function getTimestampValue(value) {
    const valueMs = new Date(value || "").getTime();
    return Number.isNaN(valueMs) ? 0 : valueMs;
  }

  function toCount(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function clampPercent(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(100, parsed));
  }

  function formatPercent(value) {
    return `${clampPercent(value).toFixed(1)}%`;
  }

  function normalizeStatusCode(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["active", "completed", "closed", "rescheduled"].includes(normalized)) return normalized;
    return "active";
  }

  function getStatusLabel(statusCode) {
    const normalized = normalizeStatusCode(statusCode);
    if (normalized === "completed") return "Completed";
    if (normalized === "closed") return "Closed";
    if (normalized === "rescheduled") return "Rescheduled";
    return "Active";
  }

  function hasValidCoordinatePair(lat, lng) {
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    return (
      Number.isFinite(parsedLat) &&
      Number.isFinite(parsedLng) &&
      parsedLat >= -90 &&
      parsedLat <= 90 &&
      parsedLng >= -180 &&
      parsedLng <= 180 &&
      !(parsedLat === 0 && parsedLng === 0)
    );
  }

  function sanitizeBrandColor(value) {
    const raw = String(value || "").trim();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return "#c8102e";
    if (raw.length === 4) {
      return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
    }
    return raw.toLowerCase();
  }

  function getBrandRgb(color) {
    const hex = sanitizeBrandColor(color).slice(1);
    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);
    if (![red, green, blue].every(Number.isFinite)) return "200, 16, 46";
    return `${red}, ${green}, ${blue}`;
  }

  function uniqueSorted(values) {
    return Array.from(new Set(
      values.map(value => String(value || "").trim()).filter(Boolean)
    )).sort((a, b) => a.localeCompare(b));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function truncateText(value, maxLength = 240) {
    const text = String(value || "").trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
  }

  function isSafeDisplayUrl(value) {
    const url = String(value || "").trim();
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (_) {
      return false;
    }
  }

  function getPhotoTypeLabel(value) {
    const normalized = String(value || "").trim().replace(/[_-]+/g, " ");
    if (!normalized) return "Photo";
    return normalized.replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function getStoreEvidence(storeId) {
    const normalizedStoreId = String(storeId || "").trim();
    const evidence = state.payload?.evidenceByStoreId?.[normalizedStoreId] || {};
    return {
      notes: Array.isArray(evidence.notes) ? evidence.notes : [],
      photos: Array.isArray(evidence.photos) ? evidence.photos.filter(photo => isSafeDisplayUrl(photo?.image_url)) : []
    };
  }

  function getPayloadSummary() {
    const fallback = calculateSummary(getStores());
    const raw = state.payload?.summary || {};
    const summary = {
      total: toCount(raw.total ?? fallback.total),
      active: toCount(raw.active ?? fallback.active),
      completed: toCount(raw.completed ?? fallback.completed),
      rescheduled: toCount(raw.rescheduled ?? fallback.rescheduled),
      closed: toCount(raw.closed ?? fallback.closed),
      open_work: toCount(raw.open_work ?? fallback.open_work),
      attention_count: toCount(raw.attention_count ?? fallback.attention_count),
      missing_coordinate_count: toCount(raw.missing_coordinate_count ?? fallback.missing_coordinate_count),
      missing_status_count: toCount(raw.missing_status_count ?? fallback.missing_status_count),
      missing_region_count: toCount(raw.missing_region_count),
      missing_territory_count: toCount(raw.missing_territory_count),
      missing_state_count: toCount(raw.missing_state_count),
      data_health_issue_count: toCount(raw.data_health_issue_count)
    };

    if (!summary.open_work) {
      summary.open_work = summary.active + summary.rescheduled;
    }

    const percent = Number(raw.percent_complete ?? fallback.percent_complete);
    summary.percent_complete = Number.isFinite(percent) ? percent : 0;

    if (!summary.data_health_issue_count) {
      summary.data_health_issue_count = summary.missing_coordinate_count
        + summary.missing_status_count
        + summary.missing_region_count
        + summary.missing_territory_count
        + summary.missing_state_count;
    }

    return summary;
  }

  function getDataHealthItems(summary = getPayloadSummary()) {
    return [
      ["Missing coordinates", summary.missing_coordinate_count],
      ["Missing status", summary.missing_status_count],
      ["Missing region", summary.missing_region_count],
      ["Missing territory", summary.missing_territory_count],
      ["Missing state", summary.missing_state_count]
    ].filter(([, value]) => Number(value || 0) > 0);
  }

  function getReportAddress(store) {
    const fullAddress = String(store?.full_address || "").trim();
    if (fullAddress) return fullAddress;
    const fallback = [store?.city, store?.state].map(value => String(value || "").trim()).filter(Boolean).join(", ");
    return fallback || "No address on file";
  }

  function getReportGeoLine(store) {
    const parts = [
      store?.state ? `State: ${store.state}` : "",
      store?.region ? `Region: ${store.region}` : "",
      store?.territory ? `Territory: ${store.territory}` : ""
    ].filter(Boolean);
    return parts.length ? parts.join(" | ") : "No region, territory, or state metadata";
  }

  function compareStoreIds(a, b) {
    return String(a?.store_id || "").localeCompare(String(b?.store_id || ""), undefined, {
      numeric: true,
      sensitivity: "base"
    });
  }

  function getStatusSortIndex(statusCode) {
    const order = { active: 0, rescheduled: 1, completed: 2, closed: 3 };
    return order[normalizeStatusCode(statusCode)] ?? 0;
  }

  function getLatestActivityByStoreId() {
    const activity = Array.isArray(state.payload?.activity) ? state.payload.activity : [];
    const map = new Map();
    [...activity]
      .sort((a, b) => getTimestampValue(b?.timestamp) - getTimestampValue(a?.timestamp))
      .forEach(item => {
        const storeId = String(item?.store_id || "").trim();
        if (storeId && !map.has(storeId)) map.set(storeId, item);
      });
    return map;
  }

  function getStoreEvidenceCounts(storeId) {
    const evidence = getStoreEvidence(storeId);
    return {
      notes: evidence.notes.length,
      photos: evidence.photos.length
    };
  }

  function getGeographyRows(payloadKey, storeKey) {
    const geography = state.payload?.geography || {};
    const providedRows = Array.isArray(geography[payloadKey]) ? geography[payloadKey] : [];
    if (providedRows.length) {
      return providedRows
        .map(row => ({
          label: String(row?.label || "").trim(),
          count: toCount(row?.count)
        }))
        .filter(row => row.label && row.count > 0);
    }

    const counts = new Map();
    getStores().forEach(store => {
      const label = String(store?.[storeKey] || "").trim();
      if (!label) return;
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  function getReportSummaryLine(summary) {
    if (!summary.total) return "No stores are currently available in this shared project scope.";
    return `${formatNumber(summary.total)} stores in this shared scope with ${formatNumber(summary.completed)} completed, ${formatNumber(summary.open_work)} open, ${formatNumber(summary.rescheduled)} rescheduled, and ${formatNumber(summary.closed)} closed.`;
  }

  function getEvidenceLatestTimestamp(row) {
    const noteTimestamp = row.notes.reduce((latest, note) => Math.max(latest, getTimestampValue(note?.created_at)), 0);
    const photoTimestamp = row.photos.reduce((latest, photo) => Math.max(latest, getTimestampValue(photo?.created_at)), 0);
    return Math.max(noteTimestamp, photoTimestamp);
  }

  function getReportEvidenceRows() {
    return getStores()
      .map((store, originalIndex) => {
        const storeId = String(store?.store_id || "").trim();
        if (!storeId) return null;
        const evidence = getStoreEvidence(storeId);
        if (!evidence.notes.length && !evidence.photos.length) return null;
        const firstNote = evidence.notes[0]?.note ? truncateText(evidence.notes[0].note, 160) : "";
        const photoPreview = evidence.photos.length ? `${formatNumber(evidence.photos.length)} photo${evidence.photos.length === 1 ? "" : "s"} available` : "";
        const row = {
          store,
          storeId,
          originalIndex,
          address: getReportAddress(store),
          statusCode: normalizeStatusCode(store.status_code),
          statusLabel: getStatusLabel(store.status_code),
          notes: evidence.notes,
          photos: evidence.photos,
          noteCount: evidence.notes.length,
          photoCount: evidence.photos.length,
          latestPreview: firstNote || photoPreview || "Evidence available",
          sortGroup: evidence.notes.length && evidence.photos.length ? 0 : 1
        };
        row.latestEvidenceTimestamp = getEvidenceLatestTimestamp(row);
        return row;
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.sortGroup !== b.sortGroup) return a.sortGroup - b.sortGroup;
        if (a.latestEvidenceTimestamp !== b.latestEvidenceTimestamp) {
          return b.latestEvidenceTimestamp - a.latestEvidenceTimestamp;
        }
        return a.originalIndex - b.originalIndex;
      });
  }

  function getToken() {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(String(url.hash || "").replace(/^#/, ""));
    const hashToken = String(hashParams.get("t") || hashParams.get("token") || "").trim();
    const queryToken = String(url.searchParams.get("t") || url.searchParams.get("token") || "").trim();
    const token = hashToken || queryToken;

    if (queryToken) {
      // Migrate legacy query-string links into a reload-safe fragment. Fragments
      // stay out of page requests and referrers while remaining available after
      // transient API failures or a manual reload.
      url.searchParams.delete("t");
      url.searchParams.delete("token");
      if (!hashToken) {
        hashParams.set("t", queryToken);
        url.hash = `#${hashParams.toString()}`;
      }
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }

    return token;
  }

  async function fetchSharePayload(token) {
    const response = await fetch("/api/share-links/resolve", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Share-Token": token
      },
      cache: "no-store"
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      const message = payload?.error?.message || "The link may be expired, revoked, or malformed.";
      const error = new Error(message);
      error.code = payload?.error?.code || "share_load_failed";
      throw error;
    }

    return payload;
  }

  function getStores() {
    return Array.isArray(state.payload?.stores) ? state.payload.stores : [];
  }

  function getFilteredStores() {
    return getStores().filter(store => {
      if (state.filters.region && String(store.region || "") !== state.filters.region) return false;
      if (state.filters.territory && String(store.territory || "") !== state.filters.territory) return false;
      if (state.filters.state && String(store.state || "") !== state.filters.state) return false;
      if (state.filters.status && normalizeStatusCode(store.status_code) !== state.filters.status) return false;
      return true;
    });
  }

  function calculateSummary(stores) {
    const summary = {
      total: stores.length,
      active: 0,
      completed: 0,
      rescheduled: 0,
      closed: 0,
      open_work: 0,
      percent_complete: 0,
      attention_count: 0,
      missing_coordinate_count: 0,
      missing_status_count: 0
    };

    stores.forEach(store => {
      const statusCode = normalizeStatusCode(store.status_code);
      if (statusCode === "completed") summary.completed += 1;
      else if (statusCode === "closed") summary.closed += 1;
      else if (statusCode === "rescheduled") summary.rescheduled += 1;
      else summary.active += 1;

      if (!hasValidCoordinatePair(store.lat, store.lng)) summary.missing_coordinate_count += 1;
      if (store.has_persisted_status !== true) summary.missing_status_count += 1;
      if (statusCode === "rescheduled" && !String(store.status_reason || "").trim()) summary.attention_count += 1;
      if (store.has_persisted_status !== true) summary.attention_count += 1;
    });

    summary.open_work = summary.active + summary.rescheduled;
    const actionableTotal = Math.max(0, summary.total - summary.closed);
    summary.percent_complete = actionableTotal > 0 ? (summary.completed / actionableTotal) * 100 : 0;
    return summary;
  }

  function applyBranding(project) {
    const brandColor = sanitizeBrandColor(project?.brand_color);
    document.documentElement.style.setProperty("--project-accent", brandColor);
    document.documentElement.style.setProperty("--project-accent-rgb", getBrandRgb(brandColor));

    const logoUrl = String(project?.brand_logo_url || "").trim();
    const logoFrame = getEl("shareLogoFrame");
    const logo = getEl("shareProjectLogo");
    if (!logoFrame || !logo) return;

    if (!logoUrl) {
      logoFrame.classList.add("hidden");
      logo.removeAttribute("src");
      logo.alt = "";
      return;
    }

    logo.src = logoUrl;
    logo.alt = `${project?.name || "Project"} logo`;
    logoFrame.classList.remove("hidden");
    logo.onerror = () => {
      logoFrame.classList.add("hidden");
      logo.removeAttribute("src");
    };
  }

  function populateSelect(id, defaultLabel, values, selectedValue) {
    const select = getEl(id);
    if (!select) return;
    select.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = defaultLabel;
    select.appendChild(defaultOption);

    values.forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });

    select.value = values.includes(selectedValue) ? selectedValue : "";
  }

  function populateFilters() {
    const stores = getStores();
    populateSelect("shareRegionFilter", "All Regions", uniqueSorted(stores.map(store => store.region)), state.filters.region);
    populateSelect("shareTerritoryFilter", "All Territories", uniqueSorted(stores.map(store => store.territory)), state.filters.territory);
    populateSelect("shareStateFilter", "All States", uniqueSorted(stores.map(store => store.state)), state.filters.state);

    const statusSelect = getEl("shareStatusFilter");
    if (statusSelect) {
      statusSelect.innerHTML = "";
      STATUS_OPTIONS.forEach(optionConfig => {
        const option = document.createElement("option");
        option.value = optionConfig.value;
        option.textContent = optionConfig.label;
        statusSelect.appendChild(option);
      });
      statusSelect.value = state.filters.status || "";
    }
  }

  function updateSummaryCards() {
    const summary = calculateSummary(getFilteredStores());
    const percent = Number.isFinite(summary.percent_complete) ? summary.percent_complete : 0;

    setText("summaryTotal", formatNumber(summary.total));
    setText("summaryCompleted", formatNumber(summary.completed));
    setText("summaryActive", formatNumber(summary.active));
    setText("summaryRescheduled", formatNumber(summary.rescheduled));
    setText("summaryClosed", formatNumber(summary.closed));
    setText("summaryAttention", formatNumber(summary.attention_count));
    setText("shareProgressText", `${percent.toFixed(1)}% complete`);
    setText("shareOpenWorkText", `${formatNumber(summary.open_work)} open`);
    setText("shareFilterSummary", summary.total === getStores().length
      ? `Showing all ${formatNumber(summary.total)} stores.`
      : `Showing ${formatNumber(summary.total)} of ${formatNumber(getStores().length)} stores.`);

    const fill = getEl("shareProgressFill");
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, percent)).toFixed(2)}%`;

    const plottable = getFilteredStores().filter(store => hasValidCoordinatePair(store.lat, store.lng)).length;
    setText("shareMapScope", `${formatNumber(plottable)} of ${formatNumber(summary.total)} stores plotted in the current scope.`);
  }

  function renderStatusBreakdown() {
    const summary = calculateSummary(getFilteredStores());
    const rows = [
      { key: "active", label: "Active", value: summary.active },
      { key: "rescheduled", label: "Rescheduled", value: summary.rescheduled },
      { key: "completed", label: "Completed", value: summary.completed },
      { key: "closed", label: "Closed", value: summary.closed }
    ];
    const total = Math.max(summary.total, 1);
    const root = getEl("shareStatusBreakdown");
    if (!root) return;

    root.innerHTML = rows.map(row => {
      const percent = summary.total > 0 ? (row.value / total) * 100 : 0;
      return `
        <div class="statusBreakdownRow">
          <div class="statusBreakdownMeta">
            <span><i class="legendDot status-${escapeHtml(row.key)}"></i>${escapeHtml(row.label)}</span>
            <strong>${formatNumber(row.value)} <em>${percent.toFixed(1)}%</em></strong>
          </div>
          <div class="statusBreakdownTrack">
            <div class="statusBreakdownFill status-${escapeHtml(row.key)}" style="width:${percent.toFixed(2)}%;"></div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderDataHealth() {
    const summary = state.payload?.summary || {};
    const items = [
      ["Missing coordinates", summary.missing_coordinate_count],
      ["Missing status", summary.missing_status_count],
      ["Missing region", summary.missing_region_count],
      ["Missing territory", summary.missing_territory_count],
      ["Missing state", summary.missing_state_count]
    ].filter(([, value]) => Number(value || 0) > 0);

    const panel = getEl("shareDataHealthPanel");
    const list = getEl("shareDataHealthList");
    if (!panel || !list) return;

    panel.classList.toggle("hidden", items.length === 0);
    list.innerHTML = items.map(([label, value]) => `
      <div class="dataHealthItem">
        <span>${escapeHtml(label)}</span>
        <strong>${formatNumber(value)}</strong>
      </div>
    `).join("");
  }

  function renderActivity() {
    const root = getEl("shareActivityList");
    if (!root) return;

    const activity = Array.isArray(state.payload?.activity) ? state.payload.activity : [];
    if (!activity.length) {
      root.innerHTML = `<div class="emptyText">No recent public-safe activity is available for this share.</div>`;
      return;
    }

    root.innerHTML = activity.slice(0, 8).map(item => `
      <button class="activityItem" type="button" data-store-id="${escapeHtml(item.store_id || "")}">
        <span>${escapeHtml(formatTimestamp(item.timestamp) || "Recent")}</span>
        <strong>${escapeHtml(item.title || "Project activity")}</strong>
        <em>${escapeHtml(item.detail || "")}</em>
      </button>
    `).join("");
  }

  function renderSelectedStoreEvidence(storeId) {
    const block = getEl("shareSelectedStoreEvidence");
    const notesRoot = getEl("shareSelectedStoreNotes");
    const photosRoot = getEl("shareSelectedStorePhotos");
    const emptyRoot = getEl("shareSelectedStoreEvidenceEmpty");
    if (!block || !notesRoot || !photosRoot || !emptyRoot) return;

    const normalizedStoreId = String(storeId || "").trim();
    if (!normalizedStoreId) {
      state.selectedEvidencePhotos = [];
      block.classList.add("hidden");
      notesRoot.innerHTML = "";
      photosRoot.innerHTML = "";
      emptyRoot.classList.add("hidden");
      setText("shareSelectedStoreEvidenceSummary", "0 items");
      return;
    }

    const evidence = getStoreEvidence(normalizedStoreId);
    const notes = evidence.notes.slice(0, 5);
    const photos = evidence.photos.slice(0, 6);
    const itemCount = notes.length + photos.length;
    state.selectedEvidencePhotos = photos;

    block.classList.remove("hidden");
    setText("shareSelectedStoreEvidenceSummary", `${formatNumber(itemCount)} ${itemCount === 1 ? "item" : "items"}`);
    emptyRoot.classList.toggle("hidden", itemCount > 0);

    notesRoot.innerHTML = notes.length
      ? `
        <div class="evidenceSubhead">Notes</div>
        ${notes.map(note => `
          <article class="shareEvidenceNote">
            <div>${escapeHtml(note.note || "")}</div>
            <time>${escapeHtml(formatTimestamp(note.created_at) || "Recent")}</time>
          </article>
        `).join("")}
      `
      : "";

    photosRoot.innerHTML = photos.length
      ? `
        <div class="evidenceSubhead">Photos</div>
        <div class="shareEvidencePhotoGrid">
          ${photos.map((photo, index) => {
            const typeLabel = getPhotoTypeLabel(photo.photo_type || photo.type);
            const timestamp = formatTimestamp(photo.created_at);
            return `
              <button class="shareEvidencePhoto" type="button" data-photo-index="${index}" aria-label="Open ${escapeHtml(typeLabel)} evidence preview">
                <img src="${escapeHtml(photo.image_url)}" alt="Store ${escapeHtml(normalizedStoreId)} ${escapeHtml(typeLabel)} evidence" loading="lazy" />
                <span><strong>${escapeHtml(typeLabel)}</strong>${timestamp ? `<em>${escapeHtml(timestamp)}</em>` : ""}</span>
              </button>
            `;
          }).join("")}
        </div>
      `
      : "";
  }

  function openPhotoLightbox(photo) {
    const imageUrl = String(photo?.image_url || "").trim();
    if (!isSafeDisplayUrl(imageUrl)) return;

    const lightbox = getEl("sharePhotoLightbox");
    const image = getEl("sharePhotoLightboxImage");
    const meta = getEl("sharePhotoLightboxMeta");
    if (!lightbox || !image || !meta) return;

    const typeLabel = getPhotoTypeLabel(photo.photo_type || photo.type);
    const timestamp = formatTimestamp(photo.created_at);
    image.src = imageUrl;
    image.alt = `${typeLabel} evidence preview`;
    meta.textContent = [typeLabel, timestamp].filter(Boolean).join(" | ");
    lightbox.classList.remove("hidden");
    document.body.classList.add("shareLightboxOpen");
  }

  function closePhotoLightbox() {
    const lightbox = getEl("sharePhotoLightbox");
    const image = getEl("sharePhotoLightboxImage");
    const meta = getEl("sharePhotoLightboxMeta");
    if (lightbox) lightbox.classList.add("hidden");
    if (image) {
      image.removeAttribute("src");
      image.alt = "";
    }
    if (meta) meta.textContent = "";
    document.body.classList.remove("shareLightboxOpen");
  }

  function getTabFromHash() {
    const normalized = String(window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
    return normalized === "report" ? "report" : "overview";
  }

  function updateLocationHashForTab(tab) {
    const nextHash = tab === "report" ? "#report" : "#overview";
    if (window.location.hash === nextHash) return;
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.pushState(null, "", nextUrl);
  }

  function setActiveTab(tab, shouldUpdateHash = true) {
    const nextTab = tab === "report" ? "report" : "overview";
    state.activeTab = nextTab;

    const overviewSelected = nextTab === "overview";
    const overviewView = getEl("shareOverviewView");
    const reportView = getEl("shareReportView");
    const overviewButton = getEl("shareOverviewTabBtn");
    const reportButton = getEl("shareReportTabBtn");

    if (overviewView) {
      overviewView.hidden = !overviewSelected;
      overviewView.classList.toggle("hidden", !overviewSelected);
    }
    if (reportView) {
      reportView.hidden = overviewSelected;
      reportView.classList.toggle("hidden", overviewSelected);
    }

    if (overviewButton) {
      overviewButton.classList.toggle("active", overviewSelected);
      overviewButton.setAttribute("aria-selected", overviewSelected ? "true" : "false");
      overviewButton.tabIndex = overviewSelected ? 0 : -1;
    }
    if (reportButton) {
      reportButton.classList.toggle("active", !overviewSelected);
      reportButton.setAttribute("aria-selected", overviewSelected ? "false" : "true");
      reportButton.tabIndex = overviewSelected ? -1 : 0;
    }

    if (shouldUpdateHash) updateLocationHashForTab(nextTab);

    if (overviewSelected && state.map) {
      window.setTimeout(() => state.map?.resize(), 60);
    }
  }

  function setReportActionStatus(message) {
    const status = getEl("shareReportActionStatus");
    if (status) status.textContent = message || "";
  }

  function getShareUrlForCopy() {
    const url = new URL(window.location.href);
    url.hash = state.activeTab === "report" ? "report" : "overview";
    return url.toString();
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard copy failed.");
  }

  function buildReportLogoMarkup(project) {
    const projectName = String(project?.name || "Project").trim();
    const logoUrl = String(project?.brand_logo_url || "").trim();
    if (isSafeDisplayUrl(logoUrl)) {
      return `<img class="shareReportLogo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(projectName)} logo" loading="lazy" />`;
    }
    return `<div class="shareReportLogoMark" aria-hidden="true">${escapeHtml(projectName.slice(0, 1).toUpperCase() || "P")}</div>`;
  }

  function buildReportHero(project, summary) {
    const generated = formatLongTimestamp(state.payload?.generated_at) || "Generated just now";
    const expires = formatLongTimestamp(state.payload?.expires_at) || "Expiration unavailable";
    const percent = clampPercent(summary.percent_complete);
    const summaryLine = getReportSummaryLine(summary);
    return `
      <section class="shareReportHero">
        <div class="shareReportHeroTop">
          <div class="shareReportIdentity">
            ${buildReportLogoMarkup(project)}
            <div>
              <div class="shareReportEyebrow">Executive Field Report</div>
              <h1>${escapeHtml(project?.name || "Project Overview")}</h1>
              <div class="shareReportHeroSummary">${escapeHtml(summaryLine)}</div>
            </div>
          </div>
          <div class="shareReportCompletionCard">
            <div class="shareReportCompletionValue">${percent.toFixed(1)}%</div>
            <div class="shareReportCompletionLabel">Overall completion</div>
            <div class="shareReportProgressTrack" style="margin-top:12px;">
              <div class="shareReportProgressFill" style="width:${percent.toFixed(2)}%;"></div>
            </div>
          </div>
        </div>
        <div class="shareReportHeroMetaGrid">
          <div class="shareReportMetaCard">
            <div class="shareReportMetaLabel">Generated</div>
            <div class="shareReportMetaValue">${escapeHtml(generated)}</div>
          </div>
          <div class="shareReportMetaCard">
            <div class="shareReportMetaLabel">Link Expiration</div>
            <div class="shareReportMetaValue">${escapeHtml(expires)}</div>
          </div>
          <div class="shareReportMetaCard">
            <div class="shareReportMetaLabel">Scope Summary</div>
            <div class="shareReportMetaValue">${formatNumber(summary.total)} total | ${formatNumber(summary.completed)} completed | ${formatNumber(summary.open_work)} open | ${formatNumber(summary.rescheduled)} rescheduled | ${formatNumber(summary.closed)} closed</div>
          </div>
        </div>
      </section>
    `;
  }

  function buildReportUtilityBar() {
    return `
      <section class="shareReportUtilityBar">
        <div class="shareReportUtilityCopy">
          <div>Read-only stakeholder report generated from the secure 7-day share payload.</div>
          <div id="shareReportActionStatus" class="shareReportCopyStatus" aria-live="polite"></div>
        </div>
        <div class="shareReportActions">
          <button class="shareReportButton secondary" type="button" data-report-action="overview">Back to Overview</button>
          <button class="shareReportButton secondary" type="button" data-report-action="copy">Copy Share Link</button>
          <button class="shareReportButton" type="button" data-report-action="print">Print Page (optional)</button>
        </div>
      </section>
    `;
  }

  function buildExecutiveSummarySection(summary) {
    const cards = [
      { label: "Total Stores", value: formatNumber(summary.total), note: "Project scope" },
      { label: "Completed", value: formatNumber(summary.completed), note: `${formatPercent(summary.percent_complete)} complete` },
      { label: "Active/Open", value: formatNumber(summary.active), note: "In-progress field work" },
      { label: "Rescheduled", value: formatNumber(summary.rescheduled), note: "Follow-up queue" },
      { label: "Closed", value: formatNumber(summary.closed), note: "Out of active scope" },
      { label: "Needs Attention", value: formatNumber(summary.attention_count), note: "Follow-up or data review" },
      { label: "Completion %", value: formatPercent(summary.percent_complete), note: "Completed / actionable" }
    ];

    return `
      <section class="shareReportPanel">
        <div class="shareReportSectionHeader">
          <div>
            <div class="shareReportSectionLabel">Executive Summary</div>
            <h2>What changed, what remains, what needs attention</h2>
          </div>
          <div class="shareReportSectionBadge">${escapeHtml(formatLongTimestamp(state.payload?.generated_at) || "Current")}</div>
        </div>
        <div class="shareReportExecGrid">
          ${cards.map(card => `
            <div class="shareReportMetricCard">
              <div class="shareReportMetricLabel">${escapeHtml(card.label)}</div>
              <div class="shareReportMetricValue">${escapeHtml(card.value)}</div>
              <div class="shareReportMetricNote">${escapeHtml(card.note)}</div>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function buildDoneVsLeftSection(summary) {
    const actionableTotal = Math.max(0, summary.total - summary.closed);
    const completedPercent = actionableTotal > 0 ? (summary.completed / actionableTotal) * 100 : 0;
    const remainingPercent = actionableTotal > 0 ? (summary.open_work / actionableTotal) * 100 : 0;
    const attentionCount = Math.max(summary.attention_count, summary.data_health_issue_count || 0);
    const attentionPercent = summary.total > 0 ? (attentionCount / summary.total) * 100 : 0;
    const cards = [
      {
        key: "completed",
        title: "Completed Work",
        value: formatNumber(summary.completed),
        detail: `${formatPercent(completedPercent)} of actionable stores are complete.`,
        width: completedPercent
      },
      {
        key: "remaining",
        title: "Remaining Work",
        value: formatNumber(summary.open_work),
        detail: `${formatNumber(summary.active)} active and ${formatNumber(summary.rescheduled)} rescheduled stores remain.`,
        width: remainingPercent
      },
      {
        key: "attention",
        title: "Follow-up / Attention Needed",
        value: formatNumber(attentionCount),
        detail: attentionCount > 0 ? "Review reschedules and data exceptions before sharing downstream." : "No attention signals in the current scope.",
        width: attentionPercent
      }
    ];

    return `
      <section class="shareReportPanel">
        <div class="shareReportSectionHeader">
          <div>
            <div class="shareReportSectionLabel">Done vs Left</div>
            <h2>Execution Position</h2>
          </div>
          <div class="shareReportSectionBadge">${formatNumber(summary.open_work)} open work</div>
        </div>
        <div class="shareReportDoneGrid">
          ${cards.map(card => `
            <div class="shareReportDoneCard shareReportDoneCard-${escapeHtml(card.key)}">
              <div class="shareReportDoneTop">
                <div>
                  <div class="shareReportDoneTitle">${escapeHtml(card.title)}</div>
                  <div class="shareReportDoneDetail">${escapeHtml(card.detail)}</div>
                </div>
                <div class="shareReportDoneValue">${escapeHtml(card.value)}</div>
              </div>
              <div class="shareReportDoneTrack">
                <div class="shareReportDoneFill" style="width:${clampPercent(card.width).toFixed(2)}%;"></div>
              </div>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function buildStatusBreakdownSection(summary) {
    const rows = [
      { key: "active", label: "Active/Open", value: summary.active },
      { key: "rescheduled", label: "Rescheduled", value: summary.rescheduled },
      { key: "completed", label: "Completed", value: summary.completed },
      { key: "closed", label: "Closed", value: summary.closed }
    ];
    const total = Math.max(summary.total, 1);

    return `
      <section class="shareReportPanel">
        <div class="shareReportSectionHeader">
          <div>
            <div class="shareReportSectionLabel">Status Breakdown</div>
            <h2>Current Status Mix</h2>
          </div>
          <div class="shareReportSectionBadge">${formatNumber(summary.total)} stores</div>
        </div>
        <div class="shareReportStatusGrid">
          <div class="shareReportStatusStack">
            ${rows.map(row => {
              const percent = summary.total > 0 ? (row.value / total) * 100 : 0;
              return `
                <div class="shareReportStatusRow">
                  <div class="shareReportStatusMeta">
                    <span class="shareReportStatusLabel"><i class="shareReportStatusDot shareReportStatusDot-${escapeHtml(row.key)}"></i>${escapeHtml(row.label)}</span>
                    <strong class="shareReportStatusValue">${formatNumber(row.value)} <span>${percent.toFixed(1)}%</span></strong>
                  </div>
                  <div class="shareReportStatusTrack">
                    <div class="shareReportStatusFill shareReportStatusFill-${escapeHtml(row.key)}" style="width:${clampPercent(percent).toFixed(2)}%;"></div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
          <div class="shareReportReadout">
            <div class="shareReportReadoutLine"><span>Actionable stores</span><strong>${formatNumber(Math.max(0, summary.total - summary.closed))}</strong></div>
            <div class="shareReportReadoutLine"><span>Open work</span><strong>${formatNumber(summary.open_work)}</strong></div>
            <div class="shareReportReadoutLine"><span>Completion</span><strong>${formatPercent(summary.percent_complete)}</strong></div>
            <div class="shareReportReadoutLine"><span>Needs attention</span><strong>${formatNumber(summary.attention_count)}</strong></div>
          </div>
        </div>
      </section>
    `;
  }

  function buildGeoBreakdownCard(title, rows) {
    const safeRows = Array.isArray(rows) ? rows.slice(0, 8) : [];
    if (!safeRows.length) {
      return `
        <div class="shareReportGeoCard">
          <div class="shareReportGeoTitle">${escapeHtml(title)}</div>
          <div class="shareReportEmpty">No ${escapeHtml(title.toLowerCase())} metadata in this scope.</div>
        </div>
      `;
    }

    const total = Math.max(1, safeRows.reduce((sum, row) => sum + Number(row.count || 0), 0));
    return `
      <div class="shareReportGeoCard">
        <div class="shareReportGeoTitle">${escapeHtml(title)}</div>
        <div class="shareReportGeoRows">
          ${safeRows.map(row => {
            const percent = (Number(row.count || 0) / total) * 100;
            return `
              <div class="shareReportGeoRow">
                <div class="shareReportGeoRowMeta">
                  <span>${escapeHtml(row.label)}</span>
                  <strong>${formatNumber(row.count)}</strong>
                </div>
                <div class="shareReportGeoTrack">
                  <div class="shareReportGeoFill" style="width:${clampPercent(percent).toFixed(2)}%;"></div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  function buildGeographicOverviewSection(summary) {
    const states = getGeographyRows("states", "state");
    const regions = getGeographyRows("regions", "region");
    const territories = getGeographyRows("territories", "territory");
    const plottedCount = toCount(state.payload?.geography?.plotted_count ?? getStores().filter(store => hasValidCoordinatePair(store.lat, store.lng)).length);
    const missingMetadataCount = summary.missing_region_count + summary.missing_territory_count + summary.missing_state_count;
    const statCards = [
      { label: "States", value: formatNumber(states.length), note: "With metadata" },
      { label: "Regions", value: formatNumber(regions.length), note: "With metadata" },
      { label: "Territories", value: formatNumber(territories.length), note: "With metadata" },
      { label: "Plotted", value: formatNumber(plottedCount), note: `${formatNumber(summary.missing_coordinate_count)} missing coordinates` }
    ];
    if (missingMetadataCount > 0) {
      statCards.push({ label: "Metadata Gaps", value: formatNumber(missingMetadataCount), note: "Region, territory, or state" });
    }

    return `
      <section class="shareReportPanel">
        <div class="shareReportSectionHeader">
          <div>
            <div class="shareReportSectionLabel">Geographic Overview</div>
            <h2>Coverage Spread</h2>
          </div>
          <div class="shareReportSectionBadge">${formatNumber(plottedCount)} plotted / ${formatNumber(summary.total)} total</div>
        </div>
        <div class="shareReportGeoSummary">
          ${statCards.map(card => `
            <div class="shareReportMetricCard">
              <div class="shareReportMetricLabel">${escapeHtml(card.label)}</div>
              <div class="shareReportMetricValue">${escapeHtml(card.value)}</div>
              <div class="shareReportMetricNote">${escapeHtml(card.note)}</div>
            </div>
          `).join("")}
        </div>
        <div class="shareReportGeoGrid">
          ${buildGeoBreakdownCard("Regions", regions)}
          ${buildGeoBreakdownCard("Territories", territories)}
          ${buildGeoBreakdownCard("States", states)}
        </div>
      </section>
    `;
  }

  function buildRecentActivitySection() {
    const activity = Array.isArray(state.payload?.activity) ? state.payload.activity.slice(0, 10) : [];
    return `
      <section class="shareReportPanel">
        <div class="shareReportSectionHeader">
          <div>
            <div class="shareReportSectionLabel">Recent Activity</div>
            <h2>Latest Relevant Store Updates</h2>
          </div>
          <div class="shareReportSectionBadge">${formatNumber(activity.length)} shown</div>
        </div>
        <div class="shareReportActivityList">
          ${activity.length ? activity.map(item => `
            <article class="shareReportActivityItem">
              <div class="shareReportActivityTime">${escapeHtml(formatTimestamp(item.timestamp) || "Recent")}</div>
              <div class="shareReportActivityTitle">${escapeHtml(item.title || "Store activity")}</div>
              <div class="shareReportActivityDetail">${escapeHtml(item.detail || "")}</div>
            </article>
          `).join("") : `<div class="shareReportEmptyCard"><div class="shareReportEmptyTitle">No recent activity</div><div class="shareReportMuted">No recent public-safe activity is available for this share.</div></div>`}
        </div>
      </section>
    `;
  }

  function buildDataHealthSection(summary) {
    const items = getDataHealthItems(summary);
    if (!items.length) return "";

    return `
      <section class="shareReportPanel">
        <div class="shareReportSectionHeader">
          <div>
            <div class="shareReportSectionLabel">Data Health</div>
            <h2>Items to Resolve</h2>
          </div>
          <div class="shareReportSectionBadge">${formatNumber(summary.data_health_issue_count)} exceptions</div>
        </div>
        <div class="shareReportExceptionGrid">
          ${items.map(([label, value]) => `
            <div class="shareReportExceptionCard">
              <div class="shareReportExceptionValue">${formatNumber(value)}</div>
              <div class="shareReportExceptionLabel">${escapeHtml(label)}</div>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function buildStoreAppendixSection() {
    const activityByStoreId = getLatestActivityByStoreId();
    const stores = [...getStores()].sort((a, b) => {
      const statusDiff = getStatusSortIndex(a.status_code) - getStatusSortIndex(b.status_code);
      return statusDiff || compareStoreIds(a, b);
    });

    const rows = stores.map(store => {
      const storeId = String(store?.store_id || "").trim();
      const counts = getStoreEvidenceCounts(storeId);
      const activity = activityByStoreId.get(storeId);
      const activityTimestamp = formatTimestamp(activity?.timestamp);
      const activityText = [activity?.title, activity?.detail].filter(Boolean).join(" | ");
      return `
        <tr>
          <td data-label="Store ID"><span class="shareReportStoreId">${escapeHtml(storeId || "Unknown")}</span></td>
          <td data-label="Address">
            <div class="shareReportLocation">${escapeHtml(getReportAddress(store))}</div>
          </td>
          <td data-label="Status">
            <span class="shareReportStatusBadge shareReportStatus-${escapeHtml(normalizeStatusCode(store.status_code))}">${escapeHtml(getStatusLabel(store.status_code))}</span>
            ${store.status_reason ? `<div class="shareReportReason">Reason: ${escapeHtml(store.status_reason)}</div>` : ""}
          </td>
          <td data-label="Geo"><div class="shareReportMuted">${escapeHtml(getReportGeoLine(store))}</div></td>
          <td data-label="Evidence">
            <span class="shareReportPill ${counts.notes ? "has-data" : ""}">${formatNumber(counts.notes)} notes</span>
            <span class="shareReportPill ${counts.photos ? "has-data" : ""}" style="margin-top:4px;">${formatNumber(counts.photos)} photos</span>
          </td>
          <td data-label="Latest Activity">
            ${activity ? `
              <div class="shareReportActivityInline">${escapeHtml(activityTimestamp || "Recent")}</div>
              <div class="shareReportLocation">${escapeHtml(activityText || "Store activity")}</div>
            ` : `<div class="shareReportMuted">No recent activity in this share payload.</div>`}
          </td>
        </tr>
      `;
    }).join("");

    return `
      <section class="shareReportPanel">
        <div class="shareReportSectionHeader">
          <div>
            <div class="shareReportSectionLabel">Store Detail Appendix</div>
            <h2>Read-only Store Status</h2>
          </div>
          <div class="shareReportSectionBadge">${formatNumber(stores.length)} stores</div>
        </div>
        <div class="shareReportTableWrap">
          <table class="shareReportStoreTable">
            <thead>
              <tr>
                <th>Store ID</th>
                <th>Address</th>
                <th>Status</th>
                <th>Region / Territory / State</th>
                <th>Notes / Photos</th>
                <th>Latest Activity</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="6" data-label="Stores"><div class="shareReportMuted">No stores are available in this share payload.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function buildReportPhotoButtons(storeId, photos, limit) {
    const safePhotos = (Array.isArray(photos) ? photos : []).filter(photo => isSafeDisplayUrl(photo?.image_url));
    if (!safePhotos.length) return `<div class="shareReportEvidenceEmpty">No photo evidence captured.</div>`;
    return safePhotos.slice(0, limit).map((photo, index) => {
      const typeLabel = getPhotoTypeLabel(photo.photo_type || photo.type);
      return `
        <button class="shareReportPhotoButton" type="button" data-report-photo-store-id="${escapeHtml(storeId)}" data-report-photo-index="${index}" aria-label="Open Store ${escapeHtml(storeId)} ${escapeHtml(typeLabel)} photo">
          <img src="${escapeHtml(photo.image_url)}" alt="Store ${escapeHtml(storeId)} ${escapeHtml(typeLabel)} evidence" loading="lazy" />
        </button>
      `;
    }).join("");
  }

  function buildReportEvidenceNotes(notes) {
    const safeNotes = Array.isArray(notes) ? notes : [];
    if (!safeNotes.length) return `<div class="shareReportEvidenceEmpty">No field notes logged.</div>`;
    return safeNotes.slice(0, 3).map(note => `
      <article class="shareReportEvidenceNote">
        <div class="shareReportEvidenceNoteMeta">${escapeHtml(formatTimestamp(note.created_at) || "Note")}</div>
        <div class="shareReportEvidenceNoteText">${escapeHtml(truncateText(note.note || "No note text available", 360))}</div>
      </article>
    `).join("");
  }

  function buildFieldEvidenceSection(evidenceRows) {
    const noteCount = evidenceRows.reduce((sum, row) => sum + row.noteCount, 0);
    const photoCount = evidenceRows.reduce((sum, row) => sum + row.photoCount, 0);
    const diagnostics = `${formatNumber(evidenceRows.length)} stores with evidence | ${formatNumber(photoCount)} photos | ${formatNumber(noteCount)} notes`;

    return `
      <section class="shareReportPanel">
        <div class="shareReportSectionHeader">
          <div>
            <div class="shareReportSectionLabel">Field Evidence</div>
            <h2>Notes & Photos</h2>
          </div>
          <div class="shareReportSectionBadge">${formatNumber(evidenceRows.length)} stores</div>
        </div>
        <div class="shareReportEvidenceDiagnostics">${escapeHtml(diagnostics)}</div>
        <div class="shareReportEvidenceList">
          ${evidenceRows.length ? evidenceRows.map(row => `
            <details class="shareReportEvidenceCard" data-evidence-card>
              <summary class="shareReportEvidenceSummary">
                <div>
                  <div class="shareReportEvidenceStoreLine">
                    <span class="shareReportEvidenceStoreId">Store ${escapeHtml(row.storeId)}</span>
                    <span class="shareReportStatusBadge shareReportStatus-${escapeHtml(row.statusCode)}">${escapeHtml(row.statusLabel)}</span>
                  </div>
                  <div class="shareReportEvidenceAddress">${escapeHtml(row.address)}</div>
                  <div class="shareReportEvidencePreview">${escapeHtml(row.latestPreview)}</div>
                </div>
                <div class="shareReportEvidenceSide">
                  <div class="shareReportEvidenceCounts">
                    <span class="shareReportPill ${row.noteCount ? "has-data" : ""}">${formatNumber(row.noteCount)} notes</span>
                    <span class="shareReportPill ${row.photoCount ? "has-data" : ""}">${formatNumber(row.photoCount)} photos</span>
                  </div>
                  <div class="shareReportPhotoRail">${buildReportPhotoButtons(row.storeId, row.photos, 4)}</div>
                  <div class="shareReportEvidenceHint">Click to expand detail</div>
                </div>
              </summary>
              <div class="shareReportEvidenceExpanded">
                <div class="shareReportEvidenceExpandedGrid">
                  <div>
                    <div class="shareReportEvidenceSummaryTitle">Field Notes</div>
                    ${buildReportEvidenceNotes(row.notes)}
                  </div>
                  <div>
                    <div class="shareReportEvidenceSummaryTitle">Photo Evidence</div>
                    <div class="shareReportPhotoGrid">${buildReportPhotoButtons(row.storeId, row.photos, 4)}</div>
                  </div>
                </div>
              </div>
            </details>
          `).join("") : `
            <div class="shareReportEmptyCard">
              <div class="shareReportEmptyTitle">No field evidence in this scope</div>
              <div class="shareReportMuted">Status, scope metrics, and the store summary table are still included for stakeholder review.</div>
            </div>
          `}
        </div>
      </section>
    `;
  }

  function renderFullReport() {
    const root = getEl("shareReportContent");
    if (!root) return;

    const payload = state.payload || {};
    const project = payload.project || {};
    const summary = getPayloadSummary();
    const evidenceRows = getReportEvidenceRows();

    root.innerHTML = [
      buildReportHero(project, summary),
      buildReportUtilityBar(),
      buildExecutiveSummarySection(summary),
      buildDoneVsLeftSection(summary),
      buildStatusBreakdownSection(summary),
      buildGeographicOverviewSection(summary),
      buildRecentActivitySection(),
      buildDataHealthSection(summary),
      `<section class="shareReportDetailGrid">${buildStoreAppendixSection()}${buildFieldEvidenceSection(evidenceRows)}</section>`
    ].filter(Boolean).join("");
  }

  function createGeoJson(stores) {
    return {
      type: "FeatureCollection",
      features: stores
        .filter(store => hasValidCoordinatePair(store.lat, store.lng))
        .map(store => ({
          type: "Feature",
          properties: {
            store_id: String(store.store_id),
            status_code: normalizeStatusCode(store.status_code)
          },
          geometry: {
            type: "Point",
            coordinates: [Number(store.lng), Number(store.lat)]
          }
        }))
    };
  }

  function getDominantClusterStatusColorExpression() {
    return [
      "case",
      [
        "all",
        [">=", ["get", "closedCount"], ["get", "rescheduledCount"]],
        [">=", ["get", "closedCount"], ["get", "activeCount"]],
        [">=", ["get", "closedCount"], ["get", "completedCount"]],
        [">", ["get", "closedCount"], 0]
      ],
      "#ff2d2d",
      [
        "all",
        [">=", ["get", "rescheduledCount"], ["get", "activeCount"]],
        [">=", ["get", "rescheduledCount"], ["get", "completedCount"]],
        [">", ["get", "rescheduledCount"], 0]
      ],
      "#ff9900",
      [
        "all",
        [">=", ["get", "activeCount"], ["get", "completedCount"]],
        [">", ["get", "activeCount"], 0]
      ],
      "#64b5f6",
      [">", ["get", "completedCount"], 0],
      "#2ecc71",
      "#64b5f6"
    ];
  }

  function fitMapToStores(stores) {
    if (!state.map) return;
    const plottable = stores.filter(store => hasValidCoordinatePair(store.lat, store.lng));
    if (!plottable.length) {
      state.map.easeTo({ center: [-96, 38], zoom: 3.2, duration: 500 });
      return;
    }

    if (plottable.length === 1) {
      state.map.easeTo({
        center: [Number(plottable[0].lng), Number(plottable[0].lat)],
        zoom: 12.5,
        duration: 500
      });
      return;
    }

    const bounds = new mapboxgl.LngLatBounds();
    plottable.forEach(store => bounds.extend([Number(store.lng), Number(store.lat)]));
    state.map.fitBounds(bounds, {
      padding: 58,
      maxZoom: 8.8,
      duration: 500
    });
  }

  function initMap() {
    mapboxgl.accessToken = MAPBOX_TOKEN;
    state.map = new mapboxgl.Map({
      container: "shareMap",
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-96, 38],
      zoom: 3.2
    });
    state.map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    state.map.on("load", () => {
      state.map.addSource("share-stores", {
        type: "geojson",
        data: createGeoJson(getFilteredStores()),
        cluster: true,
        clusterRadius: 50,
        clusterProperties: {
          activeCount: ["+", ["case", ["==", ["get", "status_code"], "active"], 1, 0]],
          rescheduledCount: ["+", ["case", ["==", ["get", "status_code"], "rescheduled"], 1, 0]],
          completedCount: ["+", ["case", ["==", ["get", "status_code"], "completed"], 1, 0]],
          closedCount: ["+", ["case", ["==", ["get", "status_code"], "closed"], 1, 0]],
          totalCount: ["+", 1]
        }
      });

      state.map.addLayer({
        id: "share-clusters",
        type: "circle",
        source: "share-stores",
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": ["step", ["get", "point_count"], 26, 10, 30, 25, 34, 50, 38],
          "circle-color": getDominantClusterStatusColorExpression(),
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(255,255,255,0.2)",
          "circle-opacity": 0.93
        }
      });

      state.map.addLayer({
        id: "share-cluster-count",
        type: "symbol",
        source: "share-stores",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count}",
          "text-size": 14
        },
        paint: {
          "text-color": "#ffffff"
        }
      });

      state.map.addLayer({
        id: "share-points",
        type: "circle",
        source: "share-stores",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 8,
          "circle-color": [
            "match",
            ["get", "status_code"],
            "completed", "#2ecc71",
            "closed", "#ff2d2d",
            "rescheduled", "#ff9900",
            "#64b5f6"
          ],
          "circle-stroke-width": 1.6,
          "circle-stroke-color": "rgba(255,255,255,0.4)"
        }
      });

      state.map.on("click", "share-clusters", event => {
        const features = state.map.queryRenderedFeatures(event.point, { layers: ["share-clusters"] });
        if (!features.length) return;
        const clusterId = features[0].properties.cluster_id;
        state.map.getSource("share-stores").getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error) return;
          state.map.easeTo({ center: features[0].geometry.coordinates, zoom });
        });
      });

      state.map.on("click", "share-points", event => {
        const feature = event.features?.[0];
        if (!feature) return;
        selectStore(feature.properties.store_id, true);
      });

      ["share-clusters", "share-points"].forEach(layerId => {
        state.map.on("mouseenter", layerId, () => {
          state.map.getCanvas().style.cursor = "pointer";
        });
        state.map.on("mouseleave", layerId, () => {
          state.map.getCanvas().style.cursor = "";
        });
      });

      fitMapToStores(getFilteredStores());
    });
  }

  function updateMapData(shouldFit = false) {
    if (!state.map?.getSource("share-stores")) return;
    const stores = getFilteredStores();
    state.map.getSource("share-stores").setData(createGeoJson(stores));
    if (shouldFit) fitMapToStores(stores);
  }

  function selectStore(storeId, flyToStore) {
    const normalizedStoreId = String(storeId || "").trim();
    const store = getStores().find(item => String(item.store_id) === normalizedStoreId);
    state.selectedStoreId = normalizedStoreId;

    if (!store) {
      setText("shareSelectedStoreTitle", "No store selected");
      setText("shareSelectedStoreBody", "Select a map point to inspect store status and public project metadata.");
      renderSelectedStoreEvidence("");
      return;
    }

    setText("shareSelectedStoreTitle", `Store ${store.store_id}`);
    const locationParts = [
      store.store_name,
      store.full_address,
      store.city,
      store.state ? `State: ${store.state}` : "",
      store.region ? `Region: ${store.region}` : "",
      store.territory ? `Territory: ${store.territory}` : "",
      `Status: ${getStatusLabel(store.status_code)}`,
      store.status_reason ? `Reason: ${store.status_reason}` : ""
    ].filter(Boolean);

    const body = getEl("shareSelectedStoreBody");
    if (body) {
      body.innerHTML = locationParts.map(part => `<div>${escapeHtml(part)}</div>`).join("");
    }
    renderSelectedStoreEvidence(store.store_id);

    if (flyToStore && state.map && hasValidCoordinatePair(store.lat, store.lng)) {
      state.map.flyTo({
        center: [Number(store.lng), Number(store.lat)],
        zoom: Math.max(state.map.getZoom(), 11.5)
      });
    }
  }

  function handleFilterChange() {
    state.filters.region = String(getEl("shareRegionFilter")?.value || "");
    state.filters.territory = String(getEl("shareTerritoryFilter")?.value || "");
    state.filters.state = String(getEl("shareStateFilter")?.value || "");
    state.filters.status = String(getEl("shareStatusFilter")?.value || "");
    updateSummaryCards();
    renderStatusBreakdown();
    updateMapData(true);

    if (state.selectedStoreId && !getFilteredStores().some(store => String(store.store_id) === state.selectedStoreId)) {
      selectStore("");
    }
  }

  function bindControls() {
    const overviewTab = getEl("shareOverviewTabBtn");
    const reportTab = getEl("shareReportTabBtn");
    if (overviewTab) overviewTab.addEventListener("click", () => setActiveTab("overview"));
    if (reportTab) reportTab.addEventListener("click", () => setActiveTab("report"));

    const tabs = getEl("shareViewTabs");
    if (tabs) {
      tabs.addEventListener("keydown", event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const nextTab = state.activeTab === "report" ? "overview" : "report";
        setActiveTab(nextTab);
        getEl(nextTab === "report" ? "shareReportTabBtn" : "shareOverviewTabBtn")?.focus();
      });
    }

    ["shareRegionFilter", "shareTerritoryFilter", "shareStateFilter", "shareStatusFilter"].forEach(id => {
      const select = getEl(id);
      if (select) select.addEventListener("change", handleFilterChange);
    });

    const clearBtn = getEl("shareClearFiltersBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        state.filters = { region: "", territory: "", state: "", status: "" };
        populateFilters();
        handleFilterChange();
      });
    }

    const activityList = getEl("shareActivityList");
    if (activityList) {
      activityList.addEventListener("click", event => {
        const button = event.target.closest("[data-store-id]");
        if (!button) return;
        const storeId = String(button.dataset.storeId || "").trim();
        if (storeId) selectStore(storeId, true);
      });
    }

    const photosRoot = getEl("shareSelectedStorePhotos");
    if (photosRoot) {
      photosRoot.addEventListener("click", event => {
        const button = event.target.closest("[data-photo-index]");
        if (!button) return;
        const photo = state.selectedEvidencePhotos[Number(button.dataset.photoIndex)];
        if (photo) openPhotoLightbox(photo);
      });
    }

    const reportContent = getEl("shareReportContent");
    if (reportContent) {
      reportContent.addEventListener("click", async event => {
        const photoButton = event.target.closest("[data-report-photo-store-id]");
        if (photoButton) {
          event.preventDefault();
          event.stopPropagation();
          const storeId = String(photoButton.dataset.reportPhotoStoreId || "").trim();
          const photoIndex = Number(photoButton.dataset.reportPhotoIndex || 0);
          const photo = getStoreEvidence(storeId).photos[photoIndex];
          if (photo) openPhotoLightbox(photo);
          return;
        }

        const actionButton = event.target.closest("[data-report-action]");
        if (!actionButton) return;
        const action = String(actionButton.dataset.reportAction || "").trim();
        if (action === "overview") {
          setActiveTab("overview");
          return;
        }
        if (action === "print") {
          window.print();
          return;
        }
        if (action === "copy") {
          try {
            await copyTextToClipboard(getShareUrlForCopy());
            setReportActionStatus("Share link copied.");
          } catch (_) {
            setReportActionStatus("Copy failed. Use the browser address bar to copy this share link.");
          }
        }
      });
    }

    const lightbox = getEl("sharePhotoLightbox");
    if (lightbox) {
      lightbox.addEventListener("click", event => {
        if (event.target === lightbox) closePhotoLightbox();
      });
    }

    const closeLightboxBtn = getEl("sharePhotoLightboxClose");
    if (closeLightboxBtn) closeLightboxBtn.addEventListener("click", closePhotoLightbox);

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closePhotoLightbox();
    });

    window.addEventListener("hashchange", () => setActiveTab(getTabFromHash(), false));
    window.addEventListener("popstate", () => setActiveTab(getTabFromHash(), false));
  }

  function renderPayload(payload) {
    state.payload = payload;
    const project = payload.project || {};
    applyBranding(project);

    setText("shareProjectName", project.name || "Project Overview");
    const generated = formatTimestamp(payload.generated_at);
    const expires = formatTimestamp(payload.expires_at);
    setText("shareGeneratedMeta", [
      generated ? `Generated ${generated}` : "",
      expires ? `Link expires ${expires}` : ""
    ].filter(Boolean).join(" | "));

    populateFilters();
    updateSummaryCards();
    renderStatusBreakdown();
    renderDataHealth();
    renderActivity();
    renderFullReport();
    initMap();
    bindControls();
    setActiveTab(getTabFromHash(), Boolean(window.location.hash));

    getEl("shareApp")?.classList.remove("is-loading");
  }

  function showError(error) {
    const app = getEl("shareApp");
    app?.classList.remove("is-loading");
    app?.classList.add("hidden");
    const errorState = getEl("shareErrorState");
    if (errorState) errorState.classList.remove("hidden");
    setText("shareErrorTitle", error?.code === "missing_token" ? "Missing share token" : "Unable to load overview");
    setText("shareErrorMessage", error?.message || "The link may be expired, revoked, or malformed.");
  }

  async function init() {
    const token = getToken();
    if (!token) {
      const error = new Error("A share token is required.");
      error.code = "missing_token";
      showError(error);
      return;
    }

    try {
      const payload = await fetchSharePayload(token);
      renderPayload(payload);
    } catch (error) {
      showError(error);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
