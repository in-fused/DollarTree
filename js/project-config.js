/* ================= PROJECT CONFIG ================= */

const DEFAULT_PROJECT_CONFIG = Object.freeze({
  project_type: "operations",
  intelligence_mode: "reset_analytics",
  landing_mode: "operations",
  terminology: Object.freeze({
    storeSingular: "store",
    storePlural: "stores",
    noteSingular: "note",
    notePlural: "notes",
    notesLabel: "Notes",
    noteCoverageLabel: "Note Coverage",
    notesNoPhotosLabel: "Notes, No Photos",
    photosNoNotesLabel: "Photos, No Notes",
    notePlaceholder: "Leave note (optional)...",
    addNoteButton: "Add Note",
    notesEmpty: "No notes yet.",
    notesLoadError: "Unable to load notes.",
    selectedStoreHint: "Tap a store marker to inspect status, notes, and photos.",
    intelligenceTabLabel: "Intelligence",
    intelligenceHeaderLabel: "Intelligence Dashboard",
    progressLabel: "Project Progress"
  }),
  copy: Object.freeze({
    projectPurpose: "",
    headerSublinePrefix: "Operational visibility",
    tcgPurpose: ""
  })
});

const PROJECT_CONFIG_OVERRIDES = Object.freeze({
  "gotta-catch-em-all": Object.freeze({
    project_type: "tcg_tracking",
    intelligence_mode: "tcg_feed",
    landing_mode: "tcg_hunting",
    terminology: Object.freeze({
      noteSingular: "sighting",
      notePlural: "sightings",
      notesLabel: "Store Chatter / Sightings",
      noteCoverageLabel: "Sighting Coverage",
      notesNoPhotosLabel: "Sightings, No Photos",
      photosNoNotesLabel: "Photos, No Sightings",
      notePlaceholder: "Log a restock, new drop, or store sighting...",
      addNoteButton: "Add Sighting",
      notesEmpty: "No sightings or store chatter yet.",
      notesLoadError: "Unable to load store chatter.",
      selectedStoreHint: "Tap a store marker to inspect sightings, freshness, status, and photos.",
      intelligenceTabLabel: "Hunting Intel",
      intelligenceHeaderLabel: "TCG Hunting Intel",
      progressLabel: "Hunt Progress"
    }),
    copy: Object.freeze({
      projectPurpose: "Track retailer sightings, shelf photos, restocks, and store chatter",
      headerSublinePrefix: "TCG hunting intel",
      tcgPurpose: "Track retailer sightings, shelf photos, restocks, and store chatter"
    })
  })
});

const TCG_PROJECT_IDS = Object.freeze(["gotta-catch-em-all"]);

function isPlainProjectConfigObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneProjectConfigValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => cloneProjectConfigValue(item));
  }

  if (isPlainProjectConfigObject(value)) {
    return Object.keys(value).reduce((next, key) => {
      next[key] = cloneProjectConfigValue(value[key]);
      return next;
    }, {});
  }

  return value;
}

function mergeProjectConfig(baseConfig, overrideConfig) {
  const merged = cloneProjectConfigValue(baseConfig || {});
  if (!isPlainProjectConfigObject(overrideConfig)) return merged;

  Object.keys(overrideConfig).forEach(key => {
    const overrideValue = overrideConfig[key];
    if (isPlainProjectConfigObject(overrideValue) && isPlainProjectConfigObject(merged[key])) {
      merged[key] = mergeProjectConfig(merged[key], overrideValue);
      return;
    }

    if (overrideValue !== undefined) {
      merged[key] = cloneProjectConfigValue(overrideValue);
    }
  });

  return merged;
}

