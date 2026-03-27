/*
  Additive runtime behavior for executive summary collapse/expand.
  Works alongside modular scripts loaded by index.html.
*/
(function executiveSummaryCollapseController() {
  const STORAGE_KEY = "execSummaryCollapsed";

  function getElements() {
    return {
      card: document.getElementById("mapExecutiveCallout"),
      toggleBtn: document.getElementById("executiveSummaryToggleBtn"),
      details: document.getElementById("mapExecutiveDetails")
    };
  }

  function applyExecutiveSummaryState(collapsed) {
    const { card, toggleBtn, details } = getElements();
    if (!card || !toggleBtn || !details) return;

    card.classList.toggle("exec-summary-collapsed", collapsed);
    card.classList.toggle("exec-summary-expanded", !collapsed);

    toggleBtn.setAttribute("aria-expanded", String(!collapsed));
    toggleBtn.setAttribute("aria-label", collapsed ? "Expand executive summary" : "Collapse executive summary");
    toggleBtn.textContent = collapsed ? "Expand" : "Collapse";

    details.setAttribute("aria-hidden", String(collapsed));

    try {
      sessionStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch (error) {
      // Session storage can fail in privacy-restricted modes; collapse state remains in-memory.
    }
  }

  function initialCollapsedState() {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved === "true") return true;
      if (saved === "false") return false;
    } catch (error) {
      // Ignore storage access failure and fall back to default collapsed state.
    }
    return true;
  }

  function bindExecutiveSummaryToggle() {
    const { card, toggleBtn } = getElements();
    if (!card || !toggleBtn || toggleBtn.dataset.execSummaryBound === "true") return;

    toggleBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const collapsed = card.classList.contains("exec-summary-collapsed");
      applyExecutiveSummaryState(!collapsed);
    });

    toggleBtn.dataset.execSummaryBound = "true";
  }

  function initExecutiveSummaryController() {
    bindExecutiveSummaryToggle();
    applyExecutiveSummaryState(initialCollapsedState());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initExecutiveSummaryController);
  } else {
    initExecutiveSummaryController();
  }
})();

