import os
import sys
from pathlib import Path


def _base_path() -> Path:
    if getattr(sys, "frozen", False):
        return Path(os.path.dirname(sys.executable))
    return Path(__file__).resolve().parent.parent


BASE_DIR = _base_path()
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR / "data"))
DB_PATH = Path(os.environ.get("DB_PATH", DATA_DIR / "scheduler.db"))
STATIC_DIR = Path(os.environ.get("STATIC_DIR", BASE_DIR / "static"))
DATABASE_URL = f"sqlite:///{DB_PATH}"

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8765"))
