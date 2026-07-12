# DollarTree project tracking

A static, mobile-responsive project operations dashboard backed by Supabase and deployed with Vercel. It includes project-scoped store tracking, status and evidence capture, imports, analytics, invitations, and read-only share links.

## Local development

For frontend-only work, serve the repository over HTTP rather than opening `index.html` directly:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/`. The browser-safe Supabase URL/key and Mapbox public token are configured in `js/state.js`. Server-side functions use the variables documented in `.env.example`; never put `SUPABASE_SERVICE_ROLE_KEY` in frontend files.

The Python server does not run the files under `api/`. Use `vercel dev` from an explicitly linked Vercel project with a pulled local environment when testing invitations or share APIs end to end.

Run the same JavaScript checks used by CI:

```powershell
$files = rg --files -g '*.js'
foreach ($file in $files) { node --check $file }
$tests = rg --files -g '*.test.js'
foreach ($test in $tests) { node $test }
```

The geocoding helper accepts explicit input and output paths:

```powershell
node generate_coords.js input-stores.json stores_with_coords.json
```

## Deployment

The Vercel project needs the required environment values from `.env.example` in every intended environment. After changing API routes or variables, create a fresh cacheless deployment and verify these endpoints on the canonical domain:

- `POST /api/project-invites/send`
- `POST /api/share-links/create`
- `POST /api/share-links/resolve`

Supabase schema changes belong in `supabase/migrations/` and should be applied through a reviewed migration workflow. Do not rerun historical migrations blindly against a database whose migration history is incomplete; inspect live schema state first.

## Sign-in incident checklist

If the access panel reports `Load failed`, `Failed to fetch`, or a timeout:

1. Check the Supabase project status and restore it if it is paused.
2. Confirm `/auth/v1/settings` and the REST API are reachable.
3. Check Supabase Auth logs for the attempted request.
4. Reload the mobile tab after the project reports healthy; if needed, close the tab and clear site data for only the application domain.
5. Verify both Wi-Fi and cellular networking if the service is healthy but one network still fails.

Free Supabase projects can pause after a period of low activity. Upgrade the project or add an external availability alert if uninterrupted sign-in is required; synthetic keep-alive traffic is not a substitute for an appropriate hosting plan.
