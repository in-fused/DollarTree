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

  currentRole = data?.role || "viewer";
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
    setText("authRoleDisplay", `Role: ${currentRole}`);
  } else {
    loggedOut?.classList.remove("hidden");
    loggedIn?.classList.add("hidden");
    setText("authUserDisplay", "");
    setText("authRoleDisplay", "");
  }

  if (importLink) {
    if (isAdmin()) {
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
  const writeEnabled = isSignedIn();

  [
    "markActive",
    "markCompleted",
    "markClosed",
    "addNoteBtn",
    "noteBox",
    "photoInput",
    "uploadPhotoBtn"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !writeEnabled;
  });

  setText(
    "writeAccessMessage",
    writeEnabled ? "" : "Sign in to update store status, add notes, and upload photos."
  );
}
