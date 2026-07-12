/* ================= AUTH ================= */
let inviteDeepLinkContext = null;
let inviteDeepLinkProjectNameLookupStarted = false;
let inviteDeepLinkAcceptedProjectId = "";
let inviteDeepLinkSelectedAccessProjectId = "";
const inviteDeepLinkProjectNameCache = {};
let authStateRefreshQueue = Promise.resolve();
let authStateSubscription = null;
let authInitializationPromise = null;
let authSignupsEnabled = null;
let credentialAuthPromise = null;
let authProfileHydrationPending = false;
let authProfileHydrationFailed = false;
let authProjectRefreshToken = 0;

function getAuthErrorMessage(error, fallbackMessage = "Authentication failed.") {
  const message = String(error?.message || error || "").trim();
  const normalized = message.toLowerCase();

  if (
    error?.code === "ACTION_TIMEOUT"
    || error?.name === "TimeoutError"
    || normalized.includes("load failed")
    || normalized.includes("failed to fetch")
    || normalized.includes("fetch failed")
    || normalized.includes("network request failed")
    || normalized.includes("networkerror")
    || normalized.includes("network error")
  ) {
    return "Unable to reach the sign-in service. Check your connection and try again. If this persists, the service may still be waking up.";
  }

  if (
    normalized.includes("signup is disabled")
    || normalized.includes("signups not allowed")
    || normalized.includes("signup_disabled")
  ) {
    return "Account creation is currently disabled. Ask a project administrator to create or invite your account.";
  }

  return message || fallbackMessage;
}

function updateAuthSignupAvailability() {
  const createAccountBtn = document.getElementById("createAccountBtn");
  if (!createAccountBtn) return;

  const signupsDisabled = authSignupsEnabled === false;
  createAccountBtn.classList.toggle("hidden", signupsDisabled);
  createAccountBtn.disabled = signupsDisabled;
  createAccountBtn.setAttribute("aria-hidden", String(signupsDisabled));
}

function setCredentialAuthBusy(activeButtonId = "", busyLabel = "") {
  ["signInBtn", "createAccountBtn"].forEach(buttonId => {
    const button = document.getElementById(buttonId);
    if (!button) return;
    if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent || "";
    button.dataset.authLoading = "true";
    button.disabled = true;
    if (buttonId === activeButtonId && busyLabel) button.textContent = busyLabel;
  });
}

function clearCredentialAuthBusy() {
  ["signInBtn", "createAccountBtn"].forEach(buttonId => {
    const button = document.getElementById(buttonId);
    if (!button) return;
    button.dataset.authLoading = "false";
    button.disabled = buttonId === "createAccountBtn" && authSignupsEnabled === false;
    button.textContent = button.dataset.idleLabel || (buttonId === "signInBtn" ? "Sign In" : "Create Account");
  });
}

async function refreshAuthSignupAvailability() {
  const { data, error } = await dataLayer.getAuthSettings();
  if (error) {
    console.warn("Auth settings check skipped:", error);
    return;
  }

  authSignupsEnabled = data?.disable_signup !== true;
  updateAuthSignupAvailability();
  renderInviteDeepLinkState();
}

function normalizeInviteDeepLinkProjectId(value) {
  return String(value || "").trim();
}

function normalizeInviteDeepLinkTarget(value) {
  const raw = String(value || "").trim();
  if (!raw) return { type: "email", value: "", displayValue: "" };

  if (isLikelyEmail(raw)) {
    const email = raw.toLowerCase();
    return { type: "email", value: email, displayValue: email };
  }

  const phone = normalizePhoneForStorage(raw);
  return {
    type: "phone",
    value: phone,
    displayValue: phone || raw
  };
}

function getInviteDeepLinkContext() {
  if (inviteDeepLinkContext !== null) return inviteDeepLinkContext;

  let params;
  try {
    params = new URLSearchParams(window.location.search || "");
  } catch (_) {
    inviteDeepLinkContext = null;
    return null;
  }

  const projectId = normalizeInviteDeepLinkProjectId(params.get("inviteProject"));
  const target = normalizeInviteDeepLinkTarget(params.get("inviteTarget"));
  if (!projectId || !target.value) {
    inviteDeepLinkContext = null;
    return null;
  }

  inviteDeepLinkContext = {
    projectId,
    targetType: target.type,
    targetValue: target.value,
    targetDisplayValue: target.displayValue
  };
  return inviteDeepLinkContext;
}

function hasInviteDeepLinkContext() {
  return !!getInviteDeepLinkContext();
}

