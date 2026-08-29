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
      <td class="cell-store" data-label="Store ID">
        <div class="store-id">${escapeSnapshotHtml(row.storeId)}</div>
      </td>
      <td class="cell-location" data-label="Location">
        <div class="location-main">${escapeSnapshotHtml(row.address)}</div>
      </td>
      <td class="cell-status" data-label="Status">
        <span class="status status-${escapeSnapshotHtml(row.statusCode)}">${escapeSnapshotHtml(row.statusLabel)}</span>
      </td>
      <td class="cell-reason" data-label="Reschedule Reason">
        ${row.rescheduleReason
          ? `<div class="reason-text">${escapeSnapshotHtml(row.rescheduleReason)}</div>`
          : `<span class="muted-pill">—</span>`}
      </td>
      <td class="cell-count" data-label="Notes">
        <span class="count-pill ${row.hasNotes ? "has-data" : ""}">${row.noteCount}</span>
      </td>
      <td class="cell-count" data-label="Photos">
        <span class="count-pill ${row.hasPhotos ? "has-data" : ""}">${row.photoCount}</span>
      </td>
      <td class="cell-activity" data-label="Latest Activity">
        <div class="activity-time-inline">${escapeSnapshotHtml(row.activityLabel)}</div>
        <div class="activity-summary-inline">${escapeSnapshotHtml(row.activitySummary)}</div>
      </td>
    </tr>
  `).join("");
}

function getSnapshotScopedStoreIds(filteredStores) {
  return new Set(
    (Array.isArray(filteredStores) ? filteredStores : [])
      .map(store => String(store?.store_id || "").trim())
      .filter(Boolean)
  );
}

function isSnapshotCurrentProjectEvidenceRow(row) {
  const rowProjectId = String(row?.project_id || "").trim();
  const scopedProjectId = typeof currentProjectId === "undefined"
    ? ""
    : String(currentProjectId || "").trim();

  return !rowProjectId || !scopedProjectId || rowProjectId === scopedProjectId;
}

function isSnapshotScopedEvidenceRow(row, storeId, scopedStoreIds = null) {
  const rowStoreId = String(row?.store_id || "").trim();
  const normalizedStoreId = String(storeId || "").trim();

  if (!rowStoreId) return false;
  if (normalizedStoreId && rowStoreId !== normalizedStoreId) return false;
  if (scopedStoreIds instanceof Set && !scopedStoreIds.has(rowStoreId)) return false;

  return isSnapshotCurrentProjectEvidenceRow(row);
}

function isSnapshotSafeDisplayPhotoUrl(value) {
  const url = String(value || "").trim();
  if (!url) return false;
  if (/^(javascript|vbscript):/i.test(url)) return false;
  if (/^data:image\//i.test(url)) return true;
  if (/^blob:/i.test(url)) return true;
  if (/^\/(?!\/)/.test(url)) return true;
  if (!/^https?:\/\//i.test(url)) return false;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function isSnapshotSafeSignedPhotoUrl(value) {
  const url = String(value || "").trim();
  if (!isSnapshotSafeDisplayPhotoUrl(url)) return false;
  if (!/^https?:\/\//i.test(url)) return /^blob:/i.test(url);

  return (
    /[?&]token=/i.test(url)
    || /[?&]signature=/i.test(url)
    || /[?&]x-amz-signature=/i.test(url)
    || /[?&]x-amz-credential=/i.test(url)
    || /[?&]expires=/i.test(url)
    || /[?&]x-amz-expires=/i.test(url)
  );
}

function resolveSnapshotPhotoRowUrl(row) {
  if (!row) return "";

  let appResolvedUrl = "";
  if (typeof dataLayer !== "undefined" && dataLayer && typeof dataLayer.resolvePhotoRowUrl === "function") {
    appResolvedUrl = String(dataLayer.resolvePhotoRowUrl(row) || "").trim();
  }

  if (isSnapshotSafeDisplayPhotoUrl(appResolvedUrl)) return appResolvedUrl;

  const resolvedImageUrl = String(row.resolved_image_url || "").trim();
  if (isSnapshotSafeDisplayPhotoUrl(resolvedImageUrl)) return resolvedImageUrl;

  const signedUrl = String(row.signed_url || "").trim();
  if (isSnapshotSafeSignedPhotoUrl(signedUrl)) return signedUrl;

  const imageUrl = String(row.image_url || "").trim();
  if (isSnapshotSafeDisplayPhotoUrl(imageUrl)) return imageUrl;

  const explicitUrl = String(row.url || "").trim();
  if (isSnapshotSafeDisplayPhotoUrl(explicitUrl)) return explicitUrl;

  return "";
}

function getSnapshotStoreNotes(storeId, scopedStoreIds = null) {
  return (Array.isArray(noteRowsCache) ? noteRowsCache : [])
    .filter(row => isSnapshotScopedEvidenceRow(row, storeId, scopedStoreIds))
    .slice()
    .sort((a, b) => getTimestampValue(b.created_at) - getTimestampValue(a.created_at));
}

function getSnapshotStorePhotoEvidence(storeId, scopedStoreIds = null) {
  const photos = [];
  let skippedUnavailablePhotos = 0;

  (Array.isArray(photoRowsCache) ? photoRowsCache : [])
    .filter(row => isSnapshotScopedEvidenceRow(row, storeId, scopedStoreIds))
    .forEach(row => {
      const imageUrl = resolveSnapshotPhotoRowUrl(row);
      if (!imageUrl) {
        skippedUnavailablePhotos += 1;
        return;
      }

      photos.push({
        ...row,
        store_id: String(row.store_id || "").trim(),
        imageUrl,
        timestampValue: getTimestampValue(row.created_at)
      });
    });

  photos.sort((a, b) => b.timestampValue - a.timestampValue);

  return {
    photos,
    skippedUnavailablePhotos
  };
}

function getSnapshotStorePhotos(storeId, scopedStoreIds = null) {
  return getSnapshotStorePhotoEvidence(storeId, scopedStoreIds).photos;
}

function getSnapshotLatestNotePreview(notes, photos = []) {
  const latestNote = Array.isArray(notes) && notes.length ? notes[0] : null;
  if (!latestNote) {
    return {
      preview: Array.isArray(photos) && photos.length
        ? "No field notes captured. Photo evidence available."
        : "No field notes captured for this store in the current scope.",
      timestampLabel: "",
      timestampValue: 0
    };
  }

  const noteText = String(latestNote.note || "").trim();
  return {
    preview: noteText.length > 180 ? `${noteText.slice(0, 177)}...` : noteText,
    timestampLabel: latestNote.created_at ? formatActivityTime(latestNote.created_at) : "",
    timestampValue: getTimestampValue(latestNote.created_at)
  };
}

function getSnapshotEvidenceRows(filteredStores) {
  const scopedStores = Array.isArray(filteredStores) ? filteredStores : [];
  const scopedStoreIds = getSnapshotScopedStoreIds(scopedStores);
  const evidenceSummary = {
    storesWithEvidence: 0,
    validPhotos: 0,
    notes: 0,
    skippedUnavailablePhotos: 0
  };

  const rows = scopedStores
    .map((store, index) => {
      const storeId = String(store.store_id || "").trim();
      if (!storeId || !scopedStoreIds.has(storeId)) return null;

      const notes = getSnapshotStoreNotes(storeId, scopedStoreIds);
      const photoEvidence = getSnapshotStorePhotoEvidence(storeId, scopedStoreIds);
      const photos = photoEvidence.photos;

      evidenceSummary.notes += notes.length;
      evidenceSummary.validPhotos += photos.length;
      evidenceSummary.skippedUnavailablePhotos += photoEvidence.skippedUnavailablePhotos;

      if (!notes.length && !photos.length) return null;

      const notePreview = getSnapshotLatestNotePreview(notes, photos);
      const latestPhotoTimestampValue = photos.length ? photos[0].timestampValue : 0;
      const latestEvidenceTimestampValue = Math.max(notePreview.timestampValue, latestPhotoTimestampValue, 0);
      const hasBoth = notes.length > 0 && photos.length > 0;
      const statusCode = getSnapshotStatusCode(store);

      return {
        originalIndex: index,
        storeId,
        address: store.full_address || [store.city, store.state].filter(Boolean).join(", ") || "No address on file",
        statusCode,
        statusLabel: getStatusDisplayLabel(statusCode),
        noteCount: notes.length,
        photoCount: photos.length,
        skippedUnavailablePhotoCount: photoEvidence.skippedUnavailablePhotos,
        notes,
        photos,
        latestNotePreview: notePreview.preview,
        latestNoteTimestampLabel: notePreview.timestampLabel,
        latestEvidenceTimestampValue,
        sortGroup: hasBoth ? 0 : 1
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.sortGroup !== b.sortGroup) return a.sortGroup - b.sortGroup;
      if (a.latestEvidenceTimestampValue !== b.latestEvidenceTimestampValue) return b.latestEvidenceTimestampValue - a.latestEvidenceTimestampValue;
      return a.originalIndex - b.originalIndex;
    });

  evidenceSummary.storesWithEvidence = rows.length;
  Object.defineProperty(rows, "evidenceSummary", {
    value: evidenceSummary,
    enumerable: false
  });

  return rows;
}

function buildSnapshotEvidenceNotes(notes) {
  if (!notes.length) {
    return `<div class="evidence-empty-mini">No field notes logged.</div>`;
  }

  return notes.slice(0, 3).map(note => `
    <div class="evidence-note-item">
      <div class="evidence-note-meta">${escapeSnapshotHtml(note.created_at ? formatActivityTime(note.created_at) : "Note")}</div>
      <div class="evidence-note-text">${escapeSnapshotHtml(note.note || "No note text available")}</div>
    </div>
  `).join("");
}

function buildSnapshotEvidencePhotoRail(photos, variant = "compact") {
  const resolvedPhotos = (Array.isArray(photos) ? photos : [])
    .filter(photo => isSnapshotSafeDisplayPhotoUrl(photo?.imageUrl));

  if (!resolvedPhotos.length) {
    return `<div class="evidence-empty-mini">No photo evidence captured.</div>`;
  }

  const photoLimit = variant === "expanded" ? 4 : 3;
  return resolvedPhotos.slice(0, photoLimit).map((photo, index) => `
    <div class="evidence-photo-shell evidence-photo-shell-${escapeSnapshotHtml(variant)}">
      <img
        class="evidence-photo evidence-photo-${escapeSnapshotHtml(variant)}"
        src="${escapeSnapshotHtml(photo.imageUrl)}"
        alt="Store evidence photo ${index + 1}"
        aria-label="Open evidence photo ${index + 1}"
        data-full-image="${escapeSnapshotHtml(photo.imageUrl)}"
        tabindex="0"
        role="button"
        loading="lazy"
        onerror="var shell=this.closest('.evidence-photo-shell'); if(shell) shell.remove();"
      />
    </div>
  `).join("");
}

function getSnapshotEvidenceSummary(evidenceRows) {
  if (Array.isArray(evidenceRows) && evidenceRows.evidenceSummary) {
    return evidenceRows.evidenceSummary;
  }

  return (Array.isArray(evidenceRows) ? evidenceRows : []).reduce((summary, row) => {
    summary.storesWithEvidence += 1;
    summary.validPhotos += Number(row?.photoCount || 0);
    summary.notes += Number(row?.noteCount || 0);
    summary.skippedUnavailablePhotos += Number(row?.skippedUnavailablePhotoCount || 0);
    return summary;
  }, {
    storesWithEvidence: 0,
    validPhotos: 0,
    notes: 0,
    skippedUnavailablePhotos: 0
  });
}

function buildSnapshotEvidenceSummaryLine(evidenceRows) {
  const summary = getSnapshotEvidenceSummary(evidenceRows);
  const parts = [
    `${Number(summary.storesWithEvidence || 0).toLocaleString()} stores with evidence`,
    `${Number(summary.validPhotos || 0).toLocaleString()} valid photos`,
    `${Number(summary.notes || 0).toLocaleString()} notes`
  ];

  if (Number(summary.skippedUnavailablePhotos || 0) > 0) {
    parts.push(`${Number(summary.skippedUnavailablePhotos || 0).toLocaleString()} unavailable photos skipped`);
  }

  return `<div class="evidence-diagnostics">${parts.map(escapeSnapshotHtml).join(" | ")}</div>`;
}

function buildSnapshotEvidenceCards(evidenceRows) {
  if (!evidenceRows.length) {
    return `
      <div class="empty-state-card">
        <div class="empty-state-title">No field evidence in this scope</div>
        <div class="empty-state-copy">Status, scope metrics, and the store summary table are still included for stakeholder review. Notes and photo evidence will appear here as teams capture them.</div>
      </div>
    `;
  }

  return evidenceRows.map(row => `
    <details class="evidence-card" data-evidence-card>
      <summary class="evidence-summary">
        <div class="evidence-summary-main">
          <div class="evidence-store-line">
            <span class="evidence-store-id">Store ${escapeSnapshotHtml(row.storeId)}</span>
            <span class="status status-${escapeSnapshotHtml(row.statusCode)}">${escapeSnapshotHtml(row.statusLabel)}</span>
          </div>
          <div class="evidence-address">${escapeSnapshotHtml(row.address)}</div>
          <div class="evidence-preview">${escapeSnapshotHtml(row.latestNotePreview)}</div>
        </div>
        <div class="evidence-summary-side">
          <div class="evidence-count-row">
            <span class="count-pill ${row.noteCount ? "has-data" : ""}">${row.noteCount} notes</span>
            <span class="count-pill ${row.photoCount ? "has-data" : ""}">${row.photoCount} photos</span>
          </div>
          <div class="evidence-photo-rail">${buildSnapshotEvidencePhotoRail(row.photos, "compact")}</div>
          <div class="evidence-expand-hint">Click to expand detail</div>
        </div>
      </summary>
      <div class="evidence-expanded">
        <div class="evidence-expanded-grid">
          <div>
            <div class="summary-title">Field Notes</div>
            ${buildSnapshotEvidenceNotes(row.notes)}
          </div>
          <div>
            <div class="summary-title">Photo Evidence</div>
            <div class="evidence-photo-grid">${buildSnapshotEvidencePhotoRail(row.photos, "expanded")}</div>
          </div>
        </div>
      </div>
    </details>
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
    return `No stores are currently visible in the selected ${scopeMeta.scopeLabel.toLowerCase()} scope.`;
  }

  return `${metrics.completionRate.toFixed(1)}% of ${metrics.total.toLocaleString()} scoped stores are complete, with notes in ${metrics.storesWithNotes.toLocaleString()} stores, photo evidence in ${metrics.storesWithPhotos.toLocaleString()}, and recent activity in ${metrics.storesWithRecentActivity.toLocaleString()} stores.`;
}

