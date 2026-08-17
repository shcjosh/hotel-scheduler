from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import cross_month, employees, night, off_days, schedules, solve
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
app.include_router(solve.router, prefix=API_PREFIX, tags=["solve"])


@app.get(f"{API_PREFIX}/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"service": "Hotel Shift Scheduler", "docs": "/docs", "api": API_PREFIX}


if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
