from fastapi import APIRouter

from app.api.v1 import study, dashboard, heart_rate, sleep, sync, imports, export as export_api

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(study.router, tags=["study"])
api_router.include_router(dashboard.router, tags=["dashboard"])
api_router.include_router(heart_rate.router, tags=["heart_rate"])
api_router.include_router(sleep.router, tags=["sleep"])
api_router.include_router(sync.router, tags=["sync"])
api_router.include_router(imports.router, tags=["import"])
api_router.include_router(export_api.router, tags=["export"])
