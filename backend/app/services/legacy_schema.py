"""Read-only verification that the legacy study schema is fully installed.

Legacy features are enabled only when EVERY table (and every mapped column) of
the legacy ORM metadata exists. Presence of a single table such as ``studies``
is not enough, and no configuration value can override a failed check.
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Any, Dict, List, Optional

from sqlalchemy import inspect
from sqlalchemy.engine import Connection, Engine

from app.config import settings

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 30.0
_cache: Dict[str, tuple[float, Dict[str, Any]]] = {}
_lock = threading.Lock()


def _expected_schema() -> Dict[str, List[str]]:
    import app.models  # noqa: F401  registers every legacy model on Base.metadata
    from app.db.session import Base

    return {name: [c.name for c in table.columns] for name, table in Base.metadata.tables.items()}


def _inspect(bind) -> Dict[str, Any]:
    expected = _expected_schema()
    try:
        insp = inspect(bind)
        present = set(insp.get_table_names())
        missing_tables = sorted(t for t in expected if t not in present)
        missing_columns: Dict[str, List[str]] = {}
        for table, columns in expected.items():
            if table not in present:
                continue
            have = {c["name"] for c in insp.get_columns(table)}
            absent = sorted(c for c in columns if c not in have)
            if absent:
                missing_columns[table] = absent
        available = not missing_tables and not missing_columns
        return {
            "available": available,
            "missing_tables": missing_tables,
            "missing_columns": missing_columns,
            "reason": None if available else "missing_schema",
        }
    except Exception:  # noqa: BLE001 - never raise from a capability probe
        logger.warning("Legacy schema inspection failed", exc_info=False)
        return {
            "available": False,
            "missing_tables": sorted(expected),
            "missing_columns": {},
            "reason": "inspection_failed",
        }


def legacy_schema_status(bind: Engine | Connection, *, use_cache: bool = True) -> Dict[str, Any]:
    key = str(getattr(bind, "url", id(bind)))
    now = time.monotonic()
    if use_cache:
        with _lock:
            hit = _cache.get(key)
            if hit and now - hit[0] < _CACHE_TTL_SECONDS:
                return hit[1]
    status = _inspect(bind)
    with _lock:
        _cache[key] = (now, status)
    return status


def clear_cache() -> None:
    with _lock:
        _cache.clear()


def legacy_state(bind, *, use_cache: bool = True) -> Dict[str, Any]:
    """Effective legacy availability combining the setting and the schema check.

    ``LEGACY_STUDY_ENABLED`` may be ``auto`` or ``false``; ``true`` is treated as
    a request only and can never make an incomplete schema usable.
    """
    mode = (settings.LEGACY_STUDY_ENABLED or "auto").strip().lower()
    requested = mode in ("auto", "true", "1", "yes")
    if mode in ("false", "0", "no", "off"):
        return {"available": False, "requested": False, "reason": "disabled_by_configuration",
                "missing_tables": [], "missing_columns": {}}
    schema = legacy_schema_status(bind, use_cache=use_cache)
    return {
        "available": bool(schema["available"]),
        "requested": requested,
        "reason": schema["reason"],
        "missing_tables": schema["missing_tables"],
        "missing_columns": schema["missing_columns"],
    }


def legacy_available(bind, *, use_cache: bool = True) -> bool:
    return bool(legacy_state(bind, use_cache=use_cache)["available"])
