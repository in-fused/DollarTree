(function importRuntimeModule() {
  const DEFAULT_PRESET = "canonical";
  const FALLBACK_PRESETS = [
    { id: "canonical", label: "Default / Canonical" },
    { id: "store-number-heavy", label: "Store-Number-Heavy" },
    { id: "address-heavy", label: "Address-Heavy" }
  ];

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
    statusLevel: "idle",
    statusMessage: "Awaiting file selection for staged validation preview."
  };

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
      statusLevel: state.statusLevel,
      statusMessage: state.statusMessage
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

  function clearDryRunArtifacts() {
    state.parsedHeaders = [];
    state.parsedRows = [];
    state.mappingReport = null;
    state.headerReport = null;
    state.stageResult = null;
    state.diagnosticsSummary = null;
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
        setStatus("ok", "Dry-run completed successfully. Results are shell-local only and were not applied.");
      } else if (
        (state.stageResult.summary && state.stageResult.summary.errorCount) ||
        (state.stageResult.summary && state.stageResult.summary.rejectedRowCount)
      ) {
        setStatus("error", "Dry-run blocked by validation errors. Review staged results below.");
      } else {
        setStatus("warn", "Dry-run completed with warnings. No live project data was modified.");
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

  function resetAll() {
    state.file = null;
    state.fileText = "";
    state.dragActive = false;
    state.selectedPreset = DEFAULT_PRESET;
    state.overrideMappings = {};
    refreshAvailablePresets();
    clearDryRunArtifacts();
    setStatus("idle", "Awaiting file selection for staged validation preview.");
    notify();
  }

  refreshAvailablePresets();

  window.ImportRuntime = {
    DEFAULT_PRESET,
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
    selectFile,
    setSelectedPreset,
    setOverrideMapping,
    clearOverrideMappings,
    runDryRunPipeline
  };
})();