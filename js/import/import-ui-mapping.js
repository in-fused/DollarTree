(function importUiMappingModule() {
  const STYLE_ID = "import-ui-mapping-styles";
  const HOST_ID = "importShellMappingHost";
  const TABLE_ID = "importShellMappingTable";
  const CLEAR_BTN_ID = "importShellClearOverridesBtn";

  const FALLBACK_CANONICAL_FIELDS = [
    "store_id",
    "store_name",
    "customer_id",
    "full_address",
    "address_line_1",
    "address_line_2",
    "city",
    "state",
    "postal_code",
    "region",
    "territory",
    "district",
    "division",
    "market",
    "status",
    "status_reason",
    "completed",
    "closed",
    "latitude",
    "longitude",
    "notes_count",
    "photos_count",
    "last_activity_at",
    "source_row_index"
  ];

  function getRuntime() {
    return window.ImportRuntime || null;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .importMappingSection {
        margin-top: 14px;
      }

      .importMappingLabel {
        margin: 0 0 8px;
        font-size: 11px;
        line-height: 1.2;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(195,210,232,0.82);
      }

      .importMappingCard {
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        background: rgba(255,255,255,0.03);
        padding: 12px;
        color: #f5f7fb;
        font-size: 12px;
        line-height: 1.45;
      }

      .importMappingSummary {
        margin-bottom: 10px;
        color: rgba(228,234,244,0.84);
      }

      .importMappingControls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }

      .importMappingControls button {
        appearance: none;
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 12px;
        background: rgba(255,255,255,0.05);
        color: #f5f7fb;
        font: inherit;
        padding: 9px 12px;
        cursor: pointer;
      }

      .importMappingControls button:hover {
        background: rgba(255,255,255,0.08);
      }

      .importMappingScroll {
        overflow: auto;
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px;
      }

      .importMappingTable {
        width: 100%;
        border-collapse: collapse;
        min-width: 700px;
      }

      .importMappingTable th,
      .importMappingTable td {
        padding: 8px 10px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        vertical-align: top;
        text-align: left;
      }

      .importMappingTable th {
        position: sticky;
        top: 0;
        background: rgba(16, 26, 44, 0.98);
        z-index: 1;
        font-size: 11px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: rgba(195,210,232,0.88);
      }

      .importMappingSource {
        font-weight: 700;
        word-break: break-word;
      }

      .importMappingConfidence {
        color: rgba(228,234,244,0.72);
      }

      .importMappingTable select {
        width: 100%;
        min-width: 180px;
        background: rgba(255,255,255,0.06);
        color: #f5f7fb;
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 10px;
        padding: 8px 10px;
      }

      .importMappingIssueList {
        margin: 10px 0 0;
        padding-left: 18px;
        color: #ffd8d8;
      }

      .importMappingIssueList li + li {
        margin-top: 4px;
      }

      .importMappingRow.is-duplicate td {
        background: rgba(251, 191, 36, 0.08);
      }

      .importMappingRow.is-issue td {
        background: rgba(248, 113, 113, 0.08);
      }

      @media (max-width: 900px) {
        .importMappingControls {
          flex-direction: column;
          align-items: stretch;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function getModalContent() {
    const modal = document.getElementById("importShellModal");
    if (!modal) return null;
    return modal.querySelector(".importShellContent");
  }

  function ensureHost() {
    const content = getModalContent();
    if (!content) return null;

    let host = document.getElementById(HOST_ID);
    if (host) return host;

    host = document.createElement("section");
    host.id = HOST_ID;
    host.className = "importMappingSection";

    const label = document.createElement("div");
    label.className = "importMappingLabel";
    label.textContent = "Manual Column Mapping Review";

    const card = document.createElement("div");
    card.className = "importMappingCard";

    const controls = document.createElement("div");
    controls.className = "importMappingControls";

    const summary = document.createElement("div");
    summary.className = "importMappingSummary";
    summary.textContent = "Mapping review will appear after dry-run parsing.";

    const clearBtn = document.createElement("button");
    clearBtn.id = CLEAR_BTN_ID;
    clearBtn.type = "button";
    clearBtn.textContent = "Clear Overrides";

    controls.appendChild(summary);
    controls.appendChild(clearBtn);

    const scroll = document.createElement("div");
    scroll.className = "importMappingScroll";

    const table = document.createElement("table");
    table.id = TABLE_ID;
    table.className = "importMappingTable";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["Source Header", "Mapped Canonical", "Confidence / Strategy", "Manual Override"].forEach(function addHeader(text) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = text;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");

    table.appendChild(thead);
    table.appendChild(tbody);
    scroll.appendChild(table);

    const issues = document.createElement("ul");
    issues.className = "importMappingIssueList";

    card.appendChild(controls);
    card.appendChild(scroll);
    card.appendChild(issues);

    host.appendChild(label);
    host.appendChild(card);
    content.appendChild(host);

    return host;
  }

  function clearChildren(node) {
    while (node && node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function toHeaderKey(header, index) {
  return String(index);
}

  function getCanonicalFieldsFromSchema() {
    const schema = window.ingestionSchema || {};
    const merged = new Set();

    [
      schema.fields,
      schema.canonicalFields,
      schema.ingestionFields,
      schema.columns,
      schema.fieldDefinitions
    ].forEach(function readCollection(collection) {
      if (!collection) return;

      if (Array.isArray(collection)) {
        collection.forEach(function readEntry(entry) {
          const fieldName = normalizeText(
            typeof entry === "string"
              ? entry
              : (entry && (entry.key || entry.name || entry.field || entry.canonical)) || ""
          );
          if (fieldName) merged.add(fieldName);
        });
      } else if (typeof collection === "object") {
        Object.keys(collection).forEach(function readKey(key) {
          const fieldName = normalizeText(key);
          if (fieldName) merged.add(fieldName);
        });
      }
    });

    if (typeof schema.getCanonicalFields === "function") {
      try {
        const helperFields = schema.getCanonicalFields();
        if (Array.isArray(helperFields)) {
          helperFields.forEach(function readHelper(field) {
            const fieldName = normalizeText(
              typeof field === "string"
                ? field
                : (field && (field.key || field.name || field.field)) || ""
            );
            if (fieldName) merged.add(fieldName);
          });
        }
      } catch (error) {
        console.error(error);
      }
    }

    FALLBACK_CANONICAL_FIELDS.forEach(function addFallback(field) {
      merged.add(field);
    });

    return Array.from(merged);
  }

  function getRequiredCanonicalFields() {
    const schema = window.ingestionSchema || {};
    const required = new Set();

    if (Array.isArray(schema.requiredCanonicalFields)) {
      schema.requiredCanonicalFields.forEach(function addRequired(field) {
        const normalized = normalizeText(field);
        if (normalized) required.add(normalized);
      });
    }

    if (typeof schema.getRequiredCanonicalFields === "function") {
      try {
        const helperFields = schema.getRequiredCanonicalFields();
        if (Array.isArray(helperFields)) {
          helperFields.forEach(function addHelper(field) {
            const normalized = normalizeText(
              typeof field === "string"
                ? field
                : (field && (field.key || field.name || field.field)) || ""
            );
            if (normalized) required.add(normalized);
          });
        }
      } catch (error) {
        console.error(error);
      }
    }

    if (!required.size) {
      required.add("store_id");
    }

    return Array.from(required);
  }

  function getConfidenceByHeader(snapshot) {
    const mappingReport = snapshot && snapshot.mappingReport;
    if (!mappingReport) return {};

    const source = mappingReport.confidenceByHeader;
    if (!source) return {};

    if (Array.isArray(source)) {
      const mapped = {};
      source.forEach(function readConfidence(entry) {
        if (!entry || typeof entry !== "object") return;
        const header = normalizeText(entry.sourceHeader || entry.header || "");
        if (!header) return;
        mapped[header] = entry;
      });
      return mapped;
    }

    if (typeof source === "object") {
      return source;
    }

    return {};
  }

  function getCanonicalAssignments(snapshot) {
    const mappingReport = snapshot && snapshot.mappingReport;
    if (!mappingReport) return [];

    if (Array.isArray(mappingReport.canonicalAssignments)) {
      return mappingReport.canonicalAssignments.slice();
    }

    if (Array.isArray(mappingReport.assignments)) {
      return mappingReport.assignments.slice();
    }

    return [];
  }

  function getEffectiveMapping(snapshot) {
    const parsedHeaders = (snapshot && snapshot.parsedHeaders) || [];
    const overrides = (snapshot && snapshot.overrideMappings) || {};
    const effective = {};
    const canonicalAssignments = getCanonicalAssignments(snapshot);

    parsedHeaders.forEach(function buildAssignment(header, index) {
      const headerKey = toHeaderKey(header, index);
      const baseValue = normalizeText(canonicalAssignments[index] || "");
      const overrideValue = Object.prototype.hasOwnProperty.call(overrides, headerKey)
        ? normalizeText(overrides[headerKey])
        : null;

      effective[headerKey] = overrideValue !== null ? overrideValue : baseValue;
    });

    return effective;
  }

  function collectDuplicateAssignments(effectiveMapping) {
    const assignments = {};
    const duplicates = {};

    Object.keys(effectiveMapping).forEach(function readAssignment(headerKey) {
      const canonical = normalizeText(effectiveMapping[headerKey]);
      if (!canonical) return;

      if (!assignments[canonical]) {
        assignments[canonical] = [];
      }
      assignments[canonical].push(headerKey);
    });

    Object.keys(assignments).forEach(function findDuplicates(canonical) {
      if (assignments[canonical].length > 1) {
        duplicates[canonical] = assignments[canonical];
      }
    });

    return duplicates;
  }

  function countMissingRequiredMappings(effectiveMapping) {
    const required = getRequiredCanonicalFields();
    const mapped = new Set();

    Object.keys(effectiveMapping).forEach(function collectMapped(headerKey) {
      const canonical = normalizeText(effectiveMapping[headerKey]);
      if (canonical) mapped.add(canonical);
    });

    let missingCount = 0;
    required.forEach(function countMissing(field) {
      if (!mapped.has(field)) missingCount += 1;
    });

    return missingCount;
  }

  function formatConfidence(entry) {
    if (!entry) return "—";
    if (typeof entry === "string") return entry;

    const confidence = typeof entry.confidence === "number" ? entry.confidence : null;
    const strategy = normalizeText(entry.strategy || entry.method || "");

    if (confidence !== null && strategy) {
      return `${Math.round(confidence * 100)}% (${strategy})`;
    }

    if (confidence !== null) {
      return `${Math.round(confidence * 100)}%`;
    }

    if (strategy) return strategy;

    return "—";
  }

  function getIssueRows(snapshot) {
    const mappingReport = snapshot && snapshot.mappingReport;
    if (!mappingReport || !Array.isArray(mappingReport.issues)) return [];

    return mappingReport.issues.map(function mapIssue(issue) {
      if (typeof issue === "string") {
        return { message: issue, header: "" };
      }

      return {
        message: normalizeText(issue.message || issue.reason || "Issue detected"),
        header: normalizeText(issue.header || issue.sourceHeader || "")
      };
    });
  }

  function render(snapshot) {
    const host = ensureHost();
    if (!host) return;

    const summaryNode = host.querySelector(".importMappingSummary");
    const tableBody = host.querySelector(`#${TABLE_ID} tbody`);
    const issuesNode = host.querySelector(".importMappingIssueList");
    const clearBtn = document.getElementById(CLEAR_BTN_ID);
    const runtime = getRuntime();

    if (!summaryNode || !tableBody || !issuesNode || !runtime || !clearBtn) return;

    clearChildren(tableBody);
    clearChildren(issuesNode);

    if (!snapshot || !snapshot.file || !(snapshot.parsedHeaders || []).length) {
      summaryNode.textContent = "Mapping review will appear after dry-run parsing.";
      return;
    }

    const canonicalFields = getCanonicalFieldsFromSchema();
    const parsedHeaders = snapshot.parsedHeaders || [];
    const effectiveMapping = getEffectiveMapping(snapshot);
    const confidenceByHeader = getConfidenceByHeader(snapshot);
    const duplicates = collectDuplicateAssignments(effectiveMapping);
    const issueRows = getIssueRows(snapshot);

    const duplicateHeaderKeys = new Set();
    Object.keys(duplicates).forEach(function collectDuplicateHeaders(canonical) {
      duplicates[canonical].forEach(function addHeaderKey(headerKey) {
        duplicateHeaderKeys.add(headerKey);
      });
    });

    const issueHeaders = new Set(
      issueRows
        .map(function readIssueHeader(issue) {
          return normalizeText(issue.header);
        })
        .filter(Boolean)
    );

    parsedHeaders.forEach(function renderRow(header, index) {
      const headerKey = toHeaderKey(header, index);
      const row = document.createElement("tr");
      row.className = "importMappingRow";

      if (duplicateHeaderKeys.has(headerKey)) {
        row.classList.add("is-duplicate");
      }

      if (issueHeaders.has(header)) {
        row.classList.add("is-issue");
      }

      const sourceCell = document.createElement("td");
      sourceCell.className = "importMappingSource";
      sourceCell.textContent = header || `(column ${index + 1})`;

      const mappedCell = document.createElement("td");
      mappedCell.textContent = normalizeText(effectiveMapping[headerKey]) || "(unmapped)";

      const confidenceCell = document.createElement("td");
      confidenceCell.className = "importMappingConfidence";
      confidenceCell.textContent =
        formatConfidence(confidenceByHeader[header]) ||
        formatConfidence(confidenceByHeader[headerKey]);

      const overrideCell = document.createElement("td");
      const select = document.createElement("select");
      select.setAttribute("data-header-key", headerKey);

      const blankOption = document.createElement("option");
      blankOption.value = "";
      blankOption.textContent = "(unmapped)";
      select.appendChild(blankOption);

      canonicalFields.forEach(function appendOption(field) {
        const option = document.createElement("option");
        option.value = field;
        option.textContent = field;
        select.appendChild(option);
      });

      select.value = normalizeText(effectiveMapping[headerKey]);

      select.addEventListener("change", function onChange(event) {
        runtime.setOverrideMapping(headerKey, event.target.value);
      });

      overrideCell.appendChild(select);

      row.appendChild(sourceCell);
      row.appendChild(mappedCell);
      row.appendChild(confidenceCell);
      row.appendChild(overrideCell);

      tableBody.appendChild(row);
    });

    const duplicateCount = Object.keys(duplicates).length;
    const missingRequiredCount = countMissingRequiredMappings(effectiveMapping);
    const overrideCount = Object.keys(snapshot.overrideMappings || {}).length;

    summaryNode.textContent = [
      `Active preset: ${snapshot.selectedPreset || "canonical"}`,
      `Overrides: ${overrideCount}`,
      `Duplicate mappings: ${duplicateCount}`,
      `Missing required canonical mappings: ${missingRequiredCount}`
    ].join(" • ");

    issueRows.forEach(function appendIssue(issue) {
      const li = document.createElement("li");
      li.textContent = issue.header ? `${issue.message} (${issue.header})` : issue.message;
      issuesNode.appendChild(li);
    });

    Object.keys(duplicates).forEach(function appendDuplicateIssue(canonical) {
      const li = document.createElement("li");
      const involved = duplicates[canonical]
        .map(function resolveHeaderName(headerKey) {
          const foundIndex = parsedHeaders.findIndex(function findIndex(currentHeader, currentIndex) {
            return toHeaderKey(currentHeader, currentIndex) === headerKey;
          });
          return foundIndex >= 0 ? parsedHeaders[foundIndex] : headerKey;
        })
        .join(", ");
      li.textContent = `Duplicate assignment for ${canonical}: ${involved}`;
      issuesNode.appendChild(li);
    });

    if (clearBtn.dataset.mappingBound !== "true") {
      clearBtn.addEventListener("click", function onClear() {
        runtime.clearOverrideMappings();
      });
      clearBtn.dataset.mappingBound = "true";
    }
  }

  function init() {
    const runtime = getRuntime();
    if (!runtime) return;

    ensureStyles();
    ensureHost();
    runtime.subscribe(render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.ImportUIMapping = {
    init: init
  };
})();
