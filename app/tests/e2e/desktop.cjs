// Launches packaged binaries only, with real managed Qwen3 inference and synthetic data.
const { _electron } = require('playwright')
const os = require('node:os')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { csvFor } = require('../../benchmarks/suite.cjs')
const { ReleaseMetrics } = require('./release-metrics.cjs')
const root = path.resolve(__dirname, '../..'), output = path.join(root, 'artifacts', process.env.DESKTOP_ARTIFACT_PHASE || 'phase6', process.env.DESKTOP_TEST_RUN || 'packaged')
const metrics = new ReleaseMetrics(output)
function defaultExecutable() {
  const candidates = process.platform === 'linux' ? ['release/linux-unpacked/receipt-ai'] : process.platform === 'win32' ? ['release/win-unpacked/receipt-ai.exe', 'release/win-unpacked/Receipt.AI.exe'] : [`release/mac-${process.arch}/Receipt.AI.app/Contents/MacOS/receipt-ai`, `release/mac-${process.arch}/Receipt.AI.app/Contents/MacOS/Receipt.AI`, 'release/mac/Receipt.AI.app/Contents/MacOS/Receipt.AI', 'release/mac/Receipt.AI.app/Contents/MacOS/receipt-ai']
  return candidates.map(p => path.join(root, p)).find(p => fs.existsSync(p))
}
const executable = process.env.DESKTOP_EXECUTABLE || defaultExecutable()
const sleep = ms => new Promise(r => setTimeout(r, ms))
function alive(pid) { try { if (!pid) return false; process.kill(pid, 0); return true } catch { return false } }
async function gone(pid) { for (let i = 0; i < 80 && alive(pid); i++) await sleep(100); assert.equal(alive(pid), false, `Owned process ${pid} must stop`) }
async function phase(page, expected) {
  const until = Date.now() + 125000
  let state
  while (Date.now() < until) { state = await page.evaluate(() => window.receiptDesktop.status()); if (state.phase === expected) return state; if (expected === 'ready' && state.phase === 'failed') throw Error(state.message); await sleep(200) }
  throw Error(`Expected ${expected}, last phase ${JSON.stringify(state)}`)
}
async function diagnostics(app) { return app.evaluate(({ app }) => app.receiptAiDiagnostics()) }
async function launch(profile, events, binary = executable) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  console.log('Launching packaged app:', path.basename(binary), path.basename(profile))
  const app = await _electron.launch({ chromiumSandbox: true, executablePath: binary, args: [`--user-data-dir=${profile}`, '--disable-gpu', ...(process.platform === 'linux' ? ['--ozone-platform=x11'] : [])], env, timeout: 125000 })
  metrics.register(app.process())
  app.process().stderr?.on('data', chunk => fs.appendFileSync(path.join(output, 'electron-stderr.log'), chunk))
  const context = app.context()
  // Air-gap validation uses a real loopback-only OS network namespace. Browser
  // offline emulation is deliberately not used for the local custom protocol.
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  const page = await app.firstWindow({ timeout: 125000 })
  await page.waitForLoadState('domcontentloaded')
  console.log('Packaged window loaded:', path.basename(profile))
  page.on('pageerror', error => events.push({ type: 'pageerror', message: error.message }))
  page.on('console', msg => { if (msg.type() === 'error') events.push({ type: 'console', message: msg.text() }) })
  page.on('request', request => { if (/^https?:/.test(request.url())) events.push({ type: 'unexpected-renderer-http', url: request.url() }) })
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), true)
  assert.equal(page.url(), 'receiptai://app/')
  page.receiptTestApp = app
  return { app, context, page }
}
async function importCsv(page, name) {
  await page.locator('input[type=file]').setInputFiles({ name: name + '.csv', mimeType: 'text/csv', buffer: Buffer.from(csvFor(name)) })
  await page.getByRole('button', { name: 'Confirm Import', exact: true }).click()
  await page.getByRole('button', { name: 'AI Advisor', exact: true }).click()
}
async function ask(page, question, screenshot, expectAI = false) {
  metrics.phase = screenshot
  const count = await page.locator('.ai-advisor > .card').count()
  await page.getByLabel('Your question', { exact: true }).fill(question)
  await page.getByRole('button', { name: 'Ask Advisor', exact: true }).click()
  const card = page.locator('.ai-advisor > .card').nth(count)
  await card.waitFor({ timeout: 125000 })
  if (expectAI) { assert.match(await card.innerText(), /AI-generated/); assert.doesNotMatch(await card.innerText(), /withheld|unavailable|<think>/) }
  await card.getByRole('button', { name: 'Copy report' }).click()
  await card.getByRole('status').filter({ hasText: 'Report copied.' }).waitFor()
  const copied = await page.receiptTestApp.evaluate(({ clipboard }) => clipboard.readText())
  assert.ok(copied.includes('Verified financial figures'), 'Native clipboard must contain the copied report')
  for (const d of await card.locator('details').all()) await d.evaluate(el => { el.open = true })
  const text = await card.innerText(), explanation = (await card.locator('.advisor-markdown').allInnerTexts()).join('\n')
  await card.screenshot({ path: path.join(output, screenshot + '.png') })
  fs.writeFileSync(path.join(output, screenshot + '.txt'), text)
  return { question, text, explanation, copied }
}
async function close(instance, label) {
  console.log('Closing test instance:', label)
  const diag = await diagnostics(instance.app)
  await instance.context.tracing.stop({ path: path.join(output, label + '-trace.zip') })
  await instance.app.close()
  await gone(diag.nativePid); await gone(diag.guardianPid)
  console.log('Owned processes stopped:', label)
  return diag
}
async function main() {
  if (!executable) throw Error('Build a packaged application or set DESKTOP_EXECUTABLE.')
  fs.mkdirSync(output, { recursive: true })
  metrics.start()
  if (process.env.DESKTOP_NETWORK_ISOLATED) assert.ok(Object.values(os.networkInterfaces()).flat().every(address => address.internal), 'Only loopback interfaces may exist in the offline test')
  const unique = String(Date.now())
  const events = [], results = [], profile = path.join(output, 'profile-' + unique)
  fs.mkdirSync(profile, { recursive: true, mode: 0o700 })
  const instances = []
  try {
    const first = await launch(profile, events); instances.push(first)
    const initial = await first.page.evaluate(() => window.receiptDesktop.status())
    console.log('Initial state', initial, await first.app.evaluate(({ BrowserWindow }) => ({ visible: BrowserWindow.getAllWindows()[0].isVisible(), bounds: BrowserWindow.getAllWindows()[0].getBounds() })))
    await first.page.screenshot({ path: path.join(output, 'initialization.png') })
    await phase(first.page, 'ready')
    const diag = await diagnostics(first.app)
    assert.ok(alive(diag.nativePid)); assert.notEqual(diag.port, 8080)
    const unauthorized = await fetch(`http://127.0.0.1:${diag.port}/props`)
    assert.equal(unauthorized.status, 401, 'Native endpoint requires the private key')
    assert.equal((await fetch(`http://127.0.0.1:${diag.port}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [] }) })).status, 401)
    const prefs = await first.app.evaluate(({ BrowserWindow, app }) => { const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, noSandbox: app.commandLine.hasSwitch('no-sandbox') } })
    assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false); assert.equal(prefs.sandbox, true); assert.equal(prefs.noSandbox, false)
    assert.deepEqual(await first.page.evaluate(() => ({ require: typeof require, process: typeof process })), { require: 'undefined', process: 'undefined' })
    await importCsv(first.page, 'balanced')
    const originalLedger = await first.page.evaluate(() => JSON.parse(localStorage.getItem('receipt-ai.ledger.v1')))
    results.push(await ask(first.page, 'What should I do to improve my spending habits?', 'habits', true))
    results.push(await ask(first.page, 'Suggest how to identify potentially unnecessary services without assuming every subscription is active.', 'focused-services', true))
    results.push(await ask(first.page, 'Suggest ways to save without changing my housing costs.', 'housing', true))
    assert.match(results.at(-1).text, /Kept unchanged at your request: Housing/)
    assert.doesNotMatch(results.at(-1).explanation, /\b(?:reduce|cut|lower|renegotiate)[^.\n]*(?:housing|rent|mortgage)/i)
    const comparison = await ask(first.page, 'Compare Dining in October and November 2026.', 'category-comparison')
    assert.match(comparison.text, /Dining: 2026-11 versus 2026-10: imported outflow difference 80.00 USD; change 36.36%/)
    assert.doesNotMatch(comparison.text, /difference 100.00/)
    results.push(comparison)
    const balance = await ask(first.page, 'What is my current bank balance?', 'balance')
    assert.match(balance.text, /verified opening balance/); assert.equal(balance.explanation, ''); results.push(balance)
    const missing = await ask(first.page, 'How much did I spend in January 2027?', 'missing-records')
    assert.match(missing.text, /Outflows\nUnknown/); results.push(missing)
    // Cancellation travels through the preload/main boundary, not renderer fetch.
    await first.page.getByLabel('Your question', { exact: true }).fill('Suggest spending improvements.')
    const historyBefore = await first.page.locator('.ai-advisor > .card').count()
    await first.page.getByRole('button', { name: 'Ask Advisor', exact: true }).click()
    await first.page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await first.page.getByRole('button', { name: 'Ask Advisor', exact: true }).waitFor()
    assert.equal(await first.page.locator('.ai-advisor > .card').count(), historyBefore)
    // Two isolated profiles run simultaneously on distinct owned ephemeral ports.
    const second = await launch(path.join(output, 'transport-profile-' + unique), events); instances.push(second)
    await phase(second.page, 'ready')
    const secondDiag = await diagnostics(second.app); assert.notEqual(secondDiag.port, diag.port)
    await importCsv(second.page, 'commuting')
    const transport = await ask(second.page, 'How can I reduce spending without changing my transport costs?', 'transport', true)
    assert.match(transport.text, /Kept unchanged at your request: Transport/)
    assert.doesNotMatch(transport.explanation, /\b(?:reduce|cut|lower|combine|compare)[^.\n]*(?:transport|commut)/i)
    results.push(transport)
    await close(second, 'transport'); instances.splice(instances.indexOf(second), 1)
    assert.ok(alive(diag.nativePid), 'Closing another profile must not stop this app server')
    await close(first, 'first-launch'); instances.splice(instances.indexOf(first), 1)
    // Reopen the same profile to verify origin/key persistence with no migration.
    const reopened = await launch(profile, events); instances.push(reopened)
    await phase(reopened.page, 'ready')
    assert.deepEqual(await reopened.page.evaluate(() => JSON.parse(localStorage.getItem('receipt-ai.ledger.v1'))), originalLedger)
    await reopened.page.getByRole('button', { name: 'AI Advisor', exact: true }).click()
    const restartedDiag = await diagnostics(reopened.app)
    process.kill(restartedDiag.nativePid, 'SIGKILL')
    await phase(reopened.page, 'failed')
    await reopened.page.screenshot({ path: path.join(output, 'server-failure.png') })
    await reopened.page.getByRole('button', { name: 'Retry local AI', exact: true }).click()
    await phase(reopened.page, 'ready')
    const recovered = await diagnostics(reopened.app)
    assert.notEqual(recovered.nativePid, restartedDiag.nativePid)
    await reopened.context.tracing.stop({ path: path.join(output, 'reopen-recovery-trace.zip') })
    // Kill only our test Electron main; the guardian must reap its model process.
    process.kill(recovered.mainPid, 'SIGKILL')
    await gone(recovered.nativePid); await gone(recovered.guardianPid)
    instances.splice(instances.indexOf(reopened), 1)
    const afterCrash = await launch(profile, events); instances.push(afterCrash)
    await phase(afterCrash.page, 'ready')
    assert.deepEqual(await afterCrash.page.evaluate(() => JSON.parse(localStorage.getItem('receipt-ai.ledger.v1'))), originalLedger)
    await close(afterCrash, 'after-main-crash'); instances.splice(instances.indexOf(afterCrash), 1)
    // A stale user-selected model fails gracefully and can restore the offline bundle.
    const badProfile = path.join(output, 'missing-model-profile-' + unique); fs.mkdirSync(badProfile, { recursive: true, mode: 0o700 })
    fs.writeFileSync(path.join(badProfile, 'ai-settings.json'), JSON.stringify({ model: path.join(badProfile, 'missing.gguf') }))
    const bad = await launch(badProfile, events); instances.push(bad)
    await phase(bad.page, 'failed'); await importCsv(bad.page, 'balanced')
    await bad.page.getByLabel('Your question', { exact: true }).fill('Suggest improvements.')
    assert.equal(await bad.page.getByRole('button', { name: 'AI unavailable', exact: true }).isDisabled(), true)
    await bad.page.getByRole('button', { name: 'Use bundled model', exact: true }).click()
    await phase(bad.page, 'ready')
    await close(bad, 'missing-model-recovery'); instances.splice(instances.indexOf(bad), 1)
    // An existing but malformed GGUF exercises an actual native load failure,
    // separately from the missing-file check above.
    const corruptProfile = path.join(output, 'invalid-model-profile-' + unique); fs.mkdirSync(corruptProfile, { recursive: true, mode: 0o700 })
    const corruptModel = path.join(corruptProfile, 'invalid.gguf')
    fs.writeFileSync(corruptModel, 'Synthetic invalid GGUF')
    fs.writeFileSync(path.join(corruptProfile, 'ai-settings.json'), JSON.stringify({ model: corruptModel }))
    const corrupt = await launch(corruptProfile, events); instances.push(corrupt)
    await phase(corrupt.page, 'failed')
    await corrupt.page.screenshot({ path: path.join(output, 'invalid-model.png') })
    await close(corrupt, 'invalid-model'); instances.splice(instances.indexOf(corrupt), 1)
    let upgrade = null
    if (process.env.DESKTOP_BASELINE_EXECUTABLE) {
      metrics.phase = 'upgrade-persistence'
      const upgradeProfile = path.join(output, 'upgrade-profile-' + unique)
      const previous = await launch(upgradeProfile, events, process.env.DESKTOP_BASELINE_EXECUTABLE); instances.push(previous)
      await phase(previous.page, 'ready'); await importCsv(previous.page, 'balanced')
      // Seed manual metadata in this synthetic profile; the current Transactions
      // UI is read-only. This checks migration compatibility without adding UI.
      const before = await previous.page.evaluate(() => { const rows = JSON.parse(localStorage.getItem('receipt-ai.ledger.v1')); rows[0].category_source = 'manual'; localStorage.setItem('receipt-ai.ledger.v1', JSON.stringify(rows)); return rows })
      const oldVersion = await previous.app.evaluate(({ app }) => app.getVersion())
      await close(previous, 'before-upgrade'); instances.splice(instances.indexOf(previous), 1)
      const updated = await launch(upgradeProfile, events); instances.push(updated)
      await phase(updated.page, 'ready')
      const newVersion = await updated.app.evaluate(({ app }) => app.getVersion())
      assert.notEqual(newVersion, oldVersion, 'Upgrade test requires different application versions')
      assert.deepEqual(await updated.page.evaluate(() => JSON.parse(localStorage.getItem('receipt-ai.ledger.v1'))), before)
      await updated.page.getByRole('button', { name: 'Transactions', exact: true }).click()
      await updated.page.screenshot({ path: path.join(output, 'upgrade-persistence.png'), fullPage: true })
      upgrade = { oldVersion, newVersion, records: before.length, allFieldsPreserved: true, manualMetadataPreserved: true }
      await close(updated, 'after-upgrade'); instances.splice(instances.indexOf(updated), 1)
    }
    const summary = { status: 'passed', executable, initial, prefs, upgrade, offlineMethod: process.env.DESKTOP_NETWORK_ISOLATED ? 'Real OS network namespace with only loopback, including first launch and inference' : 'Application blocks external renderer HTTP; inference is main-process loopback' , results, events, lifecycle: { automaticStartup: true, isolatedProfiles: true, authenticatedEndpoint: true, normalShutdown: true, profilePersistence: true, crashPersistence: true, processCrashRecovery: true, mainProcessCrashCleanup: true, missingModelRecovery: true, invalidModelFailure: true, cancellation: true } }
    assert.equal(events.filter(e => e.type === 'pageerror' || e.type === 'unexpected-renderer-http').length, 0, JSON.stringify(events))
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(summary, null, 2))
    console.log(JSON.stringify(summary, null, 2))
  } finally { fs.writeFileSync(path.join(output, 'observed-events.json'), JSON.stringify(events, null, 2)); for (const instance of instances) try { await instance.app.close() } catch {}; if (process.platform === 'linux') metrics.stop() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
