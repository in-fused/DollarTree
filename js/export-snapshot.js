/* ================= SNAPSHOT EXPORT ================= */

function ensureSnapshotExportButton() {
  const projectPanel = document.querySelector(".panelProject");
  const importLink = document.getElementById("importProjectLink");
  if (!projectPanel || !importLink) return null;

  let button = document.getElementById("exportSnapshotBtn");
  if (!button) {
    button = document.createElement("button");
    button.id = "exportSnapshotBtn";
    button.type = "button";
    button.className = "btnSecondary";
    button.textContent = "Export Snapshot";
    importLink.insertAdjacentElement("afterend", button);
  } else if (button.previousElementSibling !== importLink) {
    importLink.insertAdjacentElement("afterend", button);
  }

  if (!button.dataset.bound) {
    button.addEventListener("click", exportProjectSnapshot);
    button.dataset.bound = "true";
  }

  return button;
}

function bindSnapshotExportUI() {
  const button = ensureSnapshotExportButton();
  if (button) {
    button.disabled = !isSignedIn();
    button.title = isSignedIn() ? "Open a read-only executive snapshot" : "Sign in to export a snapshot";
  }
}

function getSnapshotScopeMeta(filteredStores) {
  const hasFilters = Boolean(
    activeFilters?.region ||
    activeFilters?.territory ||
    activeFilters?.state ||
    activeFilters?.status ||
    showRemovedStores === true
  );

  return {
    scopeLabel: hasFilters ? "Filtered Scope" : "Full Project Scope",
    scopeDescription: hasFilters
      ? (document.getElementById("activeFilterSummary")?.textContent || `${filteredStores.length.toLocaleString()} stores in current filtered scope`)
      : `${filteredStores.length.toLocaleString()} stores in full project scope`
  };
}

function getSnapshotStatusCode(store) {
  const status = statusMap[String(store?.store_id)] || {};
  return normalizeStatusCode(
    status?.status_code,
    status?.completed === true,
    status?.closed === true
  );
}

function getSnapshotStoreActivity(storeId) {
  const match = activityFeed.find(item => String(item.store_id) === String(storeId));
  if (!match) {
    return {
      timestampLabel: "No recent activity",
      summary: "No logged activity in the current snapshot window",
      hasActivity: false,
      timestampValue: 0
    };
  }

  return {
    timestampLabel: match.timestamp ? formatActivityTime(match.timestamp) : "Recent activity",
    summary: match.title || match.detail || "Recent activity recorded",
    hasActivity: true,
    timestampValue: getTimestampValue(match.timestamp)
  };
}

function getSnapshotRows(filteredStores) {
  const statusPriority = {
    active: 0,
    rescheduled: 1,
    completed: 2,
    closed: 3
  };

  return filteredStores
    .map((store, index) => {
      const storeId = String(store.store_id);
      const status = statusMap[storeId] || {};
      const statusCode = getSnapshotStatusCode(store);
      const noteCount = noteRowsCache.filter(row => String(row.store_id) === storeId).length;
      const photoCount = photoRowsCache.filter(row => String(row.store_id) === storeId).length;
      const activity = getSnapshotStoreActivity(storeId);

      return {
        originalIndex: index,
        storeId,
        address: store.full_address || [store.city, store.state].filter(Boolean).join(", ") || "No address on file",
        statusCode,
        statusLabel: getStatusDisplayLabel(statusCode),
        rescheduleReason: statusCode === "rescheduled" ? String(status.status_reason || "").trim() : "",
        noteCount,
        photoCount,
        hasNotes: noteCount > 0,
        hasPhotos: photoCount > 0,
        activityLabel: activity.timestampLabel,
        activitySummary: activity.summary,
        hasActivity: activity.hasActivity,
        activityTimestampValue: activity.timestampValue,
        lat: Number(store.lat),
        lng: Number(store.lng),
        sortPriority: statusPriority[statusCode] ?? 99
      };
    })
    .sort((a, b) => {
      if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
      if (a.activityTimestampValue !== b.activityTimestampValue) return b.activityTimestampValue - a.activityTimestampValue;
      return a.originalIndex - b.originalIndex;
    });
}

