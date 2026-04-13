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
  Additive cleanup for legacy hidden header "default project" button.
  Safe no-op when the legacy element is not present.
*/
(function legacyHeaderDefaultProjectButtonCleanup() {
  function getLegacyButtonCandidates() {
    const candidates = [];
    const knownSelectors = [
      "#defaultProjectHeaderBtn",
      "#headerDefaultProjectBtn",
      "#projectDefaultHeaderBtn",
      "button[data-role='default-project-header']"
    ];
    knownSelectors.forEach((selector) => {
      const node = document.querySelector(selector);
      if (node) candidates.push(node);
    });

    document.querySelectorAll(".topHeader button.hidden").forEach((buttonEl) => {
      const text = String(buttonEl.textContent || "").trim().toLowerCase();
      if (text.includes("default project")) {
        candidates.push(buttonEl);
      }
    });

    return Array.from(new Set(candidates));
  }

  function removeLegacyButtons() {
    getLegacyButtonCandidates().forEach((buttonEl) => {
      if (!buttonEl.classList.contains("hidden")) return;
      buttonEl.remove();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", removeLegacyButtons);
    return;
  }
  removeLegacyButtons();
})();

/*
  Additive runtime behavior for live project logo preview in Project Branding.
  Keeps existing save/RBAC/dropdown/input flows intact.
*/
(function projectBrandLogoPreviewController() {
  const BRANDING_STYLE_TAG_ID = "projectBrandingEnhancementsStyle";
  const LOGO_LIBRARY_MANIFEST_PATH = "/logos/library.json";
  const LOGO_LIBRARY_PLACEHOLDER_TEXT = "Logo Library (optional)";
  const LOGO_LIBRARY_FALLBACK_ENTRIES = Object.freeze([
    { label: "Red Bull Rebels", path: "/logos/red-bull-rebels-logo.png" },
    { label: "Meat Market Map", path: "/logos/meat-market-map-logo.png" },
    { label: "Publix SCO Coolers", path: "/logos/publix-sco-coolers-logo.png" },
    { label: "Red Bull Rebels (Legacy Root)", path: "/red-bull-rebels-logo.png" }
  ]);
  const SWATCH_COLORS = Object.freeze([
    "#c8102e",
    "#0ea5e9",
    "#16a34a",
    "#f59e0b",
    "#7c3aed",
    "#ef4444"
  ]);
  let logoLibraryEntries = [...LOGO_LIBRARY_FALLBACK_ENTRIES];
  let logoLibraryLoadPromise = null;
  let logoLibraryLoaded = false;

  function ensureBrandingStyles() {
    if (document.getElementById(BRANDING_STYLE_TAG_ID)) return;

    const styleTag = document.createElement("style");
    styleTag.id = BRANDING_STYLE_TAG_ID;
    styleTag.textContent = `
      .projectBrandingLayout {
        display: grid;
        gap: 10px;
        min-width: 0;
      }

      .projectBrandColorCard {
        display: grid;
        gap: 8px;
        padding: 10px;
        border-radius: 10px;
        border: 1px solid rgba(var(--project-accent-rgb), 0.28);
        background:
          linear-gradient(180deg, rgba(var(--project-accent-rgb), 0.11), rgba(var(--project-accent-rgb), 0.03)),
          rgba(8, 16, 28, 0.72);
      }

      .projectBrandColorHeaderRow {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .projectBrandColorLabel {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: rgba(220, 235, 255, 0.9);
      }

      .projectBrandColorHexValue {
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid rgba(var(--project-accent-rgb), 0.4);
        background: rgba(4, 10, 18, 0.58);
        color: #eef6ff;
      }

      .projectBrandColorControlRow {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .projectBrandColorControlRow #projectBrandColorInput {
        margin-top: 0;
        width: 54px;
        min-width: 54px;
        height: 40px;
        padding: 0;
        border-radius: 9px;
        cursor: pointer;
      }

      .projectBrandAccentPreviewChip {
        --brand-preview-color: var(--project-accent);
        flex: 1;
        min-width: 0;
        padding: 7px 10px;
        border-radius: 9px;
        border: 1px solid var(--brand-preview-color);
        background:
          linear-gradient(115deg, var(--brand-preview-color), transparent 65%),
          rgba(5, 11, 20, 0.62);
      }

      .projectBrandAccentPreviewTitle {
        font-size: 12px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.95);
      }

      .projectBrandAccentPreviewMeta {
        margin-top: 2px;
        font-size: 11px;
        color: rgba(220, 236, 255, 0.78);
      }

      .projectBrandSwatches {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .projectBrandSwatch {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 1px solid rgba(255,255,255,0.35);
        background: var(--swatch-color, #c8102e);
        cursor: pointer;
        padding: 0;
        transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
      }

      .projectBrandSwatch:hover,
      .projectBrandSwatch:focus-visible {
        transform: translateY(-1px);
        border-color: rgba(255,255,255,0.72);
        box-shadow: 0 0 0 2px rgba(var(--project-accent-rgb), 0.34);
      }

      .projectBrandSwatch.is-active {
        border-color: rgba(255,255,255,0.92);
        box-shadow: 0 0 0 2px rgba(255,255,255,0.2), 0 0 0 4px rgba(var(--project-accent-rgb), 0.38);
      }

      .projectBrandingLibraryRow {
        grid-template-columns: minmax(0, 1fr);
        margin-bottom: 0;
      }

      .projectBrandingLibraryRow #projectBrandLogoLibrarySelect {
        margin-top: 0;
      }

      .projectBrandingRow {
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
      }

      .projectBrandingRow #projectBrandLogoUrlInput {
        min-width: 0;
      }

      .projectBrandingRow #projectBrandingSaveBtn {
        margin-top: 0;
        white-space: nowrap;
      }

      .projectBrandLogoPreview {
        margin-top: 0;
      }

      @media (max-width: 760px) {
        .projectBrandingRow {
          grid-template-columns: minmax(0, 1fr);
        }

        .projectBrandColorHeaderRow {
          flex-wrap: wrap;
        }

        .projectBrandColorControlRow {
          align-items: stretch;
        }

        .projectBrandColorControlRow #projectBrandColorInput {
          width: 48px;
          min-width: 48px;
          height: 38px;
        }

        .projectBrandingRow #projectBrandingSaveBtn {
          grid-column: 1 / -1;
        }
      }
    `;
    document.head.appendChild(styleTag);
  }

  function normalizeBrandColor(value) {
    if (typeof window.normalizeProjectBrandColor === "function") {
      return window.normalizeProjectBrandColor(value);
    }

    const raw = String(value || "").trim();
    const hexMatch = raw.match(/^#?([0-9a-f]{6})$/i);
    if (!hexMatch) return "";
    return `#${hexMatch[1].toLowerCase()}`;
  }

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

  function normalizeLogoLibraryEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const label = String(entry.label || "").trim();
    const path = normalizeLogoUrl(entry.path || entry.url || "");
    if (!label || !path) return null;
    return { label, path };
  }

  function getLogoLibraryEntriesFromManifest(payload) {
    const rawEntries = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.logos)
        ? payload.logos
        : [];
    const normalizedEntries = rawEntries
      .map(normalizeLogoLibraryEntry)
      .filter(Boolean);

    return normalizedEntries.length > 0
      ? normalizedEntries
      : [...LOGO_LIBRARY_FALLBACK_ENTRIES];
  }

  async function ensureLogoLibraryManifestLoaded() {
    if (logoLibraryLoaded) return logoLibraryEntries;
    if (logoLibraryLoadPromise) return logoLibraryLoadPromise;

    logoLibraryLoadPromise = (async () => {
      try {
        const response = await fetch(LOGO_LIBRARY_MANIFEST_PATH, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Logo manifest fetch failed (${response.status}).`);
        }
        const payload = await response.json();
        logoLibraryEntries = getLogoLibraryEntriesFromManifest(payload);
      } catch (error) {
        console.warn("Using fallback logo library entries:", error);
        logoLibraryEntries = [...LOGO_LIBRARY_FALLBACK_ENTRIES];
      } finally {
        logoLibraryLoaded = true;
        logoLibraryLoadPromise = null;
      }
      return logoLibraryEntries;
    })();

    return logoLibraryLoadPromise;
  }

  function setLogoLibraryOptions(selectEl, entries) {
    if (!selectEl) return;
    const scopedEntries = Array.isArray(entries) && entries.length > 0
      ? entries
      : [...LOGO_LIBRARY_FALLBACK_ENTRIES];
    const currentValue = String(selectEl.value || "").trim();

    selectEl.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = LOGO_LIBRARY_PLACEHOLDER_TEXT;
    selectEl.appendChild(placeholder);

    scopedEntries.forEach(({ label, path }) => {
      const option = document.createElement("option");
      option.value = path;
      option.textContent = label;
      selectEl.appendChild(option);
    });

    const hasCurrent = Array.from(selectEl.options).some((option) => option.value === currentValue);
    selectEl.value = hasCurrent ? currentValue : "";
  }

  function syncLogoLibrarySelectFromInput(selectEl, logoInputEl) {
    if (!selectEl) return;
    const inputValue = normalizeLogoUrl(
      logoInputEl ? logoInputEl.value : (window.currentProjectMeta?.brand_logo_url || "")
    );
    if (!inputValue) {
      selectEl.value = "";
      return;
    }

    const hasMatch = Array.from(selectEl.options).some((option) => option.value === inputValue);
    selectEl.value = hasMatch ? inputValue : "";
  }

  function refreshLogoLibrarySelect(selectEl, logoInputEl) {
    if (!selectEl) return;
    setLogoLibraryOptions(selectEl, logoLibraryEntries);
    syncLogoLibrarySelectFromInput(selectEl, logoInputEl);

    ensureLogoLibraryManifestLoaded()
      .then((entries) => {
        if (!document.body?.contains(selectEl)) return;
        setLogoLibraryOptions(selectEl, entries);
        syncLogoLibrarySelectFromInput(selectEl, logoInputEl);
        updatePreview();
      })
      .catch(() => {
        // Keep fallback entries; no further action needed.
      });
  }

  window.syncProjectLogoLibrarySelectFromManifest = function syncProjectLogoLibrarySelectFromManifest(selectEl, logoUrlValue) {
    if (!selectEl) return;
    syncLogoLibrarySelectFromInput(selectEl, { value: String(logoUrlValue || "") });
  };

  window.refreshProjectLogoLibrarySelectFromManifest = function refreshProjectLogoLibrarySelectFromManifest(selectEl, logoInputEl) {
    refreshLogoLibrarySelect(selectEl, logoInputEl);
  };

  function ensureBrandingUiShell() {
    ensureBrandingStyles();

    const colorInput = document.getElementById("projectBrandColorInput");
    const logoLibraryRow = document.querySelector(".projectBrandingLibraryRow");
    const brandingRow = document.querySelector(".projectBrandingRow");
    if (!colorInput || !logoLibraryRow || !brandingRow) return null;

    let layout = document.querySelector(".projectBrandingLayout");
    if (!layout) {
      layout = document.createElement("div");
      layout.className = "projectBrandingLayout";
      logoLibraryRow.insertAdjacentElement("beforebegin", layout);
    }

    if (logoLibraryRow.parentElement !== layout) {
      layout.appendChild(logoLibraryRow);
    }
    if (brandingRow.parentElement !== layout) {
      layout.appendChild(brandingRow);
    }

    let colorCard = layout.querySelector(".projectBrandColorCard");
    if (!colorCard) {
      colorCard = document.createElement("div");
      colorCard.className = "projectBrandColorCard";
      layout.insertBefore(colorCard, layout.firstChild || null);
    }

    let colorHeaderRow = colorCard.querySelector(".projectBrandColorHeaderRow");
    if (!colorHeaderRow) {
      colorHeaderRow = document.createElement("div");
      colorHeaderRow.className = "projectBrandColorHeaderRow";
      colorCard.appendChild(colorHeaderRow);
    }

    let colorLabel = colorHeaderRow.querySelector(".projectBrandColorLabel");
    if (!colorLabel) {
      colorLabel = document.createElement("div");
      colorLabel.className = "projectBrandColorLabel";
      colorHeaderRow.appendChild(colorLabel);
    }
    colorLabel.textContent = "Project Accent Color";

    let colorHexValue = document.getElementById("projectBrandColorHexValue");
    if (!colorHexValue) {
      colorHexValue = document.createElement("div");
      colorHexValue.id = "projectBrandColorHexValue";
      colorHexValue.className = "projectBrandColorHexValue";
      colorHexValue.setAttribute("aria-live", "polite");
      colorHexValue.textContent = "#C8102E";
      colorHeaderRow.appendChild(colorHexValue);
    } else if (colorHexValue.parentElement !== colorHeaderRow) {
      colorHeaderRow.appendChild(colorHexValue);
    }

if (colorHexValue && colorHexValue.dataset.copyBound !== "true") {
  colorHexValue.style.cursor = "pointer";
  colorHexValue.title = "Click to copy";

  colorHexValue.addEventListener("click", () => {
    const value = colorHexValue.textContent;
    if (!value) return;

    navigator.clipboard.writeText(value).catch(() => {});

    colorHexValue.textContent = "Copied!";
    setTimeout(() => {
      updateColorPreviewUi();
    }, 900);
  });

  colorHexValue.dataset.copyBound = "true";
}

    let colorControlRow = colorCard.querySelector(".projectBrandColorControlRow");
    if (!colorControlRow) {
      colorControlRow = document.createElement("div");
      colorControlRow.className = "projectBrandColorControlRow";
      colorCard.appendChild(colorControlRow);
    }

    if (colorInput.parentElement !== colorControlRow) {
      colorControlRow.appendChild(colorInput);
    }

    let accentPreviewChip = document.getElementById("projectBrandAccentPreviewChip");
    if (!accentPreviewChip) {
      accentPreviewChip = document.createElement("div");
      accentPreviewChip.id = "projectBrandAccentPreviewChip";
      accentPreviewChip.className = "projectBrandAccentPreviewChip";

      const accentTitle = document.createElement("div");
      accentTitle.className = "projectBrandAccentPreviewTitle";
      accentTitle.textContent = "Live accent preview";

      const accentMeta = document.createElement("div");
      accentMeta.className = "projectBrandAccentPreviewMeta";
      accentMeta.textContent = "Buttons and highlights";

      accentPreviewChip.appendChild(accentTitle);
      accentPreviewChip.appendChild(accentMeta);
      colorControlRow.appendChild(accentPreviewChip);
    } else if (accentPreviewChip.parentElement !== colorControlRow) {
      colorControlRow.appendChild(accentPreviewChip);
    }

    let swatchRow = colorCard.querySelector(".projectBrandSwatches");
    if (!swatchRow) {
      swatchRow = document.createElement("div");
      swatchRow.className = "projectBrandSwatches";
      swatchRow.setAttribute("role", "list");
      swatchRow.setAttribute("aria-label", "Preset accent colors");
      colorCard.appendChild(swatchRow);
    }

    const existingSwatchColors = new Set(
      Array.from(swatchRow.querySelectorAll(".projectBrandSwatch[data-brand-color]"))
        .map((node) => normalizeBrandColor(node.dataset.brandColor || ""))
        .filter(Boolean)
    );

    SWATCH_COLORS.forEach((swatchColor) => {
      if (existingSwatchColors.has(swatchColor)) return;
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "projectBrandSwatch";
      swatch.dataset.brandColor = swatchColor;
      swatch.style.setProperty("--swatch-color", swatchColor);
      swatch.setAttribute("aria-label", `Select accent ${swatchColor.toUpperCase()}`);
      swatchRow.appendChild(swatch);
    });

    return { colorInput };
  }

  function getColorControlRefs() {
    return {
      colorInput: document.getElementById("projectBrandColorInput"),
      colorHexValue: document.getElementById("projectBrandColorHexValue"),
      accentPreviewChip: document.getElementById("projectBrandAccentPreviewChip"),
      swatches: Array.from(document.querySelectorAll(".projectBrandSwatch[data-brand-color]"))
    };
  }

  function updateColorPreviewUi(colorValue = null) {
    ensureBrandingUiShell();
    const { colorInput, colorHexValue, accentPreviewChip, swatches } = getColorControlRefs();
    if (!colorInput) return;

    const normalizedColor = normalizeBrandColor(
      colorValue === null ? String(colorInput.value || "").trim() : String(colorValue || "").trim()
    ) || "#c8102e";

    if (normalizeBrandColor(colorInput.value) !== normalizedColor) {
      colorInput.value = normalizedColor;
    }

    if (colorHexValue) {
      colorHexValue.textContent = normalizedColor.toUpperCase();
    }

    if (accentPreviewChip) {
      accentPreviewChip.style.setProperty("--brand-preview-color", normalizedColor);
    }

    swatches.forEach((swatch) => {
      const swatchColor = normalizeBrandColor(swatch.dataset.brandColor || "");
      if (swatchColor) {
        swatch.style.setProperty("--swatch-color", swatchColor);
      }
      swatch.classList.toggle("is-active", swatchColor === normalizedColor);
      swatch.disabled = colorInput.disabled;
    });
  }

  function ensurePreviewElements() {
    ensureBrandingUiShell();
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
    ensureBrandingUiShell();
    const colorInput = document.getElementById("projectBrandColorInput");
    if (colorInput && colorInput.dataset.brandColorPreviewBound !== "true") {
      colorInput.addEventListener("input", () => updateColorPreviewUi(colorInput.value));
      colorInput.addEventListener("change", () => updateColorPreviewUi(colorInput.value));
      colorInput.dataset.brandColorPreviewBound = "true";
    }

    const swatches = document.querySelectorAll(".projectBrandSwatch[data-brand-color]");
    swatches.forEach((swatch) => {
      if (swatch.dataset.bound === "true") return;
      swatch.addEventListener("click", () => {
        const inputEl = document.getElementById("projectBrandColorInput");
        if (!inputEl || inputEl.disabled) return;
        const swatchColor = normalizeBrandColor(swatch.dataset.brandColor || "");
        if (!swatchColor) return;
        inputEl.value = swatchColor;
        updateColorPreviewUi(swatchColor);
      });
      swatch.dataset.bound = "true";
    });

    const logoInput = document.getElementById("projectBrandLogoUrlInput");
    if (logoInput && logoInput.dataset.brandPreviewBound !== "true") {
      logoInput.addEventListener("input", () => updatePreview(logoInput.value));
      logoInput.dataset.brandPreviewBound = "true";
    }

    const logoLibrarySelect = document.getElementById("projectBrandLogoLibrarySelect");
    if (logoLibrarySelect) {
      refreshLogoLibrarySelect(logoLibrarySelect, logoInput);
    }
    if (logoLibrarySelect && logoLibrarySelect.dataset.brandPreviewBound !== "true") {
      logoLibrarySelect.addEventListener("change", () => {
        const logoInputEl = document.getElementById("projectBrandLogoUrlInput");
        const valueToPreview = logoInputEl ? logoInputEl.value : logoLibrarySelect.value;
        updatePreview(valueToPreview);
      });
      logoLibrarySelect.dataset.brandPreviewBound = "true";
    }

    if (logoInput && logoInput.dataset.logoLibrarySyncBound !== "true") {
      logoInput.addEventListener("input", () => {
        const selectEl = document.getElementById("projectBrandLogoLibrarySelect");
        syncLogoLibrarySelectFromInput(selectEl, logoInput);
      });
      logoInput.dataset.logoLibrarySyncBound = "true";
    }
  }

  function patchRefreshProjectAdminPanel() {
    if (typeof window.refreshProjectAdminPanel !== "function") return false;
    if (window.refreshProjectAdminPanel.__brandPreviewPatched === true) return true;

    const originalRefresh = window.refreshProjectAdminPanel;
    const patchedRefresh = async function patchedRefreshProjectAdminPanel(...args) {
      const result = await originalRefresh.apply(this, args);
      bindBrandingInputs();
      updateColorPreviewUi();
      updatePreview();
      ensureBrandingUiShell();

      return result;
    };

    patchedRefresh.__brandPreviewPatched = true;
    window.refreshProjectAdminPanel = patchedRefresh;
    return true;
  }

  function initializeController() {
    ensureBrandingUiShell();
    bindBrandingInputs();
    updateColorPreviewUi();
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
