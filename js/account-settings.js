/* ================= ACCOUNT SETTINGS / ONBOARDING / ORG OVERSIGHT ================= */

function isMissingRequiredDisplayName() {
  if (!isSignedIn()) return false;
  const fromProfile = String(currentProfile?.display_name || "").trim();
  return !fromProfile;
}

function setAccountSettingsMessage(message = "", type = "") {
  const el = document.getElementById("accountSettingsMessage");
  if (!el) return;
  el.textContent = String(message || "");
  el.classList.remove("authSuccess", "authError");
  if (type === "success") el.classList.add("authSuccess");
  if (type === "error") el.classList.add("authError");
}

function refreshAccountSettingsUI() {
  const panel = document.getElementById("accountSettingsPanel");
  const toggle = document.getElementById("accountSettingsToggleBtn");
  const emailEl = document.getElementById("accountSettingsEmail");
  const roleEl = document.getElementById("accountSettingsRole");
  const projectRoleEl = document.getElementById("accountSettingsProjectRole");
  const displayInput = document.getElementById("accountDisplayNameInput");
  const phoneInput = document.getElementById("accountPhoneInput");
  const saveBtn = document.getElementById("accountSettingsSaveBtn");

  const signedIn = isSignedIn();

  if (toggle) {
    toggle.classList.toggle("hidden", !signedIn);
    toggle.textContent = panel?.classList.contains("hidden") ? "Personal Settings" : "Hide Settings";
  }

  if (!panel) return;
  if (!signedIn) {
    panel.classList.add("hidden");
    setAccountSettingsMessage("");
    return;
  }

  if (emailEl) emailEl.textContent = String(currentUser?.email || "").trim() || "—";
  if (roleEl) roleEl.textContent = getCurrentRole();
  if (projectRoleEl) projectRoleEl.textContent = getCurrentProjectRole();

  if (displayInput && displayInput.dataset.userEdited !== "true") {
    displayInput.value = String(currentProfile?.display_name || "").trim();
  }
  if (phoneInput && phoneInput.dataset.userEdited !== "true") {
    phoneInput.value = String(currentProfile?.phone || "").trim();
  }

  if (saveBtn && saveBtn.dataset.loading !== "true") {
    saveBtn.disabled = false;
  }
}

async function saveAccountSettings() {
  const displayInput = document.getElementById("accountDisplayNameInput");
  const phoneInput = document.getElementById("accountPhoneInput");
  const saveBtn = document.getElementById("accountSettingsSaveBtn");

  if (!displayInput || !saveBtn || !isSignedIn()) return;

  const displayName = String(displayInput.value || "").trim();
  const phoneRaw = String(phoneInput?.value || "").trim();
  const normalizedPhone = normalizePhoneForStorage(phoneRaw);

  if (!displayName) {
    setAccountSettingsMessage("Display name is required.", "error");
    return;
  }
  if (phoneRaw) {
    const phoneDigits = normalizedPhone.replace(/\D/g, "");
    if (phoneDigits.length < 8 || phoneDigits.length > 15) {
      setAccountSettingsMessage("Enter a valid phone number.", "error");
      return;
    }
  }

  saveBtn.dataset.loading = "true";
  saveBtn.disabled = true;
  const originalLabel = saveBtn.textContent;
  saveBtn.textContent = "Saving…";
  if (displayInput) displayInput.disabled = true;
  if (phoneInput) phoneInput.disabled = true;

  try {
    const { data, error } = await dataLayer.upsertMyProfile({
      displayName,
      phone: normalizedPhone
    });

    if (error) {
      setAccountSettingsMessage(error.message || "Unable to save settings.", "error");
      return;
    }

    currentProfile = {
      ...(currentProfile || {}),
      display_name: displayName,
      phone: normalizedPhone,
      role: currentRole,
      email: String(currentUser?.email || "").trim()
    };

    if (Array.isArray(data) && data[0] && typeof data[0] === "object") {
      currentProfile = {
        ...currentProfile,
        ...data[0]
      };
      currentRole = normalizeRole(data[0].role || currentRole);
    }

    displayInput.dataset.userEdited = "false";
    if (phoneInput) phoneInput.dataset.userEdited = "false";

    setAccountSettingsMessage("Account settings saved.", "success");
    if (typeof reloadCurrentUserAccessAndProjectScope === "function") {
      await reloadCurrentUserAccessAndProjectScope();
    }
    updateAuthUI();
    if (typeof refreshProjectAdminPanel === "function") {
      await refreshProjectAdminPanel();
    }
  } finally {
    saveBtn.dataset.loading = "false";
    saveBtn.disabled = false;
    saveBtn.textContent = originalLabel || "Save Settings";
    if (displayInput) displayInput.disabled = false;
    if (phoneInput) phoneInput.disabled = false;
  }
}

