export type AmountMode = 'signed' | 'debit-credit' | 'invert-signed'

export type ColumnRole =
  | 'date'
  | 'posted_date'
  | 'description'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'type'
  | 'bank_category'
  | 'currency'
  | 'account'
  | 'direction'
  | 'external_id'
  | 'source_bank'
  | 'category'
  | 'ignore'

export interface BankProfile {
  id: string
  label: string
  amountMode: AmountMode
  required: string[][]
  roles: Record<string, ColumnRole>
  amountBeforeDescription?: boolean
}

export function normHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[.#]/g, '')
    .replace(/\s+/g, ' ')
}

export const PROFILES: BankProfile[] = [
  {
    id: 'canonical_v1',
    label: 'Receipt.AI transactions.csv',
    amountMode: 'signed',
    required: [
      [
        'date',
        'posted_date',
        'description',
        'amount',
        'currency',
        'direction',
        'category',
        'account',
        'source_bank',
        'external_id',
      ],
    ],
    roles: {
      date: 'date',
      posted_date: 'posted_date',
      description: 'description',
      amount: 'amount',
      currency: 'currency',
      direction: 'direction',
      category: 'category',
      account: 'account',
      source_bank: 'source_bank',
      external_id: 'external_id',
    },
  },
  {
    id: 'chase_checking',
    label: 'Chase checking',
    amountMode: 'signed',
    required: [['details', 'posting date', 'description', 'amount', 'type', 'balance']],
    roles: {
      details: 'type',
      'posting date': 'date',
      description: 'description',
      amount: 'amount',
      type: 'ignore',
      balance: 'ignore',
      'check or slip': 'ignore',
    },
  },
  {
    id: 'chase_credit',
    label: 'Chase credit card',
    amountMode: 'signed',
    required: [['transaction date', 'post date', 'description', 'category', 'type', 'amount']],
    roles: {
      'transaction date': 'date',
      'post date': 'posted_date',
      description: 'description',
      category: 'bank_category',
      type: 'type',
      amount: 'amount',
      memo: 'ignore',
    },
  },
  {
    id: 'bank_of_america',
    label: 'Bank of America',
    amountMode: 'signed',
    required: [
      ['date', 'description', 'amount', 'running bal'],
      ['posted date', 'reference number', 'payee', 'amount'],
    ],
    roles: {
      date: 'date',
      description: 'description',
      amount: 'amount',
      'running bal': 'ignore',
      'posted date': 'date',
      'reference number': 'ignore',
      payee: 'description',
      address: 'ignore',
    },
  },
  {
    id: 'wells_fargo',
    label: 'Wells Fargo',
    amountMode: 'signed',
    required: [['date', 'amount', 'description']],
    amountBeforeDescription: true,
    roles: {
      date: 'date',
      amount: 'amount',
      description: 'description',
    },
  },
  {
    id: 'capital_one',
    label: 'Capital One',
    amountMode: 'debit-credit',
    required: [['transaction date', 'posted date', 'card no', 'description', 'debit', 'credit']],
    roles: {
      'transaction date': 'date',
      'posted date': 'posted_date',
      'card no': 'ignore',
      description: 'description',
      category: 'bank_category',
      debit: 'debit',
      credit: 'credit',
    },
  },
  {
    id: 'citi',
    label: 'Citi',
    amountMode: 'debit-credit',
    required: [['status', 'date', 'description', 'debit', 'credit']],
    roles: {
      status: 'ignore',
      date: 'date',
      description: 'description',
      debit: 'debit',
      credit: 'credit',
      'member name': 'ignore',
    },
  },
  {
    id: 'american_express',
    label: 'American Express',
    amountMode: 'invert-signed',
    required: [
      ['date', 'description', 'amount', 'card member'],
      ['date', 'receipt', 'description', 'amount'],
    ],
    roles: {
      date: 'date',
      description: 'description',
      amount: 'amount',
      'card member': 'ignore',
      receipt: 'ignore',
      account: 'ignore',
      'extended details': 'ignore',
    },
  },
  {
    id: 'discover',
    label: 'Discover',
    amountMode: 'invert-signed',
    required: [['trans date', 'post date', 'description', 'amount']],
    roles: {
      'trans date': 'date',
      'post date': 'posted_date',
      description: 'description',
      amount: 'amount',
      category: 'bank_category',
    },
  },
]

