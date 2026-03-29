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
    const elements = getElements();
    const card = elements.card;
    const toggleBtn = elements.toggleBtn;
    const details = elements.details;

    if (!card || !toggleBtn || !details) return;

    card.classList.toggle("exec-summary-collapsed", collapsed);
    card.classList.toggle("exec-summary-expanded", !collapsed);

    toggleBtn.setAttribute("aria-expanded", String(!collapsed));
    toggleBtn.setAttribute(
      "aria-label",
      collapsed ? "Expand executive summary" : "Collapse executive summary"
    );
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
    const elements = getElements();
    const card = elements.card;
    const toggleBtn = elements.toggleBtn;

    if (!card || !toggleBtn || toggleBtn.dataset.execSummaryBound === "true") return;

    toggleBtn.addEventListener("click", function onExecutiveToggleClick(event) {
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
  Phase 11.3 isolated import bootstrap.
  Keeps app.js minimal and loads import feature modules from js/import/.
  Dry-run only. No live data mutation, no apply/commit, no backend writes.
*/
(function importFeatureBootstrap() {
  const MODULE_URLS = [
    "js/import/ingestion-mapper.js",
    "js/import/ingestion-validator.js",
    "js/import/ingestion-stage.js",
    "js/import/ingestion-diagnostics.js",
    "js/import/import-runtime.js",
    "js/import/import-ui-shell.js",
    "js/import/import-ui-review.js",
    "js/import/import-ui-mapping.js"
  ];

  function isModuleAlreadyPresent(url) {
    const scripts = document.querySelectorAll("script[data-import-module='true']");
    for (let i = 0; i < scripts.length; i += 1) {
      if (scripts[i].getAttribute("src") === url) {
        return true;
      }
    }
    return false;
  }

  function loadScriptSequentially(index) {
    if (index >= MODULE_URLS.length) {
      return;
    }

    const url = MODULE_URLS[index];

    if (isModuleAlreadyPresent(url)) {
      loadScriptSequentially(index + 1);
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = false;
    script.defer = false;
    script.dataset.importModule = "true";

    script.addEventListener("load", function onImportModuleLoad() {
      loadScriptSequentially(index + 1);
    });

    script.addEventListener("error", function onImportModuleError(error) {
      console.error("Failed to load import module:", url, error);
    });

    document.body.appendChild(script);
  }

  function initImportFeatureBootstrap() {
    if (document.body && document.body.dataset.importBootstrapBound === "true") return;

    if (document.body) {
      document.body.dataset.importBootstrapBound = "true";
    }

    loadScriptSequentially(0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initImportFeatureBootstrap);
  } else {
    initImportFeatureBootstrap();
  }
})();