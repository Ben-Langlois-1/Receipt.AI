export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

export function formatAmount(amount: number): string {
  const cents = toCents(amount)
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const dollars = Math.trunc(abs / 100)
  const rem = abs % 100
  return `${sign}${dollars}.${String(rem).padStart(2, '0')}`
}

export function formatUsd(amount: number): string {
  return toCents(amount) === 0
    ? '$0.00'
    : (toCents(amount) / 100).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
      })
}

export function parseAmount(raw: string): number | null {
  let text = raw.trim()
  if (!text || text === '-' || text === '—' || text === '–') return null
  let negative = false
  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true
    text = text.slice(1, -1).trim()
  }
  text = text.replace(/[$\s]/g, '').replace(/,/g, '')
  if (text.startsWith('+')) text = text.slice(1)
  if (text.startsWith('-')) {
    negative = !negative
    text = text.slice(1)
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return null
  const value = Number(text)
  if (!Number.isFinite(value)) return null
  const signed = negative ? -value : value
  return toCents(signed) / 100
}
