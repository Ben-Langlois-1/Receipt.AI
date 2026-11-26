import type { AnswerFacts, AnswerRejection, CategoryFact } from './advisor-answer.ts'
import { promptList, promptName } from './category-policy.ts'

export type RetryReason = AnswerRejection | 'truncated_response'

const REASON_TEXT: Record<RetryReason, string> = {
  empty: 'it was empty', too_long: 'it was too long', unsafe_format: 'it used links, tables or HTML',
  ungrounded_number: 'it used numbers that are not in the facts',
  numeric_claim: 'it used approximate quantities such as "half" or "double"', date_claim: 'it mentioned dates or months that are not in the facts',
  unsupported_financial_claim: 'it claimed or implied income, balances, savings, guarantees or financial products',
  unknown_category: 'it mentioned a category that is not in the facts', ranking_claim: 'it ranked or sized a category differently from the facts',
  misattributed_figure: 'it attached a figure to the wrong category or called a percentage change a share of outflows',
  meta_reference: 'it repeated the question or mentioned internal field names, rules or the facts instead of answering naturally',
  direction_claim: 'it described a change in the wrong direction', constraint_violation: 'it suggested changing a protected or essential expense',
  missing_grounding: 'it did not directly answer the question with the relevant facts',
  truncated_response: 'it was cut off before it finished',
}

const list = (items: string[]) => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
// Most important correction first; the model follows the first instructions most reliably.
const PRIORITY: RetryReason[] = ['truncated_response', 'constraint_violation', 'unsupported_financial_claim', 'ungrounded_number', 'misattributed_figure', 'numeric_claim', 'ranking_claim', 'direction_claim', 'date_claim', 'unknown_category', 'missing_grounding', 'meta_reference', 'unsafe_format', 'too_long', 'empty']
const MAX_INSTRUCTIONS = 5

/**
 * Category labels are untrusted imported data. Only application-owned names (promptName)
 * and application-computed figures may appear in this text; any other label is referred
 * to by its rank, so a crafted label can never reach the instruction channel.
 */
const ref = (item: CategoryFact) => promptName(item.category) ?? `the category ranked ${item.rank}`
const describe = (item: CategoryFact) => `${ref(item)} ${item.outflows} (${item.share}, ${item.tier})`

/** Verified month-to-month changes, with category names only where they are application-owned names. */
function comparisonAnchor(facts: AnswerFacts): { overall: string; byDirection: string; extremes: string } | null {
  const k = facts.currencies[0]?.comparison
  if (!k) return null
  const names = (direction: string) => k.categories.filter((item) => item.direction === direction).map((item) => promptName(item.category)).filter((name): name is string => name !== null)
  // Natural sentences ("A and B were lower; C was unchanged"), not "label: items", which models copy verbatim.
  const byDirection = (['lower', 'higher', 'unchanged'] as const).map((direction) => ({ direction, found: names(direction) })).filter((item) => item.found.length).map((item) => `${list(item.found)} ${item.found.length === 1 ? 'was' : 'were'} ${item.direction}`).join('; ')
  const named = (categories: string[]) => categories.map((name) => ({ name: promptName(name), item: k.categories.find((entry) => entry.category === name) })).filter((entry): entry is { name: string; item: NonNullable<typeof entry.item> } => entry.name !== null && !!entry.item).map(({ name, item }) => `${name} (${item.change}, ${item.percentChange})`)
  const extremes = [k.largestIncrease.length ? `largest increase: ${list(named(k.largestIncrease))}` : '', k.largestDecrease.length ? `largest decrease: ${list(named(k.largestDecrease))}` : ''].filter((text) => !/: $/.test(text) && text).join('; ')
  return { overall: `total imported outflows were ${k.direction} in ${k.currentMonth} (${k.currentOutflows}) than in ${k.previousMonth} (${k.previousOutflows}), a change of ${k.change} (${k.percentChange})`, byDirection, extremes }
}

/**
 * Builds the corrective instruction for the one permitted second attempt from the
 * specific reasons the first answer was rejected. It carries only verified,
 * application-derived facts; the rejected text itself is never sent back.
 */
