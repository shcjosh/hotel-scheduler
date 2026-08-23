"""飯店排班系統 - 入口點（開發與 PyInstaller 打包通用）。

啟動後自動開啟瀏覽器到 http://localhost:8765
"""
import os
import sys
# === PyInstaller --windowed 模式修復 ===
# 無 console 時 sys.stdout / sys.stderr 為 None
# uvicorn logging 會呼叫 .isatty() 而崩潰
# 導到 devnull 避免 crash
if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')
# ======================================
import threading
import time
import webbrowser
from pathlib import Path
import socket


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
from app.config import HOST, PORT  # noqa: E402
from app.lifecycle import lifecycle  # noqa: E402


def _port_in_use(host: str, port: int) -> bool:
    """綁定測試：port 已被占用則回傳 True（偵測既有實例）。"""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind((host, port))
        return False
    except OSError:
        return True
    finally:
        s.close()


def open_browser() -> None:
    time.sleep(2)
    webbrowser.open(f"http://localhost:{PORT}")


def main() -> None:
    if _port_in_use(HOST, PORT):
        # 已有實例在跑（如瀏覽器當機後殘留後台）：只開瀏覽器連到既有實例，然後退出
        webbrowser.open(f"http://localhost:{PORT}")
        return
    threading.Thread(target=open_browser, daemon=True).start()
    import uvicorn

    config = uvicorn.Config(app, host=HOST, port=PORT, log_level="warning")
    server = uvicorn.Server(config)
    # 測試期間可設 SCHEDULER_DISABLE_LIFECYCLE=1 關閉「關分頁自動結束」偵測
    if os.environ.get("SCHEDULER_DISABLE_LIFECYCLE") != "1":
        lifecycle.enable(server)
    server.run()


if __name__ == "__main__":
    main()
