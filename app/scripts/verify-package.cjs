// Inspect actual packaged resources, not build-source assumptions. Build/test only.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const { listPackage, extractFile } = require('@electron/asar')
const MODEL_HASH = 'd2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5'
async function hash(file) { const h = crypto.createHash('sha256'); for await (const c of fs.createReadStream(file)) h.update(c); return h.digest('hex') }
function windowsImports(buffer) {
  checkArchitecture(buffer, 'win32', 'x64')
  const pe = buffer.readUInt32LE(60), optional = pe + 24
  if (buffer.readUInt16LE(optional) !== 0x20b) throw Error('Expected PE32+ optional header.')
  const sectionTable = optional + buffer.readUInt16LE(pe + 20), sections = buffer.readUInt16LE(pe + 6)
  const offset = rva => {
    for (let i = 0; i < sections; i++) {
      const section = sectionTable + 40 * i, address = buffer.readUInt32LE(section + 12), size = Math.max(buffer.readUInt32LE(section + 8), buffer.readUInt32LE(section + 16))
      if (rva >= address && rva < address + size) { const result = buffer.readUInt32LE(section + 20) + rva - address; if (result < buffer.length) return result }
    }
    throw Error('Invalid PE import address.')
  }
  const rva = buffer.readUInt32LE(optional + 120)
  if (!rva) return []
  const imports = []
  for (let descriptor = offset(rva); descriptor + 20 <= buffer.length; descriptor += 20) {
    const nameRva = buffer.readUInt32LE(descriptor + 12)
    if (!nameRva) return imports
    const name = offset(nameRva), end = buffer.indexOf(0, name)
    if (end < name || end - name > 512) throw Error('Invalid PE dependency name.')
    imports.push(buffer.toString('ascii', name, end))
  }
  throw Error('Unterminated PE import descriptors.')
}
function missingWindowsDependencies(imports, packagedNames) {
  // The VC++ redistributable is deliberately absent: it is not an OS DLL and
  // must be statically linked or explicitly bundled, not assumed on user PCs.
  const system = new Set(['kernel32.dll', 'msvcrt.dll', 'advapi32.dll', 'user32.dll', 'ws2_32.dll', 'shell32.dll', 'ole32.dll', 'oleaut32.dll', 'bcrypt.dll', 'ntdll.dll', 'gdi32.dll', 'comdlg32.dll', 'winspool.drv', 'version.dll', 'ucrtbase.dll', 'shlwapi.dll'])
  const packaged = new Set(packagedNames.map(name => name.toLowerCase()))
  return [...new Set(Object.values(imports).flat())].filter(name => !system.has(name.toLowerCase()) && !packaged.has(name.toLowerCase()) && !name.toLowerCase().startsWith('api-ms-win-'))
}
function checkArchitecture(buffer, platform, arch) {
  if (platform === 'linux') {
    if (buffer.toString('hex', 0, 4) !== '7f454c46' || buffer[4] !== 2 || buffer[5] !== 1 || buffer.readUInt16LE(18) !== ({ x64: 62, arm64: 183 })[arch]) throw Error('Wrong ELF target architecture.')
  } else if (platform === 'win32') {
    const pe = buffer.length >= 64 ? buffer.readUInt32LE(60) : -1
    if (buffer.toString('ascii', 0, 2) !== 'MZ' || pe < 0 || pe + 6 > buffer.length || buffer.toString('hex', pe, pe + 4) !== '50450000' || buffer.readUInt16LE(pe + 4) !== 0x8664 || arch !== 'x64') throw Error('Wrong Windows PE target architecture.')
  } else if (platform === 'darwin') {
    if (buffer.length < 8 || buffer.readUInt32LE(0) !== 0xfeedfacf || buffer.readUInt32LE(4) !== ({ x64: 0x1000007, arm64: 0x100000c })[arch]) throw Error('Wrong thin Mach-O target architecture.')
  } else throw Error('Unsupported package platform.')
}
async function verifyPackage(directory, platform = process.platform, arch = process.arch) {
  const resources = path.join(directory, platform === 'darwin' ? 'Contents/Resources' : 'resources')
  const modelDirectory = path.join(resources, 'models'), modelFiles = fs.readdirSync(modelDirectory)
  if (modelFiles.length !== 1 || modelFiles[0] !== 'Qwen3-1.7B-Q4_K_M.gguf') throw Error('Default package must contain exactly the approved 1.7B model.')
  if (await hash(path.join(modelDirectory, modelFiles[0])) !== MODEL_HASH) throw Error('Packaged model checksum mismatch.')
  const nativeDirectory = path.join(resources, 'native', `${platform}-${arch}`)
  const manifest = JSON.parse(fs.readFileSync(path.join(nativeDirectory, 'manifest.json')))
  if (manifest.target !== `${platform}-${arch}` || manifest.model.sha256 !== MODEL_HASH) throw Error('Native manifest target/model mismatch.')
  const entries = Object.entries(manifest.files)
  if (!entries.some(([name]) => name === (platform === 'win32' ? 'llama-server.exe' : 'llama-server'))) throw Error('No bundled native inference executable.')
  if (fs.readdirSync(nativeDirectory).some(name => name !== 'manifest.json' && !Object.hasOwn(manifest.files, name))) throw Error('Untracked native package file.')
  const imports = {}
  for (const [name, expected] of entries) {
    if (path.basename(name) !== name || !/^[a-f0-9]{64}$/.test(expected)) throw Error('Invalid native manifest entry.')
    const file = path.join(nativeDirectory, name)
    if (await hash(file) !== expected) throw Error(`Native checksum mismatch: ${name}`)
    const fd = fs.openSync(file, 'r'), header = Buffer.alloc(4096)
    const bytes = fs.readSync(fd, header); fs.closeSync(fd)
    checkArchitecture(header.subarray(0, bytes), platform, arch)
    if (platform === 'win32') imports[name] = windowsImports(fs.readFileSync(file))
    if (platform !== 'win32' && !(fs.statSync(file).mode & 0o111)) throw Error(`Missing native executable permissions: ${name}`)
  }
  const missing = missingWindowsDependencies(imports, entries.map(([name]) => name))
  if (missing.length) throw Error('Missing non-system Windows dependencies: ' + missing.join(', '))
  const asar = path.join(resources, 'app.asar'), appEntries = listPackage(asar)
  if (appEntries.some(name => /\.gguf$|[/\\](?:tests|benchmarks|scripts)[/\\]/i.test(name))) throw Error('Unexpected model/test/build files inside ASAR.')
  const metadata = JSON.parse(extractFile(asar, 'package.json'))
  for (const license of ['NOTICE.txt', 'Qwen3-Apache-2.0.txt', 'llama.cpp-MIT.txt', 'Electron-MIT.txt', 'Chromium-NOTICES.html', 'React-MIT.txt', 'React-DOM-MIT.txt', 'Scheduler-MIT.txt']) if (!fs.existsSync(path.join(resources, 'licenses', license))) throw Error(`Missing bundled license: ${license}`)
  return { status: 'passed', platform, arch, version: metadata.version, model: { file: modelFiles[0], sha256: MODEL_HASH, bytes: fs.statSync(path.join(modelDirectory, modelFiles[0])).size, outsideAsar: true }, native: { files: entries.length, sha256Verified: true, architectureVerified: true, ...(platform === 'win32' ? { imports, missingNonSystemDependencies: missing } : {}) }, inferenceRuntimeBundled: true, runtimeDownloadNeeded: false }
}
if (require.main === module) verifyPackage(path.resolve(process.argv[2] || ''), process.argv[3], process.argv[4]).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { verifyPackage, checkArchitecture, windowsImports, missingWindowsDependencies, hash }
