import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { nativeFlags } = require('../scripts/build-native.cjs')
const { replaceDirectory } = require('../scripts/stage-resources.cjs')

test('Windows native release is one static CPU runtime without shared CRT boundaries', () => {
  const flags: string[] = nativeFlags('win32', 'x64')
  for (const expected of ['-DBUILD_SHARED_LIBS=OFF', '-DGGML_BACKEND_DL=OFF', '-DGGML_CPU_ALL_VARIANTS=OFF', '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded']) assert.ok(flags.includes(expected))
  for (const unsafe of ['-DBUILD_SHARED_LIBS=ON', '-DGGML_BACKEND_DL=ON', '-DGGML_CPU_ALL_VARIANTS=ON']) assert.ok(!flags.includes(unsafe))
})

test('macOS and Linux retain their existing platform-specific native settings', () => {
  const mac: string[] = nativeFlags('darwin', 'arm64')
  assert.ok(mac.includes('-DBUILD_SHARED_LIBS=ON'))
  assert.ok(mac.includes('-DGGML_METAL=OFF'))
  assert.ok(mac.includes('-DCMAKE_OSX_ARCHITECTURES=arm64'))
  const linux: string[] = nativeFlags('linux', 'x64')
  assert.ok(linux.includes('-DBUILD_SHARED_LIBS=ON'))
  assert.ok(linux.includes('-DGGML_BACKEND_DL=ON'))
  assert.ok(linux.includes('-DGGML_CPU_ALL_VARIANTS=ON'))
})

test('native staging removes files left by an earlier runtime', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-ai-native-stage-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  fs.writeFileSync(path.join(directory, 'stale-runtime.dll'), 'not part of the new build')
  replaceDirectory(directory)
  assert.deepEqual(fs.readdirSync(directory), [])
})

test('Windows offline harness uses Server-compatible scoped rules with rollback', () => {
  const script = fs.readFileSync(new URL('../scripts/release-network-windows.ps1', import.meta.url), 'utf8')
  assert.match(script, /foreach \(\$address in \$outsideAddresses\)/)
  assert.match(script, /-Program \$program -RemoteAddress \$address/)
  assert.doesNotMatch(script, /-RemoteAddress \$outsideIPv[46]/)
  assert.doesNotMatch(script, /'\d{1,3}(?:\.\d{1,3}){3}\/\d+'/)
  for (const scope of ['1.0.0.0-126.255.255.255', '128.0.0.0-255.255.255.255', '2000::-3fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', 'ff00::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff']) assert.ok(script.includes(`'${scope}'`))
  assert.match(script, /catch \{\s*\$enableError = \$_\s*try \{ Restore-TestFirewallState \}/)
  assert.match(script, /Remove-Item -LiteralPath \$stateFile -Force/)
  assert.match(script, /Removed test firewall rules and restored profile state/)
})
