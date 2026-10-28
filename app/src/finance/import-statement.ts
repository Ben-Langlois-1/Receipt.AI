import { categorize } from './categories.ts'
import { parseCsv, sniffRejectedFile } from './csv.ts'
import { parseDate } from './dates.ts'
import { externalId } from './external-id.ts'
import { sortLedger } from './ledger.ts'
import { formatAmount, parseAmount, toCents } from './money.ts'
import {
  columnMapForProfile,
  genericColumnMap,
  matchProfile,
  profileById,
  rowLooksLikeHeader,
  type BankProfile,
  type ColumnRole,
} from './profiles.ts'
import type { CategorySource, ImportIssue, ImportOptions, ImportResult, LedgerTransaction } from './types.ts'

const SUMMARY_ROW = /^(beginning balance|ending balance|opening balance|closing balance|total\b)/i

function fail(message: string, extra: ImportIssue[] = []): ImportResult {
  return {
    ok: false,
    profileId: null,
    profileLabel: null,
    transactions: [],
    issues: [{ row: null, severity: 'error', message }, ...extra],
  }
}

function cell(record: string[], index: number | undefined): string {
  if (index === undefined || index < 0) return ''
  return record[index] ?? ''
}

function cleanDescription(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function hasProfileColumns(map: Map<ColumnRole, number>, profile: BankProfile): boolean {
  if (!map.has('date') || !map.has('description')) return false
  if (profile.amountMode === 'debit-credit') return map.has('debit') && map.has('credit')
  return map.has('amount')
}

export function importStatement(text: string, options: ImportOptions = {}): ImportResult {
  const rejected = sniffRejectedFile(text)
  if (rejected) return fail(rejected)

  const parsed = parseCsv(text)
  const issues: ImportIssue[] = []
  if (parsed.unclosedQuote) {
    issues.push({
      row: null,
      severity: 'warning',
      message: 'A quote was left open. If a description looks cut off, fix the export and import it again.',
    })
  }
  if (parsed.rows.length === 0) return fail('The file is empty.')

  let headerIndex = -1
  const scanLimit = Math.min(parsed.rows.length, 40)
  for (let index = 0; index < scanLimit; index += 1) {
    if (rowLooksLikeHeader(parsed.rows[index] ?? [])) {
      headerIndex = index
      break
    }
  }
  if (headerIndex === -1) {
    return fail('Could not find a header row with a date and an amount. Export the statement as CSV with column names.')
  }

  const headers = parsed.rows[headerIndex] ?? []
  const requested = (options.bank ?? 'auto').trim()
  if (requested !== 'auto' && requested !== '') {
    const known = profileById(requested)
    if (!known || known.id === 'canonical_v1') {
      return fail(`Unknown bank "${requested}". Leave the bank on auto-detect or pick one from the list.`)
    }
  }

  const forced = requested !== 'auto' && requested !== '' ? profileById(requested) : undefined
  let profile = forced ?? matchProfile(headers)
  let columns = profile ? columnMapForProfile(headers, profile) : null
  if (profile && columns && !hasProfileColumns(columns, profile)) columns = null

  if (!profile || !columns) {
    const generic = genericColumnMap(headers)
    if (!generic) {
      const label = profile?.label ?? 'this'
      return fail(
        profile
          ? `${label} files need a date column and an amount, or separate debit and credit columns. This header does not have them.`
          : 'Could not find a date column and an amount column.',
      )
    }
    if (profile) {
      issues.push({
        row: null,
        severity: 'warning',
        message: `These headers are not the usual ${profile.label} export. Columns were matched by name, using that bank's amount sign.`,
      })
    } else {
      const debitCredit = generic.has('debit') && generic.has('credit')
      profile = {
        id: 'generic',
        label: 'Generic CSV',
        amountMode: debitCredit ? 'debit-credit' : 'signed',
        required: [],
        roles: {},
      }
    }
    columns = generic
  }

  const accountDefault = (options.account ?? '').replace(/\s+/g, ' ').trim()
  const transactions: LedgerTransaction[] = []
  const seen = new Map<string, number>()
  const usedIds = new Set<string>()

  for (let index = headerIndex + 1; index < parsed.rows.length; index += 1) {
    const record = parsed.rows[index] ?? []
    const rowNumber = index + 1
    if (record.every((value) => value.trim() === '')) continue

    const description = cleanDescription(cell(record, columns.get('description')))
    if (!description) {
      issues.push({
        row: rowNumber,
        severity: 'warning',
        message: `Row ${rowNumber} has no description and was skipped.`,
      })
      continue
    }
    if (SUMMARY_ROW.test(description)) {
      issues.push({
        row: rowNumber,
        severity: 'warning',
        message: `Row ${rowNumber} (“${description}”) looks like a summary line and was skipped.`,
      })
      continue
    }

    const date = parseDate(cell(record, columns.get('date')))
    if (!date) {
      issues.push({
        row: rowNumber,
        severity: 'warning',
        message: `Row ${rowNumber}: could not read the date “${cell(record, columns.get('date')).trim() || '(blank)'}”. That row was skipped.`,
      })
      continue
    }

    let posted = ''
    const postedRaw = cell(record, columns.get('posted_date')).trim()
    if (postedRaw) {
      const parsedPosted = parseDate(postedRaw)
      if (parsedPosted) posted = parsedPosted
      else {
        issues.push({
          row: rowNumber,
          severity: 'warning',
          message: `Row ${rowNumber}: posted date “${postedRaw}” was ignored.`,
        })
      }
    }

    const amount = readAmount(record, columns, profile)
    if (amount === null) {
      issues.push({
        row: rowNumber,
        severity: 'warning',
        message: `Row ${rowNumber}: could not read an amount for “${description}”. That row was skipped.`,
      })
      continue
    }
    if (amount.bothSides) {
      issues.push({
        row: rowNumber,
        severity: 'warning',
        message: `Row ${rowNumber}: both debit and credit are filled. They were netted.`,
      })
    }

    const direction = amount.value < 0 ? 'outflow' : 'inflow'
    const statedDirection = cell(record, columns.get('direction')).trim()
    if (statedDirection && statedDirection !== direction) {
      issues.push({
        row: rowNumber,
        severity: 'warning',
        message: `Row ${rowNumber}: direction “${statedDirection}” does not match the amount sign. The amount was kept.`,
      })
    }

    const fileAccount = cleanDescription(cell(record, columns.get('account')))
    const account = fileAccount || accountDefault
    const fileBank = cleanDescription(cell(record, columns.get('source_bank')))
    const sourceBank = profile.id === 'canonical_v1' ? fileBank || 'canonical_v1' : profile.id
    const currency = (cell(record, columns.get('currency')).trim() || 'USD').toUpperCase()

    let category = 'Uncategorized'
    let categorySource: CategorySource = 'rule'
    if (profile.id === 'canonical_v1') {
      const fromFile = cleanDescription(cell(record, columns.get('category')))
      if (fromFile) {
        category = fromFile
        categorySource = 'file'
      } else {
        const found = categorize(description, '')
        category = found.category
        categorySource = found.source === 'bank' ? 'bank' : 'rule'
      }
    } else {
      const found = categorize(description, cell(record, columns.get('bank_category')))
      category = found.category
      categorySource = found.source === 'bank' ? 'bank' : 'rule'
    }

    let id = ''
    if (profile.id === 'canonical_v1') {
      const existing = cell(record, columns.get('external_id')).trim().toLowerCase()
      if (/^[0-9a-f]{16}$/.test(existing)) id = existing
    }
    if (!id) {
      const key = [sourceBank, date, description, formatAmount(amount.value), account].join('|')
      const occurrence = (seen.get(key) ?? 0) + 1
      seen.set(key, occurrence)
      id = externalId(`${key}|${occurrence}`)
    }
    if (usedIds.has(id)) {
      issues.push({
        row: rowNumber,
        severity: 'warning',
        message: `Row ${rowNumber} repeats id ${id}. A new id was assigned so both rows are kept.`,
      })
      id = externalId(`${id}|${rowNumber}`)
    }
    usedIds.add(id)

    transactions.push({
      date,
      posted_date: posted,
      description,
      amount: amount.value,
      currency,
      direction,
      category,
      category_source: categorySource,
      account,
      source_bank: sourceBank,
      external_id: id,
    })
  }

  if (profile.id === 'generic' && transactions.length > 0 && transactions.every((row) => row.amount >= 0)) {
    issues.push({
      row: null,
      severity: 'warning',
      message:
        'Every amount is positive, so they were treated as money in. If these are purchases, choose American Express or Discover and import the file again.',
    })
  }

  if (transactions.length === 0) {
    const emptyMessage = issues.some((issue) => issue.row !== null)
      ? 'No transactions could be read from this file.'
      : 'The file has column names but no transaction rows.'
    return {
      ok: false,
      profileId: profile.id,
      profileLabel: profile.label,
      transactions: [],
      issues: [...issues, { row: null, severity: 'error', message: emptyMessage }],
    }
  }

  return {
    ok: true,
    profileId: profile.id,
    profileLabel: profile.label,
    transactions: sortLedger(transactions),
    issues,
  }
}

function readAmount(
  record: string[],
  columns: Map<ColumnRole, number>,
  profile: BankProfile,
): { value: number; bothSides: boolean } | null {
  const debitCredit = columns.has('debit') && columns.has('credit') && (profile.amountMode === 'debit-credit' || !columns.has('amount'))
  if (debitCredit) {
    const debitRaw = cell(record, columns.get('debit')).trim()
    const creditRaw = cell(record, columns.get('credit')).trim()
    if (!debitRaw && !creditRaw) return null
    const debit = debitRaw ? parseAmount(debitRaw) : 0
    const credit = creditRaw ? parseAmount(creditRaw) : 0
    if (debit === null || credit === null) return null
    const cents = toCents(Math.abs(credit)) - toCents(Math.abs(debit))
    return { value: cents / 100, bothSides: debitRaw !== '' && creditRaw !== '' && debit !== 0 && credit !== 0 }
  }

  const parsed = parseAmount(cell(record, columns.get('amount')))
  if (parsed === null) return null
  return { value: profile.amountMode === 'invert-signed' ? -parsed : parsed, bothSides: false }
}
