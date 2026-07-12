# Repository and service review — 2026-07-12

## Outcome

The mobile access-panel failure was reproduced and traced to the Supabase project being paused, which made its Auth and REST host unreachable. The project was restored and reports healthy. The frontend now distinguishes network/service-wakeup failures, bounds auth requests, avoids Supabase auth-callback deadlocks, and keeps the credential panel usable if Mapbox/WebGL fails.

The full repository, live Supabase schema/advisors, GitHub deployment metadata, public Vercel deployment, mobile layout, and browser flows were reviewed. Existing uncommitted user work and local output artifacts were preserved.

## Implemented fixes

- Authentication starts independently of map hydration, uses bounded requests, serializes auth refresh work safely, prevents concurrent sign-in/sign-up requests, and reports useful mobile network errors.
- Signup capability is read from Supabase Auth settings; the disabled Create Account action is no longer shown.
- Supabase JS is pinned to a reviewed version with Subresource Integrity instead of loading an unversioned CDN build.
- Phone invite authorization now uses only a verified Supabase Auth phone identity, never editable profile data.
- Invite acceptance verifies identity, locks the invite, rejects replay/revocation, and cannot downgrade an existing higher membership.
- Four core account/project tables and six operational tables now have forced, project-scoped RLS with narrow grants and one canonical policy per operation.
- Anonymous execution was removed from all public security-definer functions; only seven intentional application RPCs remain callable by signed-in users.
- Anonymous access to configuration, routes, migration audit data, and the private photo bucket was removed.
- Security-definer metric views were converted to security-invoker views.
- Imported lifecycle statuses and production store fields are preserved; invalid statuses are rejected by the exact browser script path.
- Photo uploads are single-flight and scoped to the captured project/store, eliminating duplicate handlers and cross-modal UI writes.
- Share tokens moved out of query strings into reload-safe URL fragments and request headers; storage paths are restricted to the shared project/store.
- Dashboard attention content is HTML-escaped to close stored-XSS sinks.
- Dynamic viewport units improve mobile Safari layout behavior.
- The geocoding utility now runs in this CommonJS repository and accepts explicit file paths.
- CI, environment documentation, local artifact exclusions, and focused regression tests were added.

## Live Supabase changes

Applied explicitly, in order:

1. `20260712144232_core_access_security_hotfix`
2. `20260712144943_operational_rls_consolidation`
3. `20260712145431_remaining_advisor_cleanup`

Advisor changes:

- Security: 88 findings (11 errors) → 11 findings (0 errors).
- Performance: 151 findings → 35 informational unused-index observations.

Authorization smoke tests confirmed that the owner retains all four projects and all operational rows, an unrelated authenticated identity sees zero project data, anonymous roles have no core/config/route grants, direct profile-role updates are denied, and accepting a lower-role invite does not demote an existing admin.

The two remaining RLS-without-policy informational findings are intentional service-only tables (`project_share_links` and the status migration audit table) with no anonymous/authenticated grants. The remaining security warnings are the seven intentional RPCs, the existing `http` extension location, and disabled leaked-password protection.

## Verification completed

- All JavaScript files pass `node --check`.
- All seven regression suites pass.
- PostgreSQL migration files pass parser validation.
- Mobile 390×844 browser checks pass for visible sign-in tap and password Enter behavior.
- Invalid credentials return normally instead of hanging.
- Create Account is hidden while Supabase signup is disabled.
- Share tokens survive a failed resolve request and page reload; legacy query links migrate into fragments.
- Forced-WebGL-failure regression confirms auth state remains available.
- The live Auth settings endpoint and restored project are healthy.

## Required deployment follow-up

Repository changes are local and are not yet published. The current production deployment still returns Vercel 404 for `POST /api/project-invites/send`, while the share API routes exist. Vercel CLI is not authenticated or linked in this workspace, so deployment was not changed.

Before deploying:

1. Authenticate Vercel CLI and explicitly link the `fl-dollar-tree` project in the correct team scope.
2. Confirm the canonical `redbullrebels.vercel.app` domain belongs to that same project; GitHub metadata suggests project/domain duplication may exist.
3. Confirm all values from `.env.example` are present in Production, Preview, and Development as intended.
4. Create a forced production deployment so the serverless function manifest is rebuilt without cache.
5. Verify all three POST routes listed in README, then test a real email invite and share link.

Do not run `supabase db push` yet. The live migration ledger began with the three migrations above, while three older repository migration files describe partially existing/ad-hoc schema state; one references a legacy invite column that does not exist live. Reconcile or baseline that older history before automated migration pushes.

## Remaining, intentionally deferred risks

- Supabase Free projects may pause after low activity. Use an appropriate paid plan or external availability alert for uninterrupted sign-in; do not rely on synthetic keep-alive traffic.
- Enable Supabase Auth leaked-password protection in the dashboard.
- Photo request timeouts cannot cancel an already-issued storage request. A very late network completion can leave an orphan file; true request cancellation or an idempotent reconciliation job is a future improvement.
- The `http` extension remains in `public`. The only related legacy geocode function is unused and execution-disabled; moving/removing the extension should be a separately tested schema change.
- Thirty-five unused-index notices remain. Usage statistics were recently reset by the restore, so deleting indexes now would be unsafe.
- Chrome is not installed on this machine; Brave is the available Chromium browser. In-app mobile browser verification was completed instead.
- Legacy root assets (`app.js`, `style.css`), old ingestion mapper/validator files, and duplicate JSON fallbacks appear unused or retained for compatibility. They were not deleted without a deprecation window and production access-log evidence.
- GitHub branch protection is not configured. After publishing CI, require its repository-check job on the default branch.
