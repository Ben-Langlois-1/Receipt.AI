import { useEffect, useState } from 'react'
import { desktopBridge, type DesktopAiStatus } from './desktop-bridge.ts'
export function useDesktopAi(): DesktopAiStatus | null {
  const [status, setStatus] = useState<DesktopAiStatus | null>(() => desktopBridge() ? { phase: 'starting', message: 'Initializing local AI…' } : null)
  useEffect(() => {
    const bridge = desktopBridge()
    if (!bridge) return
    let mounted = true, eventReceived = false
    const unsubscribe = bridge.onStatus(value => { eventReceived = true; if (mounted) setStatus(value) })
    bridge.status().then(value => { if (mounted && !eventReceived) setStatus(value) }).catch(() => { if (mounted) setStatus({ phase: 'failed', message: 'Desktop AI status is unavailable.' }) })
    return () => { mounted = false; unsubscribe() }
  }, [])
  return status
}
