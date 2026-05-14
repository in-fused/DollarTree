(function importUiReviewModule() {
  const STYLE_ID = "import-ui-review-styles";
  const REVIEW_HOST_ID = "importShellReviewHost";

  function getRuntime() {
    return window.ImportRuntime || null;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .importReviewSection {
        margin-top: 14px;
      }

      .importReviewLabel {
        margin: 0 0 8px;
        font-size: 11px;
        line-height: 1.2;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(195,210,232,0.82);
      }

      .importReviewCard {
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        background: rgba(255,255,255,0.03);
        padding: 12px;
        font-size: 12px;
        line-height: 1.5;
        color: #f5f7fb;
      }

      .importReviewSubsection + .importReviewSubsection {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid rgba(255,255,255,0.06);
      }

      .importReviewTitle {
        margin: 0 0 8px;
        font-size: 11px;
        line-height: 1.2;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(195,210,232,0.82);
      }

      .importReviewList {
        margin: 0;
        padding-left: 18px;
        display: grid;
        gap: 4px;
      }

      .importReviewList li {
        margin: 0;
      }

      .importReviewPill {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 0 9px;
        border-radius: 999px;
        background: rgba(255,255,255,0.07);
        font-size: 11px;
        font-weight: 700;
      }

      .importReviewPill.ready {
        background: rgba(74, 222, 128, 0.18);
        color: #d9ffe6;
      }

      .importReviewPill.warn {
        background: rgba(251, 191, 36, 0.18);
        color: #fff0c4;
      }

      .importReviewPill.blocked {
        background: rgba(248, 113, 113, 0.18);
        color: #ffd7d7;
      }

      .importReviewChipWrap {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .importReviewChip {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 999px;
        padding: 0 9px;
        background: rgba(255,255,255,0.04);
        font-size: 11px;
        line-height: 1.2;
        color: #f5f7fb;
      }
    `;
    document.head.appendChild(style);
  }

  function getModalContent() {
    const modal = document.getElementById("importShellModal");
    if (!modal) return null;
    return modal.querySelector(".importShellContent");
  }

  function ensureHost() {
    const content = getModalContent();
    if (!content) return null;

    let host = document.getElementById(REVIEW_HOST_ID);
    if (host) return host;

    host = document.createElement("section");
    host.id = REVIEW_HOST_ID;
    host.className = "importReviewSection";

    const label = document.createElement("div");
    label.className = "importReviewLabel";
    label.textContent = "Dry-Run Review";

    const card = document.createElement("div");
    card.className = "importReviewCard";
    card.textContent = "Dry-run review will render here after CSV parsing and staging.";

    host.appendChild(label);
    host.appendChild(card);
    content.appendChild(host);

    return host;
  }

  function clearChildren(node) {
    while (node && node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function appendList(section, items) {
    const list = document.createElement("ul");
    list.className = "importReviewList";

    items.forEach((item) => {
      const li = document.createElement("li");

      const strong = document.createElement("strong");
      strong.textContent = `${item.key}: `;

      const span = document.createElement("span");
      span.textContent = item.value;

      li.appendChild(strong);
      li.appendChild(span);
      list.appendChild(li);
    });

    section.appendChild(list);
  }

  function appendChipWrap(section, values, emptyText) {
    if (!values.length) {
      const empty = document.createElement("div");
      empty.textContent = emptyText;
      section.appendChild(empty);
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "importReviewChipWrap";

    values.forEach((value) => {
      const chip = document.createElement("span");
      chip.className = "importReviewChip";
      chip.textContent = value;
      wrap.appendChild(chip);
    });

    section.appendChild(wrap);
  }

  function appendSubsection(card, titleText) {
    const section = document.createElement("div");
    section.className = "importReviewSubsection";

    const title = document.createElement("div");
    title.className = "importReviewTitle";
    title.textContent = titleText;

    section.appendChild(title);
    card.appendChild(section);
    return section;
  }

  function getProceedState(snapshot) {
    const stageResult = snapshot && snapshot.stageResult;
    const summary = stageResult && stageResult.summary;

    if (!summary) {
      return {
        className: "warn",
        text: "Awaiting dry-run execution"
      };
    }

    if (stageResult.canProceed === true && stageResult.isValid === true) {
      return {
        className: "ready",
        text: "Ready to apply after confirmation"
      };
    }

    if ((summary.errorCount || 0) > 0 || (summary.rejectedRowCount || 0) > 0) {
      return {
        className: "blocked",
        text: "Blocked by validation errors"
      };
    }

    return {
      className: "warn",
      text: "Completed with warnings"
    };
  }

  function collectTopIssueCodes(snapshot) {
    const diagnostics = snapshot && snapshot.diagnosticsSummary;
    if (!diagnostics || !Array.isArray(diagnostics.topIssueCodes)) {
      return [];
    }
    return diagnostics.topIssueCodes.slice(0, 8).map((value) => String(value || "").trim()).filter(Boolean);
  }

  function collectUnmappedHeaders(snapshot) {
    const mappingReport = snapshot && snapshot.mappingReport;
    if (!mappingReport || !Array.isArray(mappingReport.unmappedHeaders)) {
      return [];
    }

    return mappingReport.unmappedHeaders
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        return String((entry && entry.sourceHeader) || "").trim();
      })
      .filter(Boolean);
  }

  function collectMissingRequiredMappings(snapshot) {
    const mappingReport = snapshot && snapshot.mappingReport;
    if (!mappingReport || !Array.isArray(mappingReport.missingRequiredFields)) {
      return [];
    }

    return mappingReport.missingRequiredFields
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  }

  function render(snapshot) {
    const host = ensureHost();
    if (!host) return;

    const card = host.querySelector(".importReviewCard");
    if (!card) return;

    clearChildren(card);

    if (!snapshot || !snapshot.file) {
      card.textContent = "Dry-run review will render here after CSV parsing and staging.";
      return;
    }

    const summary = snapshot.stageResult && snapshot.stageResult.summary;
    if (!summary) {
      card.textContent = "No dry-run review is available for the current file selection yet.";
      return;
    }

    const fileSection = appendSubsection(card, "File Overview");
    appendList(fileSection, [
      { key: "Filename", value: String((snapshot.file && snapshot.file.name) || "") },
      { key: "Header Count", value: String((snapshot.parsedHeaders || []).length) },
      { key: "Parsed Row Count", value: String((snapshot.parsedRows || []).length) },
      { key: "Preset Used", value: String(snapshot.selectedPreset || "canonical") }
    ]);

    const mappingSection = appendSubsection(card, "Mapping Overview");
    appendList(mappingSection, [
      { key: "Unmapped Header Count", value: String(summary.unmappedHeaderCount || 0) },
      { key: "Missing Required Mapping Count", value: String(summary.missingRequiredMappingCount || 0) },
      { key: "Duplicate Mapping Count", value: String(summary.duplicateMappingCount || 0) }
    ]);

    const validationSection = appendSubsection(card, "Validation Overview");
    appendList(validationSection, [
      { key: "Accepted Rows", value: String(summary.acceptedRowCount || 0) },
      { key: "Rejected Rows", value: String(summary.rejectedRowCount || 0) },
      { key: "Warnings", value: String(summary.warningCount || 0) },
      { key: "Errors", value: String(summary.errorCount || 0) }
    ]);

    const outcomeSection = appendSubsection(card, "Dry-Run Outcome");
    const proceedState = getProceedState(snapshot);
    const pill = document.createElement("span");
    pill.className = `importReviewPill ${proceedState.className}`;
    pill.textContent = proceedState.text;
    outcomeSection.appendChild(pill);

    const topIssueCodes = collectTopIssueCodes(snapshot);
    if (topIssueCodes.length) {
      const spacer = document.createElement("div");
      spacer.style.marginTop = "8px";
      outcomeSection.appendChild(spacer);
      appendChipWrap(outcomeSection, topIssueCodes, "No issue codes.");
    }

    const unmappedSection = appendSubsection(card, "Unmapped Source Headers");
    appendChipWrap(unmappedSection, collectUnmappedHeaders(snapshot), "None");

    const missingSection = appendSubsection(card, "Missing Required Canonical Mappings");
    appendChipWrap(missingSection, collectMissingRequiredMappings(snapshot), "None");
  }

  function init() {
    const runtime = getRuntime();
    if (!runtime) return;

    ensureStyles();
    ensureHost();
    runtime.subscribe(render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.ImportUIReview = {
    init: init
  };
})();