function getSnapshotMetrics(filteredStores, rows) {
  const metrics = {
    total: filteredStores.length,
    active: 0,
    completed: 0,
    rescheduled: 0,
    closed: 0,
    notes: 0,
    photos: 0,
    storesWithNotes: 0,
    storesWithPhotos: 0,
    storesWithRecentActivity: 0
  };

  rows.forEach(row => {
    if (row.statusCode === "completed") metrics.completed += 1;
    else if (row.statusCode === "closed") metrics.closed += 1;
    else if (row.statusCode === "rescheduled") metrics.rescheduled += 1;
    else metrics.active += 1;

    metrics.notes += row.noteCount;
    metrics.photos += row.photoCount;
    if (row.hasNotes) metrics.storesWithNotes += 1;
    if (row.hasPhotos) metrics.storesWithPhotos += 1;
    if (row.hasActivity) metrics.storesWithRecentActivity += 1;
  });

  const actionableTotal = Math.max(0, metrics.total - metrics.closed);
  metrics.actionableTotal = actionableTotal;
  metrics.completionRate = actionableTotal > 0 ? (metrics.completed / actionableTotal) * 100 : 0;
  metrics.noteCoverageRate = metrics.total > 0 ? (metrics.storesWithNotes / metrics.total) * 100 : 0;
  metrics.photoCoverageRate = metrics.total > 0 ? (metrics.storesWithPhotos / metrics.total) * 100 : 0;
  metrics.rescheduledRate = metrics.total > 0 ? (metrics.rescheduled / metrics.total) * 100 : 0;
  metrics.closedRate = metrics.total > 0 ? (metrics.closed / metrics.total) * 100 : 0;
  metrics.activityCoverageRate = metrics.total > 0 ? (metrics.storesWithRecentActivity / metrics.total) * 100 : 0;

  return metrics;
}

function escapeSnapshotHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getStatusColor(statusCode) {
  if (statusCode === "completed") return "#2ecc71";
  if (statusCode === "closed") return "#ff2d2d";
  if (statusCode === "rescheduled") return "#ff9900";
  return "#64b5f6";
}

function clampLatitude(lat) {
  return Math.max(-85, Math.min(85, lat));
}

function mercatorY(lat) {
  const clampedLat = clampLatitude(lat);
  const rad = clampedLat * Math.PI / 180;
  return Math.log(Math.tan((Math.PI / 4) + (rad / 2)));
}

function getSnapshotMapData(rows, width = 1100, height = 520, padding = 48) {
  const mappedRows = rows.filter(row => Number.isFinite(row.lng) && Number.isFinite(row.lat));

  if (mappedRows.length === 0) {
    return null;
  }

  let minLng = Math.min(...mappedRows.map(row => row.lng));
  let maxLng = Math.max(...mappedRows.map(row => row.lng));
  let minLat = Math.min(...mappedRows.map(row => row.lat));
  let maxLat = Math.max(...mappedRows.map(row => row.lat));

  if (minLng === maxLng) {
    minLng -= 0.3;
    maxLng += 0.3;
  }

  if (minLat === maxLat) {
    minLat -= 0.3;
    maxLat += 0.3;
  }

  const mercatorMinY = mercatorY(maxLat);
  const mercatorMaxY = mercatorY(minLat);

  const innerWidth = width - (padding * 2);
  const innerHeight = height - (padding * 2);

  const points = mappedRows.map(row => {
    const xRatio = (row.lng - minLng) / (maxLng - minLng || 1);
    const currentY = mercatorY(row.lat);
    const yRatio = (currentY - mercatorMinY) / (mercatorMaxY - mercatorMinY || 1);

    return {
      ...row,
      fill: getStatusColor(row.statusCode),
      x: padding + (xRatio * innerWidth),
      y: padding + (yRatio * innerHeight)
    };
  });

  const accessToken = typeof mapboxgl !== "undefined" ? mapboxgl.accessToken : "";
  const bbox = [
    minLng.toFixed(5),
    minLat.toFixed(5),
    maxLng.toFixed(5),
    maxLat.toFixed(5)
  ].join(",");
  const encodedBbox = encodeURIComponent(`[${bbox}]`);
  const mapUrl = accessToken
    ? `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${encodedBbox}/${width}x${height}?padding=${padding},${padding},${padding},${padding}&logo=false&attribution=false&access_token=${encodeURIComponent(accessToken)}`
    : "";

  return {
    width,
    height,
    padding,
    points,
    mapUrl
  };
}

