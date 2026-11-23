// Dedicated guardian: the IPC pipe closes even when the Electron main process is killed.
const { spawn } = require('node:child_process')
const net = require('node:net')
let native, stopping = false, heartbeat
const send = message => { if (process.connected) process.send(message) }
async function stop() {
  if (stopping) return
  stopping = true
  clearInterval(heartbeat)
  if (native && native.exitCode === null && native.signalCode === null) {
    native.kill('SIGTERM')
    const force = setTimeout(() => { if (native.exitCode === null && native.signalCode === null) native.kill('SIGKILL') }, 4000)
    await new Promise(resolve => native.once('exit', resolve))
    clearTimeout(force)
  }
  process.exit(0)
}
process.on('disconnect', stop)
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
process.on('message', async message => {
  if (message.type === 'stop') return stop()
  if (message.type !== 'start' || native || stopping) return
  const { executable, model, key, threads } = message
  // Reserve an OS-assigned ephemeral port, then release it for llama.cpp. The
  // authenticated readiness check prevents attaching to a competing process.
  const probe = net.createServer()
  probe.listen(0, '127.0.0.1', () => {
    const port = probe.address().port
    probe.close(() => {
      if (stopping) return
      native = spawn(executable, ['-m', model, '--host', '127.0.0.1', '--port', String(port), '-c', '4096', '-t', String(threads), '-tb', String(threads), '-ngl', '0', '-np', '1', '--jinja', '--reasoning-budget', '0', '--alias', 'receiptai-local', '--no-webui', '--log-disable'], {
        cwd: require('node:path').dirname(executable), windowsHide: true, shell: false,
        env: { ...process.env, LLAMA_API_KEY: key, GGML_BACKEND_PATH: require('node:path').dirname(executable), LD_LIBRARY_PATH: require('node:path').dirname(executable) },
        stdio: 'ignore',
      })
      send({ type: 'spawned', pid: native.pid, port })
      native.once('error', () => { send({ type: 'failed', message: 'The bundled AI executable could not start.' }); stop() })
      native.once('exit', code => { send({ type: 'native-exit', code }); if (!stopping) { send({ type: 'failed', message: 'The local AI process stopped unexpectedly. You can retry initialization.' }); stop() } })
      heartbeat = setInterval(() => { if (!process.connected) stop() }, 1000)
    })
  })
  probe.once('error', () => { send({ type: 'failed', message: 'No local inference port is available.' }); stop() })
})