function getLoadedProjectName(projectId) {
  const scopedProjectId = String(projectId || "").trim();
  if (!scopedProjectId) return "";

  if (currentProjectMeta?.project_id === scopedProjectId && currentProjectMeta?.name) {
    return String(currentProjectMeta.name || "").trim();
  }

  const project = [
    ...(Array.isArray(projectList) ? projectList : []),
    ...(Array.isArray(allProjectList) ? allProjectList : [])
  ].find(row => String(row?.project_id || "").trim() === scopedProjectId);

  return String(project?.name || "").trim();
}

async function lookupInviteProjectName(projectId) {
  const scopedProjectId = String(projectId || "").trim();
  if (!scopedProjectId || inviteDeepLinkProjectNameLookupStarted) return;
  inviteDeepLinkProjectNameLookupStarted = true;

  try {
    const response = await fetch(PROJECTS_FILE, { cache: "no-store" });
    if (!response.ok) return;
    const projects = await response.json();
    if (!Array.isArray(projects)) return;

    const project = projects.find(row => String(row?.project_id || "").trim() === scopedProjectId);
    const projectName = String(project?.name || "").trim();
    if (projectName) {
      inviteDeepLinkProjectNameCache[scopedProjectId] = projectName;
      renderInviteDeepLinkState();
    }
  } catch (error) {
    console.warn("Invite project name lookup skipped:", error);
  }
}

function getInviteProjectDisplayName(context = getInviteDeepLinkContext()) {
  const projectId = String(context?.projectId || "").trim();
  if (!projectId) return "this project";

  const loadedName = getLoadedProjectName(projectId);
  if (loadedName) {
    inviteDeepLinkProjectNameCache[projectId] = loadedName;
    return loadedName;
  }

  if (inviteDeepLinkProjectNameCache[projectId]) {
    return inviteDeepLinkProjectNameCache[projectId];
  }

  lookupInviteProjectName(projectId);
  return projectId;
}

function getInviteRowTargetType(invite = {}) {
  return String(invite?.invite_target_type || (invite?.phone || invite?.target_phone ? "phone" : "email")).trim().toLowerCase() === "phone"
    ? "phone"
    : "email";
}

function getInviteRowTargetValue(invite = {}, targetType = "") {
  const normalizedTargetType = String(targetType || getInviteRowTargetType(invite)).trim().toLowerCase() === "phone"
    ? "phone"
    : "email";

  if (normalizedTargetType === "phone") {
    return normalizePhoneForStorage(invite?.phone || invite?.target_phone || "");
  }

  return String(invite?.email || invite?.target_email || "").trim().toLowerCase();
}

function getCurrentInviteIdentityTargets() {
  const emails = new Set();
  const phones = new Set();
  const addEmail = value => {
    const email = String(value || "").trim().toLowerCase();
    if (email) emails.add(email);
  };
  const addPhone = value => {
    const phone = normalizePhoneForStorage(value || "");
    if (phone) phones.add(phone);
  };

  addEmail(currentUser?.email);
  // A profile phone is user-editable. Only Supabase Auth's verified identity
  // can be used to match a phone-targeted invite.
  addPhone(currentUser?.phone);

  return { emails, phones };
}

function getDeepLinkedInviteForCurrentUser(context = getInviteDeepLinkContext()) {
  if (!context || !isSignedIn()) return null;

  const identities = getCurrentInviteIdentityTargets();
  return (Array.isArray(pendingProjectInvites) ? pendingProjectInvites : []).find(invite => {
    const projectId = String(invite?.project_id || "").trim();
    if (projectId !== context.projectId) return false;

    const targetType = getInviteRowTargetType(invite);
    const targetValue = getInviteRowTargetValue(invite, targetType);
    if (!targetValue) {
      return context.targetType === "phone"
        ? identities.phones.has(context.targetValue)
        : identities.emails.has(context.targetValue);
    }

    if (targetType !== context.targetType || targetValue !== context.targetValue) return false;
    if (targetType === "phone") return identities.phones.has(targetValue);
    return identities.emails.has(targetValue);
  }) || null;
}

function setInviteLandingStatus(message = "", type = "") {
  const el = document.getElementById("inviteLandingStatus");
  if (!el) return;

  el.className = "authMessage";
  if (type === "success") el.classList.add("authSuccess");
  if (type === "error") el.classList.add("authError");
  el.textContent = message;
}

function applyInviteDeepLinkToAuthInputs() {
  const context = getInviteDeepLinkContext();
  if (!context || context.targetType !== "email") return;

  const emailInput = document.getElementById("authEmail");
  if (emailInput && !String(emailInput.value || "").trim()) {
    emailInput.value = context.targetValue;
  }
}

