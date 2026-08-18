export function shutdownServer(): void {
  fetch('/api/v1/lifecycle/shutdown', { method: 'POST', keepalive: true }).catch(
    () => {},
  )
}
