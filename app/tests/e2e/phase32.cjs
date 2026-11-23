// Real local inference only. Install Playwright separately and set PLAYWRIGHT_MODULE if needed.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const questions = [
  'What should I do to improve my spending habits?',
  'Which spending categories should I focus on reducing?',
  'How can I save more money without changing my housing costs?',
  'Compare October and November 2026.',
  'What is my current bank balance?',
]
async function main() {
  const run = process.env.PHASE32_RUN || 'acceptance'
  const destination = path.resolve(__dirname, '../../artifacts/phase3.2', run)
  await fs.mkdir(destination, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) })
  const context = await browser.newContext({ viewport: { width: 1400, height: 1100 }, timezoneId: 'America/Detroit', colorScheme: 'light', permissions: ['clipboard-read', 'clipboard-write'] })
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  const page = await context.newPage()
  const consoleErrors = [], networkFailures = [], responses = []
  page.on('pageerror', error => consoleErrors.push(error.message))
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('requestfailed', r => networkFailures.push({ url: r.url(), failure: r.failure() }))
  page.on('response', async response => {
    if (response.url().includes('/v1/chat/completions')) responses.push({ status: response.status(), body: await response.json() })
  })
  const results = []
  try {
    await page.goto('http://localhost:5173')
    assert.equal(await page.evaluate(() => localStorage.length), 0, 'Context must be isolated')
    const header = 'date,posted_date,description,amount,currency,direction,category,account,source_bank,external_id'
    const rows = [header]
    let id = 0
    for (const [month, values] of [['10', [1200, 220, 180, 140, 80, 80]], ['11', [1200, 300, 200, 180, 60, 60]]]) {
      const categories = ['Housing', 'Dining', 'Groceries', 'Uncategorized', 'Transport', 'Subscriptions']
      for (let i = 0; i < values.length; i++) rows.push(`2026-${month}-${String(i + 1).padStart(2, '0')},,SYNTHETIC TEST PURCHASE,-${values[i]}.00,USD,outflow,${categories[i]},SYNTHETIC,SYNTHETIC,${(++id).toString(16).padStart(16, '0')}`)
      rows.push(`2026-${month}-10,,SYNTHETIC TEST CREDIT,2500.00,USD,inflow,Uncategorized,SYNTHETIC,SYNTHETIC,${(++id).toString(16).padStart(16, '0')}`)
    }
    const csv = rows.join('\n') + '\n'
    await fs.writeFile(path.join(destination, 'synthetic.csv'), csv)
    await page.locator('input[type=file]').setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await page.getByRole('button', { name: 'Confirm Import', exact: true }).click()
    await page.getByRole('button', { name: 'AI Advisor', exact: true }).click()
    await page.getByText(/Local model ready:/).waitFor({ timeout: 30000 })
    for (let i = 0; i < questions.length; i++) {
      const startResponses = responses.length
      await page.getByLabel('Your question', { exact: true }).fill(questions[i])
      await page.getByRole('button', { name: 'Ask Advisor', exact: true }).click()
      const card = page.locator('.ai-advisor > .card').nth(i + 1)
      await card.waitFor({ timeout: 160000 })
      await page.getByRole('button', { name: 'Ask Advisor', exact: true }).waitFor({ timeout: 10000 })
      const visibleBefore = await card.innerText()
      let copiedReport = null
      if (run !== 'baseline') {
        await card.getByRole('button', { name: 'Copy report', exact: true }).click()
        await card.getByRole('status').filter({ hasText: 'Report copied.' }).waitFor()
        copiedReport = await page.evaluate(() => navigator.clipboard.readText())
        await fs.writeFile(path.join(destination, `question-${i + 1}.txt`), copiedReport)
        if (i < 4) assert.ok(copiedReport.includes('Dining:'))
        assert.ok(!/^-\s*$/m.test(copiedReport), 'No empty copy bullets')
      }
      for (const details of await card.locator('details').all()) await details.evaluate(el => { el.open = true })
      const text = await card.innerText()
      const rawText = await card.textContent()
      const explanation = await card.locator('.advisor-markdown').allInnerTexts()
      const emptyBullets = await card.locator('li').evaluateAll(list => list.filter(el => !el.innerText.trim()).length)
      await card.scrollIntoViewIfNeeded()
      await card.screenshot({ path: path.join(destination, `question-${i + 1}.png`) })
      const result = { question: questions[i], text, rawText, visibleBefore, copiedReport, explanation, emptyBullets, generationCalls: responses.length - startResponses }
      results.push(result)
      console.log(JSON.stringify(result))
    }
    await fs.writeFile(path.join(destination, 'results.json'), JSON.stringify({ results, consoleErrors, networkFailures, responses }, null, 2))
    if (run !== 'baseline') {
      for (const result of results.slice(0, 3)) {
        assert.match(result.text, /AI-generated/)
        assert.doesNotMatch(result.text, /AI explanation withheld|unavailable|<think>/)
        assert.ok(result.generationCalls >= 1 && result.generationCalls <= 2)
        assert.equal(result.emptyBullets, 0)
        const prose = result.explanation.join('\n')
        for (const category of ['Uncategorized', 'Dining', 'Groceries', 'Subscriptions']) assert.match(prose, new RegExp(category, 'i'))
        assert.ok(prose.toLowerCase().indexOf('uncategorized') < prose.toLowerCase().indexOf('dining'), 'Investigate unknown labels first')
        assert.match(prose, /investigat|label|categori[sz]/i)
        assert.match(prose, /pantry|shopping list|meals/i)
        assert.match(prose, /unverified|incomplete/i)
        assert.ok(!/[\d$€£%]|<think>/i.test(prose), 'No unsupported numeric claims or internal reasoning')
        assert.doesNotMatch(prose, /offer a practical option/i)
        assert.match(result.copiedReport, /Attempt 1: accepted/)
        assert.match(result.copiedReport, /Dining: 520.00 USD/)

      }
      assert.match(results[1].explanation.join('\n'), /Uncategorized/i)
      assert.match(results[2].text, /Kept unchanged at your request: Housing/);
      assert.doesNotMatch(results[2].explanation.join('\n'), /(?:reduce|cut|lower|renegotiate)[^.\n]*(?:housing|rent|mortgage)/i)
      assert.equal(results[3].generationCalls, 0)
      assert.match(results[3].text, /difference 100.00 USD; change 5.26%/)
      assert.match(results[3].text, /Coverage is unverified/)
      assert.equal(results[4].generationCalls, 0)
      assert.match(results[4].text, /verified opening balance/)
      assert.equal(consoleErrors.filter(e => !e.includes('aria-role')).length, 0, JSON.stringify(consoleErrors))
      assert.equal(networkFailures.filter(r => !(r.url.endsWith('/v1/models') && r.failure?.errorText === 'net::ERR_ABORTED')).length, 0, JSON.stringify(networkFailures))
    }
    console.log(`Saved ${destination}`)
  } finally {
    await context.tracing.stop({ path: path.join(destination, 'trace.zip') })
    await browser.close()
  }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
