import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { checkArchitecture, missingWindowsDependencies } = require('../scripts/verify-package.cjs')
test('package inspection rejects native binaries for the wrong operating system or CPU', () => {
  const elf = Buffer.alloc(128); elf.write('7f454c46', 0, 'hex'); elf[4] = 2; elf[5] = 1; elf.writeUInt16LE(62, 18)
  assert.doesNotThrow(() => checkArchitecture(elf, 'linux', 'x64'))
  assert.throws(() => checkArchitecture(elf, 'linux', 'arm64'))
  assert.throws(() => checkArchitecture(elf, 'win32', 'x64'))
  const pe = Buffer.alloc(128); pe.write('MZ'); pe.writeUInt32LE(80, 60); pe.write('50450000', 80, 'hex'); pe.writeUInt16LE(0x8664, 84)
  assert.doesNotThrow(() => checkArchitecture(pe, 'win32', 'x64'))
  assert.throws(() => checkArchitecture(pe, 'win32', 'arm64'))
  assert.throws(() => checkArchitecture(pe, 'linux', 'x64'))
  const macho = Buffer.alloc(128); macho.writeUInt32LE(0xfeedfacf); macho.writeUInt32LE(0x100000c, 4)
  assert.doesNotThrow(() => checkArchitecture(macho, 'darwin', 'arm64'))
  assert.throws(() => checkArchitecture(macho, 'darwin', 'x64'))
})
test('package inspection rejects truncated executable headers', () => {
  for (const platform of ['linux', 'win32', 'darwin']) assert.throws(() => checkArchitecture(Buffer.alloc(0), platform, 'x64'))
})
test('Windows inspection requires compiler runtimes and CPU-plugin DLLs to be bundled', () => {
  const imports = { 'llama-server.exe': ['KERNEL32.dll', 'ggml.dll'], 'ggml-cpu-x64.dll': ['libstdc++-6.dll', 'VCRUNTIME140.dll'] }
  assert.deepEqual(missingWindowsDependencies(imports, ['llama-server.exe', 'ggml.dll', 'ggml-cpu-x64.dll']), ['libstdc++-6.dll', 'VCRUNTIME140.dll'])
  assert.deepEqual(missingWindowsDependencies(imports, ['ggml.dll', 'LIBSTDC++-6.DLL', 'VCRUNTIME140.dll']), [])
})