function setOnboardingMessage(message = "", type = "") {
  const el = document.getElementById("usernameOnboardingMessage");
  if (!el) return;
  el.textContent = String(message || "");
  el.classList.remove("authSuccess", "authError");
  if (type === "success") el.classList.add("authSuccess");
  if (type === "error") el.classList.add("authError");
}

async function saveOnboardingDisplayName() {
  const input = document.getElementById("usernameOnboardingInput");
  const phoneInput = document.getElementById("usernameOnboardingPhoneInput");
  const btn = document.getElementById("usernameOnboardingSaveBtn");
  if (!input || !btn || !isSignedIn()) return;

  const displayName = String(input.value || "").trim();
  const phoneRaw = String(phoneInput?.value || "").trim();
  const normalizedPhone = normalizePhoneForStorage(phoneRaw);
  if (!displayName) {
    setOnboardingMessage("Display name is required.", "error");
    return;
  }
  if (phoneRaw) {
    const phoneDigits = normalizedPhone.replace(/\D/g, "");
    if (phoneDigits.length < 8 || phoneDigits.length > 15) {
      setOnboardingMessage("Enter a valid phone number.", "error");
      return;
    }
  }

  btn.dataset.loading = "true";
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = "Saving…";
  input.disabled = true;
  if (phoneInput) phoneInput.disabled = true;

  try {
    const { data, error } = await dataLayer.upsertMyProfile({
      displayName,
      phone: normalizedPhone
    });
    if (error) {
      setOnboardingMessage(error.message || "Unable to save display name.", "error");
      return;
    }

    currentProfile = {
      ...(currentProfile || {}),
      display_name: displayName,
      phone: normalizedPhone,
      role: currentRole,
      email: String(currentUser?.email || "").trim()
    };

    if (Array.isArray(data) && data[0] && typeof data[0] === "object") {
      currentProfile = {
        ...currentProfile,
        ...data[0]
      };
      currentRole = normalizeRole(data[0].role || currentRole);
    }

    setOnboardingMessage("Profile completed.", "success");
    if (typeof reloadCurrentUserAccessAndProjectScope === "function") {
      await reloadCurrentUserAccessAndProjectScope();
    }
    refreshUsernameOnboardingGate();
    refreshAccountSettingsUI();
    updateAuthUI();
  } finally {
    btn.dataset.loading = "false";
    btn.disabled = false;
    btn.textContent = originalLabel || "Continue";
    input.disabled = false;
    if (phoneInput) phoneInput.disabled = false;
  }
}

function refreshUsernameOnboardingGate() {
  const gate = document.getElementById("usernameOnboardingGate");
  const input = document.getElementById("usernameOnboardingInput");
  const phoneInput = document.getElementById("usernameOnboardingPhoneInput");
  if (!gate || !input) return;

  const shouldShow = isMissingRequiredDisplayName();
  gate.classList.toggle("hidden", !shouldShow);
  document.body.classList.toggle("onboarding-gate-active", shouldShow);

  if (shouldShow) {
    input.value = String(currentProfile?.display_name || "").trim();
    if (phoneInput) {
      phoneInput.value = String(currentProfile?.phone || "").trim();
    }
    requestAnimationFrame(() => {
      if (!input.disabled) input.focus();
    });
  } else {
    setOnboardingMessage("");
  }
}

