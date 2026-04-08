# 📌 DollarTree Project – Context Snapshot (RBAC Phase)

## ✅ CURRENT STATE (POST PR #96 FIXES)

### System Status
- Project-level RBAC foundation implemented
- Fail-closed access control enforced
- Membership-based project visibility working
- Invite system (send / accept / revoke) functional
- Project admin panel active
- Import flow gated by RBAC

### Security Guarantees
- Non-admin users cannot see unauthorized projects
- Membership lookup failures result in **no access (fail closed)**
- Role changes take effect immediately (no stale permissions)
- Global admins retain full access

---

## 🧠 CORE ARCHITECTURE PRINCIPLES

### RBAC Model
- Global roles: `viewer`, `editor`, `admin`
- Project roles: `viewer`, `editor`, `admin`
- Effective role = max(globalRole, projectRole)

### Access Rules
- Signed-out users → unrestricted read (current behavior)
- Signed-in non-admin users → **strict membership filtering**
- Membership unknown/error → **deny access**
- Global admin → bypass membership

### Data Sources
- Supabase = source of truth
- JSON fallback = allowed ONLY where safe (non-RBAC sensitive)

---

## 🚧 PHASE ROADMAP

### ✅ Phase 1 – RBAC Foundation (COMPLETE)
- Auth + role loading
- Project membership enforcement
- Fail-closed access
- Invite system backend + basic UI
- Import restrictions

---

### 🔜 Phase 2 – UX & Admin Experience (NEXT)

#### Goals
- Improve usability of RBAC system
- Reduce friction in managing users/projects

#### Features
1. Invite UX improvements
   - Cleaner pending invites panel
   - Show project names (not just IDs)
   - Better visibility after login

2. Project Admin Panel polish
   - Cleaner member list UI
   - Clear role indicators
   - Improved feedback (success/error states)

3. Safety UX
   - Disable buttons during async actions
   - Prevent duplicate submissions

4. Confirmations
   - Remove member confirmation
   - Revoke invite confirmation

---

### 🔜 Phase 3 – Audit & Governance

#### Goals
- Make system enterprise-safe

#### Features
- Activity log:
  - who changed status
  - who added notes/photos
  - who changed roles
- Audit trail table
- Immutable history entries

---

### 🔜 Phase 4 – Project Enhancements

#### Features
- Project branding (name/logo/color)
- Archive/lock mode (read-only projects)
- Route assignment by user
- Territory ownership per user

---

### 🔜 Phase 5 – Advanced Controls

#### Features
- Per-project feature toggles
- Permission tiers expansion
- Role templates

---

## 🔒 NON-NEGOTIABLE RULES (FOR ALL FUTURE PROMPTS)

### Architecture Rules
- NEVER rewrite working systems
- ALWAYS build additively
- DO NOT break:
  - map rendering
  - clustering
  - hydration
  - notes/photos/activity
  - route system

### RBAC Rules
- MUST fail closed
- MUST recompute access after mutations
- MUST NOT rely on UI-only security
- Supabase + RLS = enforcement layer

### Code Rules
- Prefer minimal, targeted changes
- No refactors unless explicitly requested
- Preserve function signatures unless required

### Prompt Rules (VERY IMPORTANT)
Every future response MUST include:
1. ✅ Codex Prompt (copy/paste ready)
2. ✅ Commit Title
3. ✅ Commit Description
4. ✅ What changed (brief)

NO exceptions.

---

## 🧪 ACCEPTANCE CRITERIA (GLOBAL)

A change is ONLY valid if:
- No regressions in UI or functionality
- RBAC remains enforced in all paths
- No console errors
- No broken flows
- Works on mobile (iOS priority)

---

## ⚠️ KNOWN RISKS TO WATCH

- Supabase rate limits / failures
- Membership loading delays
- UI state desync after async actions
- Accidental fallback data exposure

---

## 🎯 CURRENT PRIORITY

👉 Begin Phase 2 (UX polish)
👉 Keep changes SMALL and SAFE
👉 No architecture changes

---

## 🧭 HOW TO USE THIS FILE

When starting a new ChatGPT session:
1. Paste: "Read RBAC_Project_Context_Snapshot.md"
2. Then continue workflow

This restores:
- system state
- rules
- roadmap
- expectations

---

## 🔚 END STATE VISION

A **production-grade, enterprise-ready field operations platform** with:
- strict RBAC
- real-time collaboration
- auditability
- scalable architecture

Built safely, iteratively, and without regressions.

