# View imported Supabase data in React

The default dashboard now reads the `health_analysis_test` tables through the
FastAPI JSON endpoints. Database passwords remain in the Python backend.
The original study views are still available under Study Overview, Daily, Sleep,
Weekly and Comparison; those use the original application tables.

## Start locally

In a terminal in the backend folder:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In a second terminal in the frontend folder:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```

Open http://127.0.0.1:5173. Choose a participant, Daily or Weekly, a date, JSON
or CSV, and Full day, Day, or Night. Weekly means seven consecutive dates starting
on the selected date. The available data dates are shown above the results.
The original files remain intact; viewing data does not write to the database.
Sidebar Daily, Night and Weekly also open these participant views directly;
they do not depend on the legacy study configuration. Daily initially selects
daytime, Night selects nighttime, and Weekly selects seven full calendar dates.
The old daily, sleep and weekly study pages remain under `/study/daily`,
`/study/sleep` and `/study/weekly` for legacy data.

## JSON API

All endpoints are under `/api/v1`:

- `GET /participants`: permitted participant codes and available date bounds.
- `GET /participants/P001/daily?date=2026-10-09&period=day&format=json`.
- `GET /participants/P001/weekly?week_start=2026-10-09&period=night&format=csv`.
- `GET /participants/P001/range?start_date=2026-10-09&end_date=2026-10-13`.

Responses include daily metrics, aggregate summary, hourly heart-rate averages,
and morning/evening questionnaire responses. The date range is inclusive and
limited to 31 days. `period` is `all`, `day` or `night`; `format` is `json` or
`csv`. The format is an export source choice, not the HTTP response format:
every API response is JSON. Query cache keys include participant, date, view,
format, period and session to prevent stale cross-participant display.

Europe/Amsterdam determines dates and day/night boundaries. Day is 06:00–22:00.
Night includes the parts of each calendar date before 06:00 and after 22:00;
it is not a single overnight sleep-session window. Heart rate and HRV use that
filter. Step totals exclude overlapping, midnight-crossing and selected-period
boundary-crossing intervals, and report exclusions. No partial interval counts
are invented. Sleep uses wake dates, while resting HR and questionnaires use
their recorded dates; these daily values are independent of the time-of-day
filter. Missing dates have NULL metrics rather than invented zeroes.

The observed mean BPM is weighted by the number of samples when combining days,
not an average of daily averages or a time-weighted physiological estimate.
Select either JSON or CSV to avoid adding paired source copies together.
Different principal measurement values at the same instant remain source variants
in the underlying test tables; scientific use may require resolving corrections.
Sleep hours total recorded sessions per wake date, including naps.
Heart-rate charts leave gaps for hours without samples and preserve the extra
hour on the autumn daylight-saving transition; missing samples are not interpolated.

## Authenticate before Vercel deployment

Local loopback development without Supabase Auth configuration permits only the
backend's configured participant code. On Vercel all data routes fail closed
until authentication is configured. A participant code in a URL is not permission.

In Supabase Authentication, create/invite the two application users and obtain
each user's UUID. Backend environment variables:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
AUTH_PARTICIPANT_ACCESS={"FIRST_AUTH_UUID":["P001"],"SECOND_AUTH_UUID":["P001"]}
```

The mapping is server-owned. Never take participant grants from editable user
metadata. FastAPI verifies bearer tokens using Supabase Auth before reading
the grant mapping. Requests for ungranted participants return 403. The existing
study/data routes also require access to their configured study participant.

Frontend environment variables:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
VITE_API_BASE_URL=https://YOUR_BACKEND.vercel.app/api/v1
```

Only the public key belongs in the frontend; never use a service-role key or
database URI. The page provides email/password sign-in and sign-out. Tokens are
kept in tab session storage and sent in Authorization headers, not query strings.
If a session expires, sign out and back in. Account creation, password recovery
and automatic token refresh are not implemented by this dashboard yet.

Set backend CORS to the exact frontend origin. The authenticated default
Participant Data view is the supported production workflow; older study views
retain their legacy response-contract limitations and are not migrated to the
structured Supabase tables by this change.

## Access control (default-deny)

Participant and legacy endpoints are **denied by default**. Production or any
shared host must configure Supabase Auth (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) and
the server-side `AUTH_PARTICIPANT_ACCESS` grants. A request from `127.0.0.1` is
**not** treated as trusted.

For isolated local testing without sign-in, set all of:

```text
APP_ENV=local-dev
DEV_ANONYMOUS_ACCESS=true
APP_BIND_HOST=127.0.0.1
```

and start the API exactly like this (loopback only, no proxy headers):

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-proxy-headers
```

The API refuses to start if anonymous mode is enabled with a non-loopback bind,
on a shared-host marker (Vercel, Render, Kubernetes, ...), or with Supabase Auth
configured; per request it also rejects forwarded/proxied requests and non-loopback
`Host` headers. Anonymous mode is read-only and limited to `PARTICIPANT_CODE`.

## Legacy study features

`GET /api/v1/capabilities` reports whether the original study schema is fully
installed (every table and column). Legacy pages (`Study Overview`, `Comparison`,
`Data Management`, `/study/*`) are hidden and legacy endpoints answer
`503 legacy_study_unavailable` otherwise; `LEGACY_STUDY_ENABLED=true` cannot
override a missing schema. Legacy `POST /sync` and `POST /import` additionally
require `APP_ENV=local-dev`, `ALLOW_LEGACY_WRITES=true` and an administrator
(`AUTH_ADMIN_USERS`), and are always refused on shared hosts.
