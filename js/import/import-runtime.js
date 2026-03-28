(function importRuntimeModule() {
  const DEFAULT_PRESET = "canonical";

  const state = {
    isOpen: false,
    file: null,
    parsedHeaders: [],
    parsedRows: [],
    status: "idle"
  };

  const listeners = new Set();

  function notify() {
    const snapshot = JSON.parse(JSON.stringify(state));
    listeners.forEach((l) => {
      try { l(snapshot); } catch (e) { console.error(e); }
    });
  }

  function subscribe(fn) {
    if (typeof fn !== "function") return () => {};
    listeners.add(fn);
    fn(JSON.parse(JSON.stringify(state)));
    return () => listeners.delete(fn);
  }

  function parseCSV(text) {
    const rows = text.split("\n").map(r => r.split(","));
    return {
      headers: rows[0] || [],
      rows: rows.slice(1)
    };
  }

  function runDryRun() {
    if (!state.file) return;

    try {
      const parsed = parseCSV(state.file);
      state.parsedHeaders = parsed.headers;
      state.parsedRows = parsed.rows;
      state.status = "ok";
    } catch (e) {
      console.error(e);
      state.status = "error";
    }

    notify();
  }

  function selectFile(text) {
    state.file = text;
    runDryRun();
  }

  function open() {
    state.isOpen = true;
    notify();
  }

  function close() {
    state.isOpen = false;
    notify();
  }

  window.ImportRuntime = {
    subscribe,
    open,
    close,
    selectFile
  };
})();