// Keep the pinned static AppImage runtime, but do not silently add the toolset's
// obsolete GConf/appindicator/notification libraries to the application payload.
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process')
const { getAppImageTools } = require('app-builder-lib/out/toolsets/linux')
const { Arch } = require('builder-util')
const { hash } = require('./verify-package.cjs')
async function main() {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw Error('Use native Linux x64 for this package recipe.')
  const root = path.resolve(__dirname, '..'), tools = await getAppImageTools('1.0.3', Arch.x64)
  const selected = path.join(root, 'build/appimage-tools-minimal')
  fs.mkdirSync(path.join(selected, 'lib/x64'), { recursive: true }); fs.mkdirSync(path.join(selected, 'runtimes'), { recursive: true })
  const quote = value => "'" + value.replace(/'/g, "'\\''") + "'"
  for (const [name, original] of [['mksquashfs', tools.mksquashfs], ['desktop-file-validate', tools.desktopFileValidate]]) fs.writeFileSync(path.join(selected, name), `#!/bin/sh\nexec ${quote(original)} "$@"\n`, { mode: 0o755 })
  const runtime = process.env.RECEIPTAI_APPIMAGE_RUNTIME || tools.runtime
  const runtimeHash = await hash(runtime)
  if (!process.env.RECEIPTAI_APPIMAGE_RUNTIME && runtimeHash !== '2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d') throw Error('Unexpected pinned AppImage runtime.')
  fs.copyFileSync(runtime, path.join(selected, 'runtimes/runtime-x64'))
  fs.chmodSync(path.join(selected, 'runtimes/runtime-x64'), 0o755)
  fs.mkdirSync(path.join(root, 'artifacts/phase6'), { recursive: true })
  fs.writeFileSync(path.join(root, 'artifacts/phase6/appimage-toolset.json'), JSON.stringify({ runtimeHash, runtimeRelease: '20251108', customRuntimeForRelinking: !!process.env.RECEIPTAI_APPIMAGE_RUNTIME, omittedRuntimeLibraries: fs.readdirSync(tools.runtimeLibraries), reason: 'App uses the same distro GUI prerequisites as the tested RPM; these old optional toolset libraries are unnecessary.' }, null, 2))
  const targets = process.argv.slice(2)
  if (targets.some(target => !['AppImage', 'rpm'].includes(target))) throw Error('Unsupported Linux package target.')
  const result = spawnSync(process.execPath, [require.resolve('electron-builder/cli.js'), '--config', 'electron-builder.cjs', '--linux', ...(targets.length ? targets : ['AppImage', 'rpm']), '--x64'], { cwd: root, env: { ...process.env, APPIMAGE_TOOLS_PATH: selected }, stdio: 'inherit' })
  if (result.error || result.status !== 0) throw result.error || Error('Linux packaging failed.')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
