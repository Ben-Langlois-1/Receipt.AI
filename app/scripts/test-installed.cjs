// Native Windows/macOS installer tests. Linux installation uses a clean container.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawnSync } = require('node:child_process')
const { verifyPackage } = require('./verify-package.cjs')
const { macLoopbackPolicy } = require('./release-network-macos.cjs')
const root = path.resolve(__dirname, '..'), version = require('../package.json').version
function run(file, args, options = {}) {
  const r = spawnSync(file, args, { stdio: 'inherit', ...options })
  if (r.error || r.status !== 0) throw r.error || Error(`${path.basename(file)} exited ${r.status}`)
}
async function main() {
  if (!['win32', 'darwin'].includes(process.platform)) throw Error('Run this test on native Windows or macOS.')
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'receiptai-install-')), evidence = path.join(root, 'artifacts/phase6/installed-' + process.platform + '-' + process.arch)
  fs.mkdirSync(evidence, { recursive: true })
  let executable, directory, mounted = false, networkCleanup
  const group = 'ReceiptAI-Test-' + Date.now(), mount = path.join(temporary, 'volume')
  const firewall = path.join(__dirname, 'release-network-windows.ps1')
  try {
    if (process.platform === 'win32') {
      directory = path.join(temporary, 'ReceiptAI')
      run(path.join(root, 'release', `Receipt.AI-${version}-win-x64.exe`), ['/S', `/D=${directory}`])
      executable = path.join(directory, 'receipt-ai.exe')
      run('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', firewall, '-Mode', 'Enable', '-Directory', directory, '-Group', group])
    } else {
      fs.mkdirSync(mount)
      run('hdiutil', ['attach', '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mount, path.join(root, 'release', `Receipt.AI-${version}-mac-${process.arch}.dmg`)])
      mounted = true
      const applications = fs.readdirSync(mount).filter(name => name.endsWith('.app') && fs.statSync(path.join(mount, name)).isDirectory())
      if (applications.length !== 1) throw Error('Expected exactly one application bundle in the DMG.')
      console.log('Installing DMG application:', applications[0])
      directory = path.join(temporary, applications[0])
      run('ditto', [path.join(mount, applications[0]), directory])
      executable = ['receipt-ai', 'Receipt.AI'].map(name => path.join(directory, 'Contents/MacOS', name)).find(file => fs.existsSync(file))
      networkCleanup = await macLoopbackPolicy(temporary, evidence)
    }
    const inventory = await verifyPackage(directory)
    fs.writeFileSync(path.join(evidence, 'package-inventory.json'), JSON.stringify(inventory, null, 2))
    run(process.execPath, [path.join(root, 'tests/e2e/desktop.cjs')], { cwd: root, env: { ...process.env, DESKTOP_EXECUTABLE: executable, DESKTOP_ARTIFACT_PHASE: 'phase6', DESKTOP_TEST_RUN: 'installed-' + process.platform + '-' + process.arch } })
    fs.writeFileSync(path.join(evidence, 'installation.json'), JSON.stringify({ status: 'passed', platform: process.platform, arch: process.arch, version, installed: true, offlineFirstLaunch: true, networkMethod: process.platform === 'win32' ? 'Per-program Windows Firewall denies external routable addresses with active profiles' : 'Owned PF anchor blocks new external app/user connections while retaining Chromium sandboxing', unsignedPreview: true }, null, 2))
  } catch (error) {
    fs.writeFileSync(path.join(evidence, 'installation-failure.json'), JSON.stringify({ platform: process.platform, arch: process.arch, message: error.message }, null, 2))
    throw error
  } finally {
    networkCleanup?.()
    if (process.platform === 'win32') run('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', firewall, '-Mode', 'Disable', '-Directory', directory, '-Group', group])
    if (mounted) run('hdiutil', ['detach', mount])
    // Keep isolated profiles and installed files if a test fails for diagnosis.
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
