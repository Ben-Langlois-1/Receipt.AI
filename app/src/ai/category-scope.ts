const aliases: Record<string, string[]> = {
  Housing: ['housing', 'rent', 'mortgage'], Transport: ['transport', 'transportation', 'commuting'],
  Groceries: ['groceries', 'grocery'], Dining: ['dining', 'restaurants', 'eating out'], Subscriptions: ['subscriptions', 'subscription'],
}
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function namesForCategory(category: string): string[] { return [category, ...(aliases[category] ?? [])] }
export function mentionsCategory(text: string, category: string): boolean {
  return namesForCategory(category).some(name => new RegExp(`(?:^|[^a-z0-9])${escape(name)}(?=$|[^a-z0-9])`, 'i').test(text))
}
export function protectedSpendingCategories(question: string, categories: string[]): string[] {
  const spans: string[] = []
  const source = question.replace(/\b(?:but|instead|then|and (?:reduce|cut|lower|change|adjust))\b/gi, ',')
  const patterns = [
    /\bwithout\s+(?:changing|reducing|touching|cutting|adjusting|lowering)\s+([^,.!?;]+)/gi,
    /\b(?:do not|don't|never|avoid)\s+(?:changing|reducing|touching|cutting|adjusting|lowering|change|reduce|touch|cut|adjust|lower)\s+([^,.!?;]+)/gi,
    /\b(?:keep|leave|preserve)\s+([^,.!?;]+?)\s+(?:unchanged|fixed|as is|alone|the same)\b/gi,
    /\bnot\s+(?:changing|reducing|touching|cutting|adjusting)\s+([^,.!?;]+)/gi,
  ]
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) spans.push(match[1])
  return [...new Set(categories)].filter(category => spans.some(span => mentionsCategory(span, category)))
}
