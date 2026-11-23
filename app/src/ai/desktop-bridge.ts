export interface DesktopAiStatus { phase: 'idle' | 'starting' | 'ready' | 'failed' | 'stopped'; message: string }
export interface DesktopBridge {
  copyText(text: string): Promise<boolean>
  status(): Promise<DesktopAiStatus>
  request(request: { id: string; path: string; body?: unknown }): Promise<unknown>
  cancel(id: string): void
  retry(): Promise<DesktopAiStatus>
  useBundledModel(): Promise<DesktopAiStatus>
  chooseModel(): Promise<DesktopAiStatus>
  onStatus(callback: (status: DesktopAiStatus) => void): () => void
}
declare global { interface Window { receiptDesktop?: DesktopBridge } }
export function desktopBridge(): DesktopBridge | undefined { return typeof window === 'undefined' ? undefined : window.receiptDesktop }
export async function desktopJson(path: string, signal: AbortSignal, body?: unknown): Promise<unknown> {
  signal.throwIfAborted()
  const bridge = desktopBridge()
  if (!bridge) throw new Error('Desktop AI bridge is unavailable.')
  const id = crypto.randomUUID()
  const cancel = () => bridge.cancel(id)
  signal.addEventListener('abort', cancel, { once: true })
  try { const result = await bridge.request({ id, path, ...(body === undefined ? {} : { body }) }); signal.throwIfAborted(); return result }
  finally { signal.removeEventListener('abort', cancel) }
}
