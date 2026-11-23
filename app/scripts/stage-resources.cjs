const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
async function hash(file) { const sum = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(file)) sum.update(chunk); return sum.digest('hex') }
async function main() {
  const arch = process.env.NATIVE_ARCH || process.arch, platform = process.env.NATIVE_PLATFORM || process.platform
  if (!['linux', 'win32', 'darwin'].includes(platform) || !['x64', 'arm64'].includes(arch)) throw Error('Unsupported native staging target.')
  const target = `${platform}-${arch}`
  const native = path.resolve(process.env.NATIVE_BIN_DIR || path.join(root, 'build/native', target))
  const destination = path.join(root, 'resources/native', target)
  fs.mkdirSync(destination, { recursive: true })
  const candidates = fs.readdirSync(native, { recursive: true }).map(f => path.join(native, f)).filter(f => fs.statSync(f).isFile() && /(?:llama-server(?:\.exe)?$|\.so(?:\.\d+)*$|\.dylib$|\.dll$)/i.test(f))
  for (const source of candidates) { const output = path.join(destination, path.basename(source)); fs.copyFileSync(source, output); if (process.platform !== 'win32') fs.chmodSync(output, 0o755) }
  if (platform === 'linux') {
    const { execFileSync } = require('node:child_process')
    for (const name of ['libstdc++.so.6', 'libgcc_s.so.1']) if (!fs.existsSync(path.join(destination, name))) {
      const location = execFileSync('g++', ['-print-file-name=' + name], { encoding: 'utf8' }).trim()
      if (!path.isAbsolute(location) || !fs.existsSync(location)) throw Error('Cannot stage the Linux GCC runtime: ' + name)
      fs.copyFileSync(location, path.join(destination, name))
    }
  }
  const executable = path.join(destination, platform === 'win32' ? 'llama-server.exe' : 'llama-server')
  if (!fs.existsSync(executable)) throw Error('Build the native llama-server before staging.')
  const model = path.join(root, 'resources/models/Qwen3-1.7B-Q4_K_M.gguf')
  fs.mkdirSync(path.dirname(model), { recursive: true })
  if (process.env.MODEL_FILE) fs.copyFileSync(process.env.MODEL_FILE, model)
  if (!fs.existsSync(model)) throw Error('Set MODEL_FILE to the default 1.7B GGUF for build-time staging.')
  const expected = 'd2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5'
  const actual = await hash(model)
  if (actual !== expected) throw Error('The default GGUF does not match the approved model hash.')
  const manifest = { model: { file: path.basename(model), sha256: actual }, nativeSource: 'https://github.com/ggml-org/llama.cpp/tree/60ef23d6', target, files: {} }
  for (const name of fs.readdirSync(destination).filter(name => name !== 'manifest.json')) manifest.files[name] = await hash(path.join(destination, name))
  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2))
  for (const required of ['Qwen3-Apache-2.0.txt', 'llama.cpp-MIT.txt', 'LICENSE-httplib', 'LICENSE-jsonhpp']) if (!fs.existsSync(path.join(root, 'resources/licenses', required))) throw Error(`Missing license ${required}`)
  console.log(`Staged ${target}; approved default model verified. No 4B model is included.`)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
