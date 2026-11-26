import { desktopBridge } from '../ai/desktop-bridge.ts'
import { useDesktopAi } from '../ai/use-desktop-ai.ts'
import { askAdvisorReport, type AdvisorReport } from '../ai/advisor-report.ts'
import { AdvisorResponse } from '../ai/advisor-presentation.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '../components.tsx'
import { buildAdvisorContext } from '../ai/financial-context.ts'
import { getLocalModel } from '../ai/local-advisor.ts'
import type { LedgerTransaction } from '../finance/types.ts'

interface Props {
  transactions: LedgerTransaction[]
}

interface ConversationEntry {
  question: string
  report: AdvisorReport
}

const SUGGESTIONS = [
  'Where did most of my money go?',
  'Compare the latest two months of spending.',
  'Suggest ways to reduce my spending.',
  'How much have I spent on dining in the last six months?',
]

export default function AIAdvisorPage({ transactions }: Props) {
  const desktopStatus = useDesktopAi()
  const aiReady = !desktopStatus || desktopStatus.phase === 'ready'
  const context = useMemo(() => buildAdvisorContext(transactions), [transactions])
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<ConversationEntry[]>([])
  const [modelStatus, setModelStatus] = useState('Checking local model…')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const activeRequest = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    if (desktopBridge()) return () => { activeRequest.current?.abort() }
    getLocalModel(controller.signal)
      .then((model) => setModelStatus(`Local model ready: ${model}`))
      .catch(() => { if (!controller.signal.aborted) setModelStatus('Local model offline — start llama-server') })
    return () => {
      controller.abort()
      activeRequest.current?.abort()
    }
  }, [])

  async function submitQuestion(text: string) {
    if (busy || !aiReady || !text.trim()) return
    setError('')
    const controller = new AbortController()
    activeRequest.current = controller
    setBusy(true)
    try {
      const report = await askAdvisorReport(text, context, controller.signal)
      setHistory((previous) => [...previous, { question: text.trim(), report }])
      setQuestion('')
      if (report.explanationStatus === 'checked' || report.explanationStatus === 'withheld') setModelStatus('Local model connected')
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'An unknown error occurred.')
    } finally {
      activeRequest.current = null
      setBusy(false)
    }
  }

  const currencyLabels = context.currencies.map((item) => item.currency).join(', ') || 'None'
  return (
    <section className="ai-advisor" aria-label="AI Advisor">
      <Card title="Local AI Advisor">
        <p className="muted">{desktopStatus?.message ?? modelStatus}</p>
        {desktopStatus && <div className="advisor-actions">
          {desktopStatus.phase === 'failed' && <button type="button" onClick={() => { void desktopBridge()?.retry().catch(() => setError('Unable to restart local AI.')) }}>Retry local AI</button>}
          <button type="button" disabled={busy || desktopStatus.phase === 'starting'} onClick={() => { void desktopBridge()?.chooseModel().catch(() => setError('Unable to choose the local model.')) }}>Choose local model</button>
          <button type="button" disabled={busy || desktopStatus.phase === 'starting'} onClick={() => { void desktopBridge()?.useBundledModel().catch(() => setError('Unable to restore the bundled model.')) }}>Use bundled model</button>
        </div>}
        <p>Ask about your imported spending. Exact totals are calculated by Receipt.AI; the local language model explains the results.</p>
        <p className="muted">
          Data available: {context.dataRange ? `${context.dataRange.earliest} to ${context.dataRange.latest}` : 'No imported transactions'}
          {' · '}Currencies: {currencyLabels}
        </p>
        {transactions.length === 0 ? <p>Import a CSV before asking financial questions.</p> : (
          <>
            <div className="advisor-suggestions" aria-label="Suggested questions">
              {SUGGESTIONS.map((suggestion) => (
                <button className="advisor-suggestion" key={suggestion} disabled={busy}
                  onClick={() => { setQuestion(suggestion) }}>{suggestion}</button>
              ))}
            </div>
            <form className="advisor-form" onSubmit={(event) => { event.preventDefault(); void submitQuestion(question) }}>
              <label htmlFor="advisor-question">Your question</label>
              <textarea id="advisor-question" rows={3} maxLength={1000} value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="What changed about my spending this month?" />
              <div className="advisor-actions">
                <button type="submit" disabled={busy || !aiReady || !question.trim()}>{busy ? 'Thinking locally…' : !aiReady ? (desktopStatus?.phase === 'failed' ? 'AI unavailable' : 'AI initializing…') : 'Ask Advisor'}</button>
                {busy && <button type="button" onClick={() => activeRequest.current?.abort()}>Cancel</button>}
              </div>
            </form>
          </>
        )}
        {error && <p role="alert" className="advisor-error">{error}</p>}
        <p className="muted">Financial details are processed only by the local model service on this device. AI suggestions may be inaccurate; verify important figures.</p>
      </Card>
      {history.map((entry, index) => (
        <Card key={index} title={`Question ${index + 1}`}>
          <p><strong>You:</strong> {entry.question}</p>
          <AdvisorResponse report={entry.report} />
        </Card>
      ))}
    </section>
  )
}
