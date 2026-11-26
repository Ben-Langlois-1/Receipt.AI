import { useDesktopAi } from './use-desktop-ai.ts'
export function DesktopAiStatus() {
  const status = useDesktopAi()
  return status ? <span role="status" className="desktop-ai-status">{status.message}</span> : null
}
