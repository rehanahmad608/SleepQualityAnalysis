from dataclasses import dataclass
from datetime import date, timedelta
import hashlib
import json
import os
import time
from typing import Literal, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.security import admin_user_ids, anonymous_request_allowed, writes_policy_problems
from app.services.participant_data import dashboard_data

router = APIRouter(prefix='/participants')


@dataclass(frozen=True)
class Identity:
    """Who is calling. ``participants`` are the only participants they may read."""
    user_id: Optional[str]
    participants: tuple
    anonymous: bool = False


# token-hash -> (expires_at, Identity). Short TTL: revocation takes effect within it.
_TOKEN_TTL_SECONDS = 60.0
_token_cache: dict = {}


def clear_token_cache() -> None:
    _token_cache.clear()


def _cache_key(token: str) -> str:
    material = '|'.join([token, settings.SUPABASE_URL, settings.AUTH_PARTICIPANT_ACCESS])
    return hashlib.sha256(material.encode()).hexdigest()


def _verify_bearer(authorization: str) -> Identity:
    key = _cache_key(authorization)
    hit = _token_cache.get(key)
    now = time.monotonic()
    if hit and hit[0] > now:
        return hit[1]
    try:
        response = httpx.get(settings.SUPABASE_URL.rstrip('/') + '/auth/v1/user',
            headers={'Authorization': authorization, 'apikey': settings.SUPABASE_ANON_KEY}, timeout=10)
        if response.status_code != 200:
            raise HTTPException(401, 'Session expired. Please sign in again.')
        access = json.loads(settings.AUTH_PARTICIPANT_ACCESS)
        user_id = response.json()['id']
        codes = access.get(user_id, [])
        if not isinstance(codes, list) or not all(isinstance(c, str) for c in codes):
            raise ValueError('Invalid access mapping')
    except (httpx.HTTPError, ValueError, KeyError, AttributeError):
        raise HTTPException(503, 'Authentication is temporarily unavailable.')
    identity = Identity(user_id=user_id, participants=tuple(codes))
    if len(_token_cache) > 256:
        _token_cache.clear()
    _token_cache[key] = (now + _TOKEN_TTL_SECONDS, identity)
    return identity


def current_identity(authorization: str | None = Header(default=None), request: Request = None) -> Identity:
    """Default-deny. Anonymous access exists only in the isolated local-dev mode."""
    if settings.SUPABASE_URL:
        if not settings.SUPABASE_ANON_KEY:
            raise HTTPException(503, 'Configure Supabase Auth before publishing participant data.')
        if not authorization or not authorization.startswith('Bearer '):
            raise HTTPException(401, 'Sign in to view participant data.')
        return _verify_bearer(authorization)
    # No Auth configured: only the explicit isolated local-development mode may proceed.
    if request is not None and anonymous_request_allowed(
            request.client.host if request.client else None, dict(request.headers)):
        return Identity(user_id=None, participants=(settings.PARTICIPANT_CODE,), anonymous=True)
    if settings.DEV_ANONYMOUS_ACCESS:
        raise HTTPException(401, 'Sign in to view participant data.')
    raise HTTPException(503, 'Configure Supabase Auth before publishing participant data.')


def allowed_participants(authorization: str | None = Header(default=None), request: Request = None) -> list[str]:
    return list(current_identity(authorization, request).participants)


def legacy_access(allowed: list[str] = Depends(allowed_participants)):
    if settings.PARTICIPANT_CODE not in allowed:
        raise HTTPException(403, 'You do not have access to the configured study participant.')


def require_legacy_write(identity: Identity = Depends(current_identity)):
    """Legacy import/sync/regenerate: local-dev only, explicitly enabled, admin identity."""
    problems = writes_policy_problems()
    if problems:
        raise HTTPException(403, 'Legacy write operations are disabled: ' + problems[0] + '.')
    if identity.anonymous or not identity.user_id or identity.user_id not in admin_user_ids():
        raise HTTPException(403, 'Legacy write operations require an administrator.')
    if settings.PARTICIPANT_CODE not in identity.participants:
        raise HTTPException(403, 'You do not have access to the configured study participant.')


@router.get('')
def participants(db: Session=Depends(get_db), allowed: list[str]=Depends(allowed_participants)):
    if not allowed:
        return []
    result=[]
    try:
        for code in allowed:
            participant=db.execute(text('SELECT participant_code,timezone FROM health_analysis_test.participants WHERE participant_code=:code'),{'code':code}).mappings().first()
            if participant:
                bounds=db.execute(text('''SELECT min(study_date) AS start_date,max(study_date) AS end_date FROM (
                    SELECT study_date FROM health_analysis_test.heart_rate WHERE participant_code=:code
                    UNION ALL SELECT study_date FROM health_analysis_test.steps WHERE participant_code=:code
                    UNION ALL SELECT study_date FROM health_analysis_test.sleep WHERE participant_code=:code
                    UNION ALL SELECT study_date FROM health_analysis_test.hrv WHERE participant_code=:code
                    UNION ALL SELECT study_date FROM health_analysis_test.resting_heart_rate WHERE participant_code=:code
                    UNION ALL SELECT study_date FROM health_analysis_test.morning_responses WHERE participant_code=:code
                    UNION ALL SELECT study_date FROM health_analysis_test.evening_responses WHERE participant_code=:code
                ) records'''),{'code':code}).mappings().one()
                default_date=db.scalar(text('SELECT min(study_date) FROM health_analysis_test.heart_rate WHERE participant_code=:code'),{'code':code})
                result.append({**participant,**bounds,'default_date':default_date or bounds['start_date']})
        return result
    except SQLAlchemyError:
        raise HTTPException(503,'Structured participant data is unavailable. Check database setup.')


def get_data(code,start,end,fmt,period,db,allowed):
    if code not in allowed:
        raise HTTPException(403,'You do not have access to this participant.')
    if end<start or (end-start).days>30:
        raise HTTPException(422,'Select an inclusive date range of 1 to 31 days.')
    try:
        exists=db.scalar(text('SELECT 1 FROM health_analysis_test.participants WHERE participant_code=:code'),{'code':code})
        if not exists:
            raise HTTPException(404,'Participant not found.')
        return dashboard_data(db,code,start,end,fmt,period)
    except SQLAlchemyError:
        raise HTTPException(503,'Participant data is temporarily unavailable.')


@router.get('/{code}/daily')
def daily(code:str,date:date,format:Literal['json','csv']='json',period:Literal['all','day','night']='all',db:Session=Depends(get_db),allowed:list[str]=Depends(allowed_participants)):
    return get_data(code,date,date,format,period,db,allowed)


@router.get('/{code}/weekly')
def weekly(code:str,week_start:date,format:Literal['json','csv']='json',period:Literal['all','day','night']='all',db:Session=Depends(get_db),allowed:list[str]=Depends(allowed_participants)):
    return get_data(code,week_start,week_start+timedelta(days=6),format,period,db,allowed)


@router.get('/{code}/range')
def date_range(code:str,start_date:date,end_date:date,format:Literal['json','csv']='json',period:Literal['all','day','night']='all',db:Session=Depends(get_db),allowed:list[str]=Depends(allowed_participants)):
    return get_data(code,start_date,end_date,format,period,db,allowed)