/*
  Phase 11.3.b import UI shell wiring.
  Dry-run only. No live data mutation, no apply/commit, no backend writes.
*/
(function importUiShellController() {
  const shellState = {
    open: false,
    dragActive: false,
    file: null,
    parsedHeaders: [],
    parsedRows: [],
    mappingReport: null,
    headerReport: null,
    stageResult: null,
    diagnosticsSummary: null,
    statusLevel: "idle",
    statusMessage: "Awaiting file selection for staged validation preview."
  };

  function getIngestionApis() {
    return {
      mapper: window.ingestionMapper || null,
      validator: window.ingestionValidator || null,
      stage: window.ingestionStage || null,
      diagnostics: window.ingestionDiagnostics || null
    };
  }

  function injectImportShellStyles() {
    if (document.getElementById("importShellStyleTag")) return;

    const styleTag = document.createElement("style");
    styleTag.id = "importShellStyleTag";
    styleTag.textContent = `
      .importShellModal { z-index: 620; }
      .importShellContent { width: min(760px, 100%); }
      .importShellHeader { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
      .importShellHeader h3 { margin: 0; }
      .importShellCopy { margin:6px 0 0; font-size:13px; line-height:1.45; opacity:.86; }
      .importShellNote { margin-top:12px; font-size:12px; color:#b4c8dd; }
      .importShellPickerRow { margin-top:12px; display:grid; gap:6px; }
      .importShellLabel { font-size:11px; text-transform:uppercase; letter-spacing:.08em; opacity:.8; }
      .importShellDropZone { margin-top:12px; border:1px dashed rgba(159,209,255,.48); border-radius:12px; padding:14px; text-align:center; background:rgba(255,255,255,.03); cursor:pointer; }
      .importShellDropZone.is-dragover { border-color:rgba(159,209,255,.85); background:rgba(159,209,255,.08); }
      .importShellDropTitle { font-size:13px; font-weight:700; }
      .importShellDropSubtitle { margin-top:4px; font-size:12px; opacity:.78; }
      .importShellSection { margin-top:14px; }
      .importShellSection h4 { margin:0 0 8px; font-size:12px; text-transform:uppercase; letter-spacing:.08em; opacity:.85; }
      .importShellMeta, .importShellStatus, .importShellSummary { border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:10px; background:rgba(255,255,255,.03); font-size:12px; line-height:1.45; }
      .importShellStatus.ok { border-color: rgba(46,204,113,.45); }
      .importShellStatus.warn { border-color: rgba(255,153,0,.55); }
      .importShellStatus.error { border-color: rgba(255,107,107,.6); }
      .importShellSummaryList { margin:0; padding-left:16px; display:grid; gap:2px; }
      .importShellActions { margin-top:14px; display:flex; gap:8px; flex-wrap:wrap; }
      .importShellActions button { margin-top:0; }
      @media (max-width: 900px) {
        .importShellHeader, .importShellActions { flex-direction:column; }
      }
    `;

    document.head.appendChild(styleTag);
  }

  function ensureImportShellMarkup() {
    if (document.getElementById("openImportShellBtn")) return;

    const importLink = document.getElementById("importProjectLink");
    if (!importLink) return;

    const openBtn = document.createElement("button");
    openBtn.id = "openImportShellBtn";
    openBtn.type = "button";
    openBtn.className = "btnSecondary";
    openBtn.textContent = "Import Data Shell";
    importLink.insertAdjacentElement("afterend", openBtn);

    const modal = document.createElement("div");
    modal.id = "importShellModal";
    modal.className = "modal importShellModal hidden";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="modalContent importShellContent" role="dialog" aria-modal="true" aria-labelledby="importShellTitle">
        <div class="importShellHeader">
          <div>
            <h3 id="importShellTitle">Import Data Shell</h3>
            <p class="importShellCopy">Run a shell-local dry-run pipeline (mapping → validation → stage → diagnostics) without modifying live project data.</p>
          </div>
          <button id="importShellCloseBtn" class="btnSecondary" type="button" aria-label="Close import shell">Close</button>
        </div>

        <div class="importShellNote">Supported now: CSV dry-run in browser. XLSX parsing is not yet active in this phase.</div>

        <div class="importShellPickerRow">
          <label for="importShellFileInput" class="importShellLabel">Select file</label>
          <input id="importShellFileInput" type="file" accept=",text/csv,.csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
        </div>

        <div id="importShellDropZone" class="importShellDropZone" tabindex="0" role="button" aria-label="Drop import file here">
          <div class="importShellDropTitle">Drag and drop file here</div>
          <div class="importShellDropSubtitle">or use file picker above</div>
        </div>

        <section class="importShellSection">
          <h4>Selected File</h4>
          <div id="importShellFileMeta" class="importShellMeta">No file selected.</div>
        </section>

        <section class="importShellSection">
          <h4>Validation / Status</h4>
          <div id="importShellStatus" class="importShellStatus">Awaiting file selection for staged validation preview.</div>
        </section>

        <section class="importShellSection">
          <h4>Dry-Run Summary</h4>
          <div id="importShellDryRunSummary" class="importShellSummary">Dry-run summary will render here after CSV parsing and staging.</div>
        </section>

        <div class="importShellActions">
          <button id="importShellClearBtn" class="btnSecondary" type="button">Clear</button>
          <button id="importShellCancelBtn" class="btnSecondary" type="button">Cancel</button>
          <button id="importShellApplyBtn" class="btnComplete" type="button" disabled title="Apply is not enabled in this phase">Apply (Not Active)</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  function getShellElements() {
    return {
      openBtn: document.getElementById("openImportShellBtn"),
      modal: document.getElementById("importShellModal"),
      closeBtn: document.getElementById("importShellCloseBtn"),
      cancelBtn: document.getElementById("importShellCancelBtn"),
      clearBtn: document.getElementById("importShellClearBtn"),
      fileInput: document.getElementById("importShellFileInput"),
      dropZone: document.getElementById("importShellDropZone"),
      fileMeta: document.getElementById("importShellFileMeta"),
      status: document.getElementById("importShellStatus"),
      summary: document.getElementById("importShellDryRunSummary")
    };
  }

  function formatFileSize(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return "0 B";
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }

  function resetImportShellState() {
    const { fileInput } = getShellElements();

    shellState.file = null;
    shellState.parsedHeaders = [];
    shellState.parsedRows = [];
    shellState.mappingReport = null;
    shellState.headerReport = null;
    shellState.stageResult = null;
    shellState.diagnosticsSummary = null;
    shellState.dragActive = false;
    shellState.statusLevel = "idle";
    shellState.statusMessage = "Awaiting file selection for staged validation preview.";

    if (fileInput) {
      fileInput.value = "";
    }

    renderImportShellState();
  }

  function parseCsvText(csvText) {
    const text = String(csvText || "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let value = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') {
          value += '"';
          i += 1;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          value += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(value);
        value = "";
      } else if (char === '\n') {
        row.push(value);
        rows.push(row);
        row = [];
        value = "";
      } else if (char === '\r') {
        if (next === '\n') continue;
        row.push(value);
        rows.push(row);
        row = [];
        value = "";
      } else {
        value += char;
      }
    }

    row.push(value);
    if (row.length > 1 || String(row[0] || "").trim() !== "") {
      rows.push(row);
    }

    if (!rows.length) {
      return { headers: [], rows: [] };
    }

    const headers = rows[0].map((header) => String(header || "").trim());
    const dataRows = rows.slice(1).filter((r) => r.some((cell) => String(cell || "").trim() !== ""));

    return {
      headers,
      rows: dataRows
    };
  }

  function collectTopIssueCodes(diagnosticsSummary) {
    if (!diagnosticsSummary || !Array.isArray(diagnosticsSummary.topIssueCodes)) return [];
    return diagnosticsSummary.topIssueCodes.slice(0, 5);
  }

  function renderImportShellState() {
    const { modal, dropZone, fileMeta, status, summary } = getShellElements();
    if (!modal) return;

    modal.classList.toggle("hidden", !shellState.open);
    modal.setAttribute("aria-hidden", String(!shellState.open));

    if (dropZone) {
      dropZone.classList.toggle("is-dragover", shellState.dragActive);
    }

    if (fileMeta) {
  if (!shellState.file) {
    fileMeta.textContent = "No file selected.";
  } else {
    fileMeta.innerHTML = "";

    const modified = shellState.file.lastModified
      ? new Date(shellState.file.lastModified).toLocaleString()
      : "Unknown";

    const lines = [
      ["Name", shellState.file.name],
      ["Type", shellState.file.type || "Unknown"],
      ["Size", formatFileSize(shellState.file.size)],
      ["Headers", String(shellState.parsedHeaders.length)],
      ["Rows", String(shellState.parsedRows.length)],
      ["Last Modified", modified]
    ];

    lines.forEach(([label, value]) => {
      const row = document.createElement("div");

      const strong = document.createElement("strong");
      strong.textContent = `${label}: `;

      const span = document.createElement("span");
      span.textContent = value;

      row.appendChild(strong);
      row.appendChild(span);
      fileMeta.appendChild(row);
    });
  }
}

    if (status) {
      status.classList.remove("ok", "warn", "error");
      if (shellState.statusLevel === "ok") status.classList.add("ok");
      if (shellState.statusLevel === "warn") status.classList.add("warn");
      if (shellState.statusLevel === "error") status.classList.add("error");
      status.textContent = shellState.statusMessage;
    }

    if (summary) {
  const stageSummary = shellState.stageResult && shellState.stageResult.summary ? shellState.stageResult.summary : null;
  const diagnosticsSummary = shellState.diagnosticsSummary || null;

  if (!shellState.file) {
    summary.textContent = "Dry-run summary will render here after CSV parsing and staging.";
  } else if (!stageSummary) {
    summary.textContent = "No dry-run summary available for current file selection.";
  } else {
    summary.innerHTML = "";

    const list = document.createElement("ul");
    list.className = "importShellSummaryList";

    const items = [
      ["Preset Used", String(shellState.mappingReport?.presetUsed || "canonical")],
      ["Accepted Rows", String(stageSummary.acceptedRowCount)],
      ["Rejected Rows", String(stageSummary.rejectedRowCount)],
      ["Warnings", String(stageSummary.warningCount)],
      ["Errors", String(stageSummary.errorCount)],
      ["Missing Required Mappings", String(stageSummary.missingRequiredMappingCount)],
      ["Unmapped Headers", String(stageSummary.unmappedHeaderCount)]
    ];

    const topIssueCodes = collectTopIssueCodes(diagnosticsSummary);
    if (topIssueCodes.length) {
      items.push(["Top Issue Codes", topIssueCodes.join(", ")]);
    }

    items.forEach(([label, value]) => {
      const li = document.createElement("li");

      const strong = document.createElement("strong");
      strong.textContent = `${label}: `;

      const span = document.createElement("span");
      span.textContent = value;

      li.appendChild(strong);
      li.appendChild(span);
      list.appendChild(li);
    });

    summary.appendChild(list);
  }
}
  }

  function openImportShell() {
    shellState.open = true;
    renderImportShellState();
  }

  function closeImportShell() {
    shellState.open = false;
    shellState.dragActive = false;
    renderImportShellState();
  }

  function setStatus(level, message) {
    shellState.statusLevel = level;
    shellState.statusMessage = message;
  }

  function runDryRunPipeline(file, fileText) {
    const apis = getIngestionApis();

    if (!apis.mapper || !apis.validator || !apis.stage || !apis.diagnostics) {
      setStatus("error", "Ingestion modules are unavailable. Dry-run cannot execute in this session.");
      shellState.mappingReport = null;
      shellState.headerReport = null;
      shellState.stageResult = null;
      shellState.diagnosticsSummary = null;
      renderImportShellState();
      return;
    }

    const lowerName = String(file.name || "").toLowerCase();
    if (lowerName.endsWith(".xlsx") || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
      shellState.parsedHeaders = [];
      shellState.parsedRows = [];
      shellState.mappingReport = null;
      shellState.headerReport = null;
      shellState.stageResult = null;
      shellState.diagnosticsSummary = null;
      setStatus("warn", "XLSX parsing is not active in Phase 11.3.b yet. Please use CSV for dry-run preview.");
      renderImportShellState();
      return;
    }

    if (!lowerName.endsWith(".csv") && file.type && file.type !== "text/csv" && file.type !== "application/csv") {
      setStatus("error", "Unsupported file type. Use CSV for Phase 11.3.b dry-run.");
      shellState.parsedHeaders = [];
      shellState.parsedRows = [];
      shellState.mappingReport = null;
      shellState.headerReport = null;
      shellState.stageResult = null;
      shellState.diagnosticsSummary = null;
      renderImportShellState();
      return;
    }

    let parsed;
    try {
      parsed = parseCsvText(fileText);
    } catch (error) {
      console.error(error);
      setStatus("error", "CSV parse failed. Please verify the file format and try again.");
      shellState.parsedHeaders = [];
      shellState.parsedRows = [];
      shellState.mappingReport = null;
      shellState.headerReport = null;
      shellState.stageResult = null;
      shellState.diagnosticsSummary = null;
      renderImportShellState();
      return;
    }

    if (!parsed.headers.length) {
      setStatus("error", "CSV appears empty or missing a header row.");
      shellState.parsedHeaders = [];
      shellState.parsedRows = [];
      shellState.mappingReport = null;
      shellState.headerReport = null;
      shellState.stageResult = null;
      shellState.diagnosticsSummary = null;
      renderImportShellState();
      return;
    }

    shellState.parsedHeaders = parsed.headers.slice();
    shellState.parsedRows = parsed.rows.slice();

    try {
      const mappingReport = apis.mapper.buildHeaderMappingReport(parsed.headers, { presetId: "canonical" });
      const headerReport = apis.validator.validateHeaders(parsed.headers);
      const stageResult = apis.stage.stageImportBatch({
        sourceHeaders: parsed.headers,
        rawRows: parsed.rows,
        sourceFilename: file.name,
        presetId: "canonical"
      });
      const diagnosticsSummary = apis.diagnostics.buildDryRunIntegritySummary(stageResult);

      shellState.mappingReport = mappingReport;
      shellState.headerReport = headerReport;
      shellState.stageResult = stageResult;
      shellState.diagnosticsSummary = diagnosticsSummary;

      if (stageResult.canProceed === true && stageResult.isValid === true) {
        setStatus("ok", "Dry-run completed successfully. Results are shell-local only and were not applied.");
      } else if ((stageResult.summary?.errorCount || 0) > 0 || (stageResult.summary?.rejectedRowCount || 0) > 0) {
        setStatus("error", "Dry-run blocked by validation errors. Review summary details below.");
      } else {
        setStatus("warn", "Dry-run completed with warnings. No live project data was modified.");
      }
    } catch (error) {
      console.error(error);
      shellState.mappingReport = null;
      shellState.headerReport = null;
      shellState.stageResult = null;
      shellState.diagnosticsSummary = null;
      setStatus("error", "Dry-run pipeline failed safely. No project data was changed.");
    }

    renderImportShellState();
  }

  function handleSelectedFile(file) {
    if (!file) {
      setStatus("warn", "No file selected.");
      renderImportShellState();
      return;
    }

    shellState.file = file;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      runDryRunPipeline(file, result);
    };
    reader.onerror = () => {
      setStatus("error", "Unable to read file in browser. Please retry.");
      shellState.parsedHeaders = [];
      shellState.parsedRows = [];
      shellState.mappingReport = null;
      shellState.headerReport = null;
      shellState.stageResult = null;
      shellState.diagnosticsSummary = null;
      renderImportShellState();
    };
    reader.readAsText(file);

    renderImportShellState();
  }

  function bindImportShellUI() {
    ensureImportShellMarkup();

    const {
      openBtn,
      modal,
      closeBtn,
      cancelBtn,
      clearBtn,
      fileInput,
      dropZone
    } = getShellElements();

    if (!openBtn || !modal || !closeBtn || !cancelBtn || !clearBtn || !fileInput || !dropZone) return;
    if (modal.dataset.boundImportShell === "true") return;

    openBtn.addEventListener("click", (event) => {
      event.preventDefault();
      openImportShell();
    });

    closeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      closeImportShell();
    });

    cancelBtn.addEventListener("click", (event) => {
      event.preventDefault();
      closeImportShell();
    });

    clearBtn.addEventListener("click", (event) => {
      event.preventDefault();
      resetImportShellState();
    });

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeImportShell();
      }
    });

    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files.length ? fileInput.files[0] : null;
      handleSelectedFile(file);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        shellState.dragActive = true;
        renderImportShellState();
      });
    });

    ["dragleave", "dragend"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        shellState.dragActive = false;
        renderImportShellState();
      });
    });

    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      shellState.dragActive = false;

      const files = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files : null;
      const file = files && files.length ? files[0] : null;
      handleSelectedFile(file);
    });

    dropZone.addEventListener("click", () => {
      fileInput.click();
    });

    dropZone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        fileInput.click();
      }
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && shellState.open) {
        closeImportShell();
      }
    });

    modal.dataset.boundImportShell = "true";
    renderImportShellState();
  }

  window.openImportShell = openImportShell;
  window.closeImportShell = closeImportShell;
  window.resetImportShellState = resetImportShellState;
  window.bindImportShellUI = bindImportShellUI;
  window.renderImportShellState = renderImportShellState;

  function initImportShell() {
    injectImportShellStyles();
    bindImportShellUI();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initImportShell);
  } else {
    initImportShell();
  }
})();