export function buildRetryFeedback(reasons: RetryReason[], facts: AnswerFacts): string {
  const unique = PRIORITY.filter((reason) => reasons.includes(reason))
  if (!unique.length) return 'Your previous answer was rejected. Answer again using only the verified facts.'
  // A truncated answer is rejected for length alone; the instruction is simply to be shorter.
  if (unique.length === 1 && unique[0] === 'truncated_response') return 'Your previous answer was too long and was cut off. Answer in at most 3 short sentences, finish the last sentence, and use only the verified facts.'
  const first = facts.currencies[0]
  const ranking = first ? `largest first: ${list(first.categories.slice(0, 4).map(describe))}` : ''
  const options = facts.suggestionOptions
  const optionNames = promptList(options.map((item) => item.category), 'the flexible categories in the facts')
  const restricted = facts.restrictedCategories
  const instructions: string[] = []
  for (const reason of unique) {
    switch (reason) {
      case 'truncated_response':
      case 'too_long':
        instructions.push('Answer in at most 3 short sentences and finish the last sentence.')
        break
      case 'constraint_violation': {
        const named = restricted.length ? promptList(restricted, 'the restricted categories') : 'the protected and essential categories'
        if (facts.intent !== 'advice') {
          instructions.push(`Only describe the figures that answer the question. Do not recommend any change to ${named}, or to anything else.`)
          break
        }
        instructions.push(`Do not recommend any change to ${named}. Recommend only ${optionNames}.`)
        // The second attempt is stricter: protected and essential spending may be stated once as a
        // fact, but may not appear in, or be implied by, any recommendation.
        const housing = restricted.some((item) => promptName(item) === 'Housing')
        instructions.push(`State once, as a plain fact, where most of the money went. Then write recommendations that do not mention ${housing ? 'housing, rent, mortgage, ' : ''}${restricted.length ? 'any restricted category, ' : ''}essential or fixed costs, or "your largest expense". Recommend only ${optionNames}.`)
        break
      }
      case 'unsupported_financial_claim':
        instructions.push('The figures cover imported records only, which are not verified complete, and inflows are not income. Say that once; do not mention income, balances, savings you will make, guarantees, loans or investments.')
        break
      case 'ungrounded_number':
      case 'misattributed_figure':
      case 'numeric_claim':
        const cmp = comparisonAnchor(facts)
        instructions.push(`Use only figures written exactly as in the facts, each attached to its own category (${cmp ? cmp.overall : ranking}). Do not calculate, round, add or estimate, and do not use words like half or double. A percentage is a share of imported outflows unless it is a percentage change between months.`)
        break
      case 'ranking_claim': {
        const cmp = comparisonAnchor(facts)
        if (cmp) { instructions.push(`Do not rank categories by size. Report the verified changes: ${cmp.extremes || cmp.overall}. Use "significant" only for the verified change itself.`); break }
        instructions.push(ranking ? `Follow the ranking in the facts, ${ranking}. Use each tier exactly: never call a minor category significant, and say changes in minor categories have a limited effect.` : 'Follow the ranking and tiers in the facts exactly.')
        break
      }
      case 'direction_claim': {
        const cmp = comparisonAnchor(facts)
        instructions.push(cmp ? `Use the verified directions: ${cmp.overall}. By category: ${cmp.byDirection || 'use the direction words in the facts'}. Never call an unchanged category lower or higher.` : 'Use the direction words given in the facts exactly.')
        break
      }
      case 'date_claim': {
        const months = [...new Set(facts.currencies.flatMap((c) => [...c.scope.matchAll(/\b\d{4}-\d{2}\b/g)].map((m) => m[0]).concat(c.comparison ? [c.comparison.previousMonth, c.comparison.currentMonth] : [])))]
        instructions.push(`Mention only months that appear in the facts${months.length ? ` (${list(months)})` : ''}. Do not mention today, this month, last month or any other date.`)
        break
      }
      case 'unknown_category':
        instructions.push(ranking ? `Mention only categories that appear in the facts (${ranking}).` : 'Mention only categories that appear in the facts.')
        break
      case 'missing_grounding': {
        const unavailable = facts.currencies.find((c) => c.comparisonUnavailable)
        const top = first?.categories[0]
        if (unavailable) {
          const months = unavailable.missingMonths.filter((month) => /^\d{4}-\d{2}$/.test(month))
          instructions.push(`Say plainly that the comparison cannot be made because imported records are ${months.length ? `missing for ${list(months)}` : 'incomplete'}, that missing records do not mean zero spending, and that the figures cover imported records only.`)
        } else if (facts.intent === 'comparison' && first?.comparison) instructions.push(`Open with the overall change: ${first.comparison.change} (${first.comparison.percentChange}), ${first.comparison.currentMonth} versus ${first.comparison.previousMonth}.`)
        else if (facts.intent === 'advice') instructions.push(`Answer the request with suggestions for ${optionNames}${top ? `, and give the largest category (${describe(top)}) as context` : ''}. No generic tips.`)
        else if (top) instructions.push(`Start by answering the question with the relevant figures, for example the largest category: ${describe(top)}.`)
        else instructions.push('Answer the question directly using the categories in the facts.')
        break
      }
      case 'meta_reference':
        instructions.push('Answer naturally without repeating the question or mentioning JSON, fields, facts, rules or the application.')
        break
      case 'unsafe_format':
        instructions.push('Use plain sentences: no links, tables, HTML or headings.')
        break
      case 'empty':
        instructions.push('Give a direct answer to the question.')
        break
    }
  }
  const reasonText = list(unique.map((reason) => REASON_TEXT[reason]))
  return `Your previous answer was rejected because ${reasonText}. ${[...new Set(instructions)].slice(0, MAX_INSTRUCTIONS).join(' ')} Follow every rule above.`
}