function parseProjectConfigOverride(value) {
  if (isPlainProjectConfigObject(value)) return value;
  if (typeof value !== "string") return {};

  const trimmed = value.trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed);
    return isPlainProjectConfigObject(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function getProjectMetaConfigOverride(projectMeta = {}) {
  if (!isPlainProjectConfigObject(projectMeta)) return {};

  const metaConfig = mergeProjectConfig(
    parseProjectConfigOverride(projectMeta.project_config),
    parseProjectConfigOverride(projectMeta.config)
  );

  ["project_type", "intelligence_mode", "landing_mode"].forEach(key => {
    const value = String(projectMeta[key] || "").trim();
    if (value) metaConfig[key] = value;
  });

  if (isPlainProjectConfigObject(projectMeta.terminology)) {
    metaConfig.terminology = mergeProjectConfig(metaConfig.terminology || {}, projectMeta.terminology);
  }

  if (isPlainProjectConfigObject(projectMeta.copy)) {
    metaConfig.copy = mergeProjectConfig(metaConfig.copy || {}, projectMeta.copy);
  }

  return metaConfig;
}

function normalizeProjectConfigId(projectMetaOrProjectId, explicitProjectId) {
  const explicit = String(explicitProjectId || "").trim();
  if (explicit) return explicit;

  if (typeof projectMetaOrProjectId === "string") {
    return projectMetaOrProjectId.trim();
  }

  const metaProjectId = String(projectMetaOrProjectId?.project_id || "").trim();
  if (metaProjectId) return metaProjectId;

  if (typeof currentProjectId !== "undefined") {
    return String(currentProjectId || "").trim();
  }

  return typeof DEFAULT_PROJECT_ID !== "undefined" ? DEFAULT_PROJECT_ID : "";
}

function isTcgProjectId(projectId) {
  return TCG_PROJECT_IDS.includes(String(projectId || "").trim());
}

function sanitizeProjectConfigForProject(config, projectId) {
  const sanitized = mergeProjectConfig(DEFAULT_PROJECT_CONFIG, config);
  sanitized.project_id = String(projectId || "").trim();

  const explicitTcgFeedMode = String(sanitized.intelligence_mode || "") === "tcg_feed";

  if (!isTcgProjectId(projectId) && !explicitTcgFeedMode) {
    const requestedTcgMode = String(sanitized.project_type || "") === "tcg_tracking"
      || String(sanitized.landing_mode || "") === "tcg_hunting";

    if (String(sanitized.project_type || "") === "tcg_tracking") {
      sanitized.project_type = DEFAULT_PROJECT_CONFIG.project_type;
    }
    if (String(sanitized.landing_mode || "") === "tcg_hunting") {
      sanitized.landing_mode = DEFAULT_PROJECT_CONFIG.landing_mode;
    }
    if (requestedTcgMode) {
      sanitized.terminology = cloneProjectConfigValue(DEFAULT_PROJECT_CONFIG.terminology);
      sanitized.copy = cloneProjectConfigValue(DEFAULT_PROJECT_CONFIG.copy);
    }
  }

  return sanitized;
}

function getProjectConfig(projectMetaOrProjectId = null, explicitProjectId = "") {
  const projectMeta = isPlainProjectConfigObject(projectMetaOrProjectId) ? projectMetaOrProjectId : {};
  const projectId = normalizeProjectConfigId(projectMetaOrProjectId, explicitProjectId);
  const metaOverride = getProjectMetaConfigOverride(projectMeta);
  const projectOverride = isTcgProjectId(projectId) ? (PROJECT_CONFIG_OVERRIDES[projectId] || {}) : {};

  return sanitizeProjectConfigForProject(mergeProjectConfig(
    mergeProjectConfig(DEFAULT_PROJECT_CONFIG, metaOverride),
    projectOverride
  ), projectId);
}

function getActiveProjectConfig() {
  if (isPlainProjectConfigObject(currentProjectConfig)) return currentProjectConfig;
  return getProjectConfig(
    typeof currentProjectMeta !== "undefined" ? currentProjectMeta : null,
    typeof currentProjectId !== "undefined" ? currentProjectId : ""
  );
}

function isTcgProjectConfig(config = getActiveProjectConfig()) {
  const configuredProjectId = String(
    config?.project_id
      || (typeof currentProjectId !== "undefined" ? currentProjectId : "")
      || ""
  ).trim();

  return isTcgProjectId(configuredProjectId)
    || String(config?.intelligence_mode || "") === "tcg_feed";
}

function setProjectTextContent(id, value) {
  const el = document.getElementById(id);
  if (el && value !== undefined && value !== null) {
    el.textContent = String(value);
  }
}

function getProjectConfigClassToken(value, fallback) {
  return String(value || fallback || "default")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";
}

function applyProjectTerminologyUi(config = getActiveProjectConfig()) {
  const terminology = config?.terminology || DEFAULT_PROJECT_CONFIG.terminology;

  setProjectTextContent("intelligenceViewBtn", terminology.intelligenceTabLabel || "Intelligence");
  setProjectTextContent("workspaceProgressLabel", terminology.progressLabel || "Project Progress");
  setProjectTextContent("addNoteBtn", terminology.addNoteButton || "Add Note");

  const noteBox = document.getElementById("noteBox");
  if (noteBox) {
    noteBox.placeholder = terminology.notePlaceholder || "Leave note (optional)...";
  }
}

function applyProjectConfigBodyState(config = getActiveProjectConfig()) {
  if (!document.body) return;

  const previousType = document.body.dataset.projectType || "";
  const previousIntelligenceMode = document.body.dataset.intelligenceMode || "";
  const previousLandingMode = document.body.dataset.landingMode || "";

  if (previousType) document.body.classList.remove(`project-type-${previousType}`);
  if (previousIntelligenceMode) document.body.classList.remove(`intelligence-mode-${previousIntelligenceMode}`);
  if (previousLandingMode) document.body.classList.remove(`landing-mode-${previousLandingMode}`);

  const nextType = getProjectConfigClassToken(config?.project_type, DEFAULT_PROJECT_CONFIG.project_type);
  const nextIntelligenceMode = getProjectConfigClassToken(config?.intelligence_mode, DEFAULT_PROJECT_CONFIG.intelligence_mode);
  const nextLandingMode = getProjectConfigClassToken(config?.landing_mode, DEFAULT_PROJECT_CONFIG.landing_mode);

  document.body.dataset.projectType = nextType;
  document.body.dataset.intelligenceMode = nextIntelligenceMode;
  document.body.dataset.landingMode = nextLandingMode;

  document.body.classList.add(`project-type-${nextType}`);
  document.body.classList.add(`intelligence-mode-${nextIntelligenceMode}`);
  document.body.classList.add(`landing-mode-${nextLandingMode}`);
  document.body.classList.toggle("project-mode-tcg", isTcgProjectConfig(config));
}

function updateCurrentProjectConfig(projectMeta = null, projectId = "") {
  currentProjectConfig = getProjectConfig(
    projectMeta || (typeof currentProjectMeta !== "undefined" ? currentProjectMeta : null),
    projectId || (typeof currentProjectId !== "undefined" ? currentProjectId : "")
  );

  applyProjectConfigBodyState(currentProjectConfig);
  applyProjectTerminologyUi(currentProjectConfig);
  return currentProjectConfig;
}

if (typeof window !== "undefined") {
  window.getProjectConfig = getProjectConfig;
  window.getActiveProjectConfig = getActiveProjectConfig;
  window.updateCurrentProjectConfig = updateCurrentProjectConfig;
  window.isTcgProjectConfig = isTcgProjectConfig;
}

updateCurrentProjectConfig(
  typeof currentProjectMeta !== "undefined" ? currentProjectMeta : null,
  typeof currentProjectId !== "undefined" ? currentProjectId : ""
);