function buildSnapshotMapMarkup(rows, width = 1100, height = 520) {
  const mapData = getSnapshotMapData(rows, width, height, 48);

  if (!mapData) {
    return `
      <div class="snapshotMapFallback">
        <div class="snapshotMapFallbackTitle">No mappable store coordinates in current scope</div>
        <div class="snapshotMapFallbackText">The snapshot still includes metrics, store detail, and recent activity for stakeholder review.</div>
      </div>
    `;
  }

  const markers = mapData.points.map(point => `
    <div
      class="snapshotMapMarker"
      style="left:${point.x.toFixed(2)}px; top:${point.y.toFixed(2)}px; --marker-color:${escapeSnapshotHtml(point.fill)};"
      title="Store ${escapeSnapshotHtml(point.storeId)} · ${escapeSnapshotHtml(point.statusLabel)}"
      aria-label="Store ${escapeSnapshotHtml(point.storeId)} ${escapeSnapshotHtml(point.statusLabel)}">
    </div>
  `).join("");

  const background = mapData.mapUrl
    ? `<img class="snapshotMapImage" src="${escapeSnapshotHtml(mapData.mapUrl)}" alt="Geographic project footprint overview map" />`
    : `<div class="snapshotMapBackgroundFallback"></div>`;

  return `
    <div class="snapshotMapFrame" style="width:${mapData.width}px; height:${mapData.height}px;">
      ${background}
      <div class="snapshotMapOverlay">
        ${markers}
      </div>
      <div class="snapshotMapTopline">Geographic scope footprint</div>
      <div class="snapshotMapCaption">Store markers are positioned from live latitude/longitude coordinates across the current export scope.</div>
    </div>
  `;
}

function buildSnapshotMetricCards(metrics) {
  const cards = [
    { label: "Total Stores", value: metrics.total.toLocaleString() },
    { label: "Active", value: metrics.active.toLocaleString() },
    { label: "Completed", value: metrics.completed.toLocaleString() },
    { label: "Rescheduled", value: metrics.rescheduled.toLocaleString() },
    { label: "Closed", value: metrics.closed.toLocaleString() },
    { label: "Completion Rate", value: `${metrics.completionRate.toFixed(1)}%` },
    { label: "Note Coverage", value: `${metrics.noteCoverageRate.toFixed(1)}%` },
    { label: "Photo Coverage", value: `${metrics.photoCoverageRate.toFixed(1)}%` },
    { label: "Rescheduled %", value: `${metrics.rescheduledRate.toFixed(1)}%` },
    { label: "Stores w/ Activity", value: `${metrics.storesWithRecentActivity.toLocaleString()}` }
  ];

  return cards.map(card => `
    <div class="metric">
      <div class="metric-label">${escapeSnapshotHtml(card.label)}</div>
      <div class="metric-value">${escapeSnapshotHtml(card.value)}</div>
    </div>
  `).join("");
}

function buildSnapshotTableRows(rows) {
  return rows.map(row => `
    <tr>
      <td class="cell-store">
        <div class="store-id">${escapeSnapshotHtml(row.storeId)}</div>
      </td>
      <td class="cell-location">
        <div class="location-main">${escapeSnapshotHtml(row.address)}</div>
      </td>
      <td class="cell-status">
        <span class="status status-${escapeSnapshotHtml(row.statusCode)}">${escapeSnapshotHtml(row.statusLabel)}</span>
      </td>
      <td class="cell-reason">
        ${row.rescheduleReason
          ? `<div class="reason-text">${escapeSnapshotHtml(row.rescheduleReason)}</div>`
          : `<span class="muted-pill">—</span>`}
      </td>
      <td class="cell-count">
        <span class="count-pill ${row.hasNotes ? "has-data" : ""}">${row.noteCount}</span>
      </td>
      <td class="cell-count">
        <span class="count-pill ${row.hasPhotos ? "has-data" : ""}">${row.photoCount}</span>
      </td>
      <td class="cell-activity">
        <div class="activity-time-inline">${escapeSnapshotHtml(row.activityLabel)}</div>
        <div class="activity-summary-inline">${escapeSnapshotHtml(row.activitySummary)}</div>
      </td>
    </tr>
  `).join("");
}