function focusInviteAuthPanel() {
  const accessSection = document.querySelector(".sidebar-section[data-section='access']");
  accessSection?.classList.remove("collapsed");

  if (isMobileViewport()) {
    document.body?.classList.add("sidebar-open");
  }
}

function renderInviteDeepLinkState() {
  const context = getInviteDeepLinkContext();
  const panel = document.getElementById("inviteLandingPanel");
  const title = document.getElementById("inviteLandingTitle");
  const body = document.getElementById("inviteLandingBody");
  const meta = document.getElementById("inviteLandingMeta");
  const acceptBtn = document.getElementById("inviteLandingAcceptBtn");
  if (!panel || !title || !body || !meta || !acceptBtn) return;

  const hasContext = !!context;
  panel.classList.toggle("hidden", !hasContext);
  document.body?.classList.toggle("invite-landing-active", hasContext && !isSignedIn());

  if (!hasContext) {
    acceptBtn.classList.add("hidden");
    acceptBtn.removeAttribute("data-invite-ref");
    acceptBtn.removeAttribute("data-project-id");
    setInviteLandingStatus("");
    return;
  }

  focusInviteAuthPanel();
  applyInviteDeepLinkToAuthInputs();

  const projectName = getInviteProjectDisplayName(context);
  title.textContent = `You’ve been invited to ${projectName}`;
  meta.textContent = context.targetType === "phone"
    ? `Invited phone: ${context.targetDisplayValue}`
    : `Invited email: ${context.targetDisplayValue}`;

  acceptBtn.classList.add("hidden");
  acceptBtn.removeAttribute("data-invite-ref");
  acceptBtn.removeAttribute("data-project-id");
  acceptBtn.textContent = "Accept Invite";

  if (!isSignedIn()) {
    body.textContent = context.targetType === "phone"
      ? "Sign in with the invited account to continue. Phone invites require an administrator to verify the account before access can be granted."
      : (
          authSignupsEnabled === false
            ? "Sign in with the invited email to accept. Ask a project administrator if you need an account."
            : "Sign in or create an account with the invited email to accept."
        );
    setInviteLandingStatus("");
    return;
  }

  const matchingInvite = getDeepLinkedInviteForCurrentUser(context);
  if (matchingInvite) {
    const inviteRef = typeof getInviteActionRef === "function"
      ? getInviteActionRef(matchingInvite)
      : String(matchingInvite?.invite_ref || matchingInvite?._invite_ref || "").trim();
    body.textContent = "Invite found for your account. Accept it to join this project.";
    acceptBtn.dataset.projectId = context.projectId;
    if (inviteRef) acceptBtn.dataset.inviteRef = inviteRef;
    acceptBtn.classList.remove("hidden");
    setInviteLandingStatus("");
    return;
  }

  if (canAccessProject(context.projectId)) {
    body.textContent = "This account already has access to the invited project.";
    const selectedProjectId = String(currentProjectId || "").trim();
    const statusMessage = selectedProjectId === context.projectId
      ? `${projectName} is selected.`
      : (
          inviteDeepLinkAcceptedProjectId === context.projectId
            ? `${projectName} is now selected.`
            : `Opening ${projectName}...`
        );
    setInviteLandingStatus(statusMessage, "success");

    if (
      inviteDeepLinkSelectedAccessProjectId !== context.projectId &&
      String(currentProjectId || "").trim() !== context.projectId &&
      typeof refreshProjectAccessAfterAuthChange === "function"
    ) {
      inviteDeepLinkSelectedAccessProjectId = context.projectId;
      currentProjectId = context.projectId;
      localStorage.setItem(ACTIVE_PROJECT_KEY, context.projectId);
      refreshProjectAccessAfterAuthChange().then(() => {
        updateAuthUI();
      }).catch(error => {
        console.warn("Invite project selection skipped:", error);
      });
    }
    return;
  }

  const currentEmail = String(currentUser?.email || "").trim();
  body.textContent = "No pending invite was found for the signed-in account.";
  setInviteLandingStatus(
    currentEmail
      ? `Signed in as ${currentEmail}. Sign out and use the invited account to accept this invite.`
      : "Sign out and use the invited account to accept this invite.",
    "error"
  );
}

function resetSignedOutAuthState() {
  currentProfile = null;
  currentRole = "viewer";
  currentProjectRole = "viewer";
  projectMemberships = [];
  projectMembershipByProjectId = {};
  profileEmailByUserId = {};
  pendingProjectInvites = [];
  projectMembershipsLoaded = false;
  projectMembershipsLoadError = null;
}

