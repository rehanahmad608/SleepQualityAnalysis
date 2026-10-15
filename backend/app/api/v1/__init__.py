from fastapi import APIRouter, Depends

from app.api.v1 import study, dashboard, heart_rate, sleep, sync, imports, export as export_api
from app.api.v1 import participant_data, capabilities
from app.api.v1.capabilities import legacy_gate

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(participant_data.router, tags=["participant data"])
api_router.include_router(capabilities.router, tags=["capabilities"])

# Order matters: authenticate first, then check the legacy schema is really usable.
legacy_dependencies = [Depends(participant_data.legacy_access), Depends(legacy_gate)]
api_router.include_router(study.router, tags=["study"], dependencies=legacy_dependencies)
api_router.include_router(dashboard.router, tags=["dashboard"], dependencies=legacy_dependencies)
api_router.include_router(heart_rate.router, tags=["heart_rate"], dependencies=legacy_dependencies)
api_router.include_router(sleep.router, tags=["sleep"], dependencies=legacy_dependencies)
api_router.include_router(sync.router, tags=["sync"], dependencies=legacy_dependencies)
api_router.include_router(imports.router, tags=["import"], dependencies=legacy_dependencies)
api_router.include_router(export_api.router, tags=["export"], dependencies=legacy_dependencies)