function buildSnapshotRecentActivity(rows) {
  const scopedIds = new Set(rows.map(row => String(row.storeId)));
  const recent = activityFeed
    .filter(item => !item.store_id || scopedIds.has(String(item.store_id)))
    .slice(0, 8);

  if (recent.length === 0) {
    return `
      <div class="empty-state-card">
        <div class="empty-state-title">No recent activity in this scope</div>
        <div class="empty-state-copy">This export still captures live store status, scope metrics, and mapped execution visibility for stakeholder review.</div>
      </div>
    `;
  }

  return recent.map(item => `
    <div class="activity-row">
      <div class="activity-time">${escapeSnapshotHtml(item.timestamp ? formatActivityTime(item.timestamp) : "—")}</div>
      <div class="activity-body">
        <div class="activity-title">${escapeSnapshotHtml(item.title || "Operational update")}</div>
        <div class="activity-detail">${escapeSnapshotHtml(item.detail || "Recent activity recorded")}</div>
      </div>
    </div>
  `).join("");
}

function buildSnapshotStatusSummary(metrics) {
  const parts = [
    `${metrics.completed.toLocaleString()} completed`,
    `${metrics.active.toLocaleString()} active`,
    `${metrics.rescheduled.toLocaleString()} rescheduled`,
    `${metrics.closed.toLocaleString()} closed`
  ];

  return parts.join(" • ");
}

function buildSnapshotNarrative(payload) {
  const { metrics, scopeMeta } = payload;

  if (metrics.total === 0) {
    return `This snapshot was generated from live project data with no stores currently visible in the selected ${scopeMeta.scopeLabel.toLowerCase()}.`;
  }

  return `${metrics.total.toLocaleString()} stores are currently in scope. Actionable completion is ${metrics.completionRate.toFixed(1)}%, with ${metrics.storesWithPhotos.toLocaleString()} stores carrying photo evidence and ${metrics.storesWithRecentActivity.toLocaleString()} stores showing recent logged activity.`;
}