function setOrgOversightMessage(message = "", type = "") {
  const el = document.getElementById("orgOversightMessage");
  if (!el) return;
  el.textContent = String(message || "");
  el.classList.remove("authSuccess", "authError");
  if (type === "success") el.classList.add("authSuccess");
  if (type === "error") el.classList.add("authError");
}

function canViewOrgOversight() {
  return isSignedIn() && isGlobalAdmin();
}

function canAdjustGlobalRole() {
  return isSignedIn() && isOrgOwner();
}

function canCancelOrgOversightInvite() {
  return canViewOrgOversight() && typeof dataLayer?.revokeProjectInvite === "function";
}

async function refreshOrgOversightPanel() {
  const panel = document.getElementById("orgOversightPanel");
  const accountsList = document.getElementById("orgOversightAccountsList");
  const invitesList = document.getElementById("orgOversightInvitesList");
  const accountsEmpty = document.getElementById("orgOversightAccountsEmpty");
  const invitesEmpty = document.getElementById("orgOversightInvitesEmpty");

  if (!panel || !accountsList || !invitesList || !accountsEmpty || !invitesEmpty) return;

  const canView = canViewOrgOversight();
  panel.classList.toggle("hidden", !canView);
  if (!canView) return;

  accountsList.innerHTML = "";
  invitesList.innerHTML = "";
  accountsEmpty.classList.remove("hidden");
  accountsEmpty.textContent = "Loading accounts…";
  invitesEmpty.classList.remove("hidden");
  invitesEmpty.textContent = "Loading invites…";

  const [accountsResult, invitesResult] = await Promise.all([
    dataLayer.loadOrgOversightAccounts(),
    dataLayer.loadOrgOversightInvites()
  ]);

  if (accountsResult.error) {
    accountsEmpty.classList.remove("hidden");
    accountsEmpty.textContent = accountsResult.error.message || "Unable to load accounts.";
  } else {
    const rows = Array.isArray(accountsResult.data) ? accountsResult.data : [];
    if (rows.length === 0) {
      accountsEmpty.classList.remove("hidden");
      accountsEmpty.textContent = "No accounts found.";
    } else {
      accountsEmpty.classList.add("hidden");
      rows.forEach((row) => {
        const userId = String(row.user_id || row.id || "").trim();
        const email = String(row.email || "").trim() || userId || "Unknown";
        const displayName = String(row.display_name || "").trim();
        const phone = String(row.phone || "").trim();
        const globalRole = normalizeRole(row.global_role || row.role);
        const membershipCount = Number(row.project_membership_count || row.membership_count || 0);

        const item = document.createElement("div");
        item.className = "orgOversightRow";

        const meta = document.createElement("div");
        meta.className = "orgOversightMeta";
        const primary = document.createElement("div");
        primary.className = "orgOversightPrimary";
        primary.textContent = email;

        const secondary = document.createElement("div");
        secondary.className = "orgOversightSecondary";
        secondary.textContent = `${displayName || "No display name"}${phone ? ` • ${phone}` : ""}`;

        const projectsLine = document.createElement("div");
        projectsLine.className = "orgOversightSecondary";
        projectsLine.textContent = `Projects: ${membershipCount}`;

        meta.appendChild(primary);
        meta.appendChild(secondary);
        meta.appendChild(projectsLine);

        const roleWrap = document.createElement("div");
        roleWrap.className = "orgOversightRoleWrap";

        const roleSelect = document.createElement("select");
        roleSelect.className = "adminRoleSelect";
        roleSelect.dataset.action = "org-role-select";
        roleSelect.dataset.userId = userId;
        roleSelect.innerHTML = ["viewer", "editor", "admin", "owner"]
          .map((optionRole) => `<option value="${optionRole}"${optionRole === globalRole ? " selected" : ""}>${optionRole}</option>`)
          .join("");
        roleSelect.disabled = !canAdjustGlobalRole() || !userId;

        const roleSaveBtn = document.createElement("button");
        roleSaveBtn.type = "button";
        roleSaveBtn.className = "btnSecondary";
        roleSaveBtn.textContent = "Save";
        roleSaveBtn.dataset.action = "save-org-role";
        roleSaveBtn.dataset.userId = userId;
        roleSaveBtn.disabled = !canAdjustGlobalRole() || !userId;

        roleWrap.appendChild(roleSelect);
        roleWrap.appendChild(roleSaveBtn);

        item.appendChild(meta);
        item.appendChild(roleWrap);
        accountsList.appendChild(item);
      });
    }
  }

  if (invitesResult.error) {
    invitesEmpty.classList.remove("hidden");
    invitesEmpty.textContent = invitesResult.error.message || "Unable to load invites.";
  } else {
    const rows = Array.isArray(invitesResult.data) ? invitesResult.data : [];
    if (rows.length === 0) {
      invitesEmpty.classList.remove("hidden");
      invitesEmpty.textContent = "No pending invites.";
    } else {
      invitesEmpty.classList.add("hidden");
      rows.forEach((invite) => {
        const inviteId = String(invite.id || invite.invite_id || "").trim();
        const targetType = String(invite.invite_target_type || (invite.phone ? "phone" : "email")).toLowerCase() === "phone"
          ? "phone"
          : "email";
        const targetValue = targetType === "phone"
          ? String(invite.phone || invite.target_phone || "").trim()
          : String(invite.email || invite.target_email || "").trim();
        const role = normalizeProjectRole(invite.role);
        const projectId = String(invite.project_id || "").trim();
        const projectName = String(invite.project_name || invite.project_id || "").trim() || "Unknown project";
        const canCancelInvite = canCancelOrgOversightInvite() && !!inviteId;

        const item = document.createElement("div");
        item.className = "orgOversightInviteRow";

        const meta = document.createElement("div");
        meta.className = "orgOversightInviteMeta";

        const primary = document.createElement("div");
        primary.className = "orgOversightPrimary";
        primary.textContent = projectName;

        const secondary = document.createElement("div");
        secondary.className = "orgOversightSecondary";
        secondary.textContent = `${targetType}: ${targetValue || "unknown"} • ${role}`;

        meta.appendChild(primary);
        meta.appendChild(secondary);
        item.appendChild(meta);

        if (canCancelInvite) {
          const actionWrap = document.createElement("div");
          actionWrap.className = "orgOversightInviteActions";

          const cancelBtn = document.createElement("button");
          cancelBtn.type = "button";
          cancelBtn.className = "btnClosed";
          cancelBtn.classList.add("adminRowActionBtn", "adminInviteCancelBtn");
          cancelBtn.textContent = "Cancel Invite";
          cancelBtn.setAttribute("aria-label", `Cancel invite for ${targetValue || projectName}`);
          cancelBtn.title = "Cancel this pending invite";
          cancelBtn.dataset.action = "cancel-org-invite";
          cancelBtn.dataset.inviteId = inviteId;
          cancelBtn.dataset.projectId = projectId;

          actionWrap.appendChild(cancelBtn);
          item.appendChild(actionWrap);
        }

        invitesList.appendChild(item);
      });
    }
  }
}