async function hydrateAuthSession(session = null, options = {}) {
  const { refreshProjects = true } = options;
  const refreshToken = ++authProjectRefreshToken;
  if (typeof activeProjectHydrationToken !== "undefined") {
    activeProjectHydrationToken += 1;
  }
  currentSession = session || null;
  currentUser = currentSession?.user || null;
  resetSignedOutAuthState();
  authProfileHydrationPending = !!currentUser;
  authProfileHydrationFailed = false;

  if (currentUser) {
    const currentUserId = String(currentUser.id || "").trim();
    const currentUserEmail = String(currentUser.email || "").trim();
    if (currentUserId && currentUserEmail) {
      profileEmailByUserId[currentUserId] = currentUserEmail;
    }
    // Reflect the new session immediately; role and project hydration are
    // bounded follow-up work and must not leave the credential panel stale.
    updateAuthUI();
    updateWriteAccessUI();
    try {
      await loadCurrentUserRole();
    } finally {
      authProfileHydrationPending = false;
      updateAuthUI();
      updateWriteAccessUI();
    }
    await loadCurrentUserProjectAccess();
  }

  updateAuthUI();
  updateWriteAccessUI();

  if (typeof window.ImportUIShell?.retryOpenIntent === "function") {
    window.ImportUIShell.retryOpenIntent();
  }

  if (refreshProjects && typeof refreshProjectAccessAfterAuthChange === "function") {
    Promise.resolve().then(() => {
      if (refreshToken !== authProjectRefreshToken) return null;
      return refreshProjectAccessAfterAuthChange({
        isCurrent: () => refreshToken === authProjectRefreshToken
      });
    }).catch(error => {
      if (refreshToken !== authProjectRefreshToken) return;
      console.error("Project access refresh after auth change failed:", error);
      setAuthMessage(getAuthErrorMessage(error, "Unable to refresh project data."), "error");
    });
  }
}

function queueAuthStateRefresh(session = null) {
  const queuedSession = session || null;
  authStateRefreshQueue = authStateRefreshQueue
    .catch(error => {
      console.error("Previous auth refresh failed:", error);
    })
    .then(() => new Promise(resolve => window.setTimeout(resolve, 0)))
    .then(() => hydrateAuthSession(queuedSession))
    .catch(error => {
      console.error("Auth state refresh failed:", error);
      setAuthMessage(getAuthErrorMessage(error, "Unable to refresh account access."), "error");
    });

  return authStateRefreshQueue;
}

async function runAuthInitialization() {
  const { data, error } = await dataLayer.getSession();

  if (error) {
    console.error("Auth session error:", error);
    setAuthMessage(getAuthErrorMessage(error, "Unable to check the saved session."), "error");
  }

  await hydrateAuthSession(data?.session || null, { refreshProjects: false });

  if (!authStateSubscription) {
    authStateSubscription = dataLayer.onAuthStateChange((event, session) => {
      const currentUserId = String(currentUser?.id || "").trim();
      const nextUserId = String(session?.user?.id || "").trim();
      if (event === "INITIAL_SESSION" && currentUserId === nextUserId) return;

      // Supabase warns against awaiting client calls inside this callback.
      // Queue the refresh after the callback returns to avoid auth-lock deadlocks.
      queueAuthStateRefresh(session || null);
    });
  }

  refreshAuthSignupAvailability().catch(settingsError => {
    console.warn("Auth signup availability check failed:", settingsError);
  });
}

function initializeAuth() {
  if (!authInitializationPromise) {
    authInitializationPromise = runAuthInitialization().catch(error => {
      authInitializationPromise = null;
      throw error;
    });
  }

  return authInitializationPromise;
}

async function loadCurrentUserRole() {
  if (!currentUser) {
    currentProfile = null;
    currentRole = "viewer";
    return;
  }

  const { data, error } = await dataLayer.getProfileRole(currentUser.id);

  if (error) {
    console.error("Profile lookup failed:", error);
    currentProfile = null;
    currentRole = "viewer";
    const normalizedError = String(error?.message || "").toLowerCase();
    const profileIsMissing = error?.code === "PGRST116"
      || (error?.status === 406 && normalizedError.includes("row"));
    authProfileHydrationFailed = !profileIsMissing;
    if (authProfileHydrationFailed) {
      setAuthMessage(getAuthErrorMessage(error, "Signed in, but the profile could not be loaded. Reload to retry."), "error");
    }
    return;
  }

  currentProfile = data || null;
  currentRole = normalizeRole(data?.role);
  authProfileHydrationFailed = false;
}

