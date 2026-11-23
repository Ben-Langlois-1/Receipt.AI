// Native-platform CI build. Linux release baseline should use the Ubuntu container script.
const { execFileSync } = require('node:child_process'), fs = require('node:fs'), path = require('node:path')
const root = path.resolve(__dirname, '..'), source = path.resolve(process.env.LLAMA_SOURCE || path.join(root, 'build/llama-source'))
const arch = process.env.NATIVE_ARCH || process.arch, output = path.join(root, 'build/native', `${process.platform}-${arch}`)
const flags = ['-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=ON', '-DGGML_NATIVE=OFF', '-DGGML_OPENMP=OFF', '-DLLAMA_CURL=OFF', '-DLLAMA_BUILD_TESTS=OFF', '-DLLAMA_BUILD_EXAMPLES=OFF', '-DLLAMA_BUILD_SERVER=ON', '-DLLAMA_BUILD_TOOLS=ON']
if (process.platform === 'darwin') flags.push('-DGGML_BACKEND_DL=OFF', '-DGGML_CPU_ALL_VARIANTS=OFF', '-DGGML_METAL=OFF', '-DGGML_ACCELERATE=OFF', '-DCMAKE_BUILD_RPATH=@loader_path', `-DCMAKE_OSX_ARCHITECTURES=${arch === 'arm64' ? 'arm64' : 'x86_64'}`)
else flags.push('-DGGML_BACKEND_DL=ON', '-DGGML_CPU_ALL_VARIANTS=ON', '-DCMAKE_BUILD_RPATH_USE_ORIGIN=ON')
if (process.platform === 'win32') flags.push('-DCMAKE_POLICY_DEFAULT_CMP0091=NEW', '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded', '-A', 'x64')
fs.mkdirSync(output, { recursive: true })
execFileSync('cmake', ['-S', source, '-B', output, ...flags], { stdio: 'inherit' })
execFileSync('cmake', ['--build', output, '--config', 'Release', '--target', 'llama-server', '--parallel', '4'], { stdio: 'inherit' })
console.log(`Set NATIVE_BIN_DIR=${path.join(output, 'bin')} when staging.`)
