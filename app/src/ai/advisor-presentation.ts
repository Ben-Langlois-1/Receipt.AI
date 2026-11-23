import { desktopBridge } from './desktop-bridge.ts'
import { useState } from 'react'
import { createElement as h, type ReactNode } from 'react'
import type { AdvisorReport } from './advisor-report.ts'
import { formatCents } from './financial-facts.ts'

// Deliberately small Markdown subset: text nodes only, no raw HTML, links or images.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return h('strong', { key: index }, part.slice(2, -2))
    if (part.startsWith('*') && part.endsWith('*')) return h('em', { key: index }, part.slice(1, -1))
    if (part.startsWith('`') && part.endsWith('`')) return h('code', { key: index }, part.slice(1, -1))
    return part
  })
}
export function AdvisorMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const list = /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line)
    if (list) {
      const ordered = /^\s*\d+[.)]/.test(line)
      const items: ReactNode[] = []
      const pattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(h('li', { key: i }, ...inline(lines[i].replace(pattern, ''))))
        i++
      }
      i--
      blocks.push(h(ordered ? 'ol' : 'ul', { key: i }, ...items))
    } else {
      const heading = /^(#{1,3})\s+(.+)$/.exec(line)
      blocks.push(h(heading ? 'h4' : 'p', { key: i }, ...inline(heading ? heading[2] : line)))
    }
  }
  return h('div', { className: 'advisor-markdown' }, ...blocks)
}
const amount = (value: number | null, currency: string) => value === null ? 'Unknown' : `${formatCents(value)} ${currency}`
export function AdvisorResponse({ report }: { report: AdvisorReport }) {
  return h('div', { className: 'advisor-report' },
    h(CopyAdvisorReport, { report }),
    h('section', { 'aria-label': 'Verified financial figures' },
      h('h4', null, 'Verified financial figures'),
      h('p', { className: 'muted' }, `Calculated from imported records · As of ${report.asOfDate} · ${report.timezone}`),
      ...report.figures.map((row, i) => h('div', { key: i, className: 'advisor-figures' },
        h('h4', null, `${row.period} · ${row.currency}`),
        h('p', null, row.endExclusive ? `${row.startInclusive} inclusive to ${row.endExclusive} exclusive` : `Imported date range: ${row.startInclusive} through ${row.endInclusive} inclusive`),
        h('p', null, row.coverage === 'no_records' ? 'Coverage: no records found; spending unknown.' : `Coverage: unverified · ${row.transactions} imported transactions`),
        h('dl', null,
          h('dt', null, 'Outflows'), h('dd', null, amount(row.outflowCents, row.currency)),
          h('dt', null, 'Inflows'), h('dd', null, amount(row.inflowCents, row.currency)),
          h('dt', null, 'Net cash flow'), h('dd', null, amount(row.netFlowCents, row.currency))),
        row.categories.length ? h('details', null, h('summary', null, 'Category outflows (labels unverified)'),
          h('ul', null, ...row.categories.map((c, index) => h('li', { key: index }, `${c.category}: ${amount(c.outflowCents, row.currency)}`)))) : null)),
      ...report.comparisons.map((c, i) => h('p', { key: `comparison-${i}` }, `${c.category ? c.category + ": " : ""}${c.currentMonth} versus ${c.previousMonth}: imported outflow difference ${amount(c.differenceCents, c.currency)}; change ${c.percentageChange === null ? 'unavailable (zero baseline)' : `${c.percentageChange}%`}. Coverage is unverified; this is not a complete spending comparison.`)),
      h('p', null, report.notice)),
    report.explanationStatus !== 'not_requested' ? h('section', { 'aria-label': 'AI explanation and recommendations' },
      h('h4', null, 'AI explanation and recommendations'),
      h('p', { className: 'muted' }, report.explanationStatus === 'checked' ? 'AI-generated · passed format checks; factual accuracy is not guaranteed.' : report.explanationStatus === 'withheld' ? 'AI explanation withheld · application guidance follows.' : 'Local AI explanation unavailable.'),
      h(AdvisorMarkdown, { text: report.explanation }),
      report.explanationAttempts?.some((a) => a.reasons.length) ? h('details', null,
        h('summary', null, 'Explanation checks'),
        h('ul', null, ...report.explanationAttempts.map((attempt, index) => h('li', { key: index },
          `Attempt ${index + 1}: ${attempt.reasons.length ? attempt.reasons.join(', ') : 'accepted'}`)))) : null) : null)
}

/** Serialize the data, not collapsed DOM details, for reliable clipboard output. */
export function reportToPlainText(report: AdvisorReport): string {
  const lines = ['Verified financial figures', `As of ${report.asOfDate} · ${report.timezone}`]
  for (const row of report.figures) {
    lines.push(`${row.period} · ${row.currency}`, row.endExclusive ? `${row.startInclusive} inclusive to ${row.endExclusive} exclusive` : `${row.startInclusive} through ${row.endInclusive} inclusive`,
      `Coverage: ${row.coverage === 'no_records' ? 'no records; spending unknown' : 'unverified'} · ${row.transactions} imported transactions`,
      `Outflows: ${amount(row.outflowCents, row.currency)}`, `Inflows: ${amount(row.inflowCents, row.currency)}`, `Net cash flow: ${amount(row.netFlowCents, row.currency)}`)
    for (const category of row.categories) lines.push(`- ${category.category}: ${amount(category.outflowCents, row.currency)}`)
  }
  for (const c of report.comparisons) lines.push(`${c.category ? c.category + ": " : ""}${c.currentMonth} versus ${c.previousMonth}: imported outflow difference ${amount(c.differenceCents, c.currency)}; change ${c.percentageChange === null ? 'unavailable (zero baseline)' : `${c.percentageChange}%`}. Coverage unverified.`)
  lines.push(report.notice)
  if (report.explanationStatus !== 'not_requested') {
    lines.push(`AI explanation: ${report.explanationStatus}`, report.explanation)
    for (const [index, attempt] of (report.explanationAttempts ?? []).entries()) lines.push(`- Attempt ${index + 1}: ${attempt.reasons.length ? attempt.reasons.join(', ') : 'accepted'}`)
  }
  return lines.join('\n')
}
function CopyAdvisorReport({ report }: { report: AdvisorReport }) {
  const [status, setStatus] = useState('')
  return h('div', null,
    h('button', { type: 'button', onClick: async () => {
      try { if (desktopBridge()) await desktopBridge()!.copyText(reportToPlainText(report)); else await navigator.clipboard.writeText(reportToPlainText(report)); setStatus('Report copied.') }
      catch { setStatus('Unable to copy. Check browser clipboard permission.') }
    } }, 'Copy report'),
    h('span', { role: 'status', className: 'muted' }, status))
}
