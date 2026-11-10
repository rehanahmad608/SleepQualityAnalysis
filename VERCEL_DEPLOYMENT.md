# Dashboard deployment to Vercel

## Current production deployment (10 November 2026)

- Dashboard: https://sleep-quality-dashboard.vercel.app
- API: https://sleep-quality-dashboard-api.vercel.app
- Both were deployed from the local workspace using the authenticated Vercel CLI. The automatic GitHub connection failed, so Git pushes do not yet trigger these deployments.
- Backend database connection was uploaded as a Vercel secret with the owner's explicit approval. The production access mapping includes the owner's Google account with P001_DEMO access.
- Verified HTTP 200 for the dashboard, `/weekly`, `/auth/callback`, frontend assets and API `/healthz`. Verified unsigned `/api/v1/participants` returns 401 and CORS allows the production frontend origin. Frontend build and 14 selected authentication/dashboard tests passed.
- Signed-in production data retrieval still requires the owner to finish the Supabase production redirect settings and test Google login. No signed-in production session was used during deployment verification.
- Set Supabase Site URL to `https://sleep-quality-dashboard.vercel.app` and add `https://sleep-quality-dashboard.vercel.app/auth/callback` to allowed redirects. Add the frontend origin in the Google OAuth client's Authorized JavaScript origins too. The existing Supabase callback in Google stays unchanged.

Deploy this repository as two projects: backend (Root Directory `backend`, FastAPI preset) and frontend (Root Directory `frontend`, Vite preset). The database stays in Supabase. Local `.env` files are excluded from deployment uploads and Git; values must be configured in the appropriate Vercel project.

## Backend environment variables

Copy `DATABASE_URL` from the local backend settings: the Supabase transaction pooler connection with SSL. Mark it sensitive. Do not upload the migration connection or Google OAuth client secret.

Configure:

```env
SUPABASE_URL=<same project URL as local>
SUPABASE_ANON_KEY=<same public publishable key as local>
AUTH_PARTICIPANT_ACCESS=<same UUID-to-participant mapping as local>
AUTO_CREATE_TABLES=false
DEV_ANONYMOUS_ACCESS=false
ALLOW_LEGACY_WRITES=false
LEGACY_STUDY_ENABLED=false
APP_ENV=production
```

After obtaining the frontend domain, set `FRONTEND_ORIGIN=https://YOUR-FRONTEND.vercel.app` and `BACKEND_CORS_ORIGINS=https://YOUR-FRONTEND.vercel.app`, then redeploy the backend. No trailing slash in origins. The backend must be reachable by the frontend browser; Vercel deployment protection, if enabled, is a separate login from the app's Google sign-in. Keep the API's bearer-token checks enabled.

## Frontend environment variables

```env
VITE_SUPABASE_URL=<same project URL as local>
VITE_SUPABASE_ANON_KEY=<same public publishable key as local>
VITE_API_BASE_URL=https://YOUR-BACKEND.vercel.app/api/v1
```

Set these before building. Changes require a frontend redeployment. Database credentials never belong in frontend environment variables. The SPA rewrite supports direct dashboard links and `/auth/callback`.

## Google login

In Supabase Authentication → URL Configuration, set Site URL to the stable frontend production domain and add `https://YOUR-FRONTEND.vercel.app/auth/callback` to Redirect URLs. Retain local callback URLs for development.

In Google Cloud → Google Auth Platform → Clients, add the frontend origin to Authorized JavaScript origins. The Authorized redirect URI remains the Supabase callback URL already used locally. Google client credentials stay in the Supabase Google provider settings. Test accounts must be allowed by the Google consent-screen audience configuration.

## Verification

- Backend `/healthz` returns healthy JSON.
- Backend `/api/v1/participants` without a bearer token returns 401.
- The frontend opens on the Google login screen.
- A granted account sees P001_DEMO; an unassigned account gets no participant records.
- Daily, nightly and weekly pages fetch from the hosted API.
- Sign out hides the dashboard and clears cached data.

For automatic deployment on GitHub pushes, connect the repository to each Vercel project and keep the two Root Directory settings above. CLI deployment of local files alone does not push code to GitHub.
