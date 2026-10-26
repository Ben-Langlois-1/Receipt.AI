import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { toCanonicalCsv } from '../src/finance/canonical.ts'
import { importStatement } from '../src/finance/import-statement.ts'
import { profileById } from '../src/finance/profiles.ts'
import { centsToNumber, summarize } from '../src/finance/summary.ts'
import { formatUsd } from '../src/finance/money.ts'
import { SqliteLedger } from './store-sqlite.ts'

interface CliOptions {
  files: string[]
  account: string
  bank: string
  out: string
  db: string
  fresh: boolean
}

function usage(): string {
  const banks = ['chase_checking', 'chase_credit', 'bank_of_america', 'wells_fargo', 'capital_one', 'citi', 'american_express', 'discover']
    .map((id) => profileById(id)?.label ?? id)
    .join(', ')
  return `Usage: npm run import -- <statement.csv> [more.csv ...] [--account "Chase Checking"] [--bank auto] [--out data/transactions.csv] [--db data/receipt.sqlite] [--fresh]

Reads bank CSV exports and writes one ledger:
  data/transactions.csv   the file the advisor reads
  data/receipt.sqlite     the same rows, with manual categories kept on re-import

--bank accepts auto or a profile id. Known banks: ${banks}.
--fresh deletes the sqlite ledger before importing.`
}

function parseArgs(argv: string[]): CliOptions | { error: string } {
  const options: CliOptions = {
    files: [],
    account: '',
    bank: 'auto',
    out: resolve('data/transactions.csv'),
    db: resolve('data/receipt.sqlite'),
    fresh: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? ''
    if (arg === '--help' || arg === '-h') return { error: usage() }
    if (arg === '--fresh') {
      options.fresh = true
      continue
    }
    if (arg === '--account' || arg === '--bank' || arg === '--out' || arg === '--db') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) return { error: `${arg} needs a value.\n\n${usage()}` }
      index += 1
      if (arg === '--account') options.account = value
      if (arg === '--bank') options.bank = value
      if (arg === '--out') options.out = resolve(value)
      if (arg === '--db') options.db = resolve(value)
      continue
    }
    if (arg.startsWith('--')) return { error: `Unknown option ${arg}.\n\n${usage()}` }
    options.files.push(arg)
  }
  if (options.files.length === 0) return { error: usage() }
  return options
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2))
  if ('error' in parsed) {
    console.error(parsed.error)
    process.exit(2)
  }

  if (parsed.fresh) rmSync(parsed.db, { force: true })
  const ledger = new SqliteLedger(parsed.db)
  let failed = false
  const importedAt = new Date().toISOString()

  try {
    for (const file of parsed.files) {
      let text = ''
      try {
        text = readFileSync(file, 'utf8')
      } catch {
        failed = true
        console.error(`Could not read ${file}.`)
        continue
      }
      const result = importStatement(text, { account: parsed.account, bank: parsed.bank })
      for (const issue of result.issues) {
        const prefix = issue.severity === 'error' ? 'Error' : 'Warning'
        console.error(`${prefix} (${file}): ${issue.message}`)
      }
      if (!result.ok) {
        failed = true
        continue
      }
      ledger.upsert(result.transactions, importedAt)
      const summary = summarize(result.transactions)
      console.log(
        `${file}: ${summary.count} transactions from ${result.profileLabel}. Out ${formatUsd(centsToNumber(summary.outflowCents))}, in ${formatUsd(centsToNumber(summary.inflowCents))}.`,
      )
    }
    const all = ledger.list()
    mkdirSync(dirname(parsed.out), { recursive: true })
    writeFileSync(parsed.out, toCanonicalCsv(all), 'utf8')
    console.log(`Wrote ${all.length} rows to ${parsed.out}`)
    console.log(`SQLite ledger: ${parsed.db}`)
  } finally {
    ledger.close()
  }

  process.exit(failed ? 1 : 0)
}

main()
