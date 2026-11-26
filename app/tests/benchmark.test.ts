import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { importStatement } from '../src/finance/import-statement.ts'
import { buildAdvisorContext } from '../src/ai/financial-context.ts'
const require = createRequire(import.meta.url)
const { cases, datasets, csvFor, seeds } = require('../benchmarks/suite.cjs')
const { median, average, audit, provisionalQuality } = require('../benchmarks/score.cjs')
test('benchmark covers sufficient cases and repeated model trials separately from deterministic checks', () => {
  assert.ok(cases.length >= 12)
  assert.equal(new Set(cases.map((c: { id: string }) => c.id)).size, cases.length)
  assert.equal(seeds.length, 3)
  assert.equal(cases.filter((c: { kind: string }) => c.kind === 'model').length, 10)
  assert.equal(cases.filter((c: { kind: string }) => c.kind === 'deterministic').length, 6)
})
test('synthetic benchmark CSVs import reproducibly with known currency-separated results', () => {
  for (const name of Object.keys(datasets)) assert.equal(importStatement(csvFor(name)).ok, true)
  const result = buildAdvisorContext(importStatement(csvFor('balanced')).transactions)
  const [october, november] = result.facts.currencies[0].months
  assert.equal(october.outflowCents, 190000)
  assert.equal(november.outflowCents, 200000)
  assert.equal(november.inflowCents, 250000)
  assert.equal(november.outflowCents - october.outflowCents, 10000)
  assert.equal(november.categories.find((c) => c.category === 'Dining')!.outflowCents - october.categories.find((c) => c.category === 'Dining')!.outflowCents, 8000)
  const ambiguous = buildAdvisorContext(importStatement(csvFor('ambiguous')).transactions).facts.currencies[0].allImported
  assert.equal(ambiguous.inflowCents, 135000)
  assert.equal(ambiguous.verifiedIncomeCents, null)
  const gaps = buildAdvisorContext(importStatement(csvFor('gap')).transactions).facts.currencies[0].months
  assert.deepEqual(gaps.map((m) => m.month), ['2026-09', '2026-11'])
})
test('benchmark aggregates latency correctly and distinguishes review flags from proven hallucinations', () => {
  assert.equal(median([5, 1, 7, 3]), 4)
  assert.equal(median([1, 7, 3]), 3)
  assert.equal(average([1, 2, 3]), 2)
  assert.equal(median([]), null)
  assert.equal(provisionalQuality('', cases[0]).total, 0)
  assert.ok(audit('The $500 guarantee is not verified.', cases[0]).includes('numeric_or_date_claim_requires_review'))
  assert.ok(audit('Reduce transport costs by combining trips.', { protected: 'Transport' }).includes('possible_constraint_conflict'))
  assert.ok(audit('Transport\n\nCompare feasible travel options or combine trips.', { protected: 'Transport' }).includes('possible_constraint_conflict'))
  assert.ok(audit('**Transport**  \nCompare feasible travel options or combine trips.', { protected: 'Transport' }).includes('possible_constraint_conflict'))
})