function buildSnapshotHeroSummary({ metrics, scopeMeta }) {
  if (!metrics || !scopeMeta) {
    return "Snapshot summary unavailable for the selected scope.";
  }

  if (metrics.total === 0) {
    return `No stores are currently visible in the selected ${scopeMeta.scopeLabel.toLowerCase()} scope.`;
  }

  return `${metrics.total.toLocaleString()} stores in ${scopeMeta.scopeLabel.toLowerCase()} with ${metrics.completed.toLocaleString()} completed, ${metrics.rescheduled.toLocaleString()} rescheduled, and ${metrics.closed.toLocaleString()} closed.`;
}

function getSnapshotReportIdentity(payload) {
  const { projectTitle, scopeMeta, generatedAt } = payload;
  return {
    reportTitle: "Executive Field Report",
    reportSubtitle: `${projectTitle} · ${scopeMeta.scopeLabel} Snapshot`,
    preparedBy: "Prepared via Route Builder",
    generatedAtLabel: generatedAt
  };
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
    evidenceRows,
    operationalSummary,
    returnUrl
  } = payload;

  const reportIdentity = getSnapshotReportIdentity(payload);

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
    line-height: 1.6;
    color: #203648;
  }
  .summary-kpis { display: grid; gap: 8px; }
  .summary-kpi-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding-bottom: 7px;
    border-bottom: 1px dashed rgba(188, 203, 218, 0.85);
    font-size: 13px;
    color: #203648;
  }
  .summary-kpi-row:last-child { border-bottom: none; padding-bottom: 0; }
  .summary-kpi-row span:last-child { font-weight: 800; color: #173047; }
  .panel { padding: 18px 20px; }
  .panel-eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: #72879b;
    margin-bottom: 10px;
  }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }
  .metric {
    border: 1px solid rgba(188, 203, 218, 0.92);
    border-radius: 12px;
    padding: 10px 11px;
    background: linear-gradient(180deg, rgba(246, 250, 253, 0.97), rgba(236, 243, 249, 0.96));
  }
  .metric-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: #6f8498;
    margin-bottom: 5px;
  }
  .metric-value {
    font-size: 18px;
    font-weight: 800;
    line-height: 1.15;
    color: #152f45;
  }
  .analytics-footer {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .analytics-pill {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
    border-radius: 999px;
    padding: 0 11px;
    font-size: 11px;
    color: #294259;
    border: 1px solid rgba(188, 203, 218, 0.9);
    background: rgba(236, 243, 248, 0.88);
  }
  .executionOverviewGrid {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.75fr);
    gap: 12px;
  }
  .executionSummaryCard,
  .executionStatusCard {
    border: 1px solid rgba(188, 203, 218, 0.92);
    border-radius: 14px;
    padding: 13px 14px;
    background: linear-gradient(180deg, rgba(246, 250, 253, 0.98), rgba(236, 243, 249, 0.96));
  }
  .executionLead {
    font-size: 13px;
    line-height: 1.55;
    color: #21384d;
    margin-bottom: 10px;
  }
  .executionStatStack { display: grid; gap: 8px; }
  .executionStatRow {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: flex-start;
    border-top: 1px solid rgba(207, 218, 229, 0.88);
    padding-top: 8px;
  }
  .executionStatRow:first-child {
    border-top: none;
    padding-top: 0;
  }
  .executionStatLabel {
    font-size: 12px;
    font-weight: 700;
    color: #1c3348;
    margin-bottom: 3px;
  }
  .executionStatDetail {
    font-size: 11px;
    color: #5f7488;
    line-height: 1.45;
  }
  .executionStatValue {
    font-size: 14px;
    font-weight: 800;
    color: #163047;
    text-align: right;
    white-space: nowrap;
  }
  .statusBreakdownStack {
    display: grid;
    gap: 8px;
  }
  .statusBreakdownRow {
    border: 1px solid rgba(188, 203, 218, 0.9);
    border-radius: 11px;
    padding: 8px 9px;
    background: rgba(247, 251, 254, 0.97);
  }
  .statusBreakdownMeta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: center;
    margin-bottom: 6px;
  }
  .statusBreakdownLabelWrap {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .statusSwatch {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    flex-shrink: 0;
  }
  .statusSwatch-active { background: var(--active); }
  .statusSwatch-rescheduled { background: var(--rescheduled); }
  .statusSwatch-completed { background: var(--completed); }
  .statusSwatch-closed { background: var(--closed); }
  .statusBreakdownLabel {
    font-size: 12px;
    font-weight: 700;
    color: #20364a;
  }
  .statusBreakdownValue {
    font-size: 12px;
    font-weight: 800;
    color: #173047;
  }
  .statusBreakdownValue span {
    font-size: 11px;
    color: #5a7084;
    margin-left: 4px;
    font-weight: 700;
  }
  .statusBreakdownBarTrack {
    height: 8px;
    border-radius: 999px;
    background: rgba(207, 218, 229, 0.95);
    overflow: hidden;
  }
  .statusBreakdownBarFill {
    height: 100%;
    border-radius: inherit;
  }
  .statusBreakdownBarFill-active { background: var(--active); }
  .statusBreakdownBarFill-rescheduled { background: var(--rescheduled); }
  .statusBreakdownBarFill-completed { background: var(--completed); }
  .statusBreakdownBarFill-closed { background: var(--closed); }
  .two-col {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    border: 1px solid rgba(188, 203, 218, 0.94);
    border-radius: 12px;
    overflow: hidden;
    background: #fff;
  }
  thead th {
    text-align: left;
    padding: 10px 10px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: #41576d;
    background: linear-gradient(180deg, #f5f9fc 0%, #e9f0f6 100%);
    border-bottom: 1px solid rgba(188, 203, 218, 0.95);
  }
  tbody td {
    padding: 9px 10px;
    border-bottom: 1px solid rgba(211, 220, 229, 0.9);
    vertical-align: top;
    font-size: 12px;
    color: #1e3346;
  }
  tbody tr:nth-child(even) td {
    background: rgba(243, 248, 252, 0.72);
  }
  .cell-store { width: 88px; }
  .store-id { font-weight: 800; font-size: 13px; color: #173047; }
  .status {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    border-radius: 999px;
    padding: 0 9px;
    font-size: 11px;
    font-weight: 800;
    border: 1px solid transparent;
    text-transform: capitalize;
  }
  .status-active {
    color: #114d84;
    background: rgba(100, 181, 246, 0.22);
    border-color: rgba(100, 181, 246, 0.4);
  }
  .status-rescheduled {
    color: #8a4d04;
    background: rgba(255, 153, 0, 0.2);
    border-color: rgba(255, 153, 0, 0.44);
  }
  .status-completed {
    color: #136f3b;
    background: rgba(46, 204, 113, 0.2);
    border-color: rgba(46, 204, 113, 0.45);
  }
  .status-closed {
    color: #8a2020;
    background: rgba(255, 45, 45, 0.16);
    border-color: rgba(255, 45, 45, 0.36);
  }
  .muted-pill {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 11px;
    color: #6c8297;
    background: rgba(232, 239, 245, 0.88);
    border: 1px solid rgba(197, 209, 220, 0.92);
  }
  .count-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    min-height: 22px;
    border-radius: 999px;
    padding: 0 8px;
    font-size: 11px;
    font-weight: 800;
    color: #5b6f84;
    background: rgba(232, 239, 245, 0.9);
    border: 1px solid rgba(197, 209, 220, 0.94);
  }
  .count-pill.has-data {
    color: #1f3c56;
    background: rgba(213, 231, 245, 0.92);
    border-color: rgba(168, 196, 220, 0.98);
  }
  .location-main {
    font-weight: 700;
    line-height: 1.4;
  }
  .reason-text {
    font-size: 11px;
    line-height: 1.4;
    color: #5c7388;
  }
  .activity-time-inline {
    font-size: 11px;
    font-weight: 700;
    color: #334d63;
    margin-bottom: 4px;
  }
  .activity-summary-inline {
    font-size: 11px;
    color: #5c7288;
    line-height: 1.45;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    margin-top: 10px;
  }
  .legendItem {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #4a5f74;
  }
  .legendDot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
  }
  .evidence-card {
    border: 1px solid rgba(188, 203, 218, 0.94);
    border-radius: 14px;
    background: rgba(251, 253, 255, 0.98);
    margin-bottom: 10px;
    overflow: hidden;
  }
  .evidence-card:last-child { margin-bottom: 0; }
  .evidence-summary {
    list-style: none;
    cursor: pointer;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 320px);
    gap: 14px;
    align-items: flex-start;
    padding: 14px 16px;
  }
  .evidence-summary::-webkit-details-marker { display: none; }
  .evidence-summary-main { min-width: 0; display: grid; gap: 6px; }
  .evidence-store-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .evidence-store-id {
    font-size: 14px;
    font-weight: 800;
    color: #173047;
  }
  .evidence-address {
    font-size: 12px;
    color: #4f657a;
    line-height: 1.45;
  }
  .evidence-preview {
    font-size: 12px;
    color: #5b7187;
    line-height: 1.5;
  }
  .evidence-summary-side {
    min-width: 0;
    display: grid;
    gap: 8px;
    justify-items: end;
  }
  .evidence-count-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .evidence-photo-rail {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    width: 100%;
  }
  .evidence-photo-shell {
    border: 1px solid rgba(188, 203, 218, 0.9);
    border-radius: 10px;
    overflow: hidden;
    background: rgba(233, 241, 247, 0.92);
    min-height: 76px;
    display: grid;
    place-items: center;
  }
  .evidence-photo-shell-compact { min-height: 74px; }
  .evidence-photo-shell-expanded { min-height: 124px; }
  .evidence-photo { 
    display: block; 
    width: 100%; 
    height: 100%; 
    object-fit: cover;
    cursor: pointer;
    transition: transform 0.22s ease, filter 0.22s ease;
  }
  .evidence-photo:hover {
    transform: scale(1.03);
    filter: brightness(1.05);
  }
  .evidence-photo:focus-visible {
    transform: scale(1.03);
    filter: brightness(1.05);
    outline: 2px solid rgba(24, 48, 72, 0.35);
    outline-offset: 2px;
  }
  .evidence-photo-expanded { 
    aspect-ratio: 4 / 3; 
    object-fit: contain;
    background: #f4f8fb;
  }
  .evidence-photo-fallback {
    display: none;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 12px;
    text-align: center;
    font-size: 11px;
    color: var(--muted);
    background: rgba(239, 245, 250, 0.92);
  }
  .evidence-photo-shell.is-broken .evidence-photo-fallback { display: flex; }
  .evidence-diagnostics {
    margin: 0 0 10px;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.45;
    font-weight: 700;
  }
  .evidence-expand-hint { font-size: 11px; color: var(--muted); font-weight: 700; }
  .evidence-expanded {
    padding: 0 16px 16px;
    border-top: 1px solid rgba(188, 203, 218, 0.88);
  }
  .evidence-expanded-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
    padding-top: 14px;
  }
  .evidence-note-item + .evidence-note-item { margin-top: 10px; }
  .evidence-note-meta { font-size: 11px; color: var(--muted); font-weight: 700; margin-bottom: 3px; }
  .evidence-note-text { font-size: 13px; line-height: 1.55; color: #203648; }
  .evidence-photo-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .evidence-empty-mini { font-size: 12px; color: var(--muted); line-height: 1.5; }
  .prepared-footer {
    border: 1px solid rgba(188, 203, 218, 0.88);
    border-radius: 14px;
    background: rgba(244, 248, 252, 0.96);
    padding: 12px 14px;
  }
  .prepared-footer-title {
    font-size: 12px;
    font-weight: 800;
    color: #173047;
    margin-bottom: 4px;
  }
  .prepared-footer-subtitle {
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

  .snapshot-photo-modal {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(6, 12, 20, 0.82);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }
  .snapshot-photo-modal[aria-hidden="false"] {
    opacity: 1;
    pointer-events: auto;
  }
  .snapshot-photo-modal-dialog {
    position: relative;
    width: min(1100px, 94vw);
    max-height: 92vh;
    border-radius: 16px;
    overflow: hidden;
    background: rgba(12, 22, 34, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.45);
    transform: scale(0.96);
    transition: transform 0.2s ease;
  }
  .snapshot-photo-modal[aria-hidden="false"] .snapshot-photo-modal-dialog {
    transform: scale(1);
  }
  #snapshotPhotoModalImage {
    display: block;
    width: 100%;
    height: 100%;
    max-height: 92vh;
    object-fit: contain;
    background: #09111b;
  }
  #snapshotPhotoModalClose {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: rgba(6, 12, 20, 0.7);
    color: #fff;
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
  }

  .print-only { display: none; }
  @media print {
    [data-evidence-card] { page-break-inside: avoid; }
    [data-evidence-card] .evidence-expanded { display: block !important; }
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
    .snapshot-photo-modal {
      display: none !important;
    }
    table {
      width: 100%;
      table-layout: auto;
      border-collapse: collapse;
      border-spacing: 0;
    }
    thead {
      display: table-header-group;
    }
    tbody {
      display: table-row-group;
    }
    tr,
    td,
    th {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .hero,
    .panel {
      page-break-inside: avoid;
    }
    .print-only { display: block; }
    .no-print { display: none !important; }
  }
  @media screen and (max-width: 1020px) {
    .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .summary-strip,
    .executionOverviewGrid,
    .two-col,
    .evidence-expanded-grid,
    .evidence-summary { grid-template-columns: 1fr; }
    .hero-top,
    .utility-bar { flex-direction: column; }
    .hero-meta { min-width: 0; width: 100%; }
    .utility-actions { justify-content: flex-start; }
    .two-col table,
    .two-col thead,
    .two-col tbody,
    .two-col th,
    .two-col td,
    .two-col tr {
      display: block;
      width: 100%;
    }
    .two-col thead {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .two-col tbody td {
      border-bottom: 1px solid rgba(211, 220, 229, 0.9);
      padding: 8px 10px 8px 132px;
      min-height: 34px;
      position: relative;
      background: #fff;
    }
    .two-col tbody tr:nth-child(even) td {
      background: #fff;
    }
    .two-col tbody td::before {
      content: attr(data-label);
      position: absolute;
      left: 10px;
      top: 8px;
      width: 112px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #5d7388;
      font-weight: 800;
    }
    .two-col tbody tr {
      border: 1px solid rgba(188, 203, 218, 0.94);
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 10px;
      background: #fff;
    }
    .two-col tbody tr:last-child {
      margin-bottom: 0;
    }
  }
</style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <div class="hero-top">
        <div>
          <div class="hero-eyebrow">${escapeSnapshotHtml(reportIdentity.reportTitle)}</div>
          <h1 class="hero-title">${escapeSnapshotHtml(reportIdentity.reportSubtitle)}</h1>
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

      <div class="prepared-footer">
        <div class="prepared-footer-title">${escapeSnapshotHtml(reportIdentity.preparedBy)}</div>
        <div class="prepared-footer-subtitle">Generated ${escapeSnapshotHtml(reportIdentity.generatedAtLabel)} for ${escapeSnapshotHtml(scopeMeta.scopeLabel)} coverage.</div>
      </div>
    </section>

    <section class="utility-bar no-print">
      <div class="utility-copy">
        <div class="utility-title">Snapshot ready for review, sharing, and PDF export</div>
        <div class="utility-subtitle">Generated from live project data for the selected scope at ${escapeSnapshotHtml(generatedAt)}. Use Print to save as PDF, or return to the app when finished.</div>
      </div>
      <div class="utility-actions">
        <button id="snapshotReturnBtn" class="utility-btn secondary" type="button">Back to App</button>
        <button id="snapshotPrintBtn" class="utility-btn" type="button">Print / Save as PDF</button>
        <span class="utility-chip">${escapeSnapshotHtml(scopeMeta.scopeLabel)}</span>
        <span class="utility-chip">${escapeSnapshotHtml(generatedTimeLabel)}</span>
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
        <div class="panel-eyebrow">Field Notes & Photo Evidence</div>
        <div class="footnote" style="margin-bottom:10px;">This section surfaces scoped store-level evidence for stakeholder review, prioritizing locations with both notes and photos and allowing deeper browser inspection without removing print readability.</div>
        ${buildSnapshotEvidenceSummaryLine(evidenceRows || [])}
        ${buildSnapshotEvidenceCards(evidenceRows || [])}
      </div>
    </section>

    <div class="print-only footnote">Generated from live project data via ${escapeSnapshotHtml(reportIdentity.reportTitle)} on ${escapeSnapshotHtml(generatedAt)}.</div>
  </div>

  <div id="snapshotPhotoModal" class="snapshot-photo-modal no-print" aria-hidden="true">
    <div class="snapshot-photo-modal-dialog" role="dialog" aria-modal="true" aria-label="Photo preview">
      <button id="snapshotPhotoModalClose" type="button" aria-label="Close photo preview">&times;</button>
      <img id="snapshotPhotoModalImage" alt="Expanded store evidence photo" />
    </div>
  </div>

  <script>
    (function () {
      const returnUrl = ${JSON.stringify(returnUrl)};
      const printBtn = document.getElementById("snapshotPrintBtn");
      const returnBtn = document.getElementById("snapshotReturnBtn");
      const snapshotPhotoModal = document.getElementById("snapshotPhotoModal");
      const snapshotPhotoModalImage = document.getElementById("snapshotPhotoModalImage");
      const snapshotPhotoModalClose = document.getElementById("snapshotPhotoModalClose");
      const evidenceCards = Array.from(document.querySelectorAll("[data-evidence-card]"));
      const clickablePhotos = Array.from(document.querySelectorAll("img[data-full-image][role='button']"));

      const closePhotoModal = () => {
        if (!snapshotPhotoModal) return;
        snapshotPhotoModal.setAttribute("aria-hidden", "true");
        if (snapshotPhotoModalImage) snapshotPhotoModalImage.removeAttribute("src");
      };

      const openPhotoModal = (imageUrl) => {
        if (!snapshotPhotoModal || !snapshotPhotoModalImage || !imageUrl) return;
        snapshotPhotoModalImage.src = imageUrl;
        snapshotPhotoModal.setAttribute("aria-hidden", "false");
      };
      const applyEvidencePrintState = (openAll) => {
        evidenceCards.forEach(card => {
          if (openAll) {
            card.dataset.wasOpenBeforePrint = card.open ? "true" : "false";
            card.open = true;
          } else if (card.dataset.wasOpenBeforePrint === "false") {
            card.open = false;
          }
        });
      };

      if (printBtn) {
        printBtn.addEventListener("click", function () {
          window.print();
        });
      }

      window.addEventListener("beforeprint", function () {
        closePhotoModal();
        applyEvidencePrintState(true);
      });

      window.addEventListener("afterprint", function () {
        applyEvidencePrintState(false);
      });

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

      clickablePhotos.forEach(photo => {
        photo.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          openPhotoModal(photo.dataset.fullImage);
        });

        photo.addEventListener("keydown", function (event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            openPhotoModal(photo.dataset.fullImage);
          }
        });
      });

      if (snapshotPhotoModalClose) {
        snapshotPhotoModalClose.addEventListener("click", closePhotoModal);
      }

      if (snapshotPhotoModal) {
        snapshotPhotoModal.addEventListener("click", function (event) {
          if (event.target === snapshotPhotoModal) {
            closePhotoModal();
          }
        });
      }

      window.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          closePhotoModal();
        }
      });
    })();
  </script>
