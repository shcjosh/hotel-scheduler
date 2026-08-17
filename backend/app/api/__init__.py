from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import sys

from app.api.routes import (
    cross_month,
    employees,
    export,
    night,
    off_days,
    schedules,
    settings,
    solve,
    stats,
    support,
)
from app.config import STATIC_DIR
from app.database.connection import init_db

API_PREFIX = "/api/v1"

app = FastAPI(title="Hotel Shift Scheduler", version="1.0")

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
app.include_router(cross_month.router, prefix=API_PREFIX, tags=["cross-month"])
app.include_router(night.router, prefix=API_PREFIX, tags=["night"])
app.include_router(support.router, prefix=API_PREFIX, tags=["support"])
app.include_router(settings.router, prefix=API_PREFIX, tags=["settings"])
app.include_router(stats.router, prefix=API_PREFIX, tags=["stats"])
app.include_router(export.router, prefix=API_PREFIX, tags=["export"])
app.include_router(solve.router, prefix=API_PREFIX, tags=["solve"])


@app.get(f"{API_PREFIX}/health")
def health():
    return {"status": "ok"}


def _frontend_dist() -> Path | None:
    if getattr(sys, "frozen", False):
        p = Path(sys._MEIPASS) / "frontend" / "dist"
    else:
        p = Path(__file__).resolve().parent.parent.parent.parent / "frontend" / "dist"
    return p if p.is_dir() else None


_frontend = _frontend_dist()
if _frontend is None and STATIC_DIR.is_dir():
    _frontend = STATIC_DIR
if _frontend is not None:
    app.mount("/", StaticFiles(directory=str(_frontend), html=True), name="frontend")
