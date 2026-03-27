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
    if (!card || !toggleBtn || toggleBtn.dataset.bound === "true") return;

    toggleBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const collapsed = card.classList.contains("exec-summary-collapsed");
      applyExecutiveSummaryState(!collapsed);
    });

    toggleBtn.dataset.bound = "true";
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
  Phase 11.3.a additive import UI shell.
  Shell-local only: no live project mutation, no apply/commit, no ingestion auto-run.
*/
(function importUiShellController() {
  const state = {
    open: false,
    file: null,
    dragActive: false
  };

  function injectImportShellStyles() {
    if (document.getElementById("importShellStyleTag")) return;

    const styleTag = document.createElement("style");
    styleTag.id = "importShellStyleTag";
    styleTag.textContent = `
      .importShellModal {
        z-index: 620;
      }
      .importShellContent {
        width: min(720px, 100%);
      }
      .importShellHeader {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }
      .importShellHeader h3 {
        margin: 0;
      }
      .importShellCopy {
        margin: 6px 0 0;
        font-size: 13px;
        line-height: 1.45;
        opacity: 0.86;
      }
      .importShellNote {
        margin-top: 12px;
        font-size: 12px;
        color: #b4c8dd;
      }
      .importShellPickerRow {
        margin-top: 12px;
        display: grid;
        gap: 6px;
      }
      .importShellLabel {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: .08em;
        opacity: .8;
      }
      .importShellDropZone {
        margin-top: 12px;
        border: 1px dashed rgba(159, 209, 255, .48);
        border-radius: 12px;
        padding: 14px;
        text-align: center;
        background: rgba(255,255,255,.03);
        cursor: pointer;
      }
      .importShellDropZone.is-dragover {
        border-color: rgba(159, 209, 255, .85);
        background: rgba(159, 209, 255, .08);
      }
      .importShellDropTitle {
        font-size: 13px;
        font-weight: 700;
      }
      .importShellDropSubtitle {
        margin-top: 4px;
        font-size: 12px;
        opacity: .78;
      }
      .importShellSection {
        margin-top: 14px;
      }
      .importShellSection h4 {
        margin: 0 0 8px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: .08em;
        opacity: .85;
      }
      .importShellMeta,
      .importShellStatus,
      .importShellSummary {
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 10px;
        padding: 10px;
        background: rgba(255,255,255,.03);
        font-size: 12px;
        line-height: 1.45;
      }
      .importShellActions {
        margin-top: 14px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .importShellActions button {
        margin-top: 0;
      }
      @media (max-width: 900px) {
        .importShellHeader,
        .importShellActions {
          flex-direction: column;
        }
      }
    `;

    document.head.appendChild(styleTag);
  }

  function ensureImportShellMarkup() {
    if (document.getElementById("openImportShellBtn")) return;

    const importLink = document.getElementById("importProjectLink");
    if (!importLink || !importLink.parentElement) return;

    const openBtn = document.createElement("button");
    openBtn.id = "openImportShellBtn";
    openBtn.type = "button";
    openBtn.className = "btnSecondary";
    openBtn.textContent = "Import Data Shell";
    importLink.insertAdjacentElement("afterend", openBtn);

    if (document.getElementById("importShellModal")) return;

    const modal = document.createElement("div");
    modal.id = "importShellModal";
    modal.className = "modal importShellModal hidden";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="modalContent importShellContent" role="dialog" aria-modal="true" aria-labelledby="importShellTitle">
        <div class="importShellHeader">
          <div>
            <h3 id="importShellTitle">Import Data Shell</h3>
            <p class="importShellCopy">Prepare staged CSV/XLSX dry-run imports without touching live project data.</p>
          </div>
          <button id="importShellCloseBtn" class="btnSecondary" type="button" aria-label="Close import shell">Close</button>
        </div>

        <div class="importShellNote">Supported file types: .csv, .xlsx (dry-run only in this phase).</div>

        <div class="importShellPickerRow">
          <label for="importShellFileInput" class="importShellLabel">Select file</label>
          <input id="importShellFileInput" type="file" accept=",text/csv,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx" />
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
          <h4>Validation Status</h4>
          <div id="importShellStatus" class="importShellStatus">Awaiting file selection for staged validation preview.</div>
        </section>

        <section class="importShellSection">
          <h4>Dry-Run Summary Placeholder</h4>
          <div id="importShellDryRunSummary" class="importShellSummary">Dry-run summary will render here in a future phase.</div>
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
      dryRunSummary: document.getElementById("importShellDryRunSummary")
    };
  }

  function formatFileSize(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return "0 B";
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }

  function renderImportShellState() {
    const { modal, dropZone, fileMeta, status, dryRunSummary } = getShellElements();
    if (!modal) return;

    modal.classList.toggle("hidden", !state.open);
    modal.setAttribute("aria-hidden", String(!state.open));

    if (dropZone) {
      dropZone.classList.toggle("is-dragover", state.dragActive);
    }

    if (fileMeta) {
      if (!state.file) {
        fileMeta.textContent = "No file selected.";
      } else {
        const modifiedAt = state.file.lastModified
          ? new Date(state.file.lastModified).toLocaleString()
          : "Unknown";
        fileMeta.innerHTML = [
          `<strong>Name:</strong> ${state.file.name}`,
          `<strong>Type:</strong> ${state.file.type || "Unknown"}`,
          `<strong>Size:</strong> ${formatFileSize(state.file.size)}`,
          `<strong>Last Modified:</strong> ${modifiedAt}`
        ].join("<br>");
      }
    }

    if (status) {
      status.textContent = state.file
        ? "File captured in shell-local state. No validation, staging, or apply has been run."
        : "Awaiting file selection for staged validation preview.";
    }

    if (dryRunSummary) {
      dryRunSummary.textContent = state.file
        ? "Dry-run summary placeholder ready. Apply/Commit remains inactive in this phase."
        : "Dry-run summary will render here in a future phase.";
    }
  }

  function openImportShell() {
    state.open = true;
    renderImportShellState();
  }

  function closeImportShell() {
    state.open = false;
    state.dragActive = false;
    renderImportShellState();
  }

  function resetImportShellState() {
    const { fileInput } = getShellElements();
    state.file = null;
    state.dragActive = false;

    if (fileInput) {
      fileInput.value = "";
    }

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
      state.file = file;
      state.dragActive = false;
      renderImportShellState();
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        state.dragActive = true;
        renderImportShellState();
      });
    });

    ["dragleave", "dragend"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        state.dragActive = false;
        renderImportShellState();
      });
    });

    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.dragActive = false;
      const files = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files : null;
      state.file = files && files.length ? files[0] : null;
      renderImportShellState();
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
      if (event.key === "Escape" && state.open) {
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