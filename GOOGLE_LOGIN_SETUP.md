# Google login for the dashboard

The dashboard now requires a verified Supabase session before mounting dashboard pages or requesting participant data. Google passwords are entered at Google, never in this app. Sign-in uses PKCE; the verifier and access token live in this browser tab's session storage. When a session expires, sign in again. Sign out clears the token and cached dashboard data. Existing password recovery routes remain separate.

## 1. Google Cloud

Create a Google Cloud project (or select your existing project), configure its OAuth consent screen, and create an OAuth client with application type **Web application**. Add your local and deployed website origins as authorized JavaScript origins. In **Authorized redirect URIs**, enter the callback URL shown in Supabase's Google provider settings, typically:

`https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`

If the Google app is in testing, add the Google accounts that will test it as test users.

## 2. Supabase

Open **Authentication → Sign In / Providers → Google**, enable Google, and paste the Google client ID and client secret there. Keep the client secret out of the frontend and GitHub.

Under **Authentication → URL Configuration**, set Site URL to your deployed website and add these exact redirect URLs:

- `http://127.0.0.1:5173/auth/callback`
- `http://localhost:5173/auth/callback` if using localhost
- `https://YOUR-VERCEL-DOMAIN/auth/callback`

## 3. Application configuration

Copy `frontend/.env.example` to `frontend/.env.local`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using the project URL and public anon/publishable key. Never use a service-role key. Add the same variables to the Vercel frontend project and redeploy after changes.

In `backend/.env`, set `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the same project. Set `DEV_ANONYMOUS_ACCESS=false`. Stop any existing development process that overrides it to true and restart the backend with anonymous access disabled. Production must also use anonymous access disabled. Configure CORS for the actual frontend origin if hosted separately.

## 4. Grant access to participant data

Sign in once, then find the user's UUID in **Supabase → Authentication → Users**. Set the backend's access mapping, using that exact UUID:

```env
AUTH_PARTICIPANT_ACCESS={"USER-UUID-HERE":["P001_DEMO"]}
```

Restart the backend after changing it. Grant `P001` only to accounts authorized to see the original participant data. A successful Google login does not automatically grant access to every participant. New accounts without a mapping see no participants.

## 5. Check

Open the website signed out: only the login screen should appear. Choose Continue with Google, complete Google sign-in, and confirm the assigned participant appears. Test a daily/weekly page directly too. Sign out and confirm the dashboard is hidden. An unassigned account should have no participant data. Vercel must route `/auth/callback` to the React app, and the hosted Python API must have the same authentication configuration.

Official setup instructions: https://supabase.com/docs/guides/auth/social-login/auth-google
