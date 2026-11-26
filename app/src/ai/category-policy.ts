import type { AdvisorIntent } from './advisor-answer.ts'

/**
 * Deterministic permissions for what the advisor may RECOMMEND per category.
 * Describing a category (its amount, share, rank, change) is always allowed;
 * this only decides whether a suggestion to change it is.
 *
 *  - protected:    the user asked to keep it unchanged. Overrides everything.
 *  - discuss_only: an essential category (Housing, Utilities, ...) the user did
 *                  not ask for advice about. Describe it, never suggest changing it.
 *  - actionable:   suggestions are allowed (any non-essential category, or an
 *                  essential one the user explicitly asked advice about).
 */
export type CategoryPermission = 'actionable' | 'discuss_only' | 'protected'

const ESSENTIAL = ['housing', 'rent', 'mortgage', 'utilities', 'insurance', 'healthcare', 'medical', 'childcare']
export const isEssentialCategory = (category: string) => ESSENTIAL.includes(category.trim().toLowerCase())

// Asking about "essential/fixed costs" is an explicit request to discuss them.
const ESSENTIAL_REQUEST = /\b(?:essential|fixed|necessary)\s+(?:expenses?|costs?|bills?|spending|categor(?:y|ies))\b/i
export const asksAboutEssentialCosts = (question: string) => ESSENTIAL_REQUEST.test(question)

export interface PermissionInput {
  intent: AdvisorIntent
  question: string
  /** Categories the question names, minus protected ones. */
  focusCategories: string[]
  /** Categories the user asked to keep unchanged ("without changing rent"). */
  protectedCategories: string[]
}

export function categoryPermission(category: string, input: PermissionInput): CategoryPermission {
  if (input.protectedCategories.includes(category)) return 'protected'
  if (!isEssentialCategory(category)) return 'actionable'
  // An essential category is only actionable when advice was requested and the
  // user named it (or essential/fixed costs in general). Merely mentioning it in
  // a comparison, lookup or breakdown never grants permission to recommend changes.
  if (input.intent === 'advice' && (input.focusCategories.includes(category) || asksAboutEssentialCosts(input.question))) return 'actionable'
  return 'discuss_only'
}

/** Categories the model must never suggest changing. */
export const restrictedCategories = (categories: string[], input: PermissionInput) =>
  categories.filter((category) => categoryPermission(category, input) !== 'actionable')

// ---- Untrusted text: only fixed, application-owned names may enter instruction text.
const CANONICAL = ['Housing', 'Utilities', 'Insurance', 'Healthcare', 'Childcare', 'Groceries', 'Dining', 'Subscriptions', 'Transport', 'Entertainment', 'Education', 'Shopping', 'Fees', 'Uncategorized']
/**
 * Imported category labels are data, never instructions. A label may be named in
 * prompt text only if it equals one of the application's own category names; any
 * other label is replaced by a neutral reference, so a crafted label can never
 * reach the instruction channel. (Labels still appear inside the facts JSON, which
 * the model is told is data.)
 */
export function promptName(label: string): string | null {
  const match = CANONICAL.find((name) => name.toLowerCase() === label.trim().toLowerCase())
  return match ?? null
}
export function promptList(labels: string[], fallback = 'the other categories in the facts'): string {
  const names = [...new Set(labels.map(promptName).filter((name): name is string => name !== null))]
  const hidden = labels.length - labels.filter((label) => promptName(label) !== null).length
  const parts = [...names, ...(hidden ? [hidden === labels.length ? fallback : 'other listed categories'] : [])]
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}
