const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawnSync } = require('node:child_process')
const { tcp } = require('./release-network-macos.cjs')
async function main() {
  if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true') throw Error('Run only on the disposable native Windows runner.')
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'receiptai-fw-probe-')), 'ReceiptAI'), group = 'ReceiptAI-Test-' + Date.now()
  const run = (file, args) => { const r = spawnSync(file, args, { stdio: 'inherit' }); if (r.error || r.status !== 0) throw r.error || Error('Network probe exited ' + r.status) }
  for (const name of ['receipt-ai.exe', 'resources/native/win32-x64/llama-server.exe']) { const target = path.join(root, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(process.execPath, target) }
  const helper = path.join(__dirname, 'release-network-windows.ps1')
  if (!await tcp('1.1.1.1', 443)) throw Error('External TCP control unavailable before rules.')
  try {
    run('powershell.exe', ['-NoProfile', '-File', helper, '-Mode', 'Enable', '-Directory', root, '-Group', group])
    const script = `const net=require('node:net');const s=net.connect({host:'1.1.1.1',port:443});let ended=false;const done=n=>{if(ended)return;ended=true;s.destroy();process.exitCode=n};s.once('connect',()=>done(1));s.once('error',()=>done(0));s.setTimeout(3000,()=>done(0));`
    run(path.join(root, 'receipt-ai.exe'), ['-e', script])
    console.log('Native per-program external TCP block verified.')
  } finally { run('powershell.exe', ['-NoProfile', '-File', helper, '-Mode', 'Disable', '-Directory', root, '-Group', group]) }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
