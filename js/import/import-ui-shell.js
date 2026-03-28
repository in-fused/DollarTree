(function importUiShellModule() {
  const STYLE_ID = "import-ui-shell-styles";
  const OPEN_BTN_ID = "openImportShellBtn";
  const MODAL_ID = "importShellModal";
  const FILE_INPUT_ID = "importShellFileInput";
  const FILE_META_ID = "importShellFileMeta";
  const STATUS_ID = "importShellStatus";
  const CLOSE_BTN_ID = "importShellCloseBtn";
  const CANCEL_BTN_ID = "importShellCancelBtn";
  const CLEAR_BTN_ID = "importShellClearBtn";
  const DROP_ZONE_ID = "importShellDropZone";

  function getRuntime() {
    return window.ImportRuntime || null;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .importShellModal {
        position: fixed;
        inset: 0;
        z-index: 620;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(4, 10, 18, 0.66);
        backdrop-filter: blur(8px);
      }

      .importShellModal.is-open {
        display: flex;
      }

      .importShellContent {
        width: min(720px, 100%);
        max-height: min(88vh, 920px);
        overflow: auto;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.08);
        background:
          linear-gradient(180deg, rgba(10,18,34,0.98), rgba(8,14,28,0.98));
        box-shadow:
          0 22px 50px rgba(0,0,0,0.42),
          inset 0 0 0 1px rgba(255,255,255,0.02);
        padding: 18px;
        color: #f5f7fb;
      }

      .importShellHeader {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .importShellTitleWrap h3 {
        margin: 0;
        font-size: 20px;
        line-height: 1.2;
      }

      .importShellCopy {
        margin: 6px 0 0;
        font-size: 13px;
        line-height: 1.45;
        color: rgba(228,234,244,0.82);
      }

      .importShellNote {
        margin-top: 12px;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
        font-size: 12px;
        color: rgba(220,228,240,0.84);
      }

      .importShellSection {
        margin-top: 14px;
      }

      .importShellSectionLabel {
        margin: 0 0 8px;
        font-size: 11px;
        line-height: 1.2;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(195,210,232,0.82);
      }

      .importShellFileInput {
        width: 100%;
      }

      .importShellDropZone {
        margin-top: 10px;
        border: 1px dashed rgba(148, 198, 255, 0.48);
        border-radius: 14px;
        padding: 18px 14px;
        background: rgba(255,255,255,0.03);
        text-align: center;
        cursor: pointer;
        transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
      }

      .importShellDropZone.is-dragover {
        border-color: rgba(148, 198, 255, 0.88);
        background: rgba(148, 198, 255, 0.08);
        transform: translateY(-1px);
      }

      .importShellDropTitle {
        font-size: 14px;
        font-weight: 700;
      }

      .importShellDropSubtitle {
        margin-top: 4px;
        font-size: 12px;
        color: rgba(220,228,240,0.78);
      }

      .importShellCard {
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        background: rgba(255,255,255,0.03);
        padding: 12px;
        font-size: 12px;
        line-height: 1.5;
      }

      .importShellStatus {
        border-left: 3px solid rgba(255,255,255,0.14);
      }

      .importShellStatus.status-ok {
        border-left-color: rgba(74, 222, 128, 0.9);
      }

      .importShellStatus.status-warn {
        border-left-color: rgba(251, 191, 36, 0.9);
      }

      .importShellStatus.status-error {
        border-left-color: rgba(248, 113, 113, 0.92);
      }

      .importShellActions {
        margin-top: 16px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .importShellActions button,
      .importShellHeader button,
      #${OPEN_BTN_ID} {
        appearance: none;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        background: rgba(255,255,255,0.05);
        color: #f5f7fb;
        font: inherit;
        padding: 10px 12px;
        cursor: pointer;
      }

      .importShellActions button:hover,
      .importShellHeader button:hover,
      #${OPEN_BTN_ID}:hover {
        background: rgba(255,255,255,0.08);
      }

      #${OPEN_BTN_ID} {
        margin-top: 8px;
      }

      .importShellMetaRow {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .importShellMetaKey {
        font-weight: 700;
      }

      @media (max-width: 900px) {
        .importShellModal {
          padding: 10px;
          align-items: flex-end;
        }

        .importShellContent {
          width: 100%;
          max-height: 92vh;
          border-radius: 18px 18px 0 0;
          padding: 16px;
        }

        .importShellHeader,
        .importShellActions {
          flex-direction: column;
        }

        .importShellActions button,
        .importShellHeader button {
          width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function buildMetaRows(container, rows) {
    container.innerHTML = "";

    rows.forEach((row) => {
      const line = document.createElement("div");
      line.className = "importShellMetaRow";

      const key = document.createElement("span");
      key.className = "importShellMetaKey";
      key.textContent = `${row.key}:`;

      const value = document.createElement("span");
      value.textContent = row.value;

      line.appendChild(key);
      line.appendChild(value);
      container.appendChild(line);
    });
  }

  function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return "0 B";
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }

  function ensureOpenButton() {
    let openBtn = document.getElementById(OPEN_BTN_ID);
    if (openBtn) return openBtn;

    const anchor =
      document.getElementById("importProjectLink") ||
      document.querySelector("[data-import-project-link]") ||
      document.querySelector(".importProjectLink");

    if (!anchor || !anchor.parentElement) return null;

    openBtn = document.createElement("button");
    openBtn.id = OPEN_BTN_ID;
    openBtn.type = "button";
    openBtn.textContent = "Import Data Shell";
    anchor.insertAdjacentElement("afterend", openBtn);

    return openBtn;
  }

  function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "importShellModal";
    modal.setAttribute("aria-hidden", "true");

    const content = document.createElement("div");
    content.className = "importShellContent";
    content.setAttribute("role", "dialog");
    content.setAttribute("aria-modal", "true");
    content.setAttribute("aria-labelledby", "importShellTitle");

    const header = document.createElement("div");
    header.className = "importShellHeader";

    const titleWrap = document.createElement("div");
    titleWrap.className = "importShellTitleWrap";

    const title = document.createElement("h3");
    title.id = "importShellTitle";
    title.textContent = "Import Data Shell";

    const copy = document.createElement("p");
    copy.className = "importShellCopy";
    copy.textContent = "Shell-local dry-run only. No live project mutation, no apply path, no backend writes.";

    titleWrap.appendChild(title);
    titleWrap.appendChild(copy);

    const closeBtn = document.createElement("button");
    closeBtn.id = CLOSE_BTN_ID;
    closeBtn.type = "button";
    closeBtn.textContent = "Close";

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    const note = document.createElement("div");
    note.className = "importShellNote";
    note.textContent = "CSV dry-run is supported here. This shell is isolated and does not replace active production data.";

    const fileSection = document.createElement("section");
    fileSection.className = "importShellSection";

    const fileLabel = document.createElement("div");
    fileLabel.className = "importShellSectionLabel";
    fileLabel.textContent = "Select File";

    const input = document.createElement("input");
    input.id = FILE_INPUT_ID;
    input.className = "importShellFileInput";
    input.type = "file";
    input.accept = ".csv,text/csv";

    const dropZone = document.createElement("div");
    dropZone.id = DROP_ZONE_ID;
    dropZone.className = "importShellDropZone";
    dropZone.tabIndex = 0;
    dropZone.setAttribute("role", "button");
    dropZone.setAttribute("aria-label", "Drop import CSV here");

    const dropTitle = document.createElement("div");
    dropTitle.className = "importShellDropTitle";
    dropTitle.textContent = "Drag and drop CSV here";

    const dropSubtitle = document.createElement("div");
    dropSubtitle.className = "importShellDropSubtitle";
    dropSubtitle.textContent = "or tap to choose a file";

    dropZone.appendChild(dropTitle);
    dropZone.appendChild(dropSubtitle);

    fileSection.appendChild(fileLabel);
    fileSection.appendChild(input);
    fileSection.appendChild(dropZone);

    const metaSection = document.createElement("section");
    metaSection.className = "importShellSection";

    const metaLabel = document.createElement("div");
    metaLabel.className = "importShellSectionLabel";
    metaLabel.textContent = "Selected File";

    const metaCard = document.createElement("div");
    metaCard.id = FILE_META_ID;
    metaCard.className = "importShellCard";
    metaCard.textContent = "No file selected.";

    metaSection.appendChild(metaLabel);
    metaSection.appendChild(metaCard);

    const statusSection = document.createElement("section");
    statusSection.className = "importShellSection";

    const statusLabel = document.createElement("div");
    statusLabel.className = "importShellSectionLabel";
    statusLabel.textContent = "Status";

    const statusCard = document.createElement("div");
    statusCard.id = STATUS_ID;
    statusCard.className = "importShellCard importShellStatus";
    statusCard.textContent = "Awaiting file selection for staged validation preview.";

    statusSection.appendChild(statusLabel);
    statusSection.appendChild(statusCard);

    const actions = document.createElement("div");
    actions.className = "importShellActions";

    const clearBtn = document.createElement("button");
    clearBtn.id = CLEAR_BTN_ID;
    clearBtn.type = "button";
    clearBtn.textContent = "Clear";

    const cancelBtn = document.createElement("button");
    cancelBtn.id = CANCEL_BTN_ID;
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";

    actions.appendChild(clearBtn);
    actions.appendChild(cancelBtn);

    content.appendChild(header);
    content.appendChild(note);
    content.appendChild(fileSection);
    content.appendChild(metaSection);
    content.appendChild(statusSection);
    content.appendChild(actions);

    modal.appendChild(content);
    document.body.appendChild(modal);

    return modal;
  }

  function getElements() {
    return {
      openBtn: document.getElementById(OPEN_BTN_ID),
      modal: document.getElementById(MODAL_ID),
      fileInput: document.getElementById(FILE_INPUT_ID),
      fileMeta: document.getElementById(FILE_META_ID),
      status: document.getElementById(STATUS_ID),
      closeBtn: document.getElementById(CLOSE_BTN_ID),
      cancelBtn: document.getElementById(CANCEL_BTN_ID),
      clearBtn: document.getElementById(CLEAR_BTN_ID),
      dropZone: document.getElementById(DROP_ZONE_ID)
    };
  }

  function readSelectedFile(file) {
    const runtime = getRuntime();
    if (!runtime || !file) return;

    const reader = new FileReader();
    reader.onload = function onLoad() {
      runtime.selectFile({
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        text: typeof reader.result === "string" ? reader.result : ""
      });
    };
    reader.onerror = function onError() {
      console.error("Unable to read import file.");
    };
    reader.readAsText(file);
  }

  function render(state) {
    const { modal, fileMeta, status, dropZone } = getElements();
    if (!modal || !fileMeta || !status || !dropZone) return;

    modal.classList.toggle("is-open", Boolean(state.isOpen));
    modal.setAttribute("aria-hidden", String(!state.isOpen));
    dropZone.classList.toggle("is-dragover", Boolean(state.dragActive));

    if (!state.file) {
      fileMeta.textContent = "No file selected.";
    } else {
      const modified = state.file.lastModified
        ? new Date(state.file.lastModified).toLocaleString()
        : "Unknown";

      buildMetaRows(fileMeta, [
        { key: "Name", value: state.file.name || "Unknown" },
        { key: "Type", value: state.file.type || "text/csv" },
        { key: "Size", value: formatBytes(state.file.size || 0) },
        { key: "Headers", value: String((state.parsedHeaders || []).length) },
        { key: "Rows", value: String((state.parsedRows || []).length) },
        { key: "Last Modified", value: modified }
      ]);
    }

    status.classList.remove("status-ok", "status-warn", "status-error");

    if (state.statusLevel === "ok") status.classList.add("status-ok");
    if (state.statusLevel === "warn") status.classList.add("status-warn");
    if (state.statusLevel === "error") status.classList.add("status-error");

    status.textContent = state.statusMessage || "Awaiting file selection for staged validation preview.";
  }

  function bindEvents() {
    const runtime = getRuntime();
    const elements = getElements();

    if (!runtime) return;
    if (!elements.openBtn || !elements.modal || !elements.fileInput || !elements.dropZone) return;
    if (elements.modal.dataset.importShellBound === "true") return;

    elements.openBtn.addEventListener("click", function onOpen() {
      runtime.openShell();
    });

    elements.closeBtn.addEventListener("click", function onClose() {
      runtime.closeShell();
    });

    elements.cancelBtn.addEventListener("click", function onCancel() {
      runtime.closeShell();
    });

    elements.clearBtn.addEventListener("click", function onClear() {
      runtime.resetAll();
      elements.fileInput.value = "";
    });

    elements.modal.addEventListener("click", function onBackdrop(event) {
      if (event.target === elements.modal) {
        runtime.closeShell();
      }
    });

    elements.fileInput.addEventListener("change", function onFileChange() {
      const file = elements.fileInput.files && elements.fileInput.files[0];
      if (file) readSelectedFile(file);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      elements.dropZone.addEventListener(eventName, function onDrag(event) {
        event.preventDefault();
        event.stopPropagation();
        runtime.setDragActive(true);
      });
    });

    ["dragleave", "dragend"].forEach((eventName) => {
      elements.dropZone.addEventListener(eventName, function onLeave(event) {
        event.preventDefault();
        event.stopPropagation();
        runtime.setDragActive(false);
      });
    });

    elements.dropZone.addEventListener("drop", function onDrop(event) {
      event.preventDefault();
      event.stopPropagation();
      runtime.setDragActive(false);

      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) {
        elements.fileInput.value = "";
        readSelectedFile(file);
      }
    });

    elements.dropZone.addEventListener("click", function onDropZoneClick() {
      elements.fileInput.click();
    });

    elements.dropZone.addEventListener("keydown", function onDropZoneKeydown(event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        elements.fileInput.click();
      }
    });

    window.addEventListener("keydown", function onEscape(event) {
      if (event.key === "Escape") {
        const snapshot = runtime.getState();
        if (snapshot && snapshot.isOpen) {
          runtime.closeShell();
        }
      }
    });

    elements.modal.dataset.importShellBound = "true";
    runtime.subscribe(render);
  }

  function init() {
    if (!getRuntime()) return;
    ensureStyles();
    ensureOpenButton();
    ensureModal();
    bindEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.ImportUIShell = {
    init: init
  };
})();