/* ================= AUTH ================= */

async function initializeAuth() {
  const { data, error } = await dataLayer.getSession();

  if (error) {
    console.error("Auth session error:", error);
  }

  currentSession = data?.session || null;
  currentUser = currentSession?.user || null;

  if (currentUser) {
    const currentUserId = String(currentUser.id || "").trim();
    const currentUserEmail = String(currentUser.email || "").trim();
    if (currentUserId && currentUserEmail) {
      profileEmailByUserId[currentUserId] = currentUserEmail;
    }
    await loadCurrentUserRole();
    await loadCurrentUserProjectAccess();
  } else {
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

  dataLayer.onAuthStateChange(async (_event, session) => {
    currentSession = session || null;
    currentUser = currentSession?.user || null;

    if (currentUser) {
      const currentUserId = String(currentUser.id || "").trim();
      const currentUserEmail = String(currentUser.email || "").trim();
      if (currentUserId && currentUserEmail) {
        profileEmailByUserId[currentUserId] = currentUserEmail;
      }
      await loadCurrentUserRole();
      await loadCurrentUserProjectAccess();
    } else {
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

    updateAuthUI();
    updateWriteAccessUI();

    if (typeof refreshProjectAccessAfterAuthChange === "function") {
      await refreshProjectAccessAfterAuthChange();
    }
  });
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
    return;
  }

  currentProfile = data || null;
  currentRole = normalizeRole(data?.role);
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
}

async function signIn() {
  const email = document.getElementById("authEmail")?.value.trim() || "";
  const password = document.getElementById("authPassword")?.value || "";

  setAuthMessage("");

  if (!email || !password) {
    setAuthMessage("Email and password are required.", "error");
    return;
  }

  const { error } = await dataLayer.signIn(email, password);

  if (error) {
    setAuthMessage(error.message || "Sign-in failed.", "error");
    return;
  }

  setAuthMessage("Signed in successfully.", "success");
}

async function createAccount() {
  const email = document.getElementById("authEmail")?.value.trim() || "";
  const password = document.getElementById("authPassword")?.value || "";

  setAuthMessage("");

  if (!email || !password) {
    setAuthMessage("Email and password are required.", "error");
    return;
  }

  if (password.length < 6) {
    setAuthMessage("Password must be at least 6 characters.", "error");
    return;
  }

  const { data, error } = await dataLayer.signUp(email, password);

  if (error) {
    setAuthMessage(error.message || "Account creation failed.", "error");
    return;
  }

  if (data?.session) {
    setAuthMessage("Account created. You are signed in.", "success");
    return;
  }

  setAuthMessage("Account created. Check your email to verify before signing in.", "success");
}

async function signOut() {
  const { error } = await dataLayer.signOut();

  if (error) {
    setAuthMessage(error.message || "Sign-out failed.", "error");
    return;
  }

  setAuthMessage("Signed out.", "success");
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
    if (el) el.disabled = !canPhoto;
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
    const inviteId = String(invite.id || "").trim();
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
    label.style.gap = "6px";
    label.textContent = `${projectName}`;
    label.title = `Project ID: ${projectId}`;

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

    const targetMeta = document.createElement("div");
    targetMeta.className = "projectSourceTag";
    targetMeta.style.marginTop = "0";
    targetMeta.style.opacity = "0.82";
    targetMeta.style.fontSize = "11px";
    targetMeta.textContent = `${targetType === "phone" ? "Phone" : "Email"} invite for ${targetValue || "unknown target"}`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btnSecondary";
    btn.textContent = "Accept Invite";
    btn.dataset.inviteId = inviteId;
    btn.dataset.projectId = projectId;
    btn.dataset.action = "accept-project-invite";

    row.appendChild(label);
    row.appendChild(targetMeta);
    row.appendChild(btn);
    list.appendChild(row);
  });
}

async function reloadCurrentUserAccessAndProjectScope() {
  if (!isSignedIn()) return;

  await loadCurrentUserProjectAccess();
  updateAuthUI();
  updateWriteAccessUI();

  if (typeof refreshProjectAccessAfterAuthChange === "function") {
    await refreshProjectAccessAfterAuthChange();
  }
}

async function handleAcceptProjectInvite({ inviteId = "", projectId = "" } = {}) {
  if (!isSignedIn()) return;
  if (!inviteId && !projectId) return;

  const { error } = await dataLayer.acceptProjectInvite({ inviteId, projectId });
  if (error) {
    setAuthMessage(error.message || "Unable to accept invite.", "error");
    return;
  }

  setAuthMessage(`Accepted invite for ${projectId || "project"}.`, "success");
  await reloadCurrentUserAccessAndProjectScope();
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
  const inviteId = String(trigger.dataset.inviteId || "").trim();
  try {
    await handleAcceptProjectInvite({ inviteId, projectId });
  } finally {
    trigger.dataset.loading = "false";
    trigger.disabled = false;
    trigger.textContent = originalLabel || "Accept Invite";
  }
});
