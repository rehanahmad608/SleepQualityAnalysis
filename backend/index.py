"""Vercel FastAPI entrypoint; deploy with Root Directory set to backend."""
import os

if os.getenv("VERCEL") and not os.getenv("DATABASE_URL", "").startswith("postgres"):
    raise RuntimeError("Set a PostgreSQL DATABASE_URL in Vercel before deploying.")

from app.main import app  # noqa: E402, F401
