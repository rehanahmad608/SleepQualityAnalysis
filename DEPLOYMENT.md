# Supabase database and Vercel deployment

Deploy the existing React dashboard and FastAPI API as two Vercel projects from
this repository. Both use one Supabase PostgreSQL database. Credentials stay in
the backend. Local development can continue using SQLite.

## 1. Create and configure Supabase

Create a Supabase project. In **Connect**, copy its **Transaction pooler** URI
(port 6543). Set `DATABASE_URL` in `backend/.env` locally and in the backend
Vercel project's environment variables. Use `postgresql+psycopg://` as the
scheme and append `?sslmode=require`. URL-encode special characters in the
database password. Do not paste the password into chat or commit it.

Set `MIGRATION_DATABASE_URL` locally to the **Session pooler** URI (port 5432),
with the same driver scheme and SSL option. Set `AUTO_CREATE_TABLES=false`.
You do not need Supabase API keys for this SQLAlchemy connection.

From `E:\Fontys\S1\Ch1\SleepQualityAnalysis\backend`, using the existing virtual environment:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
```

The migrations create the ten existing application tables and enable PostgreSQL
row level security without browser policies. Supabase anonymous and authenticated
Data API users cannot read these tables. The backend database owner can still
access them; this does not authenticate users of the FastAPI API.

## 2. Store data

### Original Google Health JSON exports in isolated test tables

`import_health_exports.py` reads the two `health-export9oct` and
`health-export10oct` folders by default. It preserves all five metric types as
JSONB without converting or discarding nested source fields. It creates the
separate `health_export_test` schema, with `exports`, `records`, and
`export_records` tables; the existing dashboard tables are unaffected.
The records table deduplicates identical metric payloads across exports; the
link table retains which export contained each record. These contain the real
source records, not synthetic or anonymized data, and are not integrated into
the dashboard analytics yet.

From the backend folder:

```powershell
.\.venv\Scripts\python.exe import_health_exports.py
.\.venv\Scripts\python.exe import_health_exports.py --apply
```

The first command validates files without modifying the database. The second
creates and imports the isolated test tables in a single transaction. The
schema has row level security and is intended for database-owner access only.
After import, use Supabase SQL Editor to verify:

```sql
SELECT metric, count(*) FROM health_export_test.records GROUP BY metric;
SELECT export_name, metric, count(*)
FROM health_export_test.export_records GROUP BY export_name, metric;
SELECT metric, payload FROM health_export_test.records LIMIT 10;
```

`backend/health_export_test_schema.sql` contains the table definitions if you
want to inspect or create the empty tables through Supabase SQL Editor.
Record counts reflect unique payloads and may be lower than source counts.
Reimporting identical files does not add duplicates. Use a new export folder
name if the contents change.

For synthetic demo data, after migrations:

```powershell
.\.venv\Scripts\python.exe seed_demo.py
```

To preserve existing SQLite records instead, first back up the SQLite file, then:

```powershell
.\.venv\Scripts\python.exe migrate_sqlite.py --source sleep_quality_dev.db
.\.venv\Scripts\python.exe migrate_sqlite.py --source sleep_quality_dev.db --apply
```

The first command checks and reports counts without copying. The second copies
all existing model tables in dependency order and one transaction, preserving
IDs. The target must be migrated and all application tables empty. Do not seed
the target before copying. The script does not modify the source. Copying real
health records requires participant authorization and the access controls below.

Existing JSON imports and analytics automatically use DATABASE_URL; no frontend
database client is needed. HRV and exported daily resting heart rate do not yet
have dedicated models/import support. This setup does not add that support.

## 3. Deploy the backend on Vercel

Import the repository into Vercel with **Root Directory: backend** and framework
**FastAPI**. `index.py` exports the application, and `requirements.txt` supplies
its dependencies. Configure:

- `DATABASE_URL`: Supabase Transaction pooler URI as above.
- `AUTO_CREATE_TABLES`: `false`.
- `BACKEND_CORS_ORIGINS`: exact frontend origin, e.g. `https://YOUR-FRONTEND.vercel.app`.
- `FRONTEND_ORIGIN`: the same frontend origin.
- Study settings such as `PARTICIPANT_CODE`, `STUDY_START_DATE`, and `STUDY_TIMEZONE`.
- Private generated values for `SECRET_KEY` and `TOKEN_ENCRYPTION_KEY`.

Do not migrate or seed during a Vercel build or request. Run migrations explicitly
from the local environment. Preview deployments must use a separate test database
if their users can modify data. Verify `/healthz`, then a dashboard API endpoint;
`/healthz` alone does not verify database connectivity.

## 4. Deploy the frontend on Vercel

Import the same repository as another Vercel project, **Root Directory: frontend**,
framework **Vite**, build command `npm run build`, output directory `dist`.
Set `VITE_API_BASE_URL=https://YOUR-BACKEND.vercel.app/api/v1` before building.
Update backend CORS with the actual frontend URL. Redeploy after changing these
values. `vercel.json` supports browser refreshes on React routes.

Verify dashboard loading and a synthetic import, then confirm rows in Supabase's
Table Editor and refresh the dashboard from another browser.

## Access and current limitations

The participant dashboard now verifies Supabase Auth tokens and server-owned
participant grants. Configure the authentication variables in
`PARTICIPANT_DASHBOARD.md` for both collaborators before deploying on Vercel.
The API fails closed on Vercel until authentication is configured. Local loopback
development permits the configured participant when Auth is not configured.
CORS and database row level security are not substitutes for API authentication.

The existing background sync implementation is not a durable worker. Vercel
functions have execution limits, so large imports and background synchronization
need a separate durable job design. Use the local seed/import tools for initial
data loading rather than relying on a deployed background sync job.

`.env` and the SQLite database were already tracked in this repository. The new
ignore rules protect future untracked files only. Remove those files from Git
tracking before publishing; rotate any credentials that were previously pushed.
No history has been rewritten by this change.

## References

- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Psycopg prepared statements with transaction pooling](https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL)
- [FastAPI on Vercel](https://vercel.com/docs/frameworks/backend/fastapi)
