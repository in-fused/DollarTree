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