function buildSnapshotHtml(payload) {
  const {
    generatedAt,
    generatedTimeLabel,
    projectTitle,
    projectId,
    scopeMeta,
    metrics,
    mapMarkup,
    rows,
    operationalSummary,
    productLabel,
    returnUrl
  } = payload;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeSnapshotHtml(projectTitle)} Snapshot</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root {
    --bg: #f3f7fb;
    --panel: #ffffff;
    --panel-soft: #f8fbff;
    --ink: #132237;
    --muted: #5d7187;
    --line: #d7e1ec;
    --line-strong: #c3d3e2;
    --active: #64b5f6;
    --completed: #2ecc71;
    --rescheduled: #ff9900;
    --closed: #ff2d2d;
    --shadow: 0 14px 34px rgba(19, 34, 55, 0.06);
  }
  * { box-sizing: border-box; }
  html { background: var(--bg); }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: 100%;
    max-width: 1180px;
    margin: 0 auto;
    padding: 24px;
    display: grid;
    gap: 16px;
  }
  .hero,
  .panel,
  .utility-bar {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 18px;
    box-shadow: var(--shadow);
  }
  .hero {
    padding: 22px 24px;
  }
  .utility-bar {
    position: sticky;
    top: 0;
    z-index: 10;
    padding: 14px 18px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 18px;
  }
  .utility-copy {
    display: grid;
    gap: 4px;
  }
  .utility-title {
    font-size: 13px;
    font-weight: 800;
    letter-spacing: .02em;
  }
  .utility-subtitle {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
  }
  .utility-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
    align-items: center;
  }
  .utility-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    background: var(--panel-soft);
    border: 1px solid var(--line);
    color: var(--ink);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }
  .utility-btn {
    appearance: none;
    border: 1px solid var(--line-strong);
    background: #102032;
    color: #fff;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }
  .utility-btn.secondary {
    background: #fff;
    color: var(--ink);
  }
  .hero-top {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: flex-start;
  }
  .hero-eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .14em;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .hero-title {
    margin: 0;
    font-size: 32px;
    line-height: 1.02;
    letter-spacing: -.02em;
  }
  .hero-subtitle {
    margin-top: 8px;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.55;
    max-width: 760px;
  }
  .hero-meta {
    display: grid;
    gap: 8px;
    min-width: 290px;
  }
  .meta-card {
    background: var(--panel-soft);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 12px 14px;
  }
  .meta-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--muted);
    margin-bottom: 5px;
  }
  .meta-value {
    font-size: 13px;
    font-weight: 700;
    line-height: 1.4;
  }
  .summary-strip {
    margin-top: 16px;
    display: grid;
    grid-template-columns: 1.2fr .8fr;
    gap: 14px;
  }
  .summary-card {
    background: linear-gradient(180deg, #f9fbfe 0%, #f5f9fc 100%);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 14px 16px;
  }
  .summary-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .summary-body {
    font-size: 14px;
    line-height: 1.55;
    color: var(--ink);
  }
  .summary-kpis {
    display: grid;
    gap: 8px;
  }
  .summary-kpi-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
  }
  .summary-kpi-row span:last-child {
    font-weight: 800;
  }
  .panel {
    padding: 18px 20px;
  }
  .panel-eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: var(--muted);
    margin-bottom: 10px;
  }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }
  .metric {
    background: var(--panel-soft);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 12px 13px;
  }
  .metric-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .metric-value {
    font-size: 22px;
    font-weight: 800;
    line-height: 1;
  }
  .snapshotMapFrame {
    position: relative;
    width: 100%;
    max-width: 1100px;
    height: auto;
    aspect-ratio: 1100 / 520;
    overflow: hidden;
    border-radius: 20px;
    border: 1px solid var(--line);
    background: #dfe8f2;
  }
  .snapshotMapImage,
  .snapshotMapBackgroundFallback,
  .snapshotMapOverlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .snapshotMapImage {
    object-fit: cover;
    background: #dfe8f2;
  }
  .snapshotMapBackgroundFallback {
    background:
      linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02)),
      linear-gradient(135deg, #eef4fa 0%, #d7e5f0 100%);
  }
  .snapshotMapOverlay {
    pointer-events: none;
  }
  .snapshotMapMarker {
    position: absolute;
    width: 14px;
    height: 14px;
    margin-left: -7px;
    margin-top: -7px;
    border-radius: 999px;
    background: var(--marker-color);
    border: 2px solid rgba(255,255,255,0.95);
    box-shadow: 0 0 0 1px rgba(19,34,55,0.18), 0 4px 8px rgba(19,34,55,0.22);
  }
  .snapshotMapTopline {
    position: absolute;
    top: 14px;
    left: 16px;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(255,255,255,0.92);
    border: 1px solid rgba(19,34,55,0.08);
    font-size: 12px;
    font-weight: 800;
    color: var(--ink);
    z-index: 2;
  }
  .snapshotMapCaption {
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 14px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255,255,255,0.9);
    border: 1px solid rgba(19,34,55,0.08);
    color: var(--muted);
    font-size: 12px;
    line-height: 1.4;
    z-index: 2;
  }
  .snapshotMapFallback {
    min-height: 280px;
    border-radius: 18px;
    border: 1px dashed var(--line-strong);
    background: var(--panel-soft);
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 8px;
    padding: 24px;
    text-align: center;
  }
  .snapshotMapFallbackTitle {
    font-size: 18px;
    font-weight: 800;
  }
  .snapshotMapFallbackText {
    color: var(--muted);
    max-width: 640px;
    line-height: 1.5;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    color: var(--muted);
    font-size: 13px;
  }
  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    border: 1px solid rgba(0,0,0,.12);
    display: inline-block;
  }
  .analytics-footer {
    margin-top: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .analytics-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    background: #f8fbff;
    border: 1px solid var(--line);
    color: var(--ink);
    font-size: 12px;
    font-weight: 700;
  }
  .two-col {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(320px, .8fr);
    gap: 16px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
  }
  thead {
    display: table-header-group;
  }
  th, td {
    border-bottom: 1px solid var(--line);
    padding: 10px 8px;
    text-align: left;
    vertical-align: top;
  }
  th {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--muted);
    white-space: nowrap;
  }
  tr:nth-child(even) td {
    background: rgba(248, 251, 255, 0.6);
  }
  .store-id {
    font-weight: 800;
    color: var(--ink);
  }
  .location-main {
    line-height: 1.45;
  }
  .status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    font-weight: 800;
    font-size: 11px;
    color: #fff;
    white-space: nowrap;
  }
  .status-active { background: var(--active); }
  .status-completed { background: var(--completed); color: #05391c; }
  .status-rescheduled { background: var(--rescheduled); color: #3c2400; }
  .status-closed { background: var(--closed); }
  .reason-text,
  .activity-summary-inline {
    color: var(--ink);
    line-height: 1.45;
  }
  .activity-time-inline {
    font-weight: 700;
    margin-bottom: 2px;
    color: var(--muted);
    font-size: 11.5px;
  }
  .muted-pill,
  .count-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    min-height: 24px;
    padding: 0 8px;
    border-radius: 999px;
    background: #eef4fa;
    border: 1px solid var(--line);
    font-weight: 800;
    color: var(--muted);
  }
  .count-pill.has-data {
    background: #e9f7ef;
    color: #1e5b34;
    border-color: #cfe8d9;
  }
  .activity-row {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr);
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
  }
  .activity-row:last-child { border-bottom: none; }
  .activity-time {
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
  }
  .activity-title {
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 3px;
  }
  .activity-detail {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
  }
  .empty-state-card {
    border: 1px dashed var(--line-strong);
    border-radius: 14px;
    background: var(--panel-soft);
    padding: 16px;
  }
  .empty-state-title {
    font-size: 14px;
    font-weight: 800;
    margin-bottom: 6px;
  }
  .empty-state-copy {
    font-size: 13px;
    line-height: 1.5;
    color: var(--muted);
  }
  .footnote {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .print-only {
    display: none;
  }
  @media print {
    body { background: #fff; }
    .page { max-width: none; padding: 10mm; gap: 10px; }
    .utility-bar {
      position: static;
      box-shadow: none;
      page-break-inside: avoid;
    }
    .hero,
    .panel {
      box-shadow: none;
      page-break-inside: avoid;
    }
    .print-only {
      display: block;
    }
    .no-print {
      display: none !important;
    }
  }
  @media (max-width: 1020px) {
    .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .summary-strip,
    .two-col { grid-template-columns: 1fr; }
    .hero-top,
    .utility-bar { flex-direction: column; }
    .hero-meta { min-width: 0; width: 100%; }
    .utility-actions { justify-content: flex-start; }
  }
</style>
</head>
<body>
  <div class="page">
    <section class="utility-bar no-print">
      <div class="utility-copy">
        <div class="utility-title">Executive snapshot ready for review, sharing, and PDF export</div>
        <div class="utility-subtitle">Generated from live project data for the selected scope at ${escapeSnapshotHtml(generatedAt)}. Use Print to save as PDF, or return to the app when finished.</div>
      </div>
      <div class="utility-actions">
        <button id="snapshotReturnBtn" class="utility-btn secondary" type="button">Back to App</button>
        <button id="snapshotPrintBtn" class="utility-btn" type="button">Print / Save as PDF</button>
        <span class="utility-chip">${escapeSnapshotHtml(scopeMeta.scopeLabel)}</span>
        <span class="utility-chip">${escapeSnapshotHtml(generatedTimeLabel)}</span>
      </div>
    </section>

    <section class="hero">
      <div class="hero-top">
        <div>
          <div class="hero-eyebrow">${escapeSnapshotHtml(productLabel)}</div>
          <h1 class="hero-title">${escapeSnapshotHtml(projectTitle)}</h1>
          <div class="hero-subtitle">${escapeSnapshotHtml(operationalSummary)}</div>
        </div>

        <div class="hero-meta">
          <div class="meta-card">
            <div class="meta-label">Project Context</div>
            <div class="meta-value">${escapeSnapshotHtml(projectId)}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">Scope</div>
            <div class="meta-value">${escapeSnapshotHtml(scopeMeta.scopeLabel)} · ${escapeSnapshotHtml(scopeMeta.scopeDescription)}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">Generated</div>
            <div class="meta-value">${escapeSnapshotHtml(generatedAt)}</div>
          </div>
        </div>
      </div>

      <div class="summary-strip">
        <div class="summary-card">
          <div class="summary-title">Operational Summary</div>
          <div class="summary-body">${escapeSnapshotHtml(buildSnapshotNarrative(payload))}</div>
        </div>
        <div class="summary-card">
          <div class="summary-title">Snapshot Highlights</div>
          <div class="summary-kpis">
            <div class="summary-kpi-row"><span>Status Mix</span><span>${escapeSnapshotHtml(buildSnapshotStatusSummary(metrics))}</span></div>
            <div class="summary-kpi-row"><span>Actionable Scope</span><span>${metrics.actionableTotal.toLocaleString()} stores</span></div>
            <div class="summary-kpi-row"><span>Photo Evidence</span><span>${metrics.storesWithPhotos.toLocaleString()} stores</span></div>
            <div class="summary-kpi-row"><span>Recent Activity</span><span>${metrics.storesWithRecentActivity.toLocaleString()} stores</span></div>
          </div>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-eyebrow">Operational Metrics</div>
      <div class="metric-grid">
        ${buildSnapshotMetricCards(metrics)}
      </div>
      <div class="analytics-footer">
        <div class="analytics-pill">Completion vs actionable scope: ${metrics.completed.toLocaleString()} / ${metrics.actionableTotal.toLocaleString()}</div>
        <div class="analytics-pill">Note coverage: ${metrics.storesWithNotes.toLocaleString()} stores</div>
        <div class="analytics-pill">Photo coverage: ${metrics.storesWithPhotos.toLocaleString()} stores</div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-eyebrow">Map Overview</div>
      ${mapMarkup}
      <div class="legend" style="margin-top:14px;">
        <div class="legend-item"><span class="dot" style="background:var(--active)"></span>Active</div>
        <div class="legend-item"><span class="dot" style="background:var(--completed)"></span>Completed</div>
        <div class="legend-item"><span class="dot" style="background:var(--rescheduled)"></span>Rescheduled</div>
        <div class="legend-item"><span class="dot" style="background:var(--closed)"></span>Closed</div>
      </div>
      <div class="footnote" style="margin-top:10px;">Map markers are placed from current-scope geographic coordinates and colored by execution status for stakeholder-ready footprint review.</div>
    </section>

    <section class="two-col">
      <div class="panel">
        <div class="panel-eyebrow">Store Summary</div>
        <div class="footnote" style="margin-bottom:10px;">Rows are grouped for presentation by active, rescheduled, completed, then closed status, with the most recent activity surfaced first inside each group.</div>
        <table>
          <thead>
            <tr>
              <th>Store ID</th>
              <th>Location</th>
              <th>Status</th>
              <th>Reschedule Reason</th>
              <th>Notes</th>
              <th>Photos</th>
              <th>Latest Activity</th>
            </tr>
          </thead>
          <tbody>
            ${buildSnapshotTableRows(rows)}
          </tbody>
        </table>
      </div>

      <div class="panel">
        <div class="panel-eyebrow">Recent Activity</div>
        ${buildSnapshotRecentActivity(rows)}
      </div>
    </section>

    <div class="print-only footnote">Generated from live project data via ${escapeSnapshotHtml(productLabel)} on ${escapeSnapshotHtml(generatedAt)}.</div>
  </div>

  <script>
    (function () {
      const returnUrl = ${JSON.stringify(returnUrl)};
      const printBtn = document.getElementById("snapshotPrintBtn");
      const returnBtn = document.getElementById("snapshotReturnBtn");

      if (printBtn) {
        printBtn.addEventListener("click", function () {
          window.print();
        });
      }

      if (returnBtn) {
        returnBtn.addEventListener("click", function () {
          if (returnUrl) {
            window.location.href = returnUrl;
            return;
          }

          if (document.referrer && document.referrer !== location.href) {
            window.location.href = document.referrer;
            return;
          }

          window.location.reload();
        });
      }
    })();
  </script>
</body>
</html>`;
}

function exportProjectSnapshot() {
  const filteredStores = typeof getFilteredStores === "function" ? getFilteredStores() : [];
  const scopeMeta = getSnapshotScopeMeta(filteredStores);
  const rows = getSnapshotRows(filteredStores);
  const metrics = getSnapshotMetrics(filteredStores, rows);
  const generatedDate = new Date();
  const generatedAt = generatedDate.toLocaleString();
  const generatedTimeLabel = `Generated ${generatedDate.toLocaleDateString()} • ${generatedDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  const projectTitle = currentProjectMeta?.name || currentProjectId || "Project Snapshot";
  const mapMarkup = buildSnapshotMapMarkup(rows);
  const operationalSummary = document.getElementById("headerOperationalSummary")?.textContent
    || `${metrics.total.toLocaleString()} stores in scope with ${metrics.completed.toLocaleString()} completed, ${metrics.rescheduled.toLocaleString()} rescheduled, and ${metrics.closed.toLocaleString()} closed.`;
  const productLabel = "Route Builder Executive Snapshot";
  const returnUrl = window.location.href;

  document.open();
  document.write(buildSnapshotHtml({
    generatedAt,
    generatedTimeLabel,
    projectTitle,
    projectId: currentProjectId,
    scopeMeta,
    metrics,
    mapMarkup,
    rows,
    operationalSummary,
    productLabel,
    returnUrl
  }));
  document.close();
}