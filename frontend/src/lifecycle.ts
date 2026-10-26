const HEARTBEAT_INTERVAL_MS = 5000

let started = false

/**
 * 啟動瀏覽器關閉偵測（僅在打包後 PROD 模式啟用，見 main.tsx）。
 *
 * - 先查 `/lifecycle/status`：後端沒接管生命週期（Docker/server 模式，
 *   `SCHEDULER_DISABLE_LIFECYCLE=1` 或直接跑 uvicorn）就不送 heartbeat、
 *   也不掛 beacon，省掉每 5 秒一次的 log 噪音。查不到就照舊啟動（離線版行為不變）。
 * - 每 5 秒送 heartbeat，並在 focus / 回到前景時補送
 * - 分頁關閉（pagehide/beforeunload）時用 sendBeacon 通知後端
 * - 後端收到 beacon 會延遲關閉；refresh 時新頁 heartbeat 會取消該延遲
 */
export async function startLifecycleMonitor(): Promise<void> {
  if (started) return
  started = true

  try {
    const res = await fetch('/api/v1/lifecycle/status')
    if (res.ok) {
      const body = (await res.json()) as { enabled?: boolean }
      if (body && body.enabled === false) return
    }
  } catch {
    /* 查不到就照舊啟動 */
  }

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
