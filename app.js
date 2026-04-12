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

    if (details.getAttribute("aria-hidden") === "true") return true;
    if (details.getAttribute("aria-hidden") === "false") return false;

    if (toggleBtn.getAttribute("aria-expanded") === "true") return false;
    if (toggleBtn.getAttribute("aria-expanded") === "false") return true;

    if (card.classList.contains("exec-summary-collapsed")) return true;
    if (card.classList.contains("exec-summary-expanded")) return false;

    return true;
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

/*
  Additive runtime behavior for live project logo preview in Project Branding.
  Keeps existing save/RBAC/dropdown/input flows intact.
*/
(function projectBrandLogoPreviewController() {
  function normalizeLogoUrl(value) {
    if (typeof window.normalizeProjectBrandLogoUrl === "function") {
      return window.normalizeProjectBrandLogoUrl(value);
    }

    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) {
      return raw;
    }

    try {
      const parsed = new URL(raw, window.location.origin);
      const protocol = parsed.protocol.toLowerCase();
      if (!["http:", "https:", "data:", "blob:"].includes(protocol)) return "";
      return parsed.href;
    } catch (_) {
      return "";
    }
  }

  function ensurePreviewElements() {
    const brandingRow = document.querySelector(".projectBrandingRow");
    if (!brandingRow) return null;

    let previewBox = document.getElementById("projectBrandLogoPreview");
    let previewImage = document.getElementById("projectBrandLogoPreviewImage");
    let previewState = document.getElementById("projectBrandLogoPreviewState");

    if (!previewBox) {
      previewBox = document.createElement("div");
      previewBox.id = "projectBrandLogoPreview";
      previewBox.className = "projectBrandLogoPreview";
      previewBox.setAttribute("aria-live", "polite");

      previewImage = document.createElement("img");
      previewImage.id = "projectBrandLogoPreviewImage";
      previewImage.className = "projectBrandLogoPreviewImage hidden";
      previewImage.alt = "Project logo preview";

      previewState = document.createElement("div");
      previewState.id = "projectBrandLogoPreviewState";
      previewState.className = "projectBrandLogoPreviewState";
      previewState.textContent = "No logo selected";

      previewBox.appendChild(previewImage);
      previewBox.appendChild(previewState);
      brandingRow.insertAdjacentElement("afterend", previewBox);
    }

    if (!previewImage) previewImage = document.getElementById("projectBrandLogoPreviewImage");
    if (!previewState) previewState = document.getElementById("projectBrandLogoPreviewState");
    if (!previewBox || !previewImage || !previewState) return null;

    if (previewImage.dataset.previewBound !== "true") {
      previewImage.addEventListener("load", () => {
        if (!previewImage.getAttribute("src")) return;
        previewImage.classList.remove("hidden");
        previewState.classList.add("hidden");
        previewBox.classList.remove("is-error");
        previewBox.classList.add("has-image");
      });

      previewImage.addEventListener("error", () => {
        previewImage.removeAttribute("src");
        previewImage.classList.add("hidden");
        previewState.textContent = "Logo unavailable";
        previewState.classList.remove("hidden");
        previewBox.classList.remove("has-image");
        previewBox.classList.add("is-error");
      });

      previewImage.dataset.previewBound = "true";
    }

    return { previewBox, previewImage, previewState };
  }

  function getCurrentLogoInputValue() {
    const input = document.getElementById("projectBrandLogoUrlInput");
    if (input) return String(input.value || "").trim();

    const fallback = window.currentProjectMeta?.brand_logo_url;
    return String(fallback || "").trim();
  }

  function updatePreview(logoValue = null) {
    const refs = ensurePreviewElements();
    if (!refs) return;

    const { previewBox, previewImage, previewState } = refs;
    const normalizedLogoUrl = normalizeLogoUrl(
      logoValue === null ? getCurrentLogoInputValue() : String(logoValue || "").trim()
    );

    if (!normalizedLogoUrl) {
      previewImage.removeAttribute("src");
      previewImage.classList.add("hidden");
      previewState.textContent = "No logo selected";
      previewState.classList.remove("hidden");
      previewBox.classList.remove("has-image", "is-error");
      return;
    }

    previewState.classList.add("hidden");
    previewBox.classList.remove("is-error");
    previewImage.classList.remove("hidden");
    previewImage.alt = `${String(window.currentProjectMeta?.name || window.currentProjectMeta?.project_id || "Project")} logo preview`;

    if (previewImage.getAttribute("src") !== normalizedLogoUrl) {
      previewImage.src = normalizedLogoUrl;
    }
  }

  function bindBrandingInputs() {
    const logoInput = document.getElementById("projectBrandLogoUrlInput");
    if (logoInput && logoInput.dataset.brandPreviewBound !== "true") {
      logoInput.addEventListener("input", () => updatePreview(logoInput.value));
      logoInput.dataset.brandPreviewBound = "true";
    }

    const logoLibrarySelect = document.getElementById("projectBrandLogoLibrarySelect");
    if (logoLibrarySelect && logoLibrarySelect.dataset.brandPreviewBound !== "true") {
      logoLibrarySelect.addEventListener("change", () => {
        const logoInputEl = document.getElementById("projectBrandLogoUrlInput");
        const valueToPreview = logoInputEl ? logoInputEl.value : logoLibrarySelect.value;
        updatePreview(valueToPreview);
      });
      logoLibrarySelect.dataset.brandPreviewBound = "true";
    }
  }

  function patchRefreshProjectAdminPanel() {
    if (typeof window.refreshProjectAdminPanel !== "function") return false;
    if (window.refreshProjectAdminPanel.__brandPreviewPatched === true) return true;

    const originalRefresh = window.refreshProjectAdminPanel;
    const patchedRefresh = async function patchedRefreshProjectAdminPanel(...args) {
      const result = await originalRefresh.apply(this, args);
      bindBrandingInputs();
      updatePreview();
      return result;
    };

    patchedRefresh.__brandPreviewPatched = true;
    window.refreshProjectAdminPanel = patchedRefresh;
    return true;
  }

  function initializeController() {
    bindBrandingInputs();
    ensurePreviewElements();
    updatePreview();
    patchRefreshProjectAdminPanel();
  }

  function bootstrapController() {
    initializeController();

    let attempts = 0;
    const maxAttempts = 60;
    const bootInterval = window.setInterval(() => {
      attempts += 1;
      initializeController();
      if (attempts >= maxAttempts || window.refreshProjectAdminPanel?.__brandPreviewPatched === true) {
        window.clearInterval(bootInterval);
      }
    }, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapController);
  } else {
    bootstrapController();
  }
})();