async function bindAccountSettingsUI() {
  const toggle = document.getElementById("accountSettingsToggleBtn");
  const panel = document.getElementById("accountSettingsPanel");
  const displayInput = document.getElementById("accountDisplayNameInput");
  const phoneInput = document.getElementById("accountPhoneInput");
  const saveBtn = document.getElementById("accountSettingsSaveBtn");
  const onboardingSaveBtn = document.getElementById("usernameOnboardingSaveBtn");
  const onboardingPhoneInput = document.getElementById("usernameOnboardingPhoneInput");

  if (toggle && !toggle.dataset.bound) {
    toggle.addEventListener("click", () => {
      if (!panel) return;
      panel.classList.toggle("hidden");
      refreshAccountSettingsUI();
    });
    toggle.dataset.bound = "true";
  }

  if (displayInput && !displayInput.dataset.bound) {
    displayInput.addEventListener("input", () => {
      displayInput.dataset.userEdited = "true";
    });
    displayInput.dataset.bound = "true";
  }

  if (phoneInput && !phoneInput.dataset.bound) {
    phoneInput.addEventListener("input", () => {
      phoneInput.dataset.userEdited = "true";
    });
    phoneInput.dataset.bound = "true";
  }

  if (saveBtn && !saveBtn.dataset.bound) {
    saveBtn.addEventListener("click", async () => {
      await saveAccountSettings();
      await refreshOrgOversightPanel();
    });
    saveBtn.dataset.bound = "true";
  }

  if (onboardingSaveBtn && !onboardingSaveBtn.dataset.bound) {
    onboardingSaveBtn.addEventListener("click", async () => {
      await saveOnboardingDisplayName();
      await refreshOrgOversightPanel();
    });
    onboardingSaveBtn.dataset.bound = "true";
  }

  if (onboardingPhoneInput && !onboardingPhoneInput.dataset.bound) {
    onboardingPhoneInput.addEventListener("input", () => {
      onboardingPhoneInput.dataset.userEdited = "true";
    });
    onboardingPhoneInput.dataset.bound = "true";
  }

  if (document.body && !document.body.dataset.orgOversightBound) {
    document.body.addEventListener("click", async (event) => {
      const target = event.target?.closest?.("[data-action='save-org-role'], [data-action='cancel-org-invite']");
      if (!target) return;

      if (target.dataset.action === "cancel-org-invite") {
        if (!canCancelOrgOversightInvite()) {
          setOrgOversightMessage("Org admin access is required to cancel pending invites.", "error");
          return;
        }

        const inviteId = String(target.dataset.inviteId || "").trim();
        const inviteProjectId = String(target.dataset.projectId || "").trim();
        if (!inviteId) return;
        if (target.dataset.loading === "true") return;
        if (!window.confirm("Cancel this pending invite? The invite will no longer be available to accept.")) return;

        const originalLabel = target.textContent;
        target.dataset.loading = "true";
        target.disabled = true;
        target.textContent = "Canceling…";

        let error = null;
        try {
          ({ error } = await dataLayer.revokeProjectInvite(inviteId));
        } catch (caughtError) {
          error = caughtError instanceof Error
            ? caughtError
            : new Error(String(caughtError?.message || "Unable to cancel invite."));
        } finally {
          target.dataset.loading = "false";
          target.disabled = false;
          target.textContent = originalLabel || "Cancel Invite";
        }

        if (error) {
          setOrgOversightMessage(error.message || "Unable to cancel invite.", "error");
          return;
        }

        setOrgOversightMessage("Pending invite canceled.", "success");
        if (typeof logAuditEvent === "function") {
          logAuditEvent("invite_revoked", {
            project_id: inviteProjectId || currentProjectId,
            actor_user_id: currentUser?.id || null,
            invite_id: inviteId,
            metadata: {
              source: "org_oversight"
            }
          });
        }

        const currentProjectKey = String(currentProjectId || "").trim();
        if (inviteProjectId && currentProjectKey && inviteProjectId === currentProjectKey && typeof refreshProjectAdminPanel === "function") {
          await refreshProjectAdminPanel();
        } else {
          await refreshOrgOversightPanel();
        }
        return;
      }

      if (!canAdjustGlobalRole()) {
        setOrgOversightMessage("Only org owners can adjust global roles.", "error");
        return;
      }

      const userId = String(target.dataset.userId || "").trim();
      if (!userId) return;

      const select = document.querySelector(`[data-action='org-role-select'][data-user-id='${userId}']`);
      const nextRole = normalizeRole(select?.value || "viewer");

      target.disabled = true;
      const originalLabel = target.textContent;
      target.textContent = "Saving…";
      if (select) select.disabled = true;

      try {
        const { error } = await dataLayer.updateGlobalRole(userId, nextRole);
        if (error) {
          setOrgOversightMessage(error.message || "Unable to update global role.", "error");
          return;
        }
        setOrgOversightMessage(`Updated global role to ${nextRole}.`, "success");
        await refreshOrgOversightPanel();
      } finally {
        target.disabled = false;
        target.textContent = originalLabel || "Save";
        if (select) select.disabled = false;
      }
    });

    document.body.dataset.orgOversightBound = "true";
  }

  refreshAccountSettingsUI();
  refreshUsernameOnboardingGate();
  await refreshOrgOversightPanel();
}
