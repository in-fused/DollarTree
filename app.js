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

  function isExecutiveSummaryCollapsed() {
    const elements = getElements();
    const card = elements.card;
    const toggleBtn = elements.toggleBtn;
    const details = elements.details;

    if (!card || !toggleBtn || !details) return true;

    if (card.dataset.execSummaryState === "collapsed") return true;
    if (card.dataset.execSummaryState === "expanded") return false;

    if (details.getAttribute("aria-hidden") === "true") return true;
    if (details.getAttribute("aria-hidden") === "false") return false;

    if (toggleBtn.getAttribute("aria-expanded") === "true") return false;
    if (toggleBtn.getAttribute("aria-expanded") === "false") return true;

    return card.classList.contains("exec-summary-collapsed");
  }

  function applyExecutiveSummaryState(collapsed) {
    const elements = getElements();
    const card = elements.card;
    const toggleBtn = elements.toggleBtn;
    const details = elements.details;

    if (!card || !toggleBtn || !details) return;

    card.classList.toggle("exec-summary-collapsed", collapsed);
    card.classList.toggle("exec-summary-expanded", !collapsed);
    card.dataset.execSummaryState = collapsed ? "collapsed" : "expanded";

    toggleBtn.setAttribute("aria-expanded", String(!collapsed));
    toggleBtn.setAttribute(
      "aria-label",
      collapsed ? "Expand operational summary" : "Collapse operational summary"
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
    const toggleBtn = elements.toggleBtn;

    if (!toggleBtn || toggleBtn.dataset.execSummaryBound === "true") return;

    toggleBtn.addEventListener("click", function onExecutiveToggleClick(event) {
      event.preventDefault();
      event.stopPropagation();

      const collapsed = isExecutiveSummaryCollapsed();
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