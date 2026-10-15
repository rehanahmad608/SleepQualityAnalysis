# Collaborator setup — run the participant dashboard locally

This guide gets the Sleep Quality Analysis participant dashboard running on your
own computer, against the shared Supabase project.

> **Health data.** The dashboard shows real participant measurements. Do not
> screenshot, export or share them outside the project. Do not commit anything
> from `.env` files, database exports or health-data folders.

## 0. What you need

| Item | Notes |
|---|---|
| Git | any recent version |
| Python | 3.11 or newer (the project was run with 3.13) |
| Node.js | 20 LTS or newer, with npm |
| Two private env files | `backend/.env` and `frontend/.env.local` — sent to you **privately** by the project owner (see section 3) |
| Your own Supabase Auth account | created for you by the project owner (see section 6) |

## 1. Clone and check out the integration branch

```powershell
git clone https://github.com/rehanahmad608/SleepQualityAnalysis.git
cd SleepQualityAnalysis
git fetch origin
git checkout integration/combine-ui-supabase
```

Never push to `main`. Work on your own branch and open a pull request.

## 2. Install dependencies

Backend (from the `backend` folder):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
```

Frontend (from the `frontend` folder):

```powershell
cd frontend
npm ci
cd ..
```

## 3. Place the private environment files

The environment files contain connection settings and are **not stored on
GitHub**. The owner sends you an encrypted archive (`sleep-env.7z`) and the
password through two different private channels.

Extract it with 7-Zip **from the repository root** so the relative paths are
preserved:

```text
SleepQualityAnalysis/
├── backend/.env              <- backend settings
└── frontend/.env.local       <- frontend (public) settings
```

```powershell
& "C:\Program Files\7-Zip\7z.exe" x sleep-env.7z -o"."
```

Both files are git-ignored. Verify with `git status`: neither file may appear.
Delete the archive afterwards. Templates showing every variable name (with
harmless placeholders) are in `backend/.env.example` and
`frontend/.env.example`.

## 4. Start the backend (FastAPI)

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/docs for the API documentation and
http://127.0.0.1:8000/healthz for a health check. Keep this terminal open.

## 5. Start the frontend (React/Vite)

In a second terminal:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Open **http://127.0.0.1:5173/** (use `127.0.0.1`, not `localhost`). Vite
forwards `/api` requests to the backend on `127.0.0.1:8000`.

Useful pages:

| URL | Purpose |
|---|---|
| `/` | Participant data dashboard (sign-in first) |
| `/daily`, `/night`, `/weekly` | Daily, night and weekly views |
| `/forgot-password` | Request a password recovery email |
| `/reset-password` | Opened from the recovery email |

Tests and build (optional):

```powershell
cd frontend; npx tsc --noEmit -p tsconfig.json; npx vitest run; npm run build
cd ../backend; .\.venv\Scripts\python.exe -m pytest -q
```

The backend tests use isolated temporary databases; the PostgreSQL-specific
tests are skipped unless `TEST_POSTGRES_URL` points at a disposable local test
database. They never touch Supabase.

## 6. How authentication and authorization work

1. **Sign-in.** The browser signs in with email and password directly against
   Supabase Auth (`/auth/v1/token`) using only the public anon key. Supabase
   returns an access token, which the app keeps in `sessionStorage` for the tab.
2. **Every API call** carries `Authorization: Bearer <token>`.
3. **Verification.** FastAPI validates the token with Supabase
   (`/auth/v1/user`) and takes the verified user id from the response.
4. **Authorization.** The user id is looked up in the server-side
   `AUTH_PARTICIPANT_ACCESS` setting in `backend/.env`:

   ```text
   AUTH_PARTICIPANT_ACCESS={"<your-supabase-user-uuid>":["P001"]}
   ```

   Only participant codes listed for that user can be read. Anything else is
   `403`. Grants are never read from user-editable profile metadata.
5. **Default-deny.** Without Supabase configured, or without a valid token,
   participant endpoints refuse the request.

### Use your own identity — do not reuse the owner's login

* Ask the owner to create **your** user in Supabase (Authentication → Users)
  with your email address.
* Set your password with **Forgot password?** on the sign-in page (the link is
  opened in the same browser that requested it).
* Find your user's UUID (Authentication → Users), then add it to your own
  `backend/.env`:
  `AUTH_PARTICIPANT_ACCESS={"<your-uuid>":["P001"]}` and restart the backend.
* The Supabase **Dashboard** account password is a different thing from the
  application sign-in password; never share either.

## 7. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Sign-in page keeps asking for credentials / "Sign-in failed" | Wrong email or password; or `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` missing in `frontend/.env.local` (restart `npm run dev` after editing). |
| `401 Sign in to view participant data` | No or expired session. Sign in again. |
| `403 You do not have access to this participant` | Your user UUID is not in `AUTH_PARTICIPANT_ACCESS` in `backend/.env`, or the code is wrong. Restart the backend after editing. |
| `503 Authentication is temporarily unavailable` | Backend cannot reach Supabase Auth, or `SUPABASE_URL`/`SUPABASE_ANON_KEY` are wrong/empty. |
| `503 Structured participant data is unavailable` / "temporarily unavailable" | Database connection problem: check `DATABASE_URL` (pooler host, port 6543, `sslmode=require`, URL-encoded password), your network/firewall, and the backend terminal for the error type. |
| "Cannot reach the backend API" / 502 | FastAPI is not running on `127.0.0.1:8000`, or Vite was not restarted. |
| Page opens at `localhost` and recovery email lands on a different host | Always use `http://127.0.0.1:5173`. |
| Legacy pages (Study Overview, Comparison, Data Management) say "not available" | Expected: the original study schema is not installed in Supabase. They are disabled by design. |
| Charts empty / "—" values | The selected date has no data. Measurements cover about 5–14 October 2026 and individual metrics have gaps. Missing is not zero. Check the date, the JSON/CSV source and the day/night filter. |
| `Port already in use` | Close the other process or choose another `--port` (and update the Vite proxy/backend URL accordingly). |
| `.env` changes ignored | Restart the backend; restart `npm run dev` for `.env.local`. |

## 8. Rules of the road

* Never commit `backend/.env`, `frontend/.env.local`, databases, health exports
  or tokens. `git status` must never list them.
* Do not run migrations or import scripts against the shared database unless
  agreed with the owner.
* Report anything suspicious (leaked key, unexpected access) immediately.
