import os
import sys
import threading
import webbrowser

import uvicorn


def open_browser() -> None:
    import time

    time.sleep(1.5)
    webbrowser.open("http://localhost:8000")


def get_base_path() -> str:
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main() -> None:
    base_path = get_base_path()

    data_dir = os.path.join(base_path, "data")
    os.makedirs(data_dir, exist_ok=True)
    os.environ["DB_PATH"] = os.path.join(data_dir, "scheduler.db")

    static_dir = os.path.join(base_path, "static")
    os.environ["STATIC_DIR"] = static_dir

    threading.Thread(target=open_browser, daemon=True).start()

    uvicorn.run("app.api:app", host="127.0.0.1", port=8000, log_level="info")


if __name__ == "__main__":
    main()
