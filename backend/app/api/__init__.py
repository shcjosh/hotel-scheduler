from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from starlette.exceptions import HTTPException as StarletteHTTPException
import sys

from app.api.routes import (
    annual_leave,
    cross_month,
    database,
    employees,
    export,
    leave_types,
    lifecycle,
    night,
    off_days,
    schedule_meta,
    schedules,
    settings,
    solve,
    stats,
    support,
    updates,
)
from app.config import BASE_DIR, STATIC_DIR
from app.database.connection import init_db
from app.version import __version__

API_PREFIX = "/api/v1"

app = FastAPI(title="Hotel Shift Scheduler", version=__version__)

init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(employees.router, prefix=API_PREFIX, tags=["employees"])
app.include_router(schedules.router, prefix=API_PREFIX, tags=["schedules"])
app.include_router(off_days.router, prefix=API_PREFIX, tags=["off-days"])
app.include_router(leave_types.router, prefix=API_PREFIX, tags=["leave-types"])
app.include_router(annual_leave.router, prefix=API_PREFIX, tags=["annual-leave"])
app.include_router(schedule_meta.router, prefix=API_PREFIX, tags=["schedule-meta"])
app.include_router(cross_month.router, prefix=API_PREFIX, tags=["cross-month"])
app.include_router(night.router, prefix=API_PREFIX, tags=["night"])
app.include_router(support.router, prefix=API_PREFIX, tags=["support"])
app.include_router(database.router, prefix=API_PREFIX, tags=["database"])
app.include_router(settings.router, prefix=API_PREFIX, tags=["settings"])
app.include_router(stats.router, prefix=API_PREFIX, tags=["stats"])
app.include_router(export.router, prefix=API_PREFIX, tags=["export"])
app.include_router(solve.router, prefix=API_PREFIX, tags=["solve"])
app.include_router(lifecycle.router, prefix=API_PREFIX, tags=["lifecycle"])
app.include_router(updates.router, prefix=API_PREFIX, tags=["updates"])


@app.get(f"{API_PREFIX}/health")
def health():
    return {"status": "ok", "version": __version__}


def _frontend_dist() -> Path | None:
    # 三種佈局：PyInstaller（frozen）/ Docker（BASE_DIR=/app）/ repo（BASE_DIR=backend/）
    candidates: list[Path] = []
    if getattr(sys, "frozen", False):
        candidates.append(Path(sys._MEIPASS) / "frontend" / "dist")
    candidates += [
        BASE_DIR / "frontend" / "dist",
        BASE_DIR.parent / "frontend" / "dist",
        STATIC_DIR,
    ]
    for p in candidates:
        if p.is_dir() and (p / "index.html").is_file():
            return p
    return None


_frontend = _frontend_dist()
if _frontend is None and STATIC_DIR.is_dir():
    _frontend = STATIC_DIR


class _SpaStaticFiles(StaticFiles):
    """BrowserRouter 的深連結支援（v1.3.0）。

    StaticFiles(html=True) 只對「目錄」回 index.html，像 /housekeeping、/stats
    直接重新整理會 404。這裡在找不到檔案且路徑沒有副檔名時回 index.html，
    讓前端路由接手（/api/* 已在 mount 之前註冊，不受影響）。
    """

    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            is_api = path == "api" or path.startswith("api/")
            if exc.status_code == 404 and not is_api and not Path(path).suffix:
                return await super().get_response("index.html", scope)
            raise


if _frontend is not None:
    app.mount("/", _SpaStaticFiles(directory=str(_frontend), html=True), name="frontend")
