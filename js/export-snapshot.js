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

function buildExecutionStatusBreakdown(metrics) {
  const segments = [
    { key: "active", label: "Active", value: metrics.active },
    { key: "rescheduled", label: "Rescheduled", value: metrics.rescheduled },
    { key: "completed", label: "Completed", value: metrics.completed },
    { key: "closed", label: "Closed", value: metrics.closed }
  ];

  const total = Math.max(metrics.total, 1);

  return segments.map(segment => {
    const percent = metrics.total > 0 ? (segment.value / total) * 100 : 0;
    return `
      <div class="statusBreakdownRow">
        <div class="statusBreakdownMeta">
          <div class="statusBreakdownLabelWrap">
            <span class="statusSwatch statusSwatch-${escapeSnapshotHtml(segment.key)}"></span>
            <span class="statusBreakdownLabel">${escapeSnapshotHtml(segment.label)}</span>
          </div>
          <div class="statusBreakdownValue">${segment.value.toLocaleString()} <span>${percent.toFixed(1)}%</span></div>
        </div>
        <div class="statusBreakdownBarTrack">
          <div class="statusBreakdownBarFill statusBreakdownBarFill-${escapeSnapshotHtml(segment.key)}" style="width:${percent.toFixed(2)}%;"></div>
        </div>
      </div>
    `;
  }).join("");
}

