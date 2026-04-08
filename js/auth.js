/* ================= AUTH ================= */

async function initializeAuth() {
  const { data, error } = await dataLayer.getSession();

  if (error) {
    console.error("Auth session error:", error);
  }

  currentSession = data?.session || null;
  currentUser = currentSession?.user || null;

  if (currentUser) {
    await loadCurrentUserRole();
    await loadCurrentUserProjectAccess();
  } else {
    currentRole = "viewer";
    currentProjectRole = "viewer";
    projectMemberships = [];
    projectMembershipByProjectId = {};
    pendingProjectInvites = [];
    projectMembershipsLoaded = false;
    projectMembershipsLoadError = null;
  }

  dataLayer.onAuthStateChange(async (_event, session) => {
    currentSession = session || null;
    currentUser = currentSession?.user || null;

    if (currentUser) {
      await loadCurrentUserRole();
      await loadCurrentUserProjectAccess();
    } else {
      currentRole = "viewer";
      currentProjectRole = "viewer";
      projectMemberships = [];
      projectMembershipByProjectId = {};
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
    currentRole = "viewer";
    return;
  }

  const { data, error } = await dataLayer.getProfileRole(currentUser.id);

  if (error) {
    console.error("Profile lookup failed:", error);
    currentRole = "viewer";
    return;
  }

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

  const email = String(currentUser.email || "").trim();
  if (email) {
    const invitesResult = await dataLayer.loadPendingProjectInvitesByEmail(email);
    if (invitesResult.error) {
      console.error("Pending invite lookup failed:", invitesResult.error);
    } else {
      pendingProjectInvites = Array.isArray(invitesResult.data) ? invitesResult.data : [];
    }
  }

  refreshCurrentProjectRole();
}

function bindAuthUI() {
  const signInBtn = document.getElementById("signInBtn");
  const signOutBtn = document.getElementById("signOutBtn");

  if (signInBtn && !signInBtn.dataset.bound) {
    signInBtn.addEventListener("click", signIn);
    signInBtn.dataset.bound = "true";
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
      : "Editor or admin sign-in required to update store status, add notes, and upload photos."
  );

  if (typeof updateProjectLifecycleControls === "function") {
    updateProjectLifecycleControls();
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
  list.innerHTML = "";

  if (!signedIn || rows.length === 0) {
    empty.classList.remove("hidden");
    empty.textContent = signedIn
      ? "No pending project invites."
      : "Sign in to view pending invites.";
    return;
  }

  empty.classList.add("hidden");

  rows.forEach(invite => {
    const projectId = String(invite.project_id || "").trim();
    const role = normalizeProjectRole(invite.role);
    if (!projectId) return;

    const row = document.createElement("div");
    row.className = "copy";
    row.style.display = "grid";
    row.style.gap = "6px";
    row.style.padding = "8px 0";
    row.style.borderBottom = "1px solid rgba(255,255,255,.08)";

    const label = document.createElement("div");
    label.textContent = `${projectId} · ${role}`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btnSecondary";
    btn.textContent = "Accept Invite";
    btn.dataset.projectId = projectId;
    btn.dataset.action = "accept-project-invite";

    row.appendChild(label);
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

async function handleAcceptProjectInvite(projectId) {
  if (!projectId || !isSignedIn()) return;

  const { error } = await dataLayer.acceptProjectInvite(projectId);
  if (error) {
    setAuthMessage(error.message || "Unable to accept invite.", "error");
    return;
  }

  setAuthMessage(`Accepted invite for ${projectId}.`, "success");
  await reloadCurrentUserAccessAndProjectScope();
}

document.addEventListener("click", async event => {
  const trigger = event.target?.closest?.("[data-action='accept-project-invite']");
  if (!trigger) return;
  const projectId = String(trigger.dataset.projectId || "").trim();
  await handleAcceptProjectInvite(projectId);
});
