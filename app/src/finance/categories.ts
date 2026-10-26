export const CATEGORIES = [
  'Income',
  'Housing',
  'Utilities',
  'Groceries',
  'Dining',
  'Transport',
  'Subscriptions',
  'Shopping',
  'Health',
  'Entertainment',
  'Fees',
  'Transfers',
  'Uncategorized',
] as const

export type Category = (typeof CATEGORIES)[number]

const RULES: Array<{ pattern: RegExp; category: Category }> = [
  { pattern: /\b(payroll|salary|direct dep|wages)\b/i, category: 'Income' },
  { pattern: /\b(rent|mortgage|landlord|apartments)\b/i, category: 'Housing' },
  { pattern: /\b(netflix|spotify|hulu|disney\+|icloud|adobe|youtube premium)\b/i, category: 'Subscriptions' },
  { pattern: /\b(comcast|xfinity|verizon|spectrum|electric|utility|cable)\b/i, category: 'Utilities' },
  { pattern: /\b(kroger|trader joe|whole foods|safeway|aldi|grocery|publix|walmart)\b/i, category: 'Groceries' },
  { pattern: /\b(starbucks|mcdonald|chipotle|doordash|grubhub|uber eats|restaurant|dunkin)\b/i, category: 'Dining' },
  { pattern: /\b(uber|lyft|shell|chevron|exxon|parking|metro|transit|sunoco)\b/i, category: 'Transport' },
  { pattern: /\b(cvs|walgreens|pharmacy|rite aid)\b/i, category: 'Health' },
  { pattern: /\b(atm fee|overdraft|late fee|service fee|interest charge)\b/i, category: 'Fees' },
  { pattern: /\b(zelle|venmo|transfer|payment thank you|autopay|online payment)\b/i, category: 'Transfers' },
  { pattern: /\b(amazon|target|best buy|etsy)\b/i, category: 'Shopping' },
  { pattern: /\b(amc|cinema|steam|nintendo)\b/i, category: 'Entertainment' },
]

const BANK_CATEGORIES: Record<string, Category> = {
  'food & drink': 'Dining',
  'food and drink': 'Dining',
  dining: 'Dining',
  restaurants: 'Dining',
  groceries: 'Groceries',
  gas: 'Transport',
  travel: 'Transport',
  automotive: 'Transport',
  shopping: 'Shopping',
  merchandise: 'Shopping',
  'bills & utilities': 'Utilities',
  'bills and utilities': 'Utilities',
  utilities: 'Utilities',
  entertainment: 'Entertainment',
  'health & wellness': 'Health',
  health: 'Health',
  healthcare: 'Health',
  'fees & adjustments': 'Fees',
  fees: 'Fees',
  services: 'Subscriptions',
  'payments and credits': 'Transfers',
  income: 'Income',
  paycheck: 'Income',
  rent: 'Housing',
  home: 'Housing',
}

export function categorize(description: string, bankCategory: string): { category: Category; source: 'rule' | 'bank' | 'none' } {
  for (const rule of RULES) {
    if (rule.pattern.test(description)) {
      return { category: rule.category, source: 'rule' }
    }
  }
  const mapped = BANK_CATEGORIES[bankCategory.trim().toLowerCase()]
  if (mapped) return { category: mapped, source: 'bank' }
  return { category: 'Uncategorized', source: 'none' }
}

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value)
}
