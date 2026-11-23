const { _electron } = require('playwright')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'receiptai-smoke-'))
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const app = await _electron.launch({ chromiumSandbox: true, executablePath: path.resolve(__dirname, '../../release/linux-unpacked/receipt-ai'), args: [`--user-data-dir=${profile}`, '--disable-gpu'], env, timeout: 30000 })
  try {
    const page = await app.firstWindow()
    page.on('console', m => { if (m.type() === 'error') console.log('renderer error', m.text()) })
    console.log(await app.evaluate(({ app }) => ({ isPackaged: app.isPackaged, root: app.getAppPath(), data: app.getPath('userData') })))
    console.log(await page.locator('body').innerText())
    const deadline = Date.now() + 120000
    while (Date.now() < deadline) { const state = await page.evaluate(() => window.receiptDesktop.status()); if (state.phase === 'ready' || state.phase === 'failed') break; await new Promise(r => setTimeout(r, 250)) }
    console.log(await page.evaluate(() => window.receiptDesktop.status()))
    console.log(await app.evaluate(({ app }) => app.receiptAiDiagnostics()))
    await page.screenshot({ path: path.resolve(__dirname, '../../artifacts/phase5/smoke.png'), fullPage: true })
  } finally { await app.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
