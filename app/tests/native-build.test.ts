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