</body>
</html>`;
}

function getExecutiveSnapshotBranding() {
  const brandColor = typeof normalizeProjectBrandColor === "function"
    ? normalizeProjectBrandColor(currentProjectMeta?.brand_color)
    : String(currentProjectMeta?.brand_color || "").trim();
  const brandLogoUrl = typeof normalizeProjectBrandLogoUrl === "function"
    ? normalizeProjectBrandLogoUrl(currentProjectMeta?.brand_logo_url)
    : String(currentProjectMeta?.brand_logo_url || "").trim();

  const safeBrandColor = /^#([0-9a-f]{6})$/i.test(brandColor || "") ? brandColor : "#c8102e";
  const brandRgb = typeof getHexRgbTriplet === "function" ? getHexRgbTriplet(safeBrandColor) : "200, 16, 46";

  return {
    brandColor: safeBrandColor,
    brandRgb,
    brandLogoUrl
  };
}

function getSnapshotAnalyticsMetrics(payload) {
  const analyticsMetrics = payload?.analyticsSnapshot?.metrics || {};
  const metrics = payload?.metrics || {};

  return {
    openWorkCount: Number.isFinite(Number(analyticsMetrics.openWorkCount))
      ? Number(analyticsMetrics.openWorkCount)
      : metrics.active + metrics.rescheduled,
    attentionNeededCount: Number.isFinite(Number(analyticsMetrics.attentionNeededCount))
      ? Number(analyticsMetrics.attentionNeededCount)
      : metrics.rescheduled,
    completedToday: Number.isFinite(Number(analyticsMetrics.completedToday))
      ? Number(analyticsMetrics.completedToday)
      : 0,
    recentActivityCoverageRate: Number.isFinite(Number(analyticsMetrics.recentActivityCoverageRate))
      ? Number(analyticsMetrics.recentActivityCoverageRate)
      : metrics.activityCoverageRate
  };
}

function buildExecutiveSummaryCards(metrics, analyticsMetrics) {
  const cards = [
    { label: "Total Stores", value: metrics.total.toLocaleString(), note: "Project scope" },
    { label: "Completed", value: metrics.completed.toLocaleString(), note: `${metrics.completionRate.toFixed(1)}% complete` },
    { label: "Active/Open", value: analyticsMetrics.openWorkCount.toLocaleString(), note: "Remaining field work" },
    { label: "Rescheduled", value: metrics.rescheduled.toLocaleString(), note: "Follow-up queue" },
    { label: "Closed", value: metrics.closed.toLocaleString(), note: "Out of active scope" }
  ];

  return cards.map(card => `
    <div class="execMetricCard">
      <div class="execMetricLabel">${escapeSnapshotHtml(card.label)}</div>
      <div class="execMetricValue">${escapeSnapshotHtml(card.value)}</div>
      <div class="execMetricNote">${escapeSnapshotHtml(card.note)}</div>
    </div>
  `).join("");
}

function buildDoneLeftCards(metrics, analyticsMetrics, dataHealth) {
  const remainingWork = Math.max(0, analyticsMetrics.openWorkCount);
  const attentionCount = Math.max(0, analyticsMetrics.attentionNeededCount + dataHealth.totalIssueCount);
  const completedPercent = metrics.actionableTotal > 0 ? (metrics.completed / metrics.actionableTotal) * 100 : 0;
  const remainingPercent = metrics.actionableTotal > 0 ? (remainingWork / metrics.actionableTotal) * 100 : 0;

  const cards = [
    {
      key: "completed",
      title: "Completed Work",
      value: metrics.completed.toLocaleString(),
      detail: `${completedPercent.toFixed(1)}% of actionable stores are complete.`,
      width: completedPercent
    },
    {
      key: "remaining",
      title: "Remaining Work",
      value: remainingWork.toLocaleString(),
      detail: `${metrics.active.toLocaleString()} active and ${metrics.rescheduled.toLocaleString()} rescheduled stores remain.`,
      width: remainingPercent
    },
    {
      key: "attention",
      title: "Follow-up / Attention Needed",
      value: attentionCount.toLocaleString(),
      detail: attentionCount > 0 ? "Review reschedules and data exceptions before sharing downstream." : "No attention signals in the current scope.",
      width: metrics.total > 0 ? (attentionCount / metrics.total) * 100 : 0
    }
  ];

  return cards.map(card => `
    <div class="doneLeftCard doneLeftCard-${escapeSnapshotHtml(card.key)}">
      <div class="doneLeftTop">
        <div>
          <div class="doneLeftTitle">${escapeSnapshotHtml(card.title)}</div>
          <div class="doneLeftDetail">${escapeSnapshotHtml(card.detail)}</div>
        </div>
        <div class="doneLeftValue">${escapeSnapshotHtml(card.value)}</div>
      </div>
      <div class="doneLeftTrack">
        <div class="doneLeftFill" style="width:${Math.max(0, Math.min(100, card.width)).toFixed(2)}%;"></div>
      </div>
    </div>
  `).join("");
}

function getExecutiveSnapshotDataHealth(stores) {
  const scopedStores = Array.isArray(stores) ? stores : [];
  const report = typeof getDataIntegrityReport === "function"
    ? getDataIntegrityReport(scopedStores, statusMap, typeof getGeoAuditConfig === "function" ? getGeoAuditConfig(scopedStores) : undefined)
    : {
        missingRegion: [],
        missingTerritory: [],
        missingState: [],
        missingCoords: scopedStores.filter(store => !(typeof hasValidCoordinatePair === "function" && hasValidCoordinatePair(store?.lat, store?.lng))),
        missingStatus: []
      };

  const items = [
    { label: "Missing coordinates", value: report.missingCoords?.length || 0 },
    { label: "Missing status", value: report.missingStatus?.length || 0 },
    { label: "Missing region", value: report.missingRegion?.length || 0 },
    { label: "Missing territory", value: report.missingTerritory?.length || 0 },
    { label: "Missing state", value: report.missingState?.length || 0 }
  ].filter(item => item.value > 0);

  return {
    items,
    totalIssueCount: items.reduce((sum, item) => sum + item.value, 0)
  };
}

function buildExecutiveDataHealth(dataHealth) {
  if (!dataHealth?.items?.length) return "";

  return `
    <section class="reportPanel printDataHealthPanel">
      <div class="sectionHeader">
        <div>
          <div class="sectionEyebrow">Data Health / Exceptions</div>
          <h2>Items to Resolve</h2>
        </div>
        <div class="sectionBadge">${dataHealth.totalIssueCount.toLocaleString()} exceptions</div>
      </div>
      <div class="exceptionGrid">
        ${dataHealth.items.map(item => `
          <div class="exceptionCard">
            <div class="exceptionValue">${item.value.toLocaleString()}</div>
            <div class="exceptionLabel">${escapeSnapshotHtml(item.label)}</div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function buildSnapshotGeoBreakdown(stores, key, label) {
  const counts = new Map();
  (Array.isArray(stores) ? stores : []).forEach(store => {
    const value = String(store?.[key] || "").trim();
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  });

  const rows = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 8);

  if (!rows.length) {
    return `
      <div class="geoBreakdown">
        <div class="geoBreakdownTitle">${escapeSnapshotHtml(label)}</div>
        <div class="emptyCopy">No ${escapeSnapshotHtml(label.toLowerCase())} metadata in this scope.</div>
      </div>
    `;
  }

  const total = Math.max(1, rows.reduce((sum, row) => sum + row.count, 0));
  return `
    <div class="geoBreakdown">
      <div class="geoBreakdownTitle">${escapeSnapshotHtml(label)}</div>
      <div class="geoRows">
        ${rows.map(row => {
          const percent = (row.count / total) * 100;
          return `
            <div class="geoRow">
              <div class="geoRowMeta">
                <span>${escapeSnapshotHtml(row.name)}</span>
                <strong>${row.count.toLocaleString()}</strong>
              </div>
              <div class="geoTrack"><div class="geoFill" style="width:${percent.toFixed(2)}%;"></div></div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function buildExecutiveGeographicOverview(stores) {
  const plottableCount = (Array.isArray(stores) ? stores : []).filter(store =>
    typeof hasValidCoordinatePair === "function" && hasValidCoordinatePair(store?.lat, store?.lng)
  ).length;

  return `
    <section class="reportPanel printGeoPanel">
      <div class="sectionHeader">
        <div>
          <div class="sectionEyebrow">Geographic Overview</div>
          <h2>Coverage Spread</h2>
        </div>
        <div class="sectionBadge">${plottableCount.toLocaleString()} plotted / ${(stores || []).length.toLocaleString()} total</div>
      </div>
      <div class="geoGrid">
        ${buildSnapshotGeoBreakdown(stores, "region", "Regions")}
        ${buildSnapshotGeoBreakdown(stores, "territory", "Territories")}
        ${buildSnapshotGeoBreakdown(stores, "state", "States")}
      </div>
    </section>
  `;
}

function buildExecutiveRecentActivity() {
  const safeEvents = (Array.isArray(activityFeed) ? activityFeed : [])
    .filter(item => String(item?.store_id || "").trim())
    .slice(0, 8);

  return `
    <section class="reportPanel printRecentPanel">
      <div class="sectionHeader">
        <div>
          <div class="sectionEyebrow">Recent Activity</div>
          <h2>Latest Relevant Store Updates</h2>
        </div>
        <div class="sectionBadge">${safeEvents.length.toLocaleString()} shown</div>
      </div>
      <div class="activityReportList">
        ${safeEvents.length ? safeEvents.map(item => `
          <div class="activityReportItem">
            <div class="activityReportTime">${escapeSnapshotHtml(item.timestamp ? formatActivityTime(item.timestamp) : "Recent")}</div>
            <div class="activityReportTitle">${escapeSnapshotHtml(item.title || "Store activity")}</div>
            <div class="activityReportDetail">${escapeSnapshotHtml(item.detail || "")}</div>
          </div>
        `).join("") : `<div class="emptyStateCard">No recent store-level activity is available in this scope.</div>`}
      </div>
    </section>
  `;
}

function buildExecutiveSnapshotHtml(payload) {
  const {
    generatedAt,
    generatedTimeLabel,
    projectTitle,
    projectId,
    scopeMeta,
    metrics,
    rows,
    evidenceRows,
    returnUrl,
    stores
  } = payload;
  const branding = payload.branding || getExecutiveSnapshotBranding();
  const analyticsMetrics = getSnapshotAnalyticsMetrics(payload);
  const dataHealth = getExecutiveSnapshotDataHealth(stores);
  const reportIdentity = getSnapshotReportIdentity(payload);
  const logoMarkup = branding.brandLogoUrl
    ? `<img class="reportLogo" src="${escapeSnapshotHtml(branding.brandLogoUrl)}" alt="${escapeSnapshotHtml(projectTitle)} logo" />`
    : `<div class="reportLogoMark">${escapeSnapshotHtml(String(projectTitle || "P").slice(0, 1).toUpperCase())}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeSnapshotHtml(projectTitle)} Snapshot</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root {
    --bg: #09111b;
    --bg-deep: #050b12;
    --panel: rgba(255,255,255,0.065);
    --panel-strong: rgba(255,255,255,0.095);
    --line: rgba(255,255,255,0.11);
    --line-strong: rgba(255,255,255,0.18);
    --text: #ffffff;
    --muted: rgba(255,255,255,0.72);
    --soft: rgba(255,255,255,0.54);
    --brand: ${escapeSnapshotHtml(branding.brandColor)};
    --brand-rgb: ${escapeSnapshotHtml(branding.brandRgb)};
    --active: #64b5f6;
    --completed: #2ecc71;
    --rescheduled: #ff9900;
    --closed: #ff2d2d;
  }
  * { box-sizing: border-box; }
  @page {
    size: Letter landscape;
    margin: 0.35in;
  }
  html { background: var(--bg-deep); }
  body {
    margin: 0;
    color: var(--text);
    background:
      radial-gradient(circle at top left, rgba(var(--brand-rgb), 0.24), transparent 34rem),
      linear-gradient(180deg, #0b1522 0%, #060c14 100%);
    font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { width: min(1220px, 100%); margin: 0 auto; padding: 18px; display: grid; gap: 14px; }
  .reportHero, .reportPanel, .utilityBar, .reportFooter {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    box-shadow: 0 18px 44px rgba(0,0,0,0.28);
  }
  .reportHero {
    padding: 18px;
    background:
      linear-gradient(135deg, rgba(var(--brand-rgb), 0.22), rgba(255,255,255,0.06) 42%, rgba(255,255,255,0.035)),
      rgba(8, 16, 27, 0.94);
  }
  .heroTop { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; }
  .heroIdentity { display: flex; gap: 14px; align-items: center; min-width: 0; }
  .reportLogo, .reportLogoMark {
    width: 70px;
    height: 70px;
    border-radius: 8px;
    border: 1px solid rgba(var(--brand-rgb), 0.48);
    background: rgba(255,255,255,0.08);
    flex-shrink: 0;
  }
  .reportLogo { object-fit: contain; padding: 7px; }
  .reportLogoMark { display: grid; place-items: center; font-size: 34px; font-weight: 900; color: #fff; }
  .eyebrow, .sectionEyebrow, .metricLabel, .doneLeftTitle {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(226,238,255,0.72);
    font-weight: 800;
  }
  h1 { margin: 5px 0 6px; font-size: clamp(30px, 5vw, 56px); line-height: 0.98; letter-spacing: 0; }
  h2 { margin: 3px 0 0; font-size: 18px; line-height: 1.2; }
  .heroSummary { color: var(--muted); font-size: 14px; line-height: 1.5; max-width: 820px; }
  .heroCompletion {
    min-width: 220px;
    padding: 14px;
    border-radius: 8px;
    border: 1px solid rgba(var(--brand-rgb), 0.34);
    background: rgba(var(--brand-rgb), 0.12);
  }
  .completionValue { font-size: 42px; font-weight: 900; line-height: 1; }
  .completionLabel { margin-top: 5px; color: var(--muted); font-size: 12px; }
  .progressTrack, .doneLeftTrack, .statusBreakdownBarTrack, .geoTrack {
    height: 9px;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(255,255,255,0.11);
  }
  .progressFill, .doneLeftFill, .geoFill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--brand), var(--completed));
  }
  .heroMetaGrid { margin-top: 14px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .heroMetaCard, .execMetricCard, .doneLeftCard, .exceptionCard, .geoBreakdown, .activityReportItem {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: rgba(255,255,255,0.05);
    padding: 11px;
  }
  .heroMetaLabel, .execMetricLabel, .execMetricNote, .doneLeftDetail, .emptyCopy, .activityReportTime, .activityReportDetail, .footnote {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
  }
  .heroMetaValue { margin-top: 4px; font-size: 13px; font-weight: 800; overflow-wrap: anywhere; }
  .utilityBar {
    position: sticky;
    top: 0;
    z-index: 5;
    padding: 11px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    background: rgba(8, 16, 27, 0.96);
    backdrop-filter: blur(8px);
  }
  .utilityCopy { color: var(--muted); font-size: 12px; line-height: 1.45; }
  .utilityActions { display: inline-flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .utilityPrintStack { display: grid; gap: 4px; justify-items: stretch; }
  .utilityPrintHint { color: rgba(255,255,255,0.72); font-size: 11px; line-height: 1.35; text-align: center; }
  .utilityPdfGuidance {
    margin-top: 8px;
    padding: 9px 10px;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    background: rgba(255,255,255,0.055);
    color: rgba(255,255,255,0.78);
    font-size: 11px;
    line-height: 1.45;
  }
  .utilityPdfGuidance strong { color: #fff; }
  .utilityBtn {
    min-height: 36px;
    border: 1px solid rgba(var(--brand-rgb), 0.38);
    border-radius: 8px;
    padding: 0 12px;
    color: #fff;
    background: rgba(var(--brand-rgb), 0.22);
    font-weight: 800;
    cursor: pointer;
  }
  .utilityBtn.secondary { background: rgba(255,255,255,0.08); border-color: var(--line-strong); }
  .reportPanel { padding: 14px; }
  .sectionHeader { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
  .sectionBadge {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 0 10px;
    color: #fff;
    border: 1px solid rgba(var(--brand-rgb), 0.34);
    background: rgba(var(--brand-rgb), 0.14);
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }
  .execMetricGrid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 9px; }
  .execMetricValue { margin-top: 7px; font-size: 28px; font-weight: 900; line-height: 1; }
  .execMetricNote { margin-top: 7px; }
  .doneLeftGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .doneLeftTop { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
  .doneLeftValue { font-size: 34px; font-weight: 900; line-height: 1; }
  .doneLeftCard-remaining .doneLeftFill { background: var(--active); }
  .doneLeftCard-attention { border-color: rgba(255,153,0,0.32); background: rgba(255,153,0,0.08); }
  .doneLeftCard-attention .doneLeftFill { background: var(--rescheduled); }
  .statusGrid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 0.42fr); gap: 12px; }
  .statusBreakdownStack { display: grid; gap: 9px; }
  .statusBreakdownRow { display: grid; gap: 6px; }
  .statusBreakdownMeta { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--muted); }
  .statusBreakdownLabelWrap { display: inline-flex; align-items: center; gap: 7px; }
  .statusSwatch { width: 10px; height: 10px; border-radius: 999px; flex-shrink: 0; }
  .statusSwatch-active, .statusBreakdownBarFill-active { background: var(--active); }
  .statusSwatch-rescheduled, .statusBreakdownBarFill-rescheduled { background: var(--rescheduled); }
  .statusSwatch-completed, .statusBreakdownBarFill-completed { background: var(--completed); }
  .statusSwatch-closed, .statusBreakdownBarFill-closed { background: var(--closed); }
  .statusBreakdownValue { color: #fff; font-weight: 800; }
  .statusBreakdownValue span { color: var(--soft); font-size: 11px; margin-left: 4px; }
  .statusBreakdownBarFill { height: 100%; border-radius: inherit; }
  .statusReadout { display: grid; gap: 8px; }
  .statusReadoutLine { display: flex; justify-content: space-between; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; }
  .statusReadoutLine strong { color: #fff; }
  .geoGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .geoBreakdownTitle { font-size: 13px; font-weight: 900; margin-bottom: 9px; }
  .geoRows { display: grid; gap: 8px; }
  .geoRow { display: grid; gap: 5px; }
  .geoRowMeta { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 12px; }
  .geoRowMeta strong { color: #fff; }
  .activityReportList { display: grid; gap: 8px; }
  .activityReportTitle { margin-top: 3px; font-weight: 800; font-size: 13px; }
  .exceptionGrid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 9px; }
  .exceptionCard { border-color: rgba(255,153,0,0.3); background: rgba(255,153,0,0.08); }
  .exceptionValue { font-size: 26px; font-weight: 900; line-height: 1; }
  .exceptionLabel { margin-top: 6px; color: var(--muted); font-size: 12px; }
  .detailGrid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr); gap: 12px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { padding: 9px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; font-size: 12px; }
  th { color: rgba(226,238,255,0.72); text-transform: uppercase; letter-spacing: 0.08em; font-size: 10px; }
  .store-id { font-weight: 900; }
  .status, .count-pill, .muted-pill {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    border-radius: 999px;
    padding: 0 8px;
    font-size: 11px;
    font-weight: 800;
  }
  .status-active { color: #d9efff; background: rgba(100,181,246,0.2); border: 1px solid rgba(100,181,246,0.35); }
  .status-rescheduled { color: #ffe0b0; background: rgba(255,153,0,0.18); border: 1px solid rgba(255,153,0,0.36); }
  .status-completed { color: #d7fbe6; background: rgba(46,204,113,0.18); border: 1px solid rgba(46,204,113,0.34); }
  .status-closed { color: #ffd1d1; background: rgba(255,45,45,0.16); border: 1px solid rgba(255,45,45,0.34); }
  .count-pill, .muted-pill { color: rgba(255,255,255,0.78); background: rgba(255,255,255,0.08); border: 1px solid var(--line); }
  .count-pill.has-data { color: #fff; background: rgba(var(--brand-rgb),0.16); border-color: rgba(var(--brand-rgb),0.34); }
  .location-main, .reason-text, .activity-time-inline, .activity-summary-inline { line-height: 1.4; overflow-wrap: anywhere; }
  .activity-time-inline { color: rgba(255,255,255,0.82); font-weight: 800; }
  .activity-summary-inline, .reason-text { color: var(--muted); font-size: 11px; }
  .evidence-card, .empty-state-card {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: rgba(255,255,255,0.045);
    margin-bottom: 8px;
    overflow: hidden;
  }
  .evidence-summary { list-style: none; cursor: pointer; display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 0.6fr); gap: 12px; padding: 12px; }
  .evidence-summary::-webkit-details-marker { display: none; }
  .evidence-store-line, .evidence-count-row { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
  .evidence-store-id { font-weight: 900; }
  .evidence-address, .evidence-preview, .evidence-expand-hint, .evidence-empty-mini, .evidence-note-meta { color: var(--muted); font-size: 12px; line-height: 1.45; }
  .evidence-summary-side { display: grid; gap: 8px; justify-items: end; }
  .evidence-photo-rail, .evidence-photo-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 7px; width: 100%; }
  .evidence-photo-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .evidence-photo-shell { min-height: 70px; border-radius: 8px; overflow: hidden; background: rgba(255,255,255,0.08); display: grid; place-items: center; }
  .evidence-photo-shell-expanded { min-height: 118px; }
  .evidence-photo { width: 100%; height: 100%; object-fit: cover; cursor: pointer; }
  .evidence-photo-expanded { object-fit: contain; }
  .evidence-photo-fallback { display: none; color: var(--muted); font-size: 11px; padding: 10px; text-align: center; }
  .evidence-photo-shell.is-broken .evidence-photo-fallback { display: block; }
  .evidence-diagnostics { margin: 0 0 10px; color: var(--muted); font-size: 11px; line-height: 1.45; font-weight: 800; }
  .evidence-expanded { padding: 12px; border-top: 1px solid var(--line); }
  .evidence-expanded-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .summary-title { font-size: 12px; font-weight: 900; margin-bottom: 8px; }
  .evidence-note-item + .evidence-note-item { margin-top: 9px; }
  .evidence-note-text { font-size: 12px; line-height: 1.5; }
  .empty-state-title { font-weight: 900; margin-bottom: 4px; }
  .empty-state-copy { color: var(--muted); font-size: 12px; line-height: 1.5; }
  .reportFooter { padding: 13px; color: var(--muted); font-size: 12px; line-height: 1.45; }
  .snapshot-photo-modal {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(6, 12, 20, 0.84);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }
  .snapshot-photo-modal[aria-hidden="false"] { opacity: 1; pointer-events: auto; }
  .snapshot-photo-modal-dialog { position: relative; width: min(1100px,94vw); max-height: 92vh; border-radius: 8px; overflow: hidden; background: #09111b; border: 1px solid var(--line-strong); }
  #snapshotPhotoModalImage { display: block; width: 100%; height: 100%; max-height: 92vh; object-fit: contain; }
  #snapshotPhotoModalClose { position: absolute; top: 10px; right: 10px; width: 34px; height: 34px; border-radius: 999px; border: 1px solid var(--line-strong); background: rgba(0,0,0,0.6); color: #fff; font-size: 24px; cursor: pointer; }
  .print-only { display: none; }
  @media print {
    html, body {
      background: #fff !important;
      color: #111827;
      width: auto;
      min-height: auto;
    }
    body {
      font-size: 9.5pt;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: auto;
      max-width: none;
      margin: 0;
      padding: 0;
      display: block;
      gap: 0;
    }
    .reportHero,
    .reportPanel,
    .reportFooter,
    .heroMetaCard,
    .execMetricCard,
    .doneLeftCard,
    .exceptionCard,
    .geoBreakdown,
    .activityReportItem,
    .evidence-card,
    .empty-state-card {
      box-shadow: none !important;
      background: #fff !important;
      color: #111827;
      border-color: #cfd8e3;
    }
    .reportHero,
    .printSummaryPanel,
    .printDoneLeftPanel,
    .printStatusPanel,
    .printGeoPanel,
    .printDataHealthPanel,
    .reportFooter {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .reportHero {
      padding: 0.18in;
      margin: 0 0 0.08in;
      background: linear-gradient(135deg, rgba(var(--brand-rgb), 0.10), #fff 48%, #f8fafc) !important;
    }
    .reportPanel {
      padding: 0.10in;
      margin: 0 0 0.08in;
      border-radius: 6px;
    }
    .printStatusPanel {
      break-after: page;
      page-break-after: always;
    }
    .printRecentPanel {
      break-inside: auto;
      page-break-inside: auto;
    }
    .detailGrid {
      display: block;
      break-before: page;
      page-break-before: always;
    }
    .storeAppendixPanel {
      break-inside: auto;
      page-break-inside: auto;
    }
    .fieldEvidencePanel {
      break-before: page;
      page-break-before: always;
    }
    .utilityBar,
    .snapshot-photo-modal,
    .no-print,
    .screen-only {
      display: none !important;
    }
    .print-only { display: block; }
    h1 {
      margin: 3px 0 4px;
      font-size: 25pt;
      line-height: 1;
      color: #111827;
    }
    h2 { font-size: 11pt; color: #111827; }
    .heroTop { gap: 0.14in; align-items: stretch; }
    .heroIdentity { gap: 0.10in; align-items: flex-start; }
    .reportLogo,
    .reportLogoMark {
      width: 0.58in;
      height: 0.58in;
      border-color: rgba(var(--brand-rgb), 0.44);
      background: #fff;
    }
    .reportLogo { padding: 0.05in; }
    .reportLogoMark { color: var(--brand); font-size: 21pt; }
    .heroSummary {
      max-width: 6.8in;
      color: #475569;
      font-size: 8.8pt;
      line-height: 1.35;
    }
    .heroCompletion {
      min-width: 1.45in;
      padding: 0.10in;
      color: #111827;
      background: #fff7f9 !important;
      border-color: rgba(var(--brand-rgb), 0.32);
    }
    .completionValue { font-size: 25pt; }
    .completionLabel { color: #475569; font-size: 8pt; }
    .progressTrack,
    .doneLeftTrack,
    .statusBreakdownBarTrack,
    .geoTrack {
      height: 0.07in;
      background: #e5e7eb;
    }
    .heroMetaGrid {
      margin-top: 0.11in;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.07in;
    }
    .heroMetaCard,
    .execMetricCard,
    .doneLeftCard,
    .geoBreakdown,
    .activityReportItem {
      padding: 0.07in;
      background: #f8fafc !important;
    }
    .eyebrow,
    .sectionEyebrow,
    .metricLabel,
    .doneLeftTitle,
    th {
      color: #64748b;
      font-size: 7pt;
      letter-spacing: 0.08em;
    }
    .heroMetaLabel,
    .execMetricLabel,
    .execMetricNote,
    .doneLeftDetail,
    .emptyCopy,
    .activityReportTime,
    .activityReportDetail,
    .footnote,
    .geoRowMeta,
    .evidence-address,
    .evidence-preview,
    .evidence-empty-mini,
    .evidence-note-meta,
    .activity-summary-inline,
    .reason-text {
      color: #475569;
    }
    .heroMetaValue,
    .statusBreakdownValue,
    .statusReadoutLine strong,
    .geoRowMeta strong,
    .activityReportTitle,
    .store-id,
    .evidence-store-id,
    .summary-title,
    .geoBreakdownTitle {
      color: #111827;
    }
    .sectionHeader {
      margin-bottom: 0.07in;
      gap: 0.09in;
    }
    .sectionBadge {
      min-height: 0.20in;
      padding: 0 0.07in;
      color: #111827;
      background: #f1f5f9;
      border-color: #cfd8e3;
      font-size: 7.5pt;
    }
    .execMetricGrid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 0.06in;
    }
    .execMetricValue {
      margin-top: 0.04in;
      font-size: 17pt;
    }
    .execMetricNote { margin-top: 0.04in; font-size: 7.8pt; }
    .doneLeftGrid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.07in;
    }
    .doneLeftTop {
      gap: 0.08in;
      margin-bottom: 0.07in;
    }
    .doneLeftValue { font-size: 20pt; }
    .statusGrid {
      grid-template-columns: minmax(0, 1fr) minmax(2.2in, 0.42fr);
      gap: 0.08in;
    }
    .statusBreakdownStack,
    .geoRows,
    .activityReportList {
      gap: 0.05in;
    }
    .statusBreakdownMeta,
    .statusReadoutLine {
      color: #475569;
      font-size: 8pt;
    }
    .statusReadoutLine {
      padding-bottom: 0.05in;
      border-bottom-color: #d6dce3;
    }
    .geoGrid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.07in;
    }
    .activityReportList {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .activityReportItem {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .exceptionGrid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 0.06in;
    }
    .exceptionCard {
      padding: 0.07in;
      background: #fff7ed !important;
      border-color: #fed7aa;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .exceptionValue { font-size: 17pt; color: #9a3412; }
    .exceptionLabel { color: #9a3412; font-size: 7.8pt; }
    table {
      width: 100%;
      table-layout: auto;
      border-collapse: collapse;
      font-size: 7.6pt;
    }
    thead { display: table-header-group; }
    tbody { display: table-row-group; }
    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    th,
    td {
      padding: 0.045in 0.05in;
      border-bottom-color: #d6dce3;
      color: #111827;
      font-size: 7.6pt;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .status,
    .count-pill,
    .muted-pill {
      min-height: 0.18in;
      padding: 0 0.06in;
      font-size: 7.2pt;
    }
    .status-active { color: #075985; background: #e0f2fe; border-color: #7dd3fc; }
    .status-rescheduled { color: #92400e; background: #ffedd5; border-color: #fdba74; }
    .status-completed { color: #166534; background: #dcfce7; border-color: #86efac; }
    .status-closed { color: #991b1b; background: #fee2e2; border-color: #fca5a5; }
    .count-pill,
    .muted-pill {
      color: #334155;
      background: #f8fafc;
      border-color: #cfd8e3;
    }
    .count-pill.has-data {
      color: #111827;
      background: rgba(var(--brand-rgb), 0.10);
      border-color: rgba(var(--brand-rgb), 0.30);
    }
    [data-evidence-card] {
      margin-bottom: 0.08in;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    [data-evidence-card] .evidence-expanded { display: block !important; }
    .evidence-summary {
      grid-template-columns: minmax(0, 1fr) minmax(1.85in, 0.48fr);
      gap: 0.08in;
      padding: 0.08in;
    }
    .evidence-summary-side { gap: 0.05in; }
    .evidence-expand-hint { display: none; }
    .evidence-expanded {
      padding: 0.08in;
      border-top-color: #d6dce3;
    }
    .evidence-expanded-grid {
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
      gap: 0.08in;
    }
    .evidence-photo-rail,
    .evidence-photo-grid {
      gap: 0.05in;
    }
    .evidence-photo-shell {
      height: 0.62in;
      min-height: 0.62in;
      background: #f1f5f9;
      border: 1px solid #d6dce3;
    }
    .evidence-photo-shell-expanded {
      height: 0.88in;
      min-height: 0.88in;
    }
    .evidence-photo {
      cursor: default;
      object-fit: cover;
    }
    .evidence-photo-expanded { object-fit: contain; }
    .evidence-diagnostics {
      margin-bottom: 0.06in;
      color: #475569;
      font-size: 7.6pt;
    }
    .reportFooter {
      margin-top: 0.08in;
      padding: 0.08in;
      color: #475569;
    }
  }
  @media print and (max-width: 9in) {
    .heroTop,
    .statusGrid,
    .evidence-summary,
    .evidence-expanded-grid {
      grid-template-columns: 1fr;
    }
    .heroTop { display: grid; }
    .execMetricGrid,
    .geoGrid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .activityReportList,
    .exceptionGrid {
      grid-template-columns: 1fr;
    }
  }
  @media screen and (max-width: 1040px) {
    .heroTop, .utilityBar { flex-direction: column; align-items: stretch; }
    .heroMetaGrid, .doneLeftGrid, .statusGrid, .geoGrid, .detailGrid, .evidence-expanded-grid, .evidence-summary { grid-template-columns: 1fr; }
    .execMetricGrid { grid-template-columns: repeat(3, minmax(0,1fr)); }
    .exceptionGrid { grid-template-columns: repeat(2, minmax(0,1fr)); }
  }
  @media screen and (max-width: 680px) {
    .page { padding: 10px; }
    .heroIdentity { align-items: flex-start; }
    .reportLogo, .reportLogoMark { width: 52px; height: 52px; }
    .execMetricGrid { grid-template-columns: repeat(2, minmax(0,1fr)); }
    table, thead, tbody, tr, th, td { display: block; width: 100%; }
    thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
    tr { border: 1px solid var(--line); border-radius: 8px; margin-bottom: 8px; overflow: hidden; }
    td { position: relative; padding-left: 120px; min-height: 34px; }
    td::before { content: attr(data-label); position: absolute; left: 8px; top: 9px; width: 100px; color: var(--soft); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 900; }
  }
</style>
</head>
<body>
  <div class="page">
    <section class="reportHero printHeroPanel">
      <div class="heroTop">
        <div class="heroIdentity">
          ${logoMarkup}
          <div>
            <div class="eyebrow">${escapeSnapshotHtml(reportIdentity.reportTitle)}</div>
            <h1>${escapeSnapshotHtml(projectTitle)}</h1>
            <div class="heroSummary">${escapeSnapshotHtml(buildSnapshotHeroSummary({ metrics, scopeMeta }))}</div>
          </div>
        </div>
        <div class="heroCompletion">
          <div class="completionValue">${metrics.completionRate.toFixed(1)}%</div>
          <div class="completionLabel">Overall completion</div>
          <div class="progressTrack" style="margin-top:12px;"><div class="progressFill" style="width:${Math.max(0, Math.min(100, metrics.completionRate)).toFixed(2)}%;"></div></div>
        </div>
      </div>
      <div class="heroMetaGrid">
        <div class="heroMetaCard"><div class="heroMetaLabel">Generated</div><div class="heroMetaValue">${escapeSnapshotHtml(generatedAt)}</div></div>
        <div class="heroMetaCard"><div class="heroMetaLabel">Source / Project</div><div class="heroMetaValue">${escapeSnapshotHtml(projectId)} / ${escapeSnapshotHtml(currentProjectMeta?.sourceLabel || "Operations Console")}</div></div>
        <div class="heroMetaCard"><div class="heroMetaLabel">Scope</div><div class="heroMetaValue">${escapeSnapshotHtml(scopeMeta.scopeLabel)} - ${escapeSnapshotHtml(scopeMeta.scopeDescription)}</div></div>
      </div>
    </section>

    <section class="utilityBar no-print">
      <div class="utilityCopy">
        <div>Read-only executive snapshot generated from live project data at ${escapeSnapshotHtml(generatedAt)}.</div>
        <div class="utilityPdfGuidance screen-only">
          <strong>Recommended PDF settings:</strong>
          Destination: Save as PDF &bull; Layout: Landscape &bull; Paper: Letter &bull; Background graphics: On &bull; Headers/footers: Off &bull; Scale: Default/100%, or 90% if content clips
        </div>
      </div>
      <div class="utilityActions">
        <button id="snapshotReturnBtn" class="utilityBtn secondary" type="button">Back to App</button>
        <div class="utilityPrintStack">
          <button id="snapshotPrintBtn" class="utilityBtn" type="button">Print / Save as PDF</button>
          <div class="utilityPrintHint">Optimized for Letter Landscape PDF.</div>
        </div>
      </div>
    </section>

    <section class="reportPanel printSummaryPanel">
      <div class="sectionHeader">
        <div><div class="sectionEyebrow">Executive Summary</div><h2>What changed, what remains, what needs attention</h2></div>
        <div class="sectionBadge">${escapeSnapshotHtml(generatedTimeLabel)}</div>
      </div>
      <div class="execMetricGrid">${buildExecutiveSummaryCards(metrics, analyticsMetrics)}</div>
    </section>

    <section class="reportPanel printDoneLeftPanel">
      <div class="sectionHeader">
        <div><div class="sectionEyebrow">Done vs Left</div><h2>Execution Position</h2></div>
        <div class="sectionBadge">${analyticsMetrics.openWorkCount.toLocaleString()} open work</div>
      </div>
      <div class="doneLeftGrid">${buildDoneLeftCards(metrics, analyticsMetrics, dataHealth)}</div>
    </section>

    <section class="reportPanel printStatusPanel">
      <div class="sectionHeader">
        <div><div class="sectionEyebrow">Status Breakdown</div><h2>Current Status Mix</h2></div>
        <div class="sectionBadge">${metrics.total.toLocaleString()} stores</div>
      </div>
      <div class="statusGrid">
        <div class="statusBreakdownStack">${buildExecutionStatusBreakdown(metrics)}</div>
        <div class="statusReadout">
          <div class="statusReadoutLine"><span>Completed today</span><strong>${analyticsMetrics.completedToday.toLocaleString()}</strong></div>
          <div class="statusReadoutLine"><span>Recent follow-up coverage</span><strong>${analyticsMetrics.recentActivityCoverageRate.toFixed(1)}%</strong></div>
          <div class="statusReadoutLine"><span>Notes coverage</span><strong>${metrics.noteCoverageRate.toFixed(1)}%</strong></div>
          <div class="statusReadoutLine"><span>Photo evidence coverage</span><strong>${metrics.photoCoverageRate.toFixed(1)}%</strong></div>
        </div>
      </div>
    </section>

    ${buildExecutiveGeographicOverview(stores)}
    ${buildExecutiveRecentActivity()}
    ${buildExecutiveDataHealth(dataHealth)}

    <section class="detailGrid printDetailSection">
      <div class="reportPanel storeAppendixPanel">
        <div class="sectionHeader">
          <div><div class="sectionEyebrow">Store Detail Appendix</div><h2>Read-only Store Status</h2></div>
        </div>
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
          <tbody>${buildSnapshotTableRows(rows)}</tbody>
        </table>
      </div>
      <div class="reportPanel fieldEvidencePanel">
        <div class="sectionHeader">
          <div><div class="sectionEyebrow">Field Evidence</div><h2>Notes & Photos</h2></div>
        </div>
        ${buildSnapshotEvidenceSummaryLine(evidenceRows || [])}
        ${buildSnapshotEvidenceCards(evidenceRows || [])}
      </div>
    </section>

    <footer class="reportFooter">
      Generated from Route Builder / Operations Console. This report is read-only and intended for project visibility, not administration or field updates.
    </footer>
    <div class="print-only footnote">Generated from Route Builder / Operations Console on ${escapeSnapshotHtml(generatedAt)}.</div>
  </div>

  <div id="snapshotPhotoModal" class="snapshot-photo-modal no-print" aria-hidden="true">
    <div class="snapshot-photo-modal-dialog" role="dialog" aria-modal="true" aria-label="Photo preview">
      <button id="snapshotPhotoModalClose" type="button" aria-label="Close photo preview">&times;</button>
      <img id="snapshotPhotoModalImage" alt="Expanded store evidence photo" />
    </div>
  </div>

  <script>
    (function () {
      const returnUrl = ${JSON.stringify(returnUrl)};
      const printBtn = document.getElementById("snapshotPrintBtn");
      const returnBtn = document.getElementById("snapshotReturnBtn");
      const snapshotPhotoModal = document.getElementById("snapshotPhotoModal");
      const snapshotPhotoModalImage = document.getElementById("snapshotPhotoModalImage");
      const snapshotPhotoModalClose = document.getElementById("snapshotPhotoModalClose");
      const evidenceCards = Array.from(document.querySelectorAll("[data-evidence-card]"));
      const clickablePhotos = Array.from(document.querySelectorAll("img[data-full-image][role='button']"));

      const closePhotoModal = () => {
        if (!snapshotPhotoModal) return;
        snapshotPhotoModal.setAttribute("aria-hidden", "true");
        if (snapshotPhotoModalImage) snapshotPhotoModalImage.removeAttribute("src");
      };

      const openPhotoModal = (imageUrl) => {
        if (!snapshotPhotoModal || !snapshotPhotoModalImage || !imageUrl) return;
        snapshotPhotoModalImage.src = imageUrl;
        snapshotPhotoModal.setAttribute("aria-hidden", "false");
      };

      const applyEvidencePrintState = (openAll) => {
        evidenceCards.forEach(card => {
          if (openAll) {
            card.dataset.wasOpenBeforePrint = card.open ? "true" : "false";
            card.open = true;
          } else if (card.dataset.wasOpenBeforePrint === "false") {
            card.open = false;
          }
        });
      };

      if (printBtn) printBtn.addEventListener("click", () => window.print());
      if (returnBtn) {
        returnBtn.addEventListener("click", () => {
          if (returnUrl) {
            window.location.href = returnUrl;
            return;
          }
          window.location.href = "/";
        });
      }
      window.addEventListener("beforeprint", () => {
        closePhotoModal();
        applyEvidencePrintState(true);
      });
      window.addEventListener("afterprint", () => applyEvidencePrintState(false));
      clickablePhotos.forEach(photo => {
        photo.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          openPhotoModal(photo.dataset.fullImage);
        });
        photo.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            openPhotoModal(photo.dataset.fullImage);
          }
        });
      });
      if (snapshotPhotoModalClose) snapshotPhotoModalClose.addEventListener("click", closePhotoModal);
      if (snapshotPhotoModal) {
        snapshotPhotoModal.addEventListener("click", event => {
          if (event.target === snapshotPhotoModal) closePhotoModal();
        });
      }
      window.addEventListener("keydown", event => {
        if (event.key === "Escape") closePhotoModal();
      });
    })();
  </script>
</body>
</html>`;
}

function exportProjectSnapshot() {
  const filteredStores = typeof getFilteredStores === "function" ? getFilteredStores() : [];
  const scopeMeta = getSnapshotScopeMeta(filteredStores);
  const rows = getSnapshotRows(filteredStores);
  const evidenceRows = getSnapshotEvidenceRows(filteredStores);
  const metrics = getSnapshotMetrics(filteredStores, rows);
  const analyticsSnapshot = typeof getProjectAnalyticsSnapshot === "function" ? getProjectAnalyticsSnapshot() : null;
  const generatedDate = new Date();
  const generatedAt = generatedDate.toLocaleString();
  const generatedTimeLabel = `Generated ${generatedDate.toLocaleDateString()} • ${generatedDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  const projectTitle = currentProjectMeta?.name || currentProjectId || "Project Snapshot";
  const operationalSummary = buildSnapshotHeroSummary({ metrics, scopeMeta });
  const returnUrl = window.location.href;

  document.open();
  document.write(buildExecutiveSnapshotHtml({
    generatedAt,
    generatedTimeLabel,
    projectTitle,
    projectId: currentProjectId,
    scopeMeta,
    metrics,
    rows,
    evidenceRows,
    stores: filteredStores,
    analyticsSnapshot,
    branding: getExecutiveSnapshotBranding(),
    operationalSummary,
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

const ANALYTICS_EXPORT_SCHEMA_VERSION = "11.1l-bundled";
const ANALYTICS_CSV_HEADERS = [
  "rowType", "projectId", "projectName", "generatedAt", "scopeLabel", "scopeDescription", "totalStores", "active", "rescheduled", "completed", "closed", "openWorkCount", "completionRate", "actionableRate", "noteCoverageRate", "photoCoverageRate", "activityCoverageRate", "recentActivityCoverageRate", "integrityIssueCount", "integrityIssueRate", "storesWithNoUpdates", "storesWithNotesNoPhotos", "storesWithPhotosNoNotes", "stalledActiveCount", "rescheduledNoReasonCount", "rescheduledNoRecentFollowUpCount", "completedToday", "attentionNeededCount", "snapshotNotes", "snapshotPhotos", "storesWithNotes", "storesWithPhotos", "storesWithRecentActivity", "actionableTotal", "storeId", "address", "statusCode", "statusLabel", "rescheduleReason", "noteCount", "photoCount", "hasNotes", "hasPhotos", "hasActivity", "activityLabel", "activitySummary", "activityTimestampValue"
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
    rowSchema: { summaryRowType: "project_summary", detailRowType: "store_detail" },
    exportSummary: {
      rowCount: totalRows,
      storeRowCount: detailRows,
      includesProjectSummaryRow: true,
      includesStoreDetailRows: detailRows > 0,
      scopeDescription: scopeMeta.scopeDescription
    },
    exportCounts: { totalRows, summaryRows: 1, detailRows },
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
  return new Blob([`${JSON.stringify(exportPayload, null, 2)}
`], { type: "application/json;charset=utf-8" }).size;
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
  const rowSchema = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload.rowSchema || {}) : {};
  return [rowSchema.summaryRowType, rowSchema.detailRowType]
    .map(value => String(value || "").trim())
    .filter((value, index, array) => value && array.indexOf(value) === index);
}

function summarizeAnalyticsExportPayload(payload) {
  const isSupported = isSupportedAnalyticsExportPayload(payload);
  const exportCounts = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload.exportCounts || {}) : {};
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

  if (!isObject) errors.push("payload missing or not object");
  if (!isObject || payload.exportType !== "analytics_export") errors.push("wrong exportType");
  if (!isObject || payload.exportFormat !== "route_builder_analytics") errors.push("wrong exportFormat");
  if (!isObject || typeof payload.schemaVersion !== "string" || payload.schemaVersion.trim() === "") errors.push("missing schemaVersion");
  if (!isObject || !Array.isArray(payload.rows)) errors.push("missing rows array");

  if (!isObject || !payload.projectId) warnings.push("missing projectId");
  if (!isObject || !payload.projectName) warnings.push("missing projectName");
  if (!isObject || !payload.scopeLabel) warnings.push("missing scopeLabel");
  if (!isObject || typeof payload.metrics !== "object" || payload.metrics === null || Array.isArray(payload.metrics)) warnings.push("missing metrics object");
  if (!isObject || typeof payload.scopeMeta !== "object" || payload.scopeMeta === null || Array.isArray(payload.scopeMeta)) warnings.push("missing scopeMeta");
  if (!Array.isArray(payload?.rows) || payload.rows.length === 0) warnings.push("rows array empty");
  if (getAnalyticsExportSupportedRowTypes(payload).length < 2) warnings.push("rowSchema missing summary/detail row types");

  return { isValid: errors.length === 0, errors, warnings };
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
  const { projectId, projectName, generatedAt, scopeLabel, metrics, scopeMeta, snapshotMetrics, rows } = exportPayload;

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
    attentionNeededCount: normalizeAnalyticsExportValue(metrics.attentionNeededCount),
    snapshotNotes: normalizeAnalyticsExportValue(snapshotMetrics.notes),
    snapshotPhotos: normalizeAnalyticsExportValue(snapshotMetrics.photos),
    storesWithNotes: normalizeAnalyticsExportValue(snapshotMetrics.storesWithNotes),
    storesWithPhotos: normalizeAnalyticsExportValue(snapshotMetrics.storesWithPhotos),
    storesWithRecentActivity: normalizeAnalyticsExportValue(snapshotMetrics.storesWithRecentActivity),
    actionableTotal: normalizeAnalyticsExportValue(snapshotMetrics.actionableTotal),
    storeId: "", address: "", statusCode: "", statusLabel: "", rescheduleReason: "", noteCount: "", photoCount: "", hasNotes: "false", hasPhotos: "false", hasActivity: "false", activityLabel: "", activitySummary: "", activityTimestampValue: ""
  });

  return [
    { ...buildBaseRow(), rowType: "project_summary" },
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
