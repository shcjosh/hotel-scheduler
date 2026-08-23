"""瀏覽器關閉偵測 — 後台自動關閉管理。

使用者關閉瀏覽器分頁時，前端用 beacon（POST /lifecycle/shutdown-signal）通知後端，
後端延遲關閉；refresh 時新頁的 heartbeat 會取消該延遲（避免誤關）。

本設計採「只靠 beacon」：
  - 真正的關閉訊號只有「關分頁（beacon）」與「UI 關閉按鈕」
  - heartbeat 超時**不再**觸發關閉，避免瀏覽器省電/凍結背景分頁時誤關後台
  - 若瀏覽器當機（未發 beacon），後台會留存；再次啟動時 run.py 的 port 偵測
    會直接連到既有實例（單一實例行為），不會衝突

開發模式（uvicorn app.api:app）不會呼叫 enable()，因此所有操作皆為 no-op，
避免誤關開發中的伺服器。
"""
import os
import threading

SHUTDOWN_DELAY_SECONDS = 3.0  # beacon 觸發後的延遲（避開 refresh 誤關）
UI_SHUTDOWN_DELAY_SECONDS = 1.0  # UI 按鈕觸發後的延遲（等 response 送出）


class LifecycleManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._enabled = False
        self._server = None
        self._shutdown_timer: threading.Timer | None = None
        self._shutdown_cancellable = False

    def enable(self, server) -> None:
        """由 run.py 呼叫，註冊 uvicorn.Server 參照。"""
        with self._lock:
            self._server = server
            self._enabled = True

    def heartbeat(self) -> None:
        """前端心跳。僅取消「beacon 型」待處理關閉（refresh 情境），不觸發關閉。"""
        with self._lock:
            if not self._enabled:
                return
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


lifecycle = LifecycleManager()