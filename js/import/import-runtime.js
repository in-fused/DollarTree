(function importRuntimeModule() {
  const DEFAULT_PRESET = "canonical";
  const FALLBACK_PRESETS = [
    { id: "canonical", label: "Default / Canonical" },
    { id: "store-number-heavy", label: "Store-Number-Heavy" },
    { id: "address-heavy", label: "Address-Heavy" }
  ];
  const PROJECT_REFRESH_TIMEOUT_MS = 20000;
  const LARGE_MERGE_ROW_THRESHOLD = 100;
  const IMPORT_TARGET_MODES = Object.freeze({
    CREATE_NEW_PROJECT: "create_new_project",
    MERGE_CURRENT_PROJECT: "merge_current_project"
  });
  const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  const subscribers = new Set();

  const state = {
    isOpen: false,
    dragActive: false,
    file: null,
    fileText: "",
    parsedHeaders: [],
    parsedRows: [],
    mappingReport: null,
    headerReport: null,
    stageResult: null,
    diagnosticsSummary: null,
    selectedPreset: DEFAULT_PRESET,
    availablePresets: FALLBACK_PRESETS.slice(),
    overrideMappings: {},
    targetMode: IMPORT_TARGET_MODES.MERGE_CURRENT_PROJECT,
    newProjectName: "",
    newProjectId: "",
    newProjectIdTouched: false,
    statusLevel: "idle",
    statusMessage: "Awaiting file selection for staged validation preview.",
    applyConfirmOpen: false,
    applyInProgress: false,
    applyConfirmationText: "",
    applyResult: null
  };

  function getCurrentProjectId() {
    return typeof currentProjectId !== "undefined" ? String(currentProjectId || "").trim() : "";
  }

  function getCurrentProjectMeta() {
    return typeof currentProjectMeta !== "undefined" && currentProjectMeta
      ? currentProjectMeta
      : null;
  }

  function slugifyProjectId(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-");
  }

  function normalizeProjectIdInput(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isValidProjectId(value) {
    return PROJECT_ID_PATTERN.test(String(value || "").trim());
  }

  function canCurrentUserApplyImport() {
    return Boolean(
      typeof isSignedIn === "function" &&
      isSignedIn() &&
      typeof canManageProjectLifecycle === "function" &&
      canManageProjectLifecycle()
    );
  }

  function canCurrentUserCreateProject() {
    return Boolean(
      typeof isSignedIn === "function" &&
      isSignedIn() &&
      typeof isGlobalAdmin === "function" &&
      isGlobalAdmin()
    );
  }

  function getKnownProjectIds() {
    const ids = new Set();

    [
      typeof allProjectList !== "undefined" ? allProjectList : [],
      typeof projectList !== "undefined" ? projectList : []
    ].forEach((projects) => {
      (Array.isArray(projects) ? projects : []).forEach((project) => {
        const projectId = String(project && project.project_id || "").trim();
        if (projectId) ids.add(projectId);
      });
    });

    const currentId = getCurrentProjectId();
    if (currentId) ids.add(currentId);
    return ids;
  }

  function isKnownProjectId(projectId) {
    const normalizedProjectId = String(projectId || "").trim();
    return Boolean(normalizedProjectId && getKnownProjectIds().has(normalizedProjectId));
  }

  function getAcceptedRecords() {
    const stageResult = state.stageResult;
    return stageResult && Array.isArray(stageResult.acceptedRecords)
      ? stageResult.acceptedRecords
      : [];
  }

  function getAcceptedRowCount() {
    return getAcceptedRecords().length;
  }

  function getImportTargetMode() {
    return state.targetMode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT
      ? IMPORT_TARGET_MODES.CREATE_NEW_PROJECT
      : IMPORT_TARGET_MODES.MERGE_CURRENT_PROJECT;
  }

  function getCurrentProjectName() {
    const projectMeta = getCurrentProjectMeta();
    return String((projectMeta && projectMeta.name) || getCurrentProjectId() || "").trim();
  }

  function getImportTargetValidation() {
    const mode = getImportTargetMode();

    if (mode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT) {
      const projectName = String(state.newProjectName || "").trim();
      const projectId = normalizeProjectIdInput(state.newProjectId);

      if (!canCurrentUserCreateProject()) {
        return {
          valid: false,
          reason: "Global admin or owner access is required to create projects."
        };
      }

      if (!projectName) {
        return { valid: false, reason: "Project Name is required for a new project." };
      }

      if (!projectId) {
        return { valid: false, reason: "Project ID / slug is required for a new project." };
      }

      if (!isValidProjectId(projectId)) {
        return {
          valid: false,
          reason: "Project ID must use lowercase letters, numbers, and single hyphens only."
        };
      }

      if (isKnownProjectId(projectId)) {
        return {
          valid: false,
          reason: `Project ID "${projectId}" already exists. Choose a different project ID.`
        };
      }

      return { valid: true, reason: "" };
    }

    if (!getCurrentProjectId()) {
      return { valid: false, reason: "Select a current project before merging." };
    }

    if (!canCurrentUserApplyImport()) {
      return { valid: false, reason: "Project admin or global admin access is required to merge imports." };
    }

    return { valid: true, reason: "" };
  }

  function isMergeConfirmationRequired() {
    return getImportTargetMode() === IMPORT_TARGET_MODES.MERGE_CURRENT_PROJECT &&
      getAcceptedRowCount() >= LARGE_MERGE_ROW_THRESHOLD;
  }

  function getApplyConfirmationEligibility() {
    if (!isMergeConfirmationRequired()) return { eligible: true, reason: "" };

    const currentProjectIdValue = getCurrentProjectId();
    if (String(state.applyConfirmationText || "").trim() !== currentProjectIdValue) {
      return {
        eligible: false,
        reason: `Type current project_id "${currentProjectIdValue}" to confirm this merge.`
      };
    }

    return { eligible: true, reason: "" };
  }

  function buildApplyTarget() {
    const mode = getImportTargetMode();
    const validation = getImportTargetValidation();

    if (mode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT) {
      const projectName = String(state.newProjectName || "").trim();
      const projectId = normalizeProjectIdInput(state.newProjectId);
      return {
        mode,
        modeLabel: "Create new project",
        projectId,
        projectName: projectName || projectId,
        newProjectName: projectName,
        newProjectId: projectId,
        currentProjectId: getCurrentProjectId(),
        currentProjectName: getCurrentProjectName(),
        canCreateProject: canCurrentUserCreateProject(),
        canMergeCurrentProject: canCurrentUserApplyImport(),
        projectIdExists: Boolean(projectId && isKnownProjectId(projectId)),
        validation
      };
    }

    return {
      mode,
      modeLabel: "Merge into current project",
      projectId: getCurrentProjectId(),
      projectName: getCurrentProjectName(),
      currentProjectId: getCurrentProjectId(),
      currentProjectName: getCurrentProjectName(),
      newProjectName: String(state.newProjectName || "").trim(),
      newProjectId: normalizeProjectIdInput(state.newProjectId),
      canCreateProject: canCurrentUserCreateProject(),
      canMergeCurrentProject: canCurrentUserApplyImport(),
      projectIdExists: false,
      validation
    };
  }

  function getApplyEligibility() {
    const stageResult = state.stageResult;
    const summary = stageResult && stageResult.summary ? stageResult.summary : null;
    const acceptedRecords = getAcceptedRecords();
    const targetValidation = getImportTargetValidation();

    if (!state.file || !state.parsedRows.length) {
      return { eligible: false, reason: "Select and parse a CSV before applying." };
    }

    if (!stageResult || !summary) {
      return { eligible: false, reason: "Run a dry-run before applying." };
    }

    if (stageResult.canProceed !== true || stageResult.isValid !== true) {
      return { eligible: false, reason: "Resolve dry-run validation issues before applying." };
    }

    if ((Number(summary.rejectedRowCount) || 0) > 0) {
      return { eligible: false, reason: "Rejected rows must be resolved before applying." };
    }

    if (!acceptedRecords.length) {
      return { eligible: false, reason: "No accepted rows are available to apply." };
    }

    if (!targetValidation.valid) {
      return { eligible: false, reason: targetValidation.reason || "Choose a valid import target before applying." };
    }

    return { eligible: true, reason: "" };
  }

  function cloneState() {
    return {
      isOpen: state.isOpen,
      dragActive: state.dragActive,
      file: state.file
        ? {
            name: state.file.name || "",
            size: state.file.size || 0,
            type: state.file.type || "",
            lastModified: state.file.lastModified || 0
          }
        : null,
      fileText: state.fileText,
      parsedHeaders: state.parsedHeaders.slice(),
      parsedRows: state.parsedRows.slice(),
      mappingReport: state.mappingReport,
      headerReport: state.headerReport,
      stageResult: state.stageResult,
      diagnosticsSummary: state.diagnosticsSummary,
      selectedPreset: state.selectedPreset,
      availablePresets: state.availablePresets.slice(),
      overrideMappings: { ...state.overrideMappings },
      targetMode: getImportTargetMode(),
      newProjectName: state.newProjectName,
      newProjectId: state.newProjectId,
      statusLevel: state.statusLevel,
      statusMessage: state.statusMessage,
      applyConfirmOpen: state.applyConfirmOpen,
      applyInProgress: state.applyInProgress,
      applyConfirmationText: state.applyConfirmationText,
      applyResult: state.applyResult,
      applyEligibility: getApplyEligibility(),
      applyConfirmationEligibility: getApplyConfirmationEligibility(),
      mergeConfirmationRequired: isMergeConfirmationRequired(),
      largeMergeRowThreshold: LARGE_MERGE_ROW_THRESHOLD,
      applyTarget: buildApplyTarget()
    };
  }

  function notify() {
    const snapshot = cloneState();
    subscribers.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error(error);
      }
    });
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      return function noop() {};
    }

    subscribers.add(listener);
    listener(cloneState());

    return function unsubscribe() {
      subscribers.delete(listener);
    };
  }

  function getIngestionApis() {
    return {
      mapper: window.ingestionMapper || null,
      validator: window.ingestionValidator || null,
      stage: window.ingestionStage || null,
      diagnostics: window.ingestionDiagnostics || null
    };
  }

  function safePresetOptionsFromMapper(mapper) {
    if (!mapper || typeof mapper.getMappingPresets !== "function") {
      return FALLBACK_PRESETS.slice();
    }

    try {
      const presets = mapper.getMappingPresets();

      if (Array.isArray(presets)) {
        const normalizedArray = presets
          .map((preset) => ({
            id: String((preset && preset.id) || "").trim(),
            label: String((preset && (preset.label || preset.id)) || "").trim()
          }))
          .filter((preset) => preset.id);

        return normalizedArray.length ? normalizedArray : FALLBACK_PRESETS.slice();
      }

      const keys = Object.keys(presets || {});
      if (!keys.length) return FALLBACK_PRESETS.slice();

      const normalizedObject = keys
        .map((key) => {
          const preset = presets[key] || {};
          return {
            id: String(preset.id || key).trim(),
            label: String(preset.label || key).trim()
          };
        })
        .filter((preset) => preset.id);

      return normalizedObject.length ? normalizedObject : FALLBACK_PRESETS.slice();
    } catch (error) {
      console.error(error);
      return FALLBACK_PRESETS.slice();
    }
  }

  function refreshAvailablePresets() {
    const apis = getIngestionApis();
    state.availablePresets = safePresetOptionsFromMapper(apis.mapper);

    if (!state.availablePresets.some((preset) => preset.id === state.selectedPreset)) {
      state.selectedPreset = DEFAULT_PRESET;
    }
  }

  function setStatus(level, message) {
    state.statusLevel = level;
    state.statusMessage = message;
  }

  function withRuntimeTimeout(operation, timeoutMs, message) {
    const effectiveTimeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : PROJECT_REFRESH_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(message || `Operation timed out after ${Math.ceil(effectiveTimeout / 1000)} seconds.`));
      }, effectiveTimeout);

      Promise.resolve()
        .then(() => (typeof operation === "function" ? operation() : operation))
        .then(
          (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
          },
          (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
          }
        );
    });
  }

  function clearDryRunArtifacts() {
    state.parsedHeaders = [];
    state.parsedRows = [];
    state.mappingReport = null;
    state.headerReport = null;
    state.stageResult = null;
    state.diagnosticsSummary = null;
    clearApplyArtifacts();
  }

  function clearApplyArtifacts() {
    state.applyConfirmOpen = false;
    state.applyInProgress = false;
    state.applyConfirmationText = "";
    state.applyResult = null;
  }

  function setErrorState(nextState) {
    const patch = nextState && typeof nextState === "object" ? nextState : {};

    if (Object.prototype.hasOwnProperty.call(patch, "file")) {
      const filePayload = patch.file;
      state.file = filePayload
        ? {
            name: filePayload.name || "",
            size: Number(filePayload.size) || 0,
            type: filePayload.type || "",
            lastModified: Number(filePayload.lastModified) || 0
          }
        : null;

      if (!state.file) {
        state.fileText = "";
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, "fileText")) {
      state.fileText = typeof patch.fileText === "string" ? patch.fileText : "";
    }

    if (Object.prototype.hasOwnProperty.call(patch, "parsedHeaders")) {
      state.parsedHeaders = Array.isArray(patch.parsedHeaders) ? patch.parsedHeaders.slice() : [];
    }

    if (Object.prototype.hasOwnProperty.call(patch, "parsedRows")) {
      state.parsedRows = Array.isArray(patch.parsedRows) ? patch.parsedRows.slice() : [];
    }

    state.dragActive = false;
    state.mappingReport = null;
    state.headerReport = null;
    state.stageResult = null;
    state.diagnosticsSummary = null;
    clearApplyArtifacts();
    setStatus(patch.statusLevel || "error", patch.statusMessage || "Import failed safely. No project data was changed.");
    notify();
  }

  function setOpen(nextOpen) {
    state.isOpen = Boolean(nextOpen);

    if (!state.isOpen) {
      state.dragActive = false;
    }

    notify();
  }

  function setDragActive(nextValue) {
    state.dragActive = Boolean(nextValue);
    notify();
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
        if (char === "\"" && next === "\"") {
          value += "\"";
          i += 1;
        } else if (char === "\"") {
          inQuotes = false;
        } else {
          value += char;
        }
      } else if (char === "\"") {
        inQuotes = true;
      } else if (char === ",") {
        row.push(value);
        value = "";
      } else if (char === "\n") {
        row.push(value);
        rows.push(row);
        row = [];
        value = "";
      } else if (char === "\r") {
        if (next === "\n") continue;
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

    return {
      headers: rows[0].map((header) => String(header || "").trim()),
      rows: rows.slice(1).filter((currentRow) =>
        currentRow.some((cell) => String(cell || "").trim() !== "")
      )
    };
  }

  function buildStageArgs(parsed, sourceFilename) {
    const args = {
      sourceHeaders: parsed.headers,
      rawRows: parsed.rows,
      sourceFilename: sourceFilename || "",
      presetId: state.selectedPreset || DEFAULT_PRESET
    };

    if (Object.keys(state.overrideMappings).length) {
      args.overrideMappings = { ...state.overrideMappings };
    }

    return args;
  }

  function runDryRunPipeline() {
    if (!state.file) {
      setStatus("warn", "No file selected.");
      notify();
      return;
    }

    state.applyConfirmOpen = false;
    state.applyResult = null;
    refreshAvailablePresets();

    const apis = getIngestionApis();
    if (!apis.mapper || !apis.validator || !apis.stage || !apis.diagnostics) {
      clearDryRunArtifacts();
      setStatus("error", "Ingestion modules are unavailable. Dry-run cannot execute in this session.");
      notify();
      return;
    }

    const lowerName = String(state.file.name || "").toLowerCase();

    if (
      lowerName.endsWith(".xlsx") ||
      state.file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      clearDryRunArtifacts();
      setStatus("warn", "XLSX parsing is not active yet. Please use CSV for dry-run preview.");
      notify();
      return;
    }

    if (
      !lowerName.endsWith(".csv") &&
      state.file.type &&
      state.file.type !== "text/csv" &&
      state.file.type !== "application/csv"
    ) {
      clearDryRunArtifacts();
      setStatus("error", "Unsupported file type. Use CSV for dry-run preview.");
      notify();
      return;
    }

    let parsed;

    try {
      parsed = parseCsvText(state.fileText);
    } catch (error) {
      console.error(error);
      clearDryRunArtifacts();
      setStatus("error", "CSV parse failed. Please verify the file format and try again.");
      notify();
      return;
    }

    if (!parsed.headers.length) {
      clearDryRunArtifacts();
      setStatus("error", "CSV appears empty or missing a header row.");
      notify();
      return;
    }

    state.parsedHeaders = parsed.headers.slice();
    state.parsedRows = parsed.rows.slice();

    try {
      state.mappingReport = apis.mapper.buildHeaderMappingReport(parsed.headers, {
        presetId: state.selectedPreset || DEFAULT_PRESET,
        overrideMappings: { ...state.overrideMappings }
      });

      state.headerReport = apis.validator.validateHeaders(parsed.headers);

      state.stageResult = apis.stage.stageImportBatch(
        buildStageArgs(parsed, state.file.name)
      );

      state.diagnosticsSummary = apis.diagnostics.buildDryRunIntegritySummary(
        state.stageResult
      );

      if (state.stageResult.canProceed === true && state.stageResult.isValid === true) {
        setStatus("ok", "Dry-run completed successfully. No backend writes have occurred.");
      } else if (
        (state.stageResult.summary && state.stageResult.summary.errorCount) ||
        (state.stageResult.summary && state.stageResult.summary.rejectedRowCount)
      ) {
        setStatus("error", "Dry-run blocked by validation errors. Review staged results below.");
      } else {
        setStatus("warn", "Dry-run completed with warnings. No backend writes have occurred.");
      }
    } catch (error) {
      console.error(error);
      clearDryRunArtifacts();
      setStatus("error", "Dry-run pipeline failed safely. No project data was changed.");
    }

    notify();
  }

  function selectFile(filePayload) {
    if (!filePayload) {
      state.file = null;
      state.fileText = "";
      state.overrideMappings = {};
      clearDryRunArtifacts();
      setStatus("warn", "No file selected.");
      notify();
      return;
    }

    state.file = {
      name: filePayload.name || "",
      size: Number(filePayload.size) || 0,
      type: filePayload.type || "",
      lastModified: Number(filePayload.lastModified) || 0
    };

    state.fileText = typeof filePayload.text === "string" ? filePayload.text : "";
    state.overrideMappings = {};

    if (!state.fileText) {
      clearDryRunArtifacts();
      setStatus("error", "File could not be read in browser.");
      notify();
      return;
    }

    setStatus("warn", "Running dry-run preview…");
    notify();

    runDryRunPipeline();
  }

  function setSelectedPreset(presetId) {
    state.selectedPreset = String(presetId || DEFAULT_PRESET);

    if (state.file && state.fileText) {
      runDryRunPipeline();
    } else {
      notify();
    }
  }

  function setOverrideMapping(headerKey, nextValue) {
    const key = String(headerKey || "");
    const normalized = String(nextValue || "").trim();

    if (!key) return;

    if (!normalized) {
      delete state.overrideMappings[key];
    } else {
      state.overrideMappings[key] = normalized;
    }

    if (state.file && state.fileText) {
      runDryRunPipeline();
    } else {
      notify();
    }
  }

  function clearOverrideMappings() {
    state.overrideMappings = {};

    if (state.file && state.fileText) {
      runDryRunPipeline();
    } else {
      notify();
    }
  }

  function setImportTargetMode(mode) {
    const normalizedMode = mode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT
      ? IMPORT_TARGET_MODES.CREATE_NEW_PROJECT
      : IMPORT_TARGET_MODES.MERGE_CURRENT_PROJECT;

    if (state.targetMode === normalizedMode) {
      notify();
      return;
    }

    state.targetMode = normalizedMode;
    clearApplyArtifacts();
    notify();
  }

  function setNewProjectName(value) {
    const nextName = String(value || "").replace(/\s+/g, " ").trimStart();
    state.targetMode = IMPORT_TARGET_MODES.CREATE_NEW_PROJECT;
    state.newProjectName = nextName;

    if (!state.newProjectIdTouched) {
      state.newProjectId = slugifyProjectId(nextName);
    }

    clearApplyArtifacts();
    notify();
  }

  function setNewProjectId(value) {
    state.targetMode = IMPORT_TARGET_MODES.CREATE_NEW_PROJECT;
    state.newProjectIdTouched = true;
    state.newProjectId = normalizeProjectIdInput(value);
    clearApplyArtifacts();
    notify();
  }

  function setApplyConfirmationText(value) {
    state.applyConfirmationText = String(value || "").trim();
    notify();
  }

  function requestApplyConfirmation() {
    const eligibility = getApplyEligibility();

    if (!eligibility.eligible) {
      state.applyConfirmOpen = false;
      setStatus("error", eligibility.reason || "Apply is not available for this dry-run.");
      notify();
      return false;
    }

    state.applyResult = null;
    state.applyConfirmOpen = true;
    state.applyConfirmationText = "";
    notify();
    return true;
  }

  function cancelApplyConfirmation() {
    state.applyConfirmOpen = false;
    state.applyConfirmationText = "";
    notify();
  }

  async function refreshProjectAfterApply(result, target) {
    const appliedMode = result && result.mode ? result.mode : target.mode;
    const appliedProjectId = String((result && result.projectId) || target.projectId || "").trim();

    if (appliedMode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT) {
      if (appliedProjectId && typeof currentProjectId !== "undefined") {
        currentProjectId = appliedProjectId;
        try {
          localStorage.setItem(ACTIVE_PROJECT_KEY, appliedProjectId);
        } catch (error) {
          console.warn("Active project persistence failed after import:", error);
        }
      }

      if (typeof loadProjects === "function") {
        await withRuntimeTimeout(
          () => loadProjects(),
          PROJECT_REFRESH_TIMEOUT_MS,
          "Project list refresh timed out after creating the project. Reload the app to verify the latest data."
        );
      }

      if (appliedProjectId && typeof currentProjectId !== "undefined" && String(currentProjectId || "").trim() !== appliedProjectId) {
        currentProjectId = appliedProjectId;
        try {
          localStorage.setItem(ACTIVE_PROJECT_KEY, appliedProjectId);
        } catch (error) {
          console.warn("Active project persistence failed after import:", error);
        }
      }

      if (typeof refreshCurrentProjectRole === "function") {
        refreshCurrentProjectRole();
      }
    }

    if (typeof loadActiveProject === "function") {
      await withRuntimeTimeout(
        () => loadActiveProject(),
        PROJECT_REFRESH_TIMEOUT_MS,
        appliedMode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT
          ? "New project hydration timed out after apply. Reload the app to verify the latest data."
          : "Project refresh timed out after apply. Reload the app to verify the latest data."
      );
    }
  }

  async function applyImport() {
    if (state.applyInProgress) {
      return state.applyResult;
    }

    const eligibility = getApplyEligibility();
    const confirmationEligibility = getApplyConfirmationEligibility();
    const target = buildApplyTarget();

    if (!eligibility.eligible) {
      state.applyConfirmOpen = false;
      setStatus("error", eligibility.reason || "Apply is not available for this dry-run.");
      notify();
      return null;
    }

    if (!confirmationEligibility.eligible) {
      setStatus("error", confirmationEligibility.reason || "Confirm the import target before applying.");
      notify();
      return null;
    }

    if (!window.ImportApply || typeof window.ImportApply.applyImport !== "function") {
      state.applyConfirmOpen = false;
      setStatus("error", "Import apply engine is unavailable. No project data was changed.");
      notify();
      return null;
    }

    state.applyInProgress = true;
    state.applyResult = null;
    setStatus(
      "warn",
      target.mode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT
        ? "Applying import to a new project..."
        : "Applying import to the current project..."
    );
    notify();

    let result = null;

    try {
      const projectId = getCurrentProjectId();
      const projectMeta = getCurrentProjectMeta();

      result = await window.ImportApply.applyImport({
        targetMode: target.mode,
        stageResult: state.stageResult,
        acceptedRecords: state.stageResult ? state.stageResult.acceptedRecords : [],
        projectId: target.projectId,
        projectName: target.projectName,
        currentProjectId: projectId,
        currentProjectName: (projectMeta && projectMeta.name) || projectId,
        newProjectId: target.newProjectId,
        newProjectName: target.newProjectName,
        canManage: target.mode === IMPORT_TARGET_MODES.MERGE_CURRENT_PROJECT && canCurrentUserApplyImport(),
        canCreateProject: target.mode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT && canCurrentUserCreateProject(),
        knownProjectIds: Array.from(getKnownProjectIds()),
        mergeConfirmation: state.applyConfirmationText,
        largeMergeRowThreshold: LARGE_MERGE_ROW_THRESHOLD
      });

      state.applyResult = result;
      state.applyConfirmOpen = false;
      state.applyConfirmationText = "";

      if (result && result.geocodeFailureCount > 0) {
        setStatus("warn", "Apply completed with geocode failures. Review skipped rows in the summary.");
      } else if (result && result.errorCount > 0) {
        setStatus("warn", "Apply completed with row-level errors. Review the apply summary.");
      } else {
        setStatus(
          "ok",
          target.mode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT
            ? "Apply completed. Refreshing project list and opening the new project..."
            : "Apply completed. Refreshing current project data..."
        );
      }

      notify();

      if (typeof loadActiveProject === "function" || typeof loadProjects === "function") {
        try {
          await refreshProjectAfterApply(result, target);
          if (result && result.geocodeFailureCount > 0) {
            setStatus(
              "warn",
              target.mode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT
                ? "Apply completed with geocode failures and the new project was opened."
                : "Apply completed with geocode failures and current project data was refreshed."
            );
          } else if (result && result.errorCount > 0) {
            setStatus(
              "warn",
              target.mode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT
                ? "Apply completed with row-level errors and the new project was opened."
                : "Apply completed with row-level errors and current project data was refreshed."
            );
          } else {
            setStatus(
              "ok",
              target.mode === IMPORT_TARGET_MODES.CREATE_NEW_PROJECT
                ? "Apply completed. Project list refreshed and the new project is active."
                : "Apply completed and current project data was refreshed."
            );
          }
        } catch (refreshError) {
          console.error(refreshError);
          if (state.applyResult && Array.isArray(state.applyResult.warnings)) {
            state.applyResult.warnings.push("Project refresh failed after apply. Reload the app to verify the latest data.");
            state.applyResult.warningCount = state.applyResult.warnings.length;
          }
          setStatus("warn", "Apply completed, but the project refresh failed. Reload the app to verify data.");
        }
      }
    } catch (error) {
      console.error(error);
      state.applyConfirmOpen = false;
      state.applyConfirmationText = "";
      state.applyResult = {
        mode: target.mode,
        projectId: target.projectId,
        projectName: target.projectName,
        insertedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 1,
        warningCount: 0,
        geocodedCount: 0,
        geocodeFailureCount: 0,
        cacheHitCount: 0,
        coordsProvidedCount: 0,
        warnings: [],
        errors: [error && error.message ? error.message : "Import apply failed."],
        success: false
      };
      setStatus("error", error && error.message ? error.message : "Import apply failed.");
    } finally {
      state.applyInProgress = false;
      notify();
    }

    return result;
  }

  function resetAll() {
    state.file = null;
    state.fileText = "";
    state.dragActive = false;
    state.selectedPreset = DEFAULT_PRESET;
    state.overrideMappings = {};
    state.targetMode = IMPORT_TARGET_MODES.MERGE_CURRENT_PROJECT;
    state.newProjectName = "";
    state.newProjectId = "";
    state.newProjectIdTouched = false;
    refreshAvailablePresets();
    clearDryRunArtifacts();
    setStatus("idle", "Awaiting file selection for staged validation preview.");
    notify();
  }

  refreshAvailablePresets();

  window.ImportRuntime = {
    DEFAULT_PRESET,
    IMPORT_TARGET_MODES,
    LARGE_MERGE_ROW_THRESHOLD,
    slugifyProjectId,
    subscribe,
    getState: cloneState,
    openShell: function openShell() {
      setOpen(true);
    },
    closeShell: function closeShell() {
      setOpen(false);
    },
    setDragActive,
    refreshAvailablePresets,
    resetAll,
    setErrorState,
    selectFile,
    setSelectedPreset,
    setOverrideMapping,
    clearOverrideMappings,
    setImportTargetMode,
    setNewProjectName,
    setNewProjectId,
    setApplyConfirmationText,
    requestApplyConfirmation,
    cancelApplyConfirmation,
    applyImport,
    runDryRunPipeline
  };
})();