async function loadCurrentUserProjectAccess() {
  projectMemberships = [];
  projectMembershipByProjectId = {};
  pendingProjectInvites = [];
  projectMembershipsLoaded = false;
  projectMembershipsLoadError = null;

  if (!currentUser) {
    currentProjectRole = "viewer";
    return;
  }

  const membershipResult = await dataLayer.loadProjectMembershipsForUser(currentUser.id);
  if (membershipResult.error) {
    console.error("Project membership lookup failed:", membershipResult.error);
    projectMembershipsLoadError = membershipResult.error;
  } else {
    projectMemberships = Array.isArray(membershipResult.data) ? membershipResult.data : [];
    projectMembershipByProjectId = {};
    projectMemberships.forEach(row => {
      const projectId = String(row.project_id || "").trim();
      if (!projectId) return;
      projectMembershipByProjectId[projectId] = row;
    });
    projectMembershipsLoaded = true;
  }

  const invitesResult = await dataLayer.loadPendingProjectInvitesForCurrentUser();
  if (invitesResult.error) {
    console.error("Pending invite lookup failed:", invitesResult.error);
  } else {
    pendingProjectInvites = Array.isArray(invitesResult.data) ? invitesResult.data : [];
  }

  refreshCurrentProjectRole();
}

function bindAuthUI() {
  const signInBtn = document.getElementById("signInBtn");
  const loggedOutPanel = document.getElementById("authLoggedOut");
  let createAccountBtn = document.getElementById("createAccountBtn");
  const signOutBtn = document.getElementById("signOutBtn");

  if (!createAccountBtn && signInBtn && loggedOutPanel) {
    createAccountBtn = document.createElement("button");
    createAccountBtn.id = "createAccountBtn";
    createAccountBtn.type = "button";
    createAccountBtn.className = "btnSecondary";
    createAccountBtn.textContent = "Create Account";
    createAccountBtn.style.marginTop = "7px";
    loggedOutPanel.appendChild(createAccountBtn);
  }

  if (signInBtn && !signInBtn.dataset.bound) {
    signInBtn.addEventListener("click", signIn);
    signInBtn.dataset.bound = "true";
  }

  if (createAccountBtn && !createAccountBtn.dataset.bound) {
    createAccountBtn.addEventListener("click", createAccount);
    createAccountBtn.dataset.bound = "true";
  }

  if (signOutBtn && !signOutBtn.dataset.bound) {
    signOutBtn.addEventListener("click", signOut);
    signOutBtn.dataset.bound = "true";
  }

  const passwordInput = document.getElementById("authPassword");
  if (passwordInput && !passwordInput.dataset.enterBound) {
    passwordInput.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      signIn();
    });
    passwordInput.dataset.enterBound = "true";
  }

  updateAuthSignupAvailability();
  applyInviteDeepLinkToAuthInputs();
  renderInviteDeepLinkState();
}

async function signIn() {
  const email = document.getElementById("authEmail")?.value.trim() || "";
  const password = document.getElementById("authPassword")?.value || "";

  setAuthMessage("");

  if (!email || !password) {
    setAuthMessage("Email and password are required.", "error");
    return;
  }

  if (credentialAuthPromise) return;
  setCredentialAuthBusy("signInBtn", "Signing In…");

  try {
    credentialAuthPromise = dataLayer.signIn(email, password);
    const { error } = await credentialAuthPromise;

    if (error) {
      setAuthMessage(getAuthErrorMessage(error, "Sign-in failed."), "error");
      return;
    }

    setAuthMessage(hasInviteDeepLinkContext() ? "Signed in. Checking invite access..." : "Signed in successfully.", "success");
  } catch (error) {
    console.error("Sign-in request failed:", error);
    setAuthMessage(getAuthErrorMessage(error, "Sign-in failed."), "error");
  } finally {
    credentialAuthPromise = null;
    clearCredentialAuthBusy();
  }
}

