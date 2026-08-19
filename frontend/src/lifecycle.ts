const HEARTBEAT_INTERVAL_MS = 5000

let started = false

/**
 * 啟動瀏覽器關閉偵測（僅在打包後 PROD 模式啟用，見 main.tsx）。
 *
 * - 每 5 秒送 heartbeat，並在 focus / 回到前景時補送
 * - 分頁關閉（pagehide/beforeunload）時用 sendBeacon 通知後端
 * - 後端收到 beacon 會延遲關閉；refresh 時新頁 heartbeat 會取消該延遲
 */
export function startLifecycleMonitor(): void {
  if (started) return
  started = true

  const sendHeartbeat = () => {
    fetch('/api/v1/lifecycle/heartbeat', { method: 'GET', keepalive: true }).catch(
      () => {},
    )
  }

  const sendShutdownSignal = () => {
    navigator.sendBeacon('/api/v1/lifecycle/shutdown-signal')
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') sendHeartbeat()
  }

  sendHeartbeat()
  window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)

  window.addEventListener('focus', sendHeartbeat)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', sendShutdownSignal)
  window.addEventListener('beforeunload', sendShutdownSignal)
}
