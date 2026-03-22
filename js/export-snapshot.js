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
    button.title = isSignedIn() ? "Download a read-only project snapshot" : "Sign in to export a snapshot";
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

function getSnapshotMetrics(filteredStores) {
  const metrics = {
    total: filteredStores.length,
    active: 0,
    completed: 0,
    rescheduled: 0,
    closed: 0,
    notes: 0,
    photos: 0
  };

  filteredStores.forEach(store => {
    const statusCode = getSnapshotStatusCode(store);
    if (statusCode === "completed") metrics.completed += 1;
    else if (statusCode === "closed") metrics.closed += 1;
    else if (statusCode === "rescheduled") metrics.rescheduled += 1;
    else metrics.active += 1;

    const storeId = String(store.store_id);
    metrics.notes += noteRowsCache.filter(row => String(row.store_id) === storeId).length;
    metrics.photos += photoRowsCache.filter(row => String(row.store_id) === storeId).length;
  });

  const actionableTotal = Math.max(0, metrics.total - metrics.closed);
  metrics.completionRate = actionableTotal > 0 ? (metrics.completed / actionableTotal) * 100 : 0;
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

function getSnapshotStoreActivity(storeId) {
  const match = activityFeed.find(item => String(item.store_id) === String(storeId));
  if (!match) {
    return {
      timestampLabel: "—",
      summary: "No recent logged activity"
    };
  }

  return {
    timestampLabel: match.timestamp ? formatActivityTime(match.timestamp) : "—",
    summary: match.title || match.detail || "Recent activity recorded"
  };
}

function getSnapshotRows(filteredStores) {
  return filteredStores.map(store => {
    const storeId = String(store.store_id);
    const status = statusMap[storeId] || {};
    const statusCode = getSnapshotStatusCode(store);
    const noteCount = noteRowsCache.filter(row => String(row.store_id) === storeId).length;
    const photoCount = photoRowsCache.filter(row => String(row.store_id) === storeId).length;
    const activity = getSnapshotStoreActivity(storeId);

    return {
      storeId,
      address: store.full_address || [store.city, store.state].filter(Boolean).join(", ") || "No address on file",
      statusLabel: statusCode.charAt(0).toUpperCase() + statusCode.slice(1),
      rescheduleReason: statusCode === "rescheduled" ? String(status.status_reason || "").trim() : "",
      noteCount,
      photoCount,
      activityLabel: activity.timestampLabel,
      activitySummary: activity.summary,
      lat: Number(store.lat),
      lng: Number(store.lng)
    };
  });
}

function getStatusColor(statusCode) {
  if (statusCode === "completed") return "#2ecc71";
  if (statusCode === "closed") return "#ff2d2d";
  if (statusCode === "rescheduled") return "#ff9900";
  return "#64b5f6";
}

function buildSnapshotMapSvg(rows, width = 1100, height = 520) {
  const mappedRows = rows.filter(row => Number.isFinite(row.lng) && Number.isFinite(row.lat));
  if (mappedRows.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#0b1320" rx="24"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#dce8f5" font-family="Inter,Arial,sans-serif" font-size="22">No mappable store coordinates in current scope</text></svg>`;
  }

  let minLng = Math.min(...mappedRows.map(row => row.lng));
  let maxLng = Math.max(...mappedRows.map(row => row.lng));
  let minLat = Math.min(...mappedRows.map(row => row.lat));
  let maxLat = Math.max(...mappedRows.map(row => row.lat));

  if (minLng === maxLng) {
    minLng -= 0.02;
    maxLng += 0.02;
  }

  if (minLat === maxLat) {
    minLat -= 0.02;
    maxLat += 0.02;
  }

  const pad = 42;
  const innerWidth = width - (pad * 2);
  const innerHeight = height - (pad * 2);
  const project = (lng, lat) => {
    const x = pad + ((lng - minLng) / (maxLng - minLng)) * innerWidth;
    const y = pad + (1 - ((lat - minLat) / (maxLat - minLat))) * innerHeight;
    return { x, y };
  };

  const points = mappedRows.map(row => ({
    ...row,
    ...project(row.lng, row.lat),
    fill: getStatusColor(row.statusLabel.toLowerCase())
  }));

  const gridLines = Array.from({ length: 5 }).map((_, index) => {
    const x = pad + (innerWidth / 4) * index;
    const y = pad + (innerHeight / 4) * index;
    return `
      <line x1="${x}" y1="${pad}" x2="${x}" y2="${height - pad}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
      <line x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
    `;
  }).join("");

  const circles = points.map(point => `
    <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="7.5" fill="${point.fill}" stroke="rgba(255,255,255,0.86)" stroke-width="1.75" />
  `).join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Project scope map snapshot">
      <defs>
        <linearGradient id="snapshotBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#102032" />
          <stop offset="100%" stop-color="#09131f" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#snapshotBg)" rx="24" />
      <rect x="${pad}" y="${pad}" width="${innerWidth}" height="${innerHeight}" rx="20" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" />
      ${gridLines}
      ${circles}
      <text x="${pad}" y="28" fill="#dce8f5" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700">Scope map overview</text>
    </svg>
  `;
}

function buildSnapshotTableRows(rows) {
  return rows.map(row => `
    <tr>
      <td>${escapeSnapshotHtml(row.storeId)}</td>
      <td>${escapeSnapshotHtml(row.address)}</td>
      <td><span class="status status-${escapeSnapshotHtml(row.statusLabel.toLowerCase())}">${escapeSnapshotHtml(row.statusLabel)}</span></td>
      <td>${escapeSnapshotHtml(row.rescheduleReason || "—")}</td>
      <td>${row.noteCount}</td>
      <td>${row.photoCount}</td>
      <td>${escapeSnapshotHtml(row.activityLabel)}</td>
      <td>${escapeSnapshotHtml(row.activitySummary)}</td>
    </tr>
  `).join("");
}

function buildSnapshotRecentActivity(rows) {
  const scopedIds = new Set(rows.map(row => String(row.storeId)));
  const recent = activityFeed
    .filter(item => !item.store_id || scopedIds.has(String(item.store_id)))
    .slice(0, 8);

  if (recent.length === 0) {
    return `<div class="subtle">No recent activity logged for this scope.</div>`;
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

function buildSnapshotHtml(payload) {
  const { generatedAt, projectTitle, projectId, scopeMeta, metrics, mapSvg, rows, operationalSummary } = payload;

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
    --ink: #132237;
    --muted: #5d7187;
    --line: #d7e1ec;
    --active: #64b5f6;
    --completed: #2ecc71;
    --rescheduled: #ff9900;
    --closed: #ff2d2d;
  }
  * { box-sizing: border-box; }
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
    padding: 28px;
    display: grid;
    gap: 18px;
  }
  .hero,
  .panel {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 20px 22px;
  }
  .hero-top {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
  }
  .eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: var(--muted);
    margin-bottom: 8px;
  }
  h1 {
    margin: 0;
    font-size: 30px;
    line-height: 1.05;
  }
  .hero-copy {
    margin-top: 10px;
    color: var(--muted);
    line-height: 1.5;
    max-width: 820px;
  }
  .snapshot-meta {
    display: grid;
    gap: 6px;
    min-width: 260px;
    text-align: right;
    color: var(--muted);
    font-size: 13px;
  }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 12px;
  }
  .metric {
    background: #f8fbff;
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 14px;
  }
  .metric-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--muted);
    margin-bottom: 7px;
  }
  .metric-value {
    font-size: 24px;
    font-weight: 800;
    line-height: 1;
  }
  .subtle {
    color: var(--muted);
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
  .two-col {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(300px, .8fr);
    gap: 18px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
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
  }
  .status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 11px;
    color: #fff;
  }
  .status-active { background: var(--active); }
  .status-completed { background: var(--completed); color: #05391c; }
  .status-rescheduled { background: var(--rescheduled); color: #3c2400; }
  .status-closed { background: var(--closed); }
  .activity-row {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
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
  @media print {
    body { background: #fff; }
    .page { max-width: none; padding: 12mm; }
  }
  @media (max-width: 980px) {
    .metric-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .two-col { grid-template-columns: 1fr; }
    .hero-top { flex-direction: column; }
    .snapshot-meta { text-align: left; min-width: 0; }
  }
</style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <div class="hero-top">
        <div>
          <div class="eyebrow">Executive Snapshot</div>
          <h1>${escapeSnapshotHtml(projectTitle)}</h1>
          <div class="hero-copy">${escapeSnapshotHtml(operationalSummary)}</div>
        </div>
        <div class="snapshot-meta">
          <div><strong>Generated</strong>: ${escapeSnapshotHtml(generatedAt)}</div>
          <div><strong>Project ID</strong>: ${escapeSnapshotHtml(projectId)}</div>
          <div><strong>Scope</strong>: ${escapeSnapshotHtml(scopeMeta.scopeLabel)}</div>
          <div>${escapeSnapshotHtml(scopeMeta.scopeDescription)}</div>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="metric-grid">
        <div class="metric"><div class="metric-label">Total Stores</div><div class="metric-value">${metrics.total.toLocaleString()}</div></div>
        <div class="metric"><div class="metric-label">Active</div><div class="metric-value">${metrics.active.toLocaleString()}</div></div>
        <div class="metric"><div class="metric-label">Completed</div><div class="metric-value">${metrics.completed.toLocaleString()}</div></div>
        <div class="metric"><div class="metric-label">Rescheduled</div><div class="metric-value">${metrics.rescheduled.toLocaleString()}</div></div>
        <div class="metric"><div class="metric-label">Closed</div><div class="metric-value">${metrics.closed.toLocaleString()}</div></div>
        <div class="metric"><div class="metric-label">Completion Rate</div><div class="metric-value">${metrics.completionRate.toFixed(1)}%</div></div>
      </div>
    </section>

    <section class="panel">
      <div class="eyebrow">Map Overview</div>
      ${mapSvg}
      <div class="legend" style="margin-top:14px;">
        <div class="legend-item"><span class="dot" style="background:var(--active)"></span>Active</div>
        <div class="legend-item"><span class="dot" style="background:var(--completed)"></span>Completed</div>
        <div class="legend-item"><span class="dot" style="background:var(--rescheduled)"></span>Rescheduled</div>
        <div class="legend-item"><span class="dot" style="background:var(--closed)"></span>Closed</div>
      </div>
    </section>

    <section class="two-col">
      <div class="panel">
        <div class="eyebrow">Store Summary</div>
        <table>
          <thead>
            <tr>
              <th>Store ID</th>
              <th>Location</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Notes</th>
              <th>Photos</th>
              <th>Latest</th>
              <th>Activity</th>
            </tr>
          </thead>
          <tbody>
            ${buildSnapshotTableRows(rows)}
          </tbody>
        </table>
      </div>
      <div class="panel">
        <div class="eyebrow">Recent Activity</div>
        ${buildSnapshotRecentActivity(rows)}
      </div>
    </section>
  </div>
</body>
</html>`;
}

function exportProjectSnapshot() {
  const filteredStores = typeof getFilteredStores === "function" ? getFilteredStores() : [];
  const scopeMeta = getSnapshotScopeMeta(filteredStores);
  const metrics = getSnapshotMetrics(filteredStores);
  const rows = getSnapshotRows(filteredStores);
  const generatedAt = new Date().toLocaleString();
  const projectTitle = currentProjectMeta?.name || currentProjectId || "Project Snapshot";
  const mapSvg = buildSnapshotMapSvg(rows);
  const operationalSummary = document.getElementById("headerOperationalSummary")?.textContent
    || `${metrics.total.toLocaleString()} stores in scope with ${metrics.completed.toLocaleString()} completed and ${metrics.rescheduled.toLocaleString()} rescheduled.`;

  const snapshotWindow = window.open("", "_blank", "noopener,noreferrer,width=1280,height=960");
  if (!snapshotWindow) {
    alert("Unable to open the snapshot export window. Please allow pop-ups for this site.");
    return;
  }

  snapshotWindow.document.open();
  snapshotWindow.document.write(buildSnapshotHtml({
    generatedAt,
    projectTitle,
    projectId: currentProjectId,
    scopeMeta,
    metrics,
    mapSvg,
    rows,
    operationalSummary
  }));
  snapshotWindow.document.close();
}