async function createAccount() {
  const email = document.getElementById("authEmail")?.value.trim() || "";
  const password = document.getElementById("authPassword")?.value || "";

  setAuthMessage("");

  if (authSignupsEnabled === false) {
    setAuthMessage("Account creation is currently disabled. Ask a project administrator to create or invite your account.", "error");
    return;
  }

  if (!email || !password) {
    setAuthMessage("Email and password are required.", "error");
    return;
  }

  if (password.length < 6) {
    setAuthMessage("Password must be at least 6 characters.", "error");
    return;
  }

  if (credentialAuthPromise) return;
  setCredentialAuthBusy("createAccountBtn", "Creating…");

  try {
    credentialAuthPromise = dataLayer.signUp(email, password);
    const { data, error } = await credentialAuthPromise;

    if (error) {
      setAuthMessage(getAuthErrorMessage(error, "Account creation failed."), "error");
      return;
    }

    if (data?.session) {
      setAuthMessage(hasInviteDeepLinkContext() ? "Account created. Checking invite access..." : "Account created. You are signed in.", "success");
      return;
    }

    setAuthMessage("Account created. Check your email to verify before signing in.", "success");
  } catch (error) {
    console.error("Account creation request failed:", error);
    setAuthMessage(getAuthErrorMessage(error, "Account creation failed."), "error");
  } finally {
    credentialAuthPromise = null;
    clearCredentialAuthBusy();
  }
}

async function signOut() {
  try {
    const { error } = await dataLayer.signOut();

    if (error) {
      setAuthMessage(getAuthErrorMessage(error, "Sign-out failed."), "error");
      return;
    }

    setAuthMessage("Signed out.", "success");
  } catch (error) {
    console.error("Sign-out request failed:", error);
    setAuthMessage(getAuthErrorMessage(error, "Sign-out failed."), "error");
  }
}

function setAuthMessage(message, type = "") {
  const el = document.getElementById("authMessage");
  if (!el) return;

  el.className = "authMessage";
  if (type === "success") el.classList.add("authSuccess");
  if (type === "error") el.classList.add("authError");
  el.textContent = message;
}

function updateAuthUI() {
  const loggedOut = document.getElementById("authLoggedOut");
  const loggedIn = document.getElementById("authLoggedIn");
  const importLink = document.getElementById("importProjectLink");

  if (isSignedIn()) {
    loggedOut?.classList.add("hidden");
    loggedIn?.classList.remove("hidden");
    setText("authUserDisplay", currentUser.email || "Signed in");
    setText("authRoleDisplay", `Role: ${getCurrentRole()}`);
  } else {
    loggedOut?.classList.remove("hidden");
    loggedIn?.classList.add("hidden");
    setText("authUserDisplay", "");
    setText("authRoleDisplay", "");
  }

  if (importLink) {
    if (canManageProjectLifecycle()) {
      importLink.classList.remove("disabled");
      importLink.title = "";
    } else {
      importLink.classList.add("disabled");
      importLink.title = "Project admin or global admin sign-in required";
    }
  }

  renderInviteDeepLinkState();
  renderPendingProjectInvites();
  if (typeof refreshAccountSettingsUI === "function") {
    refreshAccountSettingsUI();
  }
  if (typeof refreshUsernameOnboardingGate === "function") {
    refreshUsernameOnboardingGate();
  }

  updateWriteAccessUI();

  if (typeof bindSnapshotExportUI === "function") {
    bindSnapshotExportUI();
  }

  if (typeof bindAnalyticsExportControls === "function") {
    bindAnalyticsExportControls();
  }
}

function updateWriteAccessUI() {
  const canEdit = isSignedIn() && canEditStores();
  const canNote = isSignedIn() && canAddNotes();
  const canPhoto = isSignedIn() && canUploadPhotos();
  const photoUploadBusy = typeof activePhotoUploadPromise !== "undefined" && !!activePhotoUploadPromise;
  const canRoutes = isSignedIn() && canManageRoutes();
  const canStoreLifecycle = isSignedIn() && canManageStoreLifecycle();
  const canProjectLifecycle = isSignedIn() && canManageProjectLifecycle();
  const notePermissionLabel = typeof isTcgProjectConfig === "function" && isTcgProjectConfig()
    ? "add sightings"
    : "add notes";

  [
    "markActive",
    "markCompleted",
    "markClosed",
    "markRescheduled",
    "rescheduleReasonPreset",
    "rescheduleReasonInput"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !canEdit;
  });

  [
    "addNoteBtn",
    "noteBox"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !canNote;
  });

  [
    "photoInput",
    "uploadPhotoBtn"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !canPhoto || photoUploadBusy;
  });

  [
    "addToRouteBtn",
    "routeModeToggle",
    "addRouteStoreBtn",
    "routeStoreInput",
    "openRouteBtn",
    "clearRouteBtn"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !canRoutes;
  });

  [
    "removeStoreBtn",
    "restoreStoreBtn"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = !canStoreLifecycle;
      el.classList.toggle("hidden", !canStoreLifecycle);
    }
  });

  [
    "archiveProjectBtn",
    "restoreProjectBtn",
    "toggleRemovedStoresBtn",
    "toggleArchivedProjectsBtn"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = !canProjectLifecycle;
      el.classList.toggle("hidden", !canProjectLifecycle);
    }
  });

  setText(
    "writeAccessMessage",
    canEdit
      ? ""
      : `Editor or admin sign-in required to update store status, ${notePermissionLabel}, and upload photos.`
  );

  if (typeof updateProjectLifecycleControls === "function") {
    updateProjectLifecycleControls();
  }
  if (typeof refreshStoreMaintenanceAdminUI === "function") {
    refreshStoreMaintenanceAdminUI();
  }
  if (typeof updateDataHealthPanel === "function") {
    updateDataHealthPanel();
  }
}