function buildOperationalStatusRows(metrics) {
  const rows = [
    {
      label: "Completion vs Actionable Scope",
      value: `${metrics.completed.toLocaleString()} / ${metrics.actionableTotal.toLocaleString()}`,
      detail: `${metrics.completionRate.toFixed(1)}% of non-closed stores completed`
    },
    {
      label: "Recent Activity Coverage",
      value: `${metrics.storesWithRecentActivity.toLocaleString()} stores`,
      detail: `${metrics.activityCoverageRate.toFixed(1)}% of current scope has recent logged activity`
    },
    {
      label: "Field Notes Coverage",
      value: `${metrics.storesWithNotes.toLocaleString()} stores`,
      detail: `${metrics.noteCoverageRate.toFixed(1)}% of scope includes notes`
    },
    {
      label: "Photo Evidence Coverage",
      value: `${metrics.storesWithPhotos.toLocaleString()} stores`,
      detail: `${metrics.photoCoverageRate.toFixed(1)}% of scope includes photos`
    },
    {
      label: "Rescheduled Work",
      value: `${metrics.rescheduled.toLocaleString()} stores`,
      detail: `${metrics.rescheduledRate.toFixed(1)}% of scope is rescheduled`
    },
    {
      label: "Closed Scope",
      value: `${metrics.closed.toLocaleString()} stores`,
      detail: `${metrics.closedRate.toFixed(1)}% of scope is closed`
    }
  ];

  return rows.map(row => `
    <div class="executionStatRow">
      <div>
        <div class="executionStatLabel">${escapeSnapshotHtml(row.label)}</div>
        <div class="executionStatDetail">${escapeSnapshotHtml(row.detail)}</div>
      </div>
      <div class="executionStatValue">${escapeSnapshotHtml(row.value)}</div>
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
        <div class="empty-state-copy">This export still captures live store status, scope metrics, and grouped store detail for stakeholder review.</div>
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
    --bg: #eaf0f6;
    --panel: #f6f9fc;
    --panel-soft: #edf3f8;
    --panel-strong: #ffffff;
    --ink: #102132;
    --muted: #55697e;
    --line: #cfdae5;
    --line-strong: #bccbda;
    --active: #64b5f6;
    --completed: #2ecc71;
    --rescheduled: #ff9900;
    --closed: #ff2d2d;
    --shadow: 0 16px 36px rgba(16, 33, 50, 0.08);
    --shadow-soft: 0 10px 24px rgba(16, 33, 50, 0.05);
  }
  * { box-sizing: border-box; }
  html { background: var(--bg); }
  body {
    margin: 0;
    background:
      radial-gradient(circle at top left, rgba(255,255,255,0.55), transparent 30%),
      linear-gradient(180deg, #eef4f9 0%, #e6edf4 100%);
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
    background: rgba(248, 251, 254, 0.96);
    border: 1px solid rgba(188, 203, 218, 0.92);
    border-radius: 18px;
    box-shadow: var(--shadow);
    backdrop-filter: blur(4px);
  }
  .hero {
    padding: 22px 24px;
    background: linear-gradient(180deg, rgba(250, 252, 254, 0.98) 0%, rgba(243, 248, 252, 0.98) 100%);
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
    background: rgba(245, 249, 252, 0.96);
  }
  .utility-copy { display: grid; gap: 4px; }
  .utility-title { font-size: 13px; font-weight: 800; letter-spacing: .02em; color: #12273a; }
  .utility-subtitle { color: var(--muted); font-size: 12px; line-height: 1.45; }
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
    background: #e9f0f6;
    border: 1px solid var(--line);
    color: #21384d;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }
  .utility-btn {
    appearance: none;
    border: 1px solid rgba(16, 33, 50, 0.12);
    background: #183048;
    color: #fff;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: var(--shadow-soft);
  }
  .utility-btn.secondary {
    background: rgba(255,255,255,0.88);
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
    color: #6b8095;
    margin-bottom: 8px;
  }
  .hero-title {
    margin: 0;
    font-size: 32px;
    line-height: 1.02;
    letter-spacing: -.02em;
    color: #102132;
  }
  .hero-subtitle {
    margin-top: 8px;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.55;
    max-width: 760px;
  }
  .hero-meta { display: grid; gap: 8px; min-width: 290px; }
  .meta-card {
    background: rgba(236, 243, 248, 0.92);
    border: 1px solid rgba(188, 203, 218, 0.88);
    border-radius: 14px;
    padding: 12px 14px;
  }
  .meta-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: #73879c;
    margin-bottom: 5px;
  }
  .meta-value { font-size: 13px; font-weight: 700; line-height: 1.4; color: #162b3e; }
  .summary-strip {
    margin-top: 16px;
    display: grid;
    grid-template-columns: 1.2fr .8fr;
    gap: 14px;
  }
  .summary-card {
    background: linear-gradient(180deg, rgba(242, 247, 251, 0.96) 0%, rgba(235, 242, 248, 0.96) 100%);
    border: 1px solid rgba(188, 203, 218, 0.88);
    border-radius: 16px;
    padding: 14px 16px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.55);
  }
  .summary-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: #70859a;
    margin-bottom: 8px;
  }
  .summary-body {
    font-size: 14px;
    line-height: 1.55;
    color: #13283b;
  }
  .summary-kpis { display: grid; gap: 8px; }
  .summary-kpi-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
    color: #24384c;
  }
  .summary-kpi-row span:last-child { font-weight: 800; }
  .panel { padding: 18px 20px; }
  .panel-eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: #70859a;
    margin-bottom: 10px;
  }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }
  .metric {
    background: linear-gradient(180deg, rgba(242, 247, 251, 0.98) 0%, rgba(234, 241, 247, 0.98) 100%);
    border: 1px solid rgba(188, 203, 218, 0.84);
    border-radius: 14px;
    padding: 12px 13px;
    box-shadow: var(--shadow-soft);
  }
  .metric-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: #6f8398;
    margin-bottom: 8px;
  }
  .metric-value {
    font-size: 22px;
    font-weight: 800;
    line-height: 1;
    color: #13283b;
  }
  .executionOverviewGrid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, .95fr);
    gap: 16px;
  }
  .executionSummaryCard,
  .executionStatusCard {
    background: linear-gradient(180deg, rgba(244, 248, 252, 0.98) 0%, rgba(236, 242, 248, 0.98) 100%);
    border: 1px solid rgba(188, 203, 218, 0.86);
    border-radius: 16px;
    padding: 16px;
    box-shadow: var(--shadow-soft);
  }
  .executionLead {
    font-size: 15px;
    line-height: 1.6;
    color: #13283b;
    margin-bottom: 14px;
  }
  .executionStatStack {
    display: grid;
    gap: 10px;
  }
  .executionStatRow {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    align-items: flex-start;
    padding: 10px 0;
    border-top: 1px solid rgba(16,33,50,0.08);
  }
  .executionStatRow:first-child {
    border-top: none;
    padding-top: 0;
  }
  .executionStatLabel {
    font-size: 13px;
    font-weight: 800;
    margin-bottom: 3px;
    color: #173047;
  }
  .executionStatDetail {
    font-size: 12px;
    line-height: 1.45;
    color: var(--muted);
  }
  .executionStatValue {
    font-size: 14px;
    font-weight: 800;
    white-space: nowrap;
    color: #102132;
  }
  .statusBreakdownStack {
    display: grid;
    gap: 12px;
  }
  .statusBreakdownRow {
    display: grid;
    gap: 6px;
  }
  .statusBreakdownMeta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .statusBreakdownLabelWrap {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 800;
    color: #173047;
  }
  .statusSwatch {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    border: 1px solid rgba(0,0,0,.08);
  }
  .statusSwatch-active { background: var(--active); }
  .statusSwatch-rescheduled { background: var(--rescheduled); }
  .statusSwatch-completed { background: var(--completed); }
  .statusSwatch-closed { background: var(--closed); }
  .statusBreakdownValue {
    font-size: 13px;
    font-weight: 800;
    color: #13283b;
  }
  .statusBreakdownValue span {
    color: var(--muted);
    font-weight: 700;
    margin-left: 6px;
  }
  .statusBreakdownBarTrack {
    height: 10px;
    border-radius: 999px;
    background: #dee8f1;
    overflow: hidden;
    box-shadow: inset 0 1px 1px rgba(16,33,50,0.04);
  }
  .statusBreakdownBarFill {
    height: 100%;
    border-radius: 999px;
  }
  .statusBreakdownBarFill-active { background: var(--active); }
  .statusBreakdownBarFill-rescheduled { background: var(--rescheduled); }
  .statusBreakdownBarFill-completed { background: var(--completed); }
  .statusBreakdownBarFill-closed { background: var(--closed); }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    color: var(--muted);
    font-size: 13px;
  }
  .legendItem {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .legendDot {
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
    background: #edf3f8;
    border: 1px solid rgba(188, 203, 218, 0.88);
    color: #203648;
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
  thead { display: table-header-group; }
  th, td {
    border-bottom: 1px solid rgba(188, 203, 218, 0.88);
    padding: 10px 8px;
    text-align: left;
    vertical-align: top;
  }
  th {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: #70859a;
    white-space: nowrap;
  }
  tr:nth-child(even) td { background: rgba(236, 243, 248, 0.56); }
  .store-id { font-weight: 800; color: #13283b; }
  .location-main { line-height: 1.45; color: #203648; }
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
  .activity-summary-inline { color: #203648; line-height: 1.45; }
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
    background: #e7eef5;
    border: 1px solid rgba(188, 203, 218, 0.88);
    font-weight: 800;
    color: var(--muted);
  }
  .count-pill.has-data {
    background: #e6f4eb;
    color: #1e5b34;
    border-color: #c6decf;
  }
  .activity-row {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr);
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid rgba(188, 203, 218, 0.88);
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
    color: #173047;
  }
  .activity-detail {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
  }
  .empty-state-card {
    border: 1px dashed var(--line-strong);
    border-radius: 14px;
    background: rgba(239, 245, 250, 0.92);
    padding: 16px;
  }
  .empty-state-title {
    font-size: 14px;
    font-weight: 800;
    margin-bottom: 6px;
    color: #173047;
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
  .print-only { display: none; }
  @media print {
    body {
      background: #fff;
    }
    .page {
      max-width: none;
      padding: 10mm;
      gap: 10px;
    }
    .utility-bar,
    .hero,
    .panel {
      box-shadow: none;
      backdrop-filter: none;
      background: #fff;
      border-color: #d6dce3;
    }
    .summary-card,
    .executionSummaryCard,
    .executionStatusCard,
    .metric,
    .meta-card {
      background: #fff;
      box-shadow: none;
    }
    .utility-bar {
      position: static;
      page-break-inside: avoid;
    }
    .hero,
    .panel {
      page-break-inside: avoid;
    }
    .print-only { display: block; }
    .no-print { display: none !important; }
  }
  @media (max-width: 1020px) {
    .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .summary-strip,
    .executionOverviewGrid,
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
      <div class="panel-eyebrow">Operational Status Overview</div>
      <div class="executionOverviewGrid">
        <div class="executionSummaryCard">
          <div class="summary-title">Executive Readout</div>
          <div class="executionLead">${escapeSnapshotHtml(buildSnapshotNarrative(payload))}</div>
          <div class="executionStatStack">
            ${buildOperationalStatusRows(metrics)}
          </div>
        </div>

        <div class="executionStatusCard">
          <div class="summary-title">Status Distribution</div>
          <div class="statusBreakdownStack">
            ${buildExecutionStatusBreakdown(metrics)}
          </div>
          <div class="legend" style="margin-top:14px;">
            <div class="legendItem"><span class="legendDot" style="background:var(--active)"></span>Active</div>
            <div class="legendItem"><span class="legendDot" style="background:var(--rescheduled)"></span>Rescheduled</div>
            <div class="legendItem"><span class="legendDot" style="background:var(--completed)"></span>Completed</div>
            <div class="legendItem"><span class="legendDot" style="background:var(--closed)"></span>Closed</div>
          </div>
          <div class="footnote" style="margin-top:10px;">This section replaces the export map intentionally, emphasizing execution status, scope health, and stakeholder-ready analytics in a cleaner printable format.</div>
        </div>
      </div>
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
    rows,
    operationalSummary,
    productLabel,
    returnUrl
  }));
  document.close();
}

function slugifyExportName(value) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-") || "export";
}

const ANALYTICS_EXPORT_SCHEMA_VERSION = "11.1k-bundled";
const ANALYTICS_CSV_HEADERS = [
  "rowType",
  "projectId",
  "projectName",
  "generatedAt",
  "scopeLabel",
  "scopeDescription",
  "totalStores",
  "active",
  "rescheduled",
  "completed",
  "closed",
  "openWorkCount",
  "completionRate",
  "actionableRate",
  "noteCoverageRate",
  "photoCoverageRate",
  "activityCoverageRate",
  "recentActivityCoverageRate",
  "integrityIssueCount",
  "integrityIssueRate",
  "storesWithNoUpdates",
  "storesWithNotesNoPhotos",
  "storesWithPhotosNoNotes",
  "stalledActiveCount",
  "rescheduledNoReasonCount",
  "rescheduledNoRecentFollowUpCount",
  "completedToday",
  "avgCompletedPerDay",
  "etaDays",
  "attentionNeededCount",
  "snapshotNotes",
  "snapshotPhotos",
  "storesWithNotes",
  "storesWithPhotos",
  "storesWithRecentActivity",
  "actionableTotal",
  "storeId",
  "address",
  "statusCode",
  "statusLabel",
  "rescheduleReason",
  "noteCount",
  "photoCount",
  "hasNotes",
  "hasPhotos",
  "hasActivity",
  "activityLabel",
  "activitySummary",
  "activityTimestampValue"
];

function buildAnalyticsExportPayload() {
  const filteredStores = typeof getFilteredStores === "function" ? getFilteredStores() : [];
  const scopeMeta = getSnapshotScopeMeta(filteredStores);
  const rows = getSnapshotRows(filteredStores);
  const snapshotMetrics = getSnapshotMetrics(filteredStores, rows);
  const analyticsSnapshot = typeof getProjectAnalyticsSnapshot === "function" ? getProjectAnalyticsSnapshot() : {};
  const projectId = analyticsSnapshot.projectId || currentProjectId || "";
  const projectName = analyticsSnapshot.projectName || currentProjectMeta?.name || currentProjectId || "Project Snapshot";
  const generatedAt = analyticsSnapshot.generatedAt || new Date().toISOString();
  const scopeLabel = analyticsSnapshot.scopeLabel || scopeMeta.scopeLabel;
  const metrics = analyticsSnapshot.metrics || {};
  const totalRows = rows.length + 1;
  const detailRows = rows.length;

  return {
    exportType: "analytics_export",
    schemaVersion: ANALYTICS_EXPORT_SCHEMA_VERSION,
    exportFormat: "route_builder_analytics",
    exportedBy: "Route Builder",
    exportedAtLocal: new Date().toLocaleString(),
    exportReady: true,
    exportMode: "manual_download",
    transport: "browser_blob_download",
    payloadHealth: {
      hasProjectId: Boolean(projectId),
      hasProjectName: Boolean(projectName),
      hasScopeLabel: Boolean(scopeLabel),
      hasRows: totalRows > 0,
      hasMetricsObject: Boolean(metrics && typeof metrics === "object" && !Array.isArray(metrics))
    },
    rowSchema: {
      summaryRowType: "project_summary",
      detailRowType: "store_detail"
    },
    exportSummary: {
      rowCount: totalRows,
      storeRowCount: detailRows,
      includesProjectSummaryRow: true,
      includesStoreDetailRows: detailRows > 0,
      scopeDescription: scopeMeta.scopeDescription
    },
    exportCounts: {
      totalRows,
      summaryRows: 1,
      detailRows
    },
    exportIntegrity: {
      hasRows: totalRows > 0,
      hasSummaryRow: true,
      hasDetailRows: detailRows > 0,
      csvHeaderCount: ANALYTICS_CSV_HEADERS.length,
      schemaVersion: ANALYTICS_EXPORT_SCHEMA_VERSION
    },
    ingestionHints: {
      preferredKeyField: "storeId",
      preferredTimestampField: "generatedAt",
      preferredRowTypeField: "rowType",
      supportsSummaryRow: true,
      supportsDetailRows: true
    },
    projectId,
    projectName,
    generatedAt,
    scopeLabel,
    metrics,
    scopeMeta,
    snapshotMetrics,
    rows
  };
}

function buildAnalyticsExportBaseName(payload) {
  const exportPayload = payload || buildAnalyticsExportPayload();
  const projectName = exportPayload.projectName || "project";
  const scopeLabel = exportPayload.scopeLabel || "scope";
  const generatedAt = exportPayload.generatedAt ? new Date(exportPayload.generatedAt) : new Date();
  const safeGeneratedAt = Number.isNaN(generatedAt.getTime()) ? new Date() : generatedAt;
  const dateStamp = safeGeneratedAt.toISOString().slice(0, 10);

  return `${slugifyExportName(projectName)}-${slugifyExportName(scopeLabel)}-analytics-${dateStamp}`;
}

function buildAnalyticsExportManifest(payload) {
  const exportPayload = payload || buildAnalyticsExportPayload();
  const exportCounts = exportPayload.exportCounts || {};
  const ingestionHints = exportPayload.ingestionHints || {};
  const exportIntegrity = exportPayload.exportIntegrity || {};

  return {
    exportType: exportPayload.exportType,
    schemaVersion: exportPayload.schemaVersion,
    exportFormat: exportPayload.exportFormat,
    exportedBy: exportPayload.exportedBy,
    generatedAt: exportPayload.generatedAt,
    exportedAtLocal: exportPayload.exportedAtLocal,
    projectId: exportPayload.projectId,
    projectName: exportPayload.projectName,
    scopeLabel: exportPayload.scopeLabel,
    totalRows: exportCounts.totalRows,
    summaryRows: exportCounts.summaryRows,
    detailRows: exportCounts.detailRows,
    csvHeaderCount: exportIntegrity.csvHeaderCount,
    supportsSummaryRow: ingestionHints.supportsSummaryRow === true,
    supportsDetailRows: ingestionHints.supportsDetailRows === true
  };
}

function estimateAnalyticsCsvBytes(payload) {
  return new Blob([serializeAnalyticsSnapshotToCsv(payload)], { type: "text/csv;charset=utf-8" }).size;
}

function estimateAnalyticsJsonBytes(payload) {
  const exportPayload = payload || buildAnalyticsExportPayload();
  return new Blob([`${JSON.stringify(exportPayload, null, 2)}\n`], { type: "application/json;charset=utf-8" }).size;
}

function buildAnalyticsExportPreflight(payload) {
  const exportPayload = payload || buildAnalyticsExportPayload();
  const estimatedCsvBytes = estimateAnalyticsCsvBytes(exportPayload);
  const estimatedJsonBytes = estimateAnalyticsJsonBytes(exportPayload);

  return {
    manifest: buildAnalyticsExportManifest(exportPayload),
    estimatedCsvBytes,
    estimatedJsonBytes,
    estimatedCsvKilobytes: Number((estimatedCsvBytes / 1024).toFixed(2)),
    estimatedJsonKilobytes: Number((estimatedJsonBytes / 1024).toFixed(2))
  };
}

function isSupportedAnalyticsExportPayload(payload) {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    payload.exportType === "analytics_export" &&
    payload.exportFormat === "route_builder_analytics" &&
    typeof payload.schemaVersion === "string" &&
    payload.schemaVersion.trim() !== "" &&
    Array.isArray(payload.rows)
  );
}

function getAnalyticsExportSupportedRowTypes(payload) {
  const rowSchema = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload.rowSchema || {})
    : {};

  return [rowSchema.summaryRowType, rowSchema.detailRowType]
    .map(value => String(value || "").trim())
    .filter((value, index, array) => value && array.indexOf(value) === index);
}

function summarizeAnalyticsExportPayload(payload) {
  const isSupported = isSupportedAnalyticsExportPayload(payload);
  const exportCounts = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload.exportCounts || {})
    : {};
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];

  return {
    isSupported,
    schemaVersion: payload?.schemaVersion || "",
    exportFormat: payload?.exportFormat || "",
    projectId: payload?.projectId || "",
    projectName: payload?.projectName || "",
    scopeLabel: payload?.scopeLabel || "",
    totalRows: exportCounts.totalRows ?? rows.length,
    detailRows: exportCounts.detailRows ?? rows.filter(row => row?.rowType === "store_detail").length,
    summaryRows: exportCounts.summaryRows ?? rows.filter(row => row?.rowType === "project_summary").length,
    hasRows: rows.length > 0,
    hasMetrics: Boolean(payload && typeof payload.metrics === "object" && payload.metrics !== null && !Array.isArray(payload.metrics)),
    hasScopeMeta: Boolean(payload && typeof payload.scopeMeta === "object" && payload.scopeMeta !== null && !Array.isArray(payload.scopeMeta)),
    supportedRowTypes: getAnalyticsExportSupportedRowTypes(payload)
  };
}

function validateAnalyticsExportPayloadShape(payload) {
  const errors = [];
  const warnings = [];
  const isObject = Boolean(payload && typeof payload === "object" && !Array.isArray(payload));

  if (!isObject) {
    errors.push("payload missing or not object");
  }

  if (!isObject || payload.exportType !== "analytics_export") {
    errors.push("wrong exportType");
  }

  if (!isObject || payload.exportFormat !== "route_builder_analytics") {
    errors.push("wrong exportFormat");
  }

  if (!isObject || typeof payload.schemaVersion !== "string" || payload.schemaVersion.trim() === "") {
    errors.push("missing schemaVersion");
  }

  if (!isObject || !Array.isArray(payload.rows)) {
    errors.push("missing rows array");
  }

  if (!isObject || !payload.projectId) {
    warnings.push("missing projectId");
  }

  if (!isObject || !payload.projectName) {
    warnings.push("missing projectName");
  }

  if (!isObject || !payload.scopeLabel) {
    warnings.push("missing scopeLabel");
  }

  if (!isObject || typeof payload.metrics !== "object" || payload.metrics === null || Array.isArray(payload.metrics)) {
    warnings.push("missing metrics object");
  }

  if (!isObject || typeof payload.scopeMeta !== "object" || payload.scopeMeta === null || Array.isArray(payload.scopeMeta)) {
    warnings.push("missing scopeMeta");
  }

  if (!Array.isArray(payload?.rows) || payload.rows.length === 0) {
    warnings.push("rows array empty");
  }

  const supportedRowTypes = getAnalyticsExportSupportedRowTypes(payload);
  if (supportedRowTypes.length < 2) {
    warnings.push("rowSchema missing summary/detail row types");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

function buildAnalyticsExportImportReadiness(payload) {
  const exportPayload = payload || buildAnalyticsExportPayload();

  return {
    summary: summarizeAnalyticsExportPayload(exportPayload),
    validation: validateAnalyticsExportPayloadShape(exportPayload),
    preflight: buildAnalyticsExportPreflight(exportPayload)
  };
}

function downloadExportBlob(filename, blob) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function downloadExportText(filename, text, mimeType) {
  downloadExportBlob(filename, new Blob([text], { type: mimeType || "text/plain;charset=utf-8" }));
}

function normalizeAnalyticsExportValue(value) {
  if (value === undefined || value === null) return "";
  return value;
}

function normalizeAnalyticsExportBoolean(value) {
  return value === true ? "true" : "false";
}

function buildAnalyticsCsvRows(payload) {
  const exportPayload = payload || buildAnalyticsExportPayload();
  const {
    projectId,
    projectName,
    generatedAt,
    scopeLabel,
    metrics,
    scopeMeta,
    snapshotMetrics,
    rows
  } = exportPayload;

  const buildBaseRow = () => ({
    rowType: "",
    projectId: normalizeAnalyticsExportValue(projectId),
    projectName: normalizeAnalyticsExportValue(projectName),
    generatedAt: normalizeAnalyticsExportValue(generatedAt),
    scopeLabel: normalizeAnalyticsExportValue(scopeLabel),
    scopeDescription: normalizeAnalyticsExportValue(scopeMeta.scopeDescription),
    totalStores: normalizeAnalyticsExportValue(metrics.totalStores ?? snapshotMetrics.total),
    active: normalizeAnalyticsExportValue(metrics.active ?? snapshotMetrics.active),
    rescheduled: normalizeAnalyticsExportValue(metrics.rescheduled ?? snapshotMetrics.rescheduled),
    completed: normalizeAnalyticsExportValue(metrics.completed ?? snapshotMetrics.completed),
    closed: normalizeAnalyticsExportValue(metrics.closed ?? snapshotMetrics.closed),
    openWorkCount: normalizeAnalyticsExportValue(metrics.openWorkCount ?? Math.max(0, snapshotMetrics.total - snapshotMetrics.completed - snapshotMetrics.closed)),
    completionRate: normalizeAnalyticsExportValue(metrics.completionRate ?? Number(snapshotMetrics.completionRate.toFixed(2))),
    actionableRate: normalizeAnalyticsExportValue(metrics.actionableRate),
    noteCoverageRate: normalizeAnalyticsExportValue(metrics.noteCoverageRate ?? Number(snapshotMetrics.noteCoverageRate.toFixed(2))),
    photoCoverageRate: normalizeAnalyticsExportValue(metrics.photoCoverageRate ?? Number(snapshotMetrics.photoCoverageRate.toFixed(2))),
    activityCoverageRate: normalizeAnalyticsExportValue(metrics.activityCoverageRate ?? Number(snapshotMetrics.activityCoverageRate.toFixed(2))),
    recentActivityCoverageRate: normalizeAnalyticsExportValue(metrics.recentActivityCoverageRate),
    integrityIssueCount: normalizeAnalyticsExportValue(metrics.integrityIssueCount),
    integrityIssueRate: normalizeAnalyticsExportValue(metrics.integrityIssueRate),
    storesWithNoUpdates: normalizeAnalyticsExportValue(metrics.storesWithNoUpdates),
    storesWithNotesNoPhotos: normalizeAnalyticsExportValue(metrics.storesWithNotesNoPhotos),
    storesWithPhotosNoNotes: normalizeAnalyticsExportValue(metrics.storesWithPhotosNoNotes),
    stalledActiveCount: normalizeAnalyticsExportValue(metrics.stalledActiveCount),
    rescheduledNoReasonCount: normalizeAnalyticsExportValue(metrics.rescheduledNoReasonCount),
    rescheduledNoRecentFollowUpCount: normalizeAnalyticsExportValue(metrics.rescheduledNoRecentFollowUpCount),
    completedToday: normalizeAnalyticsExportValue(metrics.completedToday),
    avgCompletedPerDay: normalizeAnalyticsExportValue(metrics.avgCompletedPerDay),
    etaDays: normalizeAnalyticsExportValue(metrics.etaDays),
    attentionNeededCount: normalizeAnalyticsExportValue(metrics.attentionNeededCount),
    snapshotNotes: normalizeAnalyticsExportValue(snapshotMetrics.notes),
    snapshotPhotos: normalizeAnalyticsExportValue(snapshotMetrics.photos),
    storesWithNotes: normalizeAnalyticsExportValue(snapshotMetrics.storesWithNotes),
    storesWithPhotos: normalizeAnalyticsExportValue(snapshotMetrics.storesWithPhotos),
    storesWithRecentActivity: normalizeAnalyticsExportValue(snapshotMetrics.storesWithRecentActivity),
    actionableTotal: normalizeAnalyticsExportValue(snapshotMetrics.actionableTotal),
    storeId: "",
    address: "",
    statusCode: "",
    statusLabel: "",
    rescheduleReason: "",
    noteCount: "",
    photoCount: "",
    hasNotes: "false",
    hasPhotos: "false",
    hasActivity: "false",
    activityLabel: "",
    activitySummary: "",
    activityTimestampValue: ""
  });

  return [
    {
      ...buildBaseRow(),
      rowType: "project_summary"
    },
    ...rows.map(row => ({
      ...buildBaseRow(),
      rowType: "store_detail",
      storeId: normalizeAnalyticsExportValue(row.storeId),
      address: normalizeAnalyticsExportValue(row.address),
      statusCode: normalizeAnalyticsExportValue(row.statusCode),
      statusLabel: normalizeAnalyticsExportValue(row.statusLabel),
      rescheduleReason: normalizeAnalyticsExportValue(row.rescheduleReason),
      noteCount: normalizeAnalyticsExportValue(row.noteCount),
      photoCount: normalizeAnalyticsExportValue(row.photoCount),
      hasNotes: normalizeAnalyticsExportBoolean(row.hasNotes),
      hasPhotos: normalizeAnalyticsExportBoolean(row.hasPhotos),
      hasActivity: normalizeAnalyticsExportBoolean(row.hasActivity),
      activityLabel: normalizeAnalyticsExportValue(row.activityLabel),
      activitySummary: normalizeAnalyticsExportValue(row.activitySummary),
      activityTimestampValue: normalizeAnalyticsExportValue(row.activityTimestampValue)
    }))
  ];
}

function escapeCsvValue(value) {
  const stringValue = value == null ? "" : String(value);
  if (/[,"\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function serializeAnalyticsSnapshotToCsv(payload) {
  const exportPayload = payload || buildAnalyticsExportPayload();
  const rows = buildAnalyticsCsvRows(exportPayload);
  if (!rows.length) return "";

  const lines = [ANALYTICS_CSV_HEADERS.map(escapeCsvValue).join(",")];
  rows.forEach(row => {
    lines.push(ANALYTICS_CSV_HEADERS.map(header => escapeCsvValue(row?.[header] ?? "")).join(","));
  });

  return lines.join("\r\n");
}

function exportProjectAnalyticsCsv() {
  try {
    const exportPayload = buildAnalyticsExportPayload();
    const filename = `${buildAnalyticsExportBaseName(exportPayload)}.csv`;
    const csv = serializeAnalyticsSnapshotToCsv(exportPayload);
    downloadExportText(filename, csv, "text/csv;charset=utf-8");
  } catch (error) {
    console.error(error);
    alert("Analytics export failed. Please try again.");
  }
}

function exportProjectAnalyticsJson() {
  try {
    const exportPayload = buildAnalyticsExportPayload();
    const filename = `${buildAnalyticsExportBaseName(exportPayload)}.json`;
    downloadExportText(filename, `${JSON.stringify(exportPayload, null, 2)}\n`, "application/json;charset=utf-8");
  } catch (error) {
    console.error(error);
    alert("Analytics export failed. Please try again.");
  }
}

function bindAnalyticsExportControls() {
  const controls = [
    ["exportAnalyticsCsvBtn", exportProjectAnalyticsCsv, "Export analytics CSV"],
    ["exportAnalyticsJsonBtn", exportProjectAnalyticsJson, "Export analytics JSON"]
  ];

  controls.forEach(([id, handler, enabledTitle]) => {
    const button = document.getElementById(id);
    if (!button) return;

    if (!button.dataset.boundAnalyticsExport) {
      button.addEventListener("click", handler);
      button.dataset.boundAnalyticsExport = "true";
    }

    button.disabled = !isSignedIn();
    button.title = isSignedIn() ? enabledTitle : "Sign in to export analytics";
  });
}

Object.assign(window, {
  slugifyExportName,
  buildAnalyticsExportPayload,
  buildAnalyticsExportBaseName,
  buildAnalyticsExportManifest,
  estimateAnalyticsCsvBytes,
  estimateAnalyticsJsonBytes,
  buildAnalyticsExportPreflight,
  isSupportedAnalyticsExportPayload,
  getAnalyticsExportSupportedRowTypes,
  summarizeAnalyticsExportPayload,
  validateAnalyticsExportPayloadShape,
  buildAnalyticsExportImportReadiness,
  downloadExportBlob,
  downloadExportText,
  buildAnalyticsCsvRows,
  escapeCsvValue,
  serializeAnalyticsSnapshotToCsv,
  exportProjectAnalyticsCsv,
  exportProjectAnalyticsJson,
  bindAnalyticsExportControls
});

bindAnalyticsExportControls();