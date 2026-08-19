"""瀏覽器關閉偵測 — 後台自動關閉管理。

當使用者關閉瀏覽器分頁時，前端會發出兩個互補訊號：
  1. beacon（POST /lifecycle/shutdown-signal）→ 正常關分頁，延遲關閉
  2. heartbeat（GET /lifecycle/heartbeat）停止 → 當機/強制關閉時超時兜底

本模組提供 LifecycleManager 管理這些訊號，並在適當時機優雅停止 uvicorn。

開發模式（uvicorn app.api:app）不會呼叫 enable()，因此所有操作皆為 no-op，
避免誤關開發中的伺服器。
"""
import os
import threading
import time

DEFAULT_TIMEOUT_SECONDS = 90.0  # 心跳超時（兜底當機/強制關閉）
SHUTDOWN_DELAY_SECONDS = 3.0  # beacon 觸發後的延遲（避開 refresh 誤關）
UI_SHUTDOWN_DELAY_SECONDS = 1.0  # UI 按鈕觸發後的延遲（等 response 送出）
MONITOR_INTERVAL_SECONDS = 5.0  # 監視迴圈檢查間隔


class LifecycleManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._enabled = False
        self._server = None
        self._last_heartbeat = 0.0
        self._shutdown_timer: threading.Timer | None = None
        self._shutdown_cancellable = False
        self._monitor_thread: threading.Thread | None = None
        self._timeout = DEFAULT_TIMEOUT_SECONDS

    def enable(self, server) -> None:
        """由 run.py 呼叫，註冊 uvicorn.Server 參照並啟動監視線程。"""
        with self._lock:
            self._server = server
            self._last_heartbeat = time.monotonic()
            self._enabled = True
        if self._monitor_thread is None:
            self._monitor_thread = threading.Thread(
                target=self._monitor_loop, name="lifecycle-monitor", daemon=True
            )
            self._monitor_thread.start()

    def heartbeat(self) -> None:
        """前端心跳。僅取消「beacon 型」待處理關閉（refresh 情境），不影響強制關閉。"""
        with self._lock:
            if not self._enabled:
                return
            self._last_heartbeat = time.monotonic()
            if self._shutdown_timer is not None and self._shutdown_cancellable:
                self._shutdown_timer.cancel()
                self._shutdown_timer = None
                self._shutdown_cancellable = False

    def signal_shutdown(self) -> None:
        """beacon 觸發：延遲後關閉，期間恢復心跳則取消（避開 refresh 誤關）。"""
        with self._lock:
            if not self._enabled:
                return
            self._schedule_shutdown(SHUTDOWN_DELAY_SECONDS, cancellable=True)

    def shutdown_now(self) -> None:
        """UI 按鈕觸發：短延遲後關閉（等 response 送出），不可被心跳取消。"""
        with self._lock:
            if not self._enabled:
                return
            self._schedule_shutdown(UI_SHUTDOWN_DELAY_SECONDS, cancellable=False)

    def _schedule_shutdown(self, delay: float, cancellable: bool) -> None:
        if self._shutdown_timer is not None:
            self._shutdown_timer.cancel()
        self._shutdown_cancellable = cancellable
        self._shutdown_timer = threading.Timer(delay, self._do_shutdown)
        self._shutdown_timer.daemon = True
        self._shutdown_timer.start()

    def _do_shutdown(self) -> None:
        with self._lock:
            self._shutdown_timer = None
            self._shutdown_cancellable = False
            server = self._server
        if server is not None:
            server.should_exit = True
        else:
            os._exit(0)

    def _monitor_loop(self) -> None:
        while True:
            time.sleep(MONITOR_INTERVAL_SECONDS)
            with self._lock:
                if not self._enabled:
                    return
                idle = time.monotonic() - self._last_heartbeat
            if idle > self._timeout:
                self._do_shutdown()
                return


lifecycle = LifecycleManager()