const DATE_ALIASES = ['transaction date', 'trans date', 'posting date', 'posted date', 'post date', 'date']
const POSTED_ALIASES = ['posted date', 'post date', 'posting date']
const DESCRIPTION_ALIASES = ['description', 'payee', 'name', 'memo', 'transaction description']
const TYPE_ALIASES = ['type', 'details', 'transaction type']

export function matchProfile(headers: string[]): BankProfile | null {
  const normalized = headers.map(normHeader)
  const present = new Set(normalized)
  const matches = PROFILES.filter((profile) =>
    profile.required.some((group) => group.every((header) => present.has(header))),
  ).filter((profile) => {
    if (!profile.amountBeforeDescription) return true
    const amountAt = normalized.indexOf('amount')
    const descriptionAt = normalized.indexOf('description')
    return amountAt !== -1 && descriptionAt !== -1 && amountAt < descriptionAt
  })
  matches.sort((a, b) => Math.max(...b.required.map((group) => group.length)) - Math.max(...a.required.map((group) => group.length)))
  return matches[0] ?? null
}

export function profileById(id: string): BankProfile | undefined {
  return PROFILES.find((profile) => profile.id === id)
}

export const BANK_CHOICES: Array<{ id: string; label: string }> = [
  { id: 'auto', label: 'Auto-detect' },
  ...PROFILES.filter((profile) => profile.id !== 'canonical_v1').map((profile) => ({
    id: profile.id,
    label: profile.label,
  })),
]

function bestIndex(headers: string[], aliases: string[], except = -1): number {
  for (const alias of aliases) {
    const index = headers.indexOf(alias)
    if (index !== -1 && index !== except) return index
  }
  return -1
}

export function genericColumnMap(headers: string[]): Map<ColumnRole, number> | null {
  const normalized = headers.map(normHeader)
  const map = new Map<ColumnRole, number>()
  const dateIndex = bestIndex(normalized, DATE_ALIASES)
  if (dateIndex !== -1) map.set('date', dateIndex)
  const postedIndex = bestIndex(normalized, POSTED_ALIASES, dateIndex)
  if (postedIndex !== -1) map.set('posted_date', postedIndex)
  const descriptionIndex = bestIndex(normalized, DESCRIPTION_ALIASES)
  if (descriptionIndex !== -1) map.set('description', descriptionIndex)
  const amountIndex = normalized.findIndex(
    (header) => (header === 'amount' || header === 'amt') && !header.includes('balance') && !header.includes('bal'),
  )
  if (amountIndex !== -1) map.set('amount', amountIndex)
  const debitIndex = bestIndex(normalized, ['debit', 'withdrawal'])
  if (debitIndex !== -1) map.set('debit', debitIndex)
  const creditIndex = bestIndex(normalized, ['credit', 'deposit'])
  if (creditIndex !== -1) map.set('credit', creditIndex)
  const typeIndex = bestIndex(normalized, TYPE_ALIASES)
  if (typeIndex !== -1) map.set('type', typeIndex)
  const categoryIndex = bestIndex(normalized, ['category'])
  if (categoryIndex !== -1) map.set('bank_category', categoryIndex)
  const currencyIndex = bestIndex(normalized, ['currency'])
  if (currencyIndex !== -1) map.set('currency', currencyIndex)
  const accountIndex = bestIndex(normalized, ['account'])
  if (accountIndex !== -1 && accountIndex !== descriptionIndex) map.set('account', accountIndex)

  const hasMoney = map.has('amount') || (map.has('debit') && map.has('credit'))
  if (!map.has('date') || !hasMoney) return null
  return map
}

export function columnMapForProfile(headers: string[], profile: BankProfile): Map<ColumnRole, number> {
  const map = new Map<ColumnRole, number>()
  headers.forEach((header, index) => {
    const role = profile.roles[normHeader(header)]
    if (role && role !== 'ignore' && !map.has(role)) map.set(role, index)
  })
  return map
}

export function rowLooksLikeHeader(headers: string[]): boolean {
  return matchProfile(headers) !== null || genericColumnMap(headers) !== null
}
