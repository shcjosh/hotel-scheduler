"""飯店排班系統 - 入口點（開發與 PyInstaller 打包通用）。

啟動後自動開啟瀏覽器到 http://localhost:8000
"""
import os
import sys
import threading
import time
import webbrowser
from pathlib import Path


def ensure_data_dir() -> None:
    if getattr(sys, "frozen", False):
        base = Path(sys.executable).parent
    else:
        base = Path(__file__).parent
    data_dir = base / "data"
    data_dir.mkdir(exist_ok=True)
    os.environ.setdefault("DB_PATH", str(data_dir / "scheduler.db"))


# 必須在 import app.api 之前設定 DB_PATH
ensure_data_dir()

# 直接 import app 讓 PyInstaller 能追蹤 fastapi/sqlalchemy/ortools 等依賴
from app.api import app  # noqa: E402


def open_browser() -> None:
    time.sleep(2)
    webbrowser.open("http://localhost:8000")


def main() -> None:
    threading.Thread(target=open_browser, daemon=True).start()
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")


if __name__ == "__main__":
    main()