function renderPendingProjectInvites() {
  const panel = document.getElementById("pendingInvitesPanel");
  const list = document.getElementById("pendingInvitesList");
  const empty = document.getElementById("pendingInvitesEmpty");
  if (!panel || !list || !empty) return;

  const signedIn = isSignedIn();
  const rows = Array.isArray(pendingProjectInvites) ? pendingProjectInvites : [];

  panel.classList.toggle("hidden", !signedIn);
  panel.style.border = rows.length > 0 ? "1px solid rgba(255, 184, 77, 0.45)" : "";
  panel.style.background = rows.length > 0 ? "linear-gradient(180deg, rgba(255,184,77,.14), rgba(255,184,77,.06))" : "";
  list.innerHTML = "";

  if (!signedIn || rows.length === 0) {
    empty.classList.remove("hidden");
    empty.textContent = signedIn
      ? "No pending project invites."
      : "Sign in to view pending invites.";
    return;
  }

  empty.classList.add("hidden");

  const header = document.createElement("div");
  header.className = "copy";
  header.style.fontWeight = "700";
  header.style.marginBottom = "8px";
  header.textContent = `Pending Project Invites (${rows.length})`;
  list.appendChild(header);

  rows.forEach(invite => {
    const projectId = String(invite.project_id || "").trim();
    const inviteRef = typeof getInviteActionRef === "function"
      ? getInviteActionRef(invite)
      : "";
    const role = normalizeProjectRole(invite.role);
    const targetType = String(invite.invite_target_type || (invite.phone ? "phone" : "email")).trim().toLowerCase() === "phone"
      ? "phone"
      : "email";
    const targetValue = targetType === "phone"
      ? String(invite.phone || invite.target_phone || "").trim()
      : String(invite.email || invite.target_email || "").trim();
    if (!projectId) return;
    const projectName = String(
      invite.project_name ||
      invite.projects?.name ||
      allProjectList?.find?.(project => project?.project_id === projectId)?.name ||
      projectId
    ).trim() || projectId;

    const row = document.createElement("div");
    row.className = "copy";
    row.style.display = "grid";
    row.style.gap = "8px";
    row.style.padding = "10px 0";
    row.style.borderBottom = "1px solid rgba(255,255,255,.08)";

    const label = document.createElement("div");
    label.style.display = "inline-flex";
    label.style.alignItems = "center";
    label.style.flexWrap = "wrap";
    label.style.gap = "6px";
    label.textContent = `${projectName}`;

    const roleBadge = document.createElement("span");
    roleBadge.textContent = role;
    roleBadge.style.padding = "2px 8px";
    roleBadge.style.borderRadius = "999px";
    roleBadge.style.border = "1px solid rgba(255,255,255,.28)";
    roleBadge.style.fontSize = "11px";
    roleBadge.style.textTransform = "uppercase";
    roleBadge.style.letterSpacing = ".04em";
    roleBadge.style.opacity = "0.95";
    label.appendChild(roleBadge);
    if (typeof createInviteDeliveryBadge === "function") {
      label.appendChild(createInviteDeliveryBadge(invite, targetType));
    }

    const targetMeta = document.createElement("div");
    targetMeta.className = "projectSourceTag";
    targetMeta.style.marginTop = "0";
    targetMeta.style.opacity = "0.82";
    targetMeta.style.fontSize = "11px";
    const createdMeta = typeof getInviteCreatedMeta === "function"
      ? getInviteCreatedMeta(invite)
      : "";
    targetMeta.textContent = [
      `${targetType === "phone" ? "Phone" : "Email"} invite for ${targetValue || "unknown target"}`,
      createdMeta
    ].filter(Boolean).join(" • ");
    const deliveryError = String(invite.delivery_error || "").trim();
    if (deliveryError) {
      targetMeta.title = deliveryError;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btnSecondary";
    btn.textContent = "Accept Invite";
    btn.dataset.inviteRef = inviteRef;
    btn.dataset.projectId = projectId;
    btn.dataset.action = "accept-project-invite";

    row.appendChild(label);
    row.appendChild(targetMeta);
    row.appendChild(btn);
    list.appendChild(row);
  });
}

async function reloadCurrentUserAccessAndProjectScope(preferredProjectId = "") {
  if (!isSignedIn()) return;

  await loadCurrentUserProjectAccess();

  const normalizedPreferredProjectId = String(preferredProjectId || "").trim();
  if (normalizedPreferredProjectId && canAccessProject(normalizedPreferredProjectId)) {
    currentProjectId = normalizedPreferredProjectId;
    localStorage.setItem(ACTIVE_PROJECT_KEY, normalizedPreferredProjectId);
    refreshCurrentProjectRole();
  }

  updateAuthUI();
  updateWriteAccessUI();

  if (typeof refreshProjectAccessAfterAuthChange === "function") {
    await refreshProjectAccessAfterAuthChange();
  }
}

async function handleAcceptProjectInvite({ inviteId = "", inviteRef = "", projectId = "" } = {}) {
  if (!isSignedIn()) return;
  if (!inviteId && !projectId) return;

  const matchingInvite = (Array.isArray(pendingProjectInvites) ? pendingProjectInvites : []).find(invite => {
    const rowInviteRef = typeof getInviteActionRef === "function"
      ? getInviteActionRef(invite)
      : String(invite?.invite_ref || invite?._invite_ref || "").trim();
    const rowProjectId = String(invite?.project_id || "").trim();
    if (inviteRef && rowInviteRef === inviteRef) return true;
    return !inviteId && projectId && rowProjectId === projectId;
  }) || null;
  const acceptedProjectId = String(projectId || matchingInvite?.project_id || "").trim();
  const projectLabel = String(
    matchingInvite?.project_name ||
    matchingInvite?.projects?.name ||
    allProjectList?.find?.(project => project?.project_id === acceptedProjectId)?.name ||
    getInviteProjectDisplayName({ projectId: acceptedProjectId }) ||
    ""
  ).trim() || "project";

  setInviteLandingStatus("Accepting invite...", "");
  const { error } = await dataLayer.acceptProjectInvite({ inviteId, projectId: acceptedProjectId });
  if (error) {
    setAuthMessage(error.message || "Unable to accept invite.", "error");
    setInviteLandingStatus(error.message || "Unable to accept invite.", "error");
    return;
  }

  setAuthMessage(`Accepted invite for ${projectLabel}.`, "success");
  setInviteLandingStatus(`Accepted invite for ${projectLabel}.`, "success");
  inviteDeepLinkAcceptedProjectId = acceptedProjectId;
  if (typeof logAuditEvent === "function") {
    logAuditEvent("invite_accepted", {
      project_id: acceptedProjectId,
      actor_user_id: currentUser?.id || null,
      metadata: {}
    });
  }
  pendingProjectInvites = (Array.isArray(pendingProjectInvites) ? pendingProjectInvites : []).filter(invite => {
    const rowProjectId = String(invite?.project_id || "").trim();
    const rowInviteRef = typeof getInviteActionRef === "function"
      ? getInviteActionRef(invite)
      : String(invite?.invite_ref || invite?._invite_ref || "").trim();
    if (inviteRef && rowInviteRef === inviteRef) return false;
    return rowProjectId !== acceptedProjectId;
  });
  renderPendingProjectInvites();
  renderInviteDeepLinkState();
  await reloadCurrentUserAccessAndProjectScope(acceptedProjectId);
  setAuthMessage(`Accepted invite for ${projectLabel}. ${projectLabel} is selected.`, "success");
  setInviteLandingStatus(`${projectLabel} is selected.`, "success");
}

document.addEventListener("click", async event => {
  const trigger = event.target?.closest?.("[data-action='accept-project-invite']");
  if (!trigger) return;
  if (trigger.dataset.loading === "true") return;

  const originalLabel = trigger.textContent;
  trigger.dataset.loading = "true";
  trigger.disabled = true;
  trigger.textContent = "Accepting...";

  const projectId = String(trigger.dataset.projectId || "").trim();
  const inviteRef = String(trigger.dataset.inviteRef || "").trim();
  const inviteId = typeof resolveInviteActionRef === "function"
    ? resolveInviteActionRef(inviteRef)
    : "";
  try {
    await handleAcceptProjectInvite({ inviteId, inviteRef, projectId });
  } finally {
    trigger.dataset.loading = "false";
    trigger.disabled = false;
    trigger.textContent = originalLabel || "Accept Invite";
  }
});
