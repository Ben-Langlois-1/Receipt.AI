// Separate invocations allow a real RPM upgrade between seed and verification.
const { _electron } = require('playwright')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { csvFor } = require('../../benchmarks/suite.cjs')
async function main() {
  const [mode, executable, profile, snapshot] = process.argv.slice(2)
  assert.ok(['seed', 'verify'].includes(mode)); assert.ok(path.isAbsolute(profile))
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const app = await _electron.launch({ chromiumSandbox: true, executablePath: executable, args: [`--user-data-dir=${profile}`, '--disable-gpu', '--ozone-platform=x11'], env, timeout: 45000 })
  let diagnostics
  try {
    const page = await app.firstWindow()
    const until = Date.now() + 125000
    while (Date.now() < until) { const state = await page.evaluate(() => window.receiptDesktop.status()); if (state.phase === 'ready') break; assert.notEqual(state.phase, 'failed', state.message); await new Promise(r => setTimeout(r, 200)) }
    assert.equal((await page.evaluate(() => window.receiptDesktop.status())).phase, 'ready')
    diagnostics = await app.evaluate(({ app }) => app.receiptAiDiagnostics())
    const version = await app.evaluate(({ app }) => app.getVersion())
    if (mode === 'seed') {
      await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-upgrade.csv', mimeType: 'text/csv', buffer: Buffer.from(csvFor('balanced')) })
      await page.getByRole('button', { name: 'Confirm Import', exact: true }).click()
      const ledger = await page.evaluate(() => { const rows = JSON.parse(localStorage.getItem('receipt-ai.ledger.v1')); rows[0].category_source = 'manual'; localStorage.setItem('receipt-ai.ledger.v1', JSON.stringify(rows)); return rows })
      assert.equal(ledger.length, 14)
      fs.writeFileSync(snapshot, JSON.stringify({ version, ledger }, null, 2))
    } else {
      const before = JSON.parse(fs.readFileSync(snapshot))
      assert.notEqual(version, before.version)
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('receipt-ai.ledger.v1'))), before.ledger)
      await page.getByRole('button', { name: 'Transactions', exact: true }).click()
      await page.screenshot({ path: snapshot + '.png', fullPage: true })
      fs.writeFileSync(snapshot + '.result.json', JSON.stringify({ status: 'passed', previousVersion: before.version, currentVersion: version, records: before.ledger.length, allFieldsPreserved: true, manualMetadataPreserved: true }, null, 2))
    }
  } finally { await app.close() }
  for (const pid of [diagnostics?.nativePid, diagnostics?.guardianPid]) if (pid) {
    let running = true
    for (let i = 0; i < 80 && running; i++) { try { process.kill(pid, 0) } catch { running = false }; if (running) await new Promise(r => setTimeout(r, 100)) }
    assert.equal(running, false, 'Owned inference process must stop before replacing the installed package')
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
