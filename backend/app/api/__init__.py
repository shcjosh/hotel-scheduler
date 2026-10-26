from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
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
if _frontend is not None:
    app.mount("/", StaticFiles(directory=str(_frontend), html=True), name="frontend")
