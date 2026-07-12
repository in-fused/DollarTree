(function importUiShellModule() {
  const STYLE_ID = "import-ui-shell-styles";
  const OPEN_BTN_ID = "importProjectLink";
  const MODAL_ID = "importShellModal";
  const FILE_INPUT_ID = "importShellFileInput";
  const FILE_META_ID = "importShellFileMeta";
  const STATUS_ID = "importShellStatus";
  const PRESET_SELECT_ID = "importShellPresetSelect";
  const PRESET_STATUS_ID = "importShellPresetStatus";
  const CLOSE_BTN_ID = "importShellCloseBtn";
  const CANCEL_BTN_ID = "importShellCancelBtn";
  const CLEAR_BTN_ID = "importShellClearBtn";
  const DROP_ZONE_ID = "importShellDropZone";
  const APPLY_BTN_ID = "importShellApplyBtn";
  const APPLY_SECTION_ID = "importShellApplySection";
  const APPLY_CONFIRM_ID = "importShellApplyConfirm";
  const APPLY_PROGRESS_ID = "importShellApplyProgress";
  const APPLY_RESULT_ID = "importShellApplyResult";
  const APPLY_CONFIRM_BTN_ID = "importShellConfirmApplyBtn";
  const APPLY_BACK_BTN_ID = "importShellApplyBackBtn";
  const TARGET_CREATE_ID = "importShellTargetCreate";
  const TARGET_MERGE_ID = "importShellTargetMerge";
  const TARGET_FIELDS_ID = "importShellCreateProjectFields";
  const TARGET_SUMMARY_ID = "importShellTargetSummary";
  const TARGET_CURRENT_DETAIL_ID = "importShellCurrentProjectDetail";
  const NEW_PROJECT_NAME_ID = "importShellNewProjectName";
  const NEW_PROJECT_ID_ID = "importShellNewProjectId";
  const APPLY_CONFIRM_TEXT_ID = "importShellApplyConfirmText";
  const OPEN_INTENT_KEY = "dt:openImportShell";

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

      .importShellFileInput,
      .importShellPresetSelect,
      .importShellTextInput {
        width: 100%;
      }

      .importShellPresetSelect,
      .importShellTextInput {
        background: rgba(255,255,255,0.06);
        color: #f5f7fb;
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 12px;
        padding: 10px 12px;
        font: inherit;
      }

      .importShellTextInput::placeholder {
        color: rgba(220,228,240,0.48);
      }

      .importShellPresetStatus {
        margin-top: 6px;
        font-size: 11px;
        color: rgba(220,228,240,0.78);
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

      .importShellTargetGrid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .importShellTargetOption {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        min-width: 0;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        background: rgba(255,255,255,0.03);
        padding: 10px;
        cursor: pointer;
      }

      .importShellTargetOption input {
        margin-top: 3px;
      }

      .importShellTargetTitle {
        display: block;
        font-size: 12px;
        font-weight: 800;
        color: #f5f7fb;
      }

      .importShellTargetDetail {
        display: block;
        margin-top: 3px;
        font-size: 11px;
        line-height: 1.35;
        color: rgba(220,228,240,0.76);
      }

      .importShellFieldGrid {
        margin-top: 10px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .importShellFieldGrid.is-hidden {
        display: none;
      }

      .importShellFieldLabel {
        display: grid;
        gap: 5px;
        min-width: 0;
        font-size: 11px;
        font-weight: 700;
        color: rgba(220,228,240,0.82);
      }

      .importShellTargetSummary {
        margin-top: 8px;
        font-size: 12px;
        line-height: 1.45;
        color: rgba(220,228,240,0.82);
      }

      .importShellTargetSummary.is-error {
        color: #ffd7d7;
      }

      .importShellConfirmInputWrap {
        margin-top: 12px;
      }

      .importShellConfirmInputHelp {
        margin: 0 0 6px;
        font-size: 12px;
        line-height: 1.4;
        color: #fff0c4;
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

      .importShellActions button.is-hidden {
        display: none;
      }

      .importShellApplySection {
        display: none;
        margin-top: 14px;
      }

      .importShellApplySection.is-visible {
        display: block;
      }

      .importShellApplyBlock + .importShellApplyBlock {
        margin-top: 10px;
      }

      .importShellApplyWarning {
        margin: 0 0 10px;
        color: #fff0c4;
        font-weight: 700;
      }

      .importShellApplyList {
        margin: 8px 0 0;
        padding-left: 18px;
        display: grid;
        gap: 4px;
      }

      .importShellApplyConfirmActions {
        margin-top: 12px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .importShellApplyResultList {
        margin: 0;
        padding-left: 18px;
        display: grid;
        gap: 4px;
      }

      .importShellProgressMetrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 10px;
      }

      .importShellProgressMetric {
        min-width: 0;
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 8px;
        padding: 8px;
        background: rgba(255,255,255,0.025);
      }

      .importShellProgressMetricKey {
        display: block;
        font-size: 10px;
        line-height: 1.2;
        color: rgba(220,228,240,0.68);
      }

      .importShellProgressMetricValue {
        display: block;
        margin-top: 2px;
        font-size: 14px;
        line-height: 1.2;
        font-weight: 800;
        color: #f5f7fb;
      }

      .importShellProgressFeed {
        max-height: 210px;
        overflow: auto;
        border-top: 1px solid rgba(255,255,255,0.08);
        padding-top: 8px;
      }

      .importShellProgressFeedList {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 5px;
      }

      .importShellProgressEntry {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 8px;
        align-items: baseline;
        color: rgba(235,240,248,0.88);
      }

      .importShellProgressTime {
        font-size: 10px;
        color: rgba(220,228,240,0.56);
        white-space: nowrap;
      }

      .importShellProgressMessage {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .importShellProgressEntry.level-warn .importShellProgressMessage {
        color: #fff0c4;
      }

      .importShellProgressEntry.level-error .importShellProgressMessage {
        color: #ffd7d7;
      }

      .importShellActions button,
      .importShellApplyConfirmActions button,
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
      .importShellApplyConfirmActions button:hover,
      .importShellHeader button:hover,
      #${OPEN_BTN_ID}:hover {
        background: rgba(255,255,255,0.08);
      }

      .importShellActions button:disabled,
      .importShellApplyConfirmActions button:disabled {
        opacity: 0.56;
        cursor: not-allowed;
      }

      #${OPEN_BTN_ID} {
        margin-top: 8px;
        text-decoration: none;
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

        .importShellTargetGrid,
        .importShellFieldGrid,
        .importShellProgressMetrics {
          grid-template-columns: 1fr;
        }

        .importShellActions button,
        .importShellApplyConfirmActions button,
        .importShellHeader button {
          width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function buildMetaRows(container, rows) {
    container.innerHTML = "";

    rows.forEach(function appendRow(row) {
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

  function clearChildren(node) {
    while (node && node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function getAcceptedRowCount(snapshot) {
    const stageResult = snapshot && snapshot.stageResult;
    const acceptedRecords = stageResult && Array.isArray(stageResult.acceptedRecords)
      ? stageResult.acceptedRecords
      : [];
    return acceptedRecords.length;
  }

  function isCreateNewProjectTarget(snapshot) {
    return String(snapshot && snapshot.applyTarget && snapshot.applyTarget.mode || "") === "create_new_project";
  }

  function getTargetModeLabel(snapshot) {
    return isCreateNewProjectTarget(snapshot) ? "Create new project" : "Merge into current project";
  }

  function getTargetValidation(snapshot) {
    const target = snapshot && snapshot.applyTarget;
    const validation = target && target.validation;
    return validation && typeof validation === "object"
      ? validation
      : { valid: true, reason: "" };
  }

  function setInputValue(input, value) {
    if (!input) return;
    const nextValue = String(value || "");
    if (document.activeElement === input) return;
    if (input.value !== nextValue) input.value = nextValue;
  }

  function appendApplyList(container, rows) {
    const list = document.createElement("ul");
    list.className = "importShellApplyList";

    rows.forEach(function appendRow(row) {
      const item = document.createElement("li");
      const strong = document.createElement("strong");
      strong.textContent = `${row.key}: `;
      const value = document.createElement("span");
      value.textContent = row.value;
      item.appendChild(strong);
      item.appendChild(value);
      list.appendChild(item);
    });

    container.appendChild(list);
  }

  function renderTargetUi(snapshot, elements) {
    const target = snapshot && snapshot.applyTarget ? snapshot.applyTarget : {};
    const validation = getTargetValidation(snapshot);
    const isCreate = isCreateNewProjectTarget(snapshot);
    const isApplying = Boolean(snapshot && snapshot.applyInProgress);

    if (elements.targetCreateRadio) {
      elements.targetCreateRadio.checked = isCreate;
      elements.targetCreateRadio.disabled = isApplying || target.canCreateProject !== true;
    }

    if (elements.targetMergeRadio) {
      elements.targetMergeRadio.checked = !isCreate;
      elements.targetMergeRadio.disabled = isApplying || target.canMergeCurrentProject !== true;
    }

    if (elements.targetFields) {
      elements.targetFields.classList.toggle("is-hidden", !isCreate);
    }

    if (elements.newProjectNameInput) {
      elements.newProjectNameInput.disabled = isApplying || !isCreate;
      setInputValue(elements.newProjectNameInput, target.newProjectName || "");
    }

    if (elements.newProjectIdInput) {
      elements.newProjectIdInput.disabled = isApplying || !isCreate;
      setInputValue(elements.newProjectIdInput, target.newProjectId || "");
    }

    if (elements.targetCurrentDetail) {
      const currentName = String(target.currentProjectName || target.projectName || "").trim() || "No current project";
      const currentId = String(target.currentProjectId || target.projectId || "").trim() || "none";
      elements.targetCurrentDetail.textContent = `${currentName} (${currentId})`;
    }

    if (elements.targetSummary) {
      elements.targetSummary.classList.toggle("is-error", validation.valid === false);

      if (validation.valid === false) {
        elements.targetSummary.textContent = validation.reason || "Choose a valid import target before applying.";
      } else if (isCreate) {
        elements.targetSummary.textContent =
          `New project target: ${target.newProjectName || target.projectName || ""} (${target.newProjectId || target.projectId || ""}). Existing projects are checked before any write.`;
      } else {
        elements.targetSummary.textContent =
          `Current project target: ${target.currentProjectName || target.projectName || ""} (${target.currentProjectId || target.projectId || ""}). Matching store_id rows update; new store rows insert.`;
      }
    }
  }

  function renderApplyConfirmation(snapshot, elements) {
    const confirm = elements.applyConfirm;
    if (!confirm) return;

    const hadConfirmInputFocus = document.activeElement && document.activeElement.id === APPLY_CONFIRM_TEXT_ID;
    clearChildren(confirm);

    if (!snapshot.applyConfirmOpen) {
      confirm.style.display = "none";
      return;
    }

    confirm.style.display = "block";

    const warning = document.createElement("p");
    warning.className = "importShellApplyWarning";
    warning.textContent = "This will write to Supabase.";
    confirm.appendChild(warning);

    const target = snapshot.applyTarget || {};
    const isCreate = isCreateNewProjectTarget(snapshot);
    const acceptedRowCount = getAcceptedRowCount(snapshot);

    appendApplyList(confirm, isCreate
      ? [
          { key: "Mode", value: "Create new project" },
          { key: "New project name", value: String(target.newProjectName || target.projectName || "") },
          { key: "New project_id", value: String(target.newProjectId || target.projectId || "") },
          { key: "Accepted rows", value: String(acceptedRowCount) }
        ]
      : [
          { key: "Mode", value: "Merge into current project" },
          { key: "Current project name", value: String(target.currentProjectName || target.projectName || "") },
          { key: "Current project_id", value: String(target.currentProjectId || target.projectId || "") },
          { key: "Accepted rows", value: String(acceptedRowCount) }
        ]);

    const explanation = document.createElement("ul");
    explanation.className = "importShellApplyList";
    (isCreate
      ? [
          "Existing stores will not be touched.",
          "Rows with valid coordinates write directly.",
          "Rows without valid coordinates geocode before writing.",
          "Rows that cannot geocode will be skipped.",
          "Notes/photos are not applicable for a new project.",
          "Baseline active status rows will be created."
        ]
      : [
          "Existing stores matched by store_id will be updated.",
          "New stores will be inserted.",
          "Rows with valid coordinates write directly.",
          "Rows without valid coordinates will geocode before writing.",
          "Rows that cannot geocode will be skipped.",
          "Notes/photos will not be touched.",
          "Existing statuses will not be reset."
        ]).forEach(function appendText(text) {
      const item = document.createElement("li");
      item.textContent = text;
      explanation.appendChild(item);
    });
    confirm.appendChild(explanation);

    const confirmationEligibility = snapshot.applyConfirmationEligibility || { eligible: true };
    if (!isCreate && snapshot.mergeConfirmationRequired) {
      const confirmWrap = document.createElement("div");
      confirmWrap.className = "importShellConfirmInputWrap";

      const confirmHelp = document.createElement("p");
      confirmHelp.className = "importShellConfirmInputHelp";
      confirmHelp.textContent = `Large merge safety: type current project_id "${String(target.currentProjectId || target.projectId || "")}" to confirm.`;

      const confirmInput = document.createElement("input");
      confirmInput.id = APPLY_CONFIRM_TEXT_ID;
      confirmInput.className = "importShellTextInput";
      confirmInput.type = "text";
      confirmInput.autocomplete = "off";
      confirmInput.placeholder = String(target.currentProjectId || target.projectId || "");
      confirmInput.value = String(snapshot.applyConfirmationText || "");
      confirmInput.disabled = Boolean(snapshot.applyInProgress);

      confirmWrap.appendChild(confirmHelp);
      confirmWrap.appendChild(confirmInput);
      confirm.appendChild(confirmWrap);

      if (hadConfirmInputFocus) {
        window.requestAnimationFrame(function restoreConfirmInputFocus() {
          confirmInput.focus();
          const cursorIndex = confirmInput.value.length;
          if (typeof confirmInput.setSelectionRange === "function") {
            confirmInput.setSelectionRange(cursorIndex, cursorIndex);
          }
        });
      }
    }

    const actions = document.createElement("div");
    actions.className = "importShellApplyConfirmActions";

    const confirmBtn = document.createElement("button");
    confirmBtn.id = APPLY_CONFIRM_BTN_ID;
    confirmBtn.type = "button";
    confirmBtn.textContent = snapshot.applyInProgress
      ? "Applying..."
      : (isCreate ? "Confirm Create" : "Confirm Merge");
    confirmBtn.disabled = Boolean(snapshot.applyInProgress || !confirmationEligibility.eligible);
    confirmBtn.title = confirmationEligibility.eligible ? "" : (confirmationEligibility.reason || "");

    const backBtn = document.createElement("button");
    backBtn.id = APPLY_BACK_BTN_ID;
    backBtn.type = "button";
    backBtn.textContent = "Back";
    backBtn.disabled = Boolean(snapshot.applyInProgress);

    actions.appendChild(confirmBtn);
    actions.appendChild(backBtn);
    confirm.appendChild(actions);
  }

  function renderApplyResult(snapshot, elements) {
    const resultNode = elements.applyResult;
    if (!resultNode) return;

    clearChildren(resultNode);

    const result = snapshot && snapshot.applyResult;
    if (!result) {
      resultNode.style.display = "none";
      return;
    }

    resultNode.style.display = "block";

    const title = document.createElement("div");
    title.className = "importShellSectionLabel";
    title.textContent = result.errorCount > 0 ? "Apply Result - Review Needed" : "Apply Result";
    resultNode.appendChild(title);

    const list = document.createElement("ul");
    list.className = "importShellApplyResultList";

    [
      { key: "Inserted stores", value: result.insertedCount },
      { key: "Updated stores", value: result.updatedCount },
      { key: "Skipped rows", value: result.skippedCount },
      { key: "Errors", value: result.errorCount },
      { key: "Warnings", value: result.warningCount },
      { key: "Geocoded", value: result.geocodedCount },
      { key: "Geocode failures", value: result.geocodeFailureCount },
      { key: "Cache hits", value: result.cacheHitCount }
    ].forEach(function appendMetric(row) {
      const item = document.createElement("li");
      item.textContent = `${row.key}: ${Number(row.value) || 0}`;
      list.appendChild(item);
    });

    resultNode.appendChild(list);

    const messages = []
      .concat(Array.isArray(result.errors) ? result.errors.slice(0, 5) : [])
      .concat(Array.isArray(result.warnings) ? result.warnings.slice(0, 5) : []);

    if (messages.length) {
      const messageList = document.createElement("ul");
      messageList.className = "importShellApplyList";
      messages.forEach(function appendMessage(message) {
        const item = document.createElement("li");
        item.textContent = message;
        messageList.appendChild(item);
      });
      resultNode.appendChild(messageList);
    }
  }

  function formatProgressNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString() : "0";
  }

  function formatProgressTime(value) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return "";
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function renderApplyProgress(snapshot, elements) {
    const progressNode = elements.applyProgress;
    if (!progressNode) return;

    clearChildren(progressNode);

    const progress = snapshot && snapshot.applyProgress ? snapshot.applyProgress : {};
    const entries = Array.isArray(progress.entries) ? progress.entries : [];
    const shouldShow = Boolean(snapshot.applyInProgress || entries.length);

    if (!shouldShow) {
      progressNode.style.display = "none";
      return;
    }

    progressNode.style.display = "block";

    const title = document.createElement("div");
    title.className = "importShellSectionLabel";
    title.textContent = "Apply Progress";
    progressNode.appendChild(title);

    const metricRows = [
      { key: "Accepted", value: progress.acceptedCount },
      { key: "Processed", value: progress.processedCount },
      { key: "Inserted", value: progress.insertedCount },
      { key: "Updated", value: progress.updatedCount },
      { key: "Skipped", value: progress.skippedCount },
      { key: "Errors", value: progress.errorCount }
    ];

    if (progress.batchCount && progress.batchNumber) {
      metricRows.push({
        key: "Batch",
        value: `${formatProgressNumber(progress.batchNumber)} / ${formatProgressNumber(progress.batchCount)}`
      });
    }

    const metrics = document.createElement("div");
    metrics.className = "importShellProgressMetrics";
    metricRows.forEach(function appendMetric(row) {
      const metric = document.createElement("div");
      metric.className = "importShellProgressMetric";

      const key = document.createElement("span");
      key.className = "importShellProgressMetricKey";
      key.textContent = row.key;

      const value = document.createElement("span");
      value.className = "importShellProgressMetricValue";
      value.textContent = typeof row.value === "string" ? row.value : formatProgressNumber(row.value);

      metric.appendChild(key);
      metric.appendChild(value);
      metrics.appendChild(metric);
    });
    progressNode.appendChild(metrics);

    const feed = document.createElement("div");
    feed.className = "importShellProgressFeed";

    const list = document.createElement("ul");
    list.className = "importShellProgressFeedList";

    if (!entries.length) {
      const empty = document.createElement("li");
      empty.className = "importShellProgressEntry";
      const time = document.createElement("span");
      time.className = "importShellProgressTime";
      time.textContent = "";
      const message = document.createElement("span");
      message.className = "importShellProgressMessage";
      message.textContent = "Waiting for apply progress...";
      empty.appendChild(time);
      empty.appendChild(message);
      list.appendChild(empty);
    } else {
      entries.forEach(function appendEntry(entry) {
        const item = document.createElement("li");
        item.className = `importShellProgressEntry level-${String(entry.level || "info")}`;

        const time = document.createElement("span");
        time.className = "importShellProgressTime";
        time.textContent = formatProgressTime(entry.timestamp);

        const message = document.createElement("span");
        message.className = "importShellProgressMessage";
        message.textContent = String(entry.message || "");

        item.appendChild(time);
        item.appendChild(message);
        list.appendChild(item);
      });
    }

    feed.appendChild(list);
    progressNode.appendChild(feed);
    feed.scrollTop = feed.scrollHeight;
  }

  function renderApplyUi(snapshot, elements) {
    const applyBtn = elements.applyBtn;
    const applySection = elements.applySection;
    if (!applyBtn || !applySection) return;

    const eligibility = snapshot.applyEligibility || { eligible: false };
    const shouldShowApply = Boolean(eligibility.eligible || snapshot.applyInProgress || snapshot.applyConfirmOpen);

    applyBtn.classList.toggle("is-hidden", !shouldShowApply);
    applyBtn.disabled = Boolean(!eligibility.eligible || snapshot.applyInProgress);
    applyBtn.textContent = snapshot.applyInProgress
      ? "Applying..."
      : `Apply Import - ${getTargetModeLabel(snapshot)}`;
    applyBtn.title = eligibility.eligible ? "" : (eligibility.reason || "");

    renderApplyConfirmation(snapshot, elements);
    renderApplyProgress(snapshot, elements);
    renderApplyResult(snapshot, elements);

    applySection.classList.toggle(
      "is-visible",
      Boolean(snapshot.applyConfirmOpen || snapshot.applyResult || snapshot.applyInProgress || (snapshot.applyProgress && snapshot.applyProgress.entries && snapshot.applyProgress.entries.length))
    );
  }

  function ensureOpenButton() {
    let openBtn = document.getElementById(OPEN_BTN_ID);
    if (openBtn) {
      openBtn.textContent = "Import Project Data";
      openBtn.setAttribute("href", "#import");
      openBtn.setAttribute("data-import-project-link", "true");
      return openBtn;
    }

    const anchor =
      document.querySelector("[data-import-project-link]") ||
      document.querySelector(".importProjectLink");

    if (anchor) {
      anchor.id = OPEN_BTN_ID;
      anchor.textContent = "Import Project Data";
      anchor.setAttribute("href", "#import");
      anchor.setAttribute("data-import-project-link", "true");
      return anchor;
    }

    const projectPanel = document.querySelector(".panelProject");
    if (!projectPanel) return null;

    openBtn = document.createElement("button");
    openBtn.id = OPEN_BTN_ID;
    openBtn.type = "button";
    openBtn.className = "importLink";
    openBtn.textContent = "Import Project Data";
    openBtn.setAttribute("data-import-project-link", "true");
    projectPanel.appendChild(openBtn);

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
    copy.textContent = "Dry-run validates the CSV first. Apply writes only after explicit confirmation.";

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
    note.textContent = "Choose the import target before applying. Dry-run never writes; apply requires permissions and an explicit final confirmation.";

    const targetSection = document.createElement("section");
    targetSection.className = "importShellSection";

    const targetLabel = document.createElement("div");
    targetLabel.className = "importShellSectionLabel";
    targetLabel.textContent = "Import Target";

    const targetGrid = document.createElement("div");
    targetGrid.className = "importShellTargetGrid";

    const createOption = document.createElement("label");
    createOption.className = "importShellTargetOption";

    const createRadio = document.createElement("input");
    createRadio.id = TARGET_CREATE_ID;
    createRadio.type = "radio";
    createRadio.name = "importShellTargetMode";
    createRadio.value = "create_new_project";

    const createCopy = document.createElement("span");
    const createTitle = document.createElement("span");
    createTitle.className = "importShellTargetTitle";
    createTitle.textContent = "Create new project";
    const createDetail = document.createElement("span");
    createDetail.className = "importShellTargetDetail";
    createDetail.textContent = "Write imported stores to a new project_id and seed baseline active statuses.";
    createCopy.appendChild(createTitle);
    createCopy.appendChild(createDetail);
    createOption.appendChild(createRadio);
    createOption.appendChild(createCopy);

    const mergeOption = document.createElement("label");
    mergeOption.className = "importShellTargetOption";

    const mergeRadio = document.createElement("input");
    mergeRadio.id = TARGET_MERGE_ID;
    mergeRadio.type = "radio";
    mergeRadio.name = "importShellTargetMode";
    mergeRadio.value = "merge_current_project";
    mergeRadio.checked = true;

    const mergeCopy = document.createElement("span");
    const mergeTitle = document.createElement("span");
    mergeTitle.className = "importShellTargetTitle";
    mergeTitle.textContent = "Merge into current project";
    const mergeDetail = document.createElement("span");
    mergeDetail.id = TARGET_CURRENT_DETAIL_ID;
    mergeDetail.className = "importShellTargetDetail";
    mergeDetail.textContent = "Current project details will load here.";
    mergeCopy.appendChild(mergeTitle);
    mergeCopy.appendChild(mergeDetail);
    mergeOption.appendChild(mergeRadio);
    mergeOption.appendChild(mergeCopy);

    targetGrid.appendChild(createOption);
    targetGrid.appendChild(mergeOption);

    const createFields = document.createElement("div");
    createFields.id = TARGET_FIELDS_ID;
    createFields.className = "importShellFieldGrid is-hidden";

    const projectNameLabel = document.createElement("label");
    projectNameLabel.className = "importShellFieldLabel";
    projectNameLabel.textContent = "Project Name";
    const projectNameInput = document.createElement("input");
    projectNameInput.id = NEW_PROJECT_NAME_ID;
    projectNameInput.className = "importShellTextInput";
    projectNameInput.type = "text";
    projectNameInput.autocomplete = "off";
    projectNameInput.placeholder = "Gotta Catch Em All";
    projectNameLabel.appendChild(projectNameInput);

    const projectIdLabel = document.createElement("label");
    projectIdLabel.className = "importShellFieldLabel";
    projectIdLabel.textContent = "Project ID / slug";
    const projectIdInput = document.createElement("input");
    projectIdInput.id = NEW_PROJECT_ID_ID;
    projectIdInput.className = "importShellTextInput";
    projectIdInput.type = "text";
    projectIdInput.autocomplete = "off";
    projectIdInput.placeholder = "gotta-catch-em-all";
    projectIdLabel.appendChild(projectIdInput);

    createFields.appendChild(projectNameLabel);
    createFields.appendChild(projectIdLabel);

    const targetSummary = document.createElement("div");
    targetSummary.id = TARGET_SUMMARY_ID;
    targetSummary.className = "importShellTargetSummary";
    targetSummary.textContent = "Current project target will be shown before apply.";

    targetSection.appendChild(targetLabel);
    targetSection.appendChild(targetGrid);
    targetSection.appendChild(createFields);
    targetSection.appendChild(targetSummary);

    const presetSection = document.createElement("section");
    presetSection.className = "importShellSection";

    const presetLabel = document.createElement("div");
    presetLabel.className = "importShellSectionLabel";
    presetLabel.textContent = "Mapping Preset";

    const presetSelect = document.createElement("select");
    presetSelect.id = PRESET_SELECT_ID;
    presetSelect.className = "importShellPresetSelect";

    const presetStatus = document.createElement("div");
    presetStatus.id = PRESET_STATUS_ID;
    presetStatus.className = "importShellPresetStatus";
    presetStatus.textContent = "Preset choice is shell-local only and never mutates live project data.";

    presetSection.appendChild(presetLabel);
    presetSection.appendChild(presetSelect);
    presetSection.appendChild(presetStatus);

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

    const applySection = document.createElement("section");
    applySection.id = APPLY_SECTION_ID;
    applySection.className = "importShellApplySection";

    const applyConfirm = document.createElement("div");
    applyConfirm.id = APPLY_CONFIRM_ID;
    applyConfirm.className = "importShellCard importShellApplyBlock";

    const applyProgress = document.createElement("div");
    applyProgress.id = APPLY_PROGRESS_ID;
    applyProgress.className = "importShellCard importShellApplyBlock";

    const applyResult = document.createElement("div");
    applyResult.id = APPLY_RESULT_ID;
    applyResult.className = "importShellCard importShellApplyBlock";

    applySection.appendChild(applyConfirm);
    applySection.appendChild(applyProgress);
    applySection.appendChild(applyResult);

    const actions = document.createElement("div");
    actions.className = "importShellActions";

    const applyBtn = document.createElement("button");
    applyBtn.id = APPLY_BTN_ID;
    applyBtn.type = "button";
    applyBtn.textContent = "Apply Import";
    applyBtn.classList.add("is-hidden");

    const clearBtn = document.createElement("button");
    clearBtn.id = CLEAR_BTN_ID;
    clearBtn.type = "button";
    clearBtn.textContent = "Clear";

    const cancelBtn = document.createElement("button");
    cancelBtn.id = CANCEL_BTN_ID;
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";

    actions.appendChild(applyBtn);
    actions.appendChild(clearBtn);
    actions.appendChild(cancelBtn);

    content.appendChild(header);
    content.appendChild(note);
    content.appendChild(targetSection);
    content.appendChild(presetSection);
    content.appendChild(fileSection);
    content.appendChild(metaSection);
    content.appendChild(statusSection);
    content.appendChild(applySection);
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
      presetSelect: document.getElementById(PRESET_SELECT_ID),
      presetStatus: document.getElementById(PRESET_STATUS_ID),
      closeBtn: document.getElementById(CLOSE_BTN_ID),
      cancelBtn: document.getElementById(CANCEL_BTN_ID),
      clearBtn: document.getElementById(CLEAR_BTN_ID),
      dropZone: document.getElementById(DROP_ZONE_ID),
      applyBtn: document.getElementById(APPLY_BTN_ID),
      applySection: document.getElementById(APPLY_SECTION_ID),
      applyConfirm: document.getElementById(APPLY_CONFIRM_ID),
      applyProgress: document.getElementById(APPLY_PROGRESS_ID),
      applyResult: document.getElementById(APPLY_RESULT_ID),
      applyConfirmBtn: document.getElementById(APPLY_CONFIRM_BTN_ID),
      applyBackBtn: document.getElementById(APPLY_BACK_BTN_ID),
      targetCreateRadio: document.getElementById(TARGET_CREATE_ID),
      targetMergeRadio: document.getElementById(TARGET_MERGE_ID),
      targetFields: document.getElementById(TARGET_FIELDS_ID),
      targetSummary: document.getElementById(TARGET_SUMMARY_ID),
      targetCurrentDetail: document.getElementById(TARGET_CURRENT_DETAIL_ID),
      newProjectNameInput: document.getElementById(NEW_PROJECT_NAME_ID),
      newProjectIdInput: document.getElementById(NEW_PROJECT_ID_ID),
      applyConfirmTextInput: document.getElementById(APPLY_CONFIRM_TEXT_ID)
    };
  }

  function populatePresetOptions(snapshot) {
    const elements = getElements();
    const presetSelect = elements.presetSelect;
    if (!presetSelect) return;

    const presets = Array.isArray(snapshot.availablePresets) ? snapshot.availablePresets : [];
    const selectedPreset = snapshot.selectedPreset || "canonical";

    presetSelect.innerHTML = "";

    presets.forEach(function appendPreset(preset) {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.label;
      presetSelect.appendChild(option);
    });

    if (!presets.some(function hasSelected(preset) { return preset.id === selectedPreset; })) {
      const fallback = document.createElement("option");
      fallback.value = selectedPreset;
      fallback.textContent = selectedPreset;
      presetSelect.appendChild(fallback);
    }

    presetSelect.value = selectedPreset;
  }

  function updatePresetStatus(snapshot) {
    const elements = getElements();
    const presetStatus = elements.presetStatus;
    if (!presetStatus) return;

    const activePreset =
      (snapshot.mappingReport && snapshot.mappingReport.presetUsed) ||
      snapshot.selectedPreset ||
      "canonical";

    presetStatus.textContent =
      `Selected preset: ${activePreset}. Preset choice is shell-local only and never mutates live project data.`;
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

  const runtime = getRuntime();
  if (!runtime) return;

  runtime.setErrorState({
    statusLevel: "error",
    statusMessage: "Failed to read file. Please try again.",
    file: null,
    parsedHeaders: [],
    parsedRows: []
  });
};
    reader.readAsText(file);
  }

  function render(snapshot) {
    const elements = getElements();
    const modal = elements.modal;
    const fileMeta = elements.fileMeta;
    const status = elements.status;
    const dropZone = elements.dropZone;

    if (!modal || !fileMeta || !status || !dropZone) return;

    modal.classList.toggle("is-open", Boolean(snapshot.isOpen));
    modal.setAttribute("aria-hidden", String(!snapshot.isOpen));
    dropZone.classList.toggle("is-dragover", Boolean(snapshot.dragActive));

    populatePresetOptions(snapshot);
    updatePresetStatus(snapshot);
    renderTargetUi(snapshot, elements);

    if (elements.fileInput) elements.fileInput.disabled = Boolean(snapshot.applyInProgress);
    if (elements.presetSelect) elements.presetSelect.disabled = Boolean(snapshot.applyInProgress);
    if (elements.clearBtn) elements.clearBtn.disabled = Boolean(snapshot.applyInProgress);
    if (elements.cancelBtn) elements.cancelBtn.disabled = Boolean(snapshot.applyInProgress);
    if (elements.closeBtn) elements.closeBtn.disabled = Boolean(snapshot.applyInProgress);

    if (!snapshot.file) {
      fileMeta.textContent = "No file selected.";
    } else {
      const modified = snapshot.file.lastModified
        ? new Date(snapshot.file.lastModified).toLocaleString()
        : "Unknown";

      buildMetaRows(fileMeta, [
        { key: "Name", value: snapshot.file.name || "Unknown" },
        { key: "Type", value: snapshot.file.type || "text/csv" },
        { key: "Size", value: formatBytes(snapshot.file.size || 0) },
        { key: "Headers", value: String((snapshot.parsedHeaders || []).length) },
        { key: "Rows", value: String((snapshot.parsedRows || []).length) },
        { key: "Last Modified", value: modified }
      ]);
    }

    status.classList.remove("status-ok", "status-warn", "status-error");

    if (snapshot.statusLevel === "ok") status.classList.add("status-ok");
    if (snapshot.statusLevel === "warn") status.classList.add("status-warn");
    if (snapshot.statusLevel === "error") status.classList.add("status-error");

    status.textContent = snapshot.statusMessage || "Awaiting file selection for staged validation preview.";
    renderApplyUi(snapshot, elements);
  }

  function bindEvents() {
    const runtime = getRuntime();
    const elements = getElements();

    if (!runtime) return;
    if (
      !elements.openBtn ||
      !elements.modal ||
      !elements.fileInput ||
      !elements.dropZone ||
      !elements.presetSelect
    ) {
      return;
    }
    if (elements.modal.dataset.importShellBound === "true") return;

    elements.openBtn.addEventListener("click", function onOpen(event) {
      event.preventDefault();
      if (!canOpenImportShell(elements)) return;
      runtime.openShell();
    });

    elements.closeBtn.addEventListener("click", function onClose() {
      if (runtime.getState().applyInProgress) return;
      runtime.closeShell();
    });

    elements.cancelBtn.addEventListener("click", function onCancel() {
      if (runtime.getState().applyInProgress) return;
      runtime.closeShell();
    });

    elements.clearBtn.addEventListener("click", function onClear() {
      if (runtime.getState().applyInProgress) return;
      runtime.resetAll();
      elements.fileInput.value = "";
    });

    if (elements.applyBtn) {
      elements.applyBtn.addEventListener("click", function onApplyClick() {
        const opened = runtime.requestApplyConfirmation();
        if (opened && elements.applySection) {
          window.requestAnimationFrame(function scrollToApply() {
            elements.applySection.scrollIntoView({ behavior: "smooth", block: "nearest" });
          });
        }
      });
    }

    if (elements.applySection) {
      elements.applySection.addEventListener("click", function onApplySectionClick(event) {
        const target = event.target;
        if (!target || !target.id) return;

        if (target.id === APPLY_CONFIRM_BTN_ID) {
          runtime.applyImport();
        }

        if (target.id === APPLY_BACK_BTN_ID) {
          runtime.cancelApplyConfirmation();
        }
      });

      elements.applySection.addEventListener("input", function onApplySectionInput(event) {
        const target = event.target;
        if (!target || target.id !== APPLY_CONFIRM_TEXT_ID) return;
        if (typeof runtime.setApplyConfirmationText === "function") {
          runtime.setApplyConfirmationText(target.value);
        }
      });
    }

    elements.presetSelect.addEventListener("change", function onPresetChange() {
      runtime.setSelectedPreset(elements.presetSelect.value);
    });

    if (elements.targetCreateRadio) {
      elements.targetCreateRadio.addEventListener("change", function onTargetCreateChange() {
        if (elements.targetCreateRadio.checked && typeof runtime.setImportTargetMode === "function") {
          runtime.setImportTargetMode("create_new_project");
        }
      });
    }

    if (elements.targetMergeRadio) {
      elements.targetMergeRadio.addEventListener("change", function onTargetMergeChange() {
        if (elements.targetMergeRadio.checked && typeof runtime.setImportTargetMode === "function") {
          runtime.setImportTargetMode("merge_current_project");
        }
      });
    }

    if (elements.newProjectNameInput) {
      elements.newProjectNameInput.addEventListener("input", function onNewProjectNameInput() {
        if (typeof runtime.setNewProjectName === "function") {
          runtime.setNewProjectName(elements.newProjectNameInput.value);
        }
      });
    }

    if (elements.newProjectIdInput) {
      elements.newProjectIdInput.addEventListener("input", function onNewProjectIdInput() {
        const normalizedProjectId = String(elements.newProjectIdInput.value || "").trim().toLowerCase();
        if (elements.newProjectIdInput.value !== normalizedProjectId) {
          elements.newProjectIdInput.value = normalizedProjectId;
        }
        if (typeof runtime.setNewProjectId === "function") {
          runtime.setNewProjectId(normalizedProjectId);
        }
      });
    }

    elements.modal.addEventListener("click", function onBackdrop(event) {
      if (event.target === elements.modal) {
        if (runtime.getState().applyInProgress) return;
        runtime.closeShell();
      }
    });

    elements.fileInput.addEventListener("change", function onFileChange() {
      const file = elements.fileInput.files && elements.fileInput.files[0];
      if (file) readSelectedFile(file);
    });

    ["dragenter", "dragover"].forEach(function bindDrag(eventName) {
      elements.dropZone.addEventListener(eventName, function onDrag(event) {
        event.preventDefault();
        event.stopPropagation();
        runtime.setDragActive(true);
      });
    });

    ["dragleave", "dragend"].forEach(function bindLeave(eventName) {
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
        if (snapshot && snapshot.isOpen && !snapshot.applyInProgress) {
          runtime.closeShell();
        }
      }
    });

    elements.modal.dataset.importShellBound = "true";
    runtime.subscribe(render);
  }

  function canOpenImportShell(elements) {
    if (typeof canManageProjectLifecycle === "function" && !canManageProjectLifecycle()) return false;
    return !(elements.openBtn && elements.openBtn.classList.contains("disabled"));
  }

  function maybeOpenFromLegacyIntent() {
    const runtime = getRuntime();
    if (!runtime) return;
    const elements = getElements();

    let hasStoredIntent = false;

    try {
      hasStoredIntent = window.sessionStorage.getItem(OPEN_INTENT_KEY) === "true";
    } catch (error) {
      hasStoredIntent = false;
    }

    if (hasStoredIntent || window.location.hash === "#import") {
      if (!canOpenImportShell(elements)) return;
      runtime.openShell();

      const opened = runtime.getState?.()?.isOpen === true;
      if (!opened) return;

      if (hasStoredIntent) {
        try {
          window.sessionStorage.removeItem(OPEN_INTENT_KEY);
        } catch (_) {
          // The shell is already open; storage cleanup is best effort.
        }
      }

      if (window.location.hash === "#import") {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
    }
  }

  function init() {
    if (!getRuntime()) return;
    ensureStyles();
    ensureOpenButton();
    ensureModal();
    bindEvents();
    maybeOpenFromLegacyIntent();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.ImportUIShell = {
    init: init,
    retryOpenIntent: maybeOpenFromLegacyIntent
  };
})();
