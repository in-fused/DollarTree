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
  } else {
    currentRole = "viewer";
  }

  dataLayer.onAuthStateChange(async (_event, session) => {
    currentSession = session || null;
    currentUser = currentSession?.user || null;

    if (currentUser) {
      await loadCurrentUserRole();
    } else {
      currentRole = "viewer";
    }

    updateAuthUI();
    updateWriteAccessUI();
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
      importLink.title = "Admin sign-in required";
    }
  }

  updateWriteAccessUI();
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