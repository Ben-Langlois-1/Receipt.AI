const { EventEmitter } = require('node:events')
const { spawn } = require('node:child_process')
const { randomBytes } = require('node:crypto')
const { existsSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
class AiManager extends EventEmitter {
  constructor({ resources, model, runtime = process.execPath, guardian = path.join(__dirname, 'ai-supervisor.cjs'), runAsNode = true, timeoutMs = 120000 }) {
    super(); Object.assign(this, { resources, model, runtime, guardian, runAsNode, timeoutMs })
    this.state = { phase: 'idle', message: 'Local AI has not started.' }; this.pending = new Map(); this.generation = 0
  }
  status() { return { ...this.state } }
  update(phase, message) { this.state = { phase, message }; this.emit('status', this.status()) }
  async start() {
    await this.stop()
    const generation = ++this.generation
    const executable = path.join(this.resources, 'native', `${process.platform}-${process.arch}`, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server')
    if (!existsSync(executable) || !existsSync(this.model)) { this.update('failed', 'The bundled AI runtime or selected model is missing. Repair the installation or choose a valid GGUF model.'); return }
    this.update('starting', 'Initializing local AI. Loading the model…')
    const key = randomBytes(32).toString('hex')
    const child = spawn(this.runtime, [this.guardian], { env: { ...process.env, ...(this.runAsNode ? { ELECTRON_RUN_AS_NODE: '1' } : {}) }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true })
    this.child = child
    child.on('message', message => {
      if (generation !== this.generation) return
      if (message.type === 'spawned') { this.nativePid = message.pid; this.connection = { port: message.port, key }; this.waitUntilReady(generation) }
      if (message.type === 'native-exit') this.nativePid = null
      if (message.type === 'failed') { this.update('failed', message.message); this.cancelAll() }
    })
    child.send({ type: 'start', executable, model: this.model, key, threads: Math.max(1, Math.min(8, Math.floor(os.cpus().length / 2))) })
    child.once('error', () => { if (generation === this.generation) this.update('failed', 'The local AI supervisor could not start.') })
    child.once('exit', () => {
      // If the guardian itself crashes, clean up the exact child PID it reported.
      if (generation !== this.generation) return
      if (this.nativePid) { try { process.kill(this.nativePid, 'SIGTERM') } catch {} this.nativePid = null }
      this.cancelAll(); this.connection = null
      if (this.state.phase !== 'stopped' && this.state.phase !== 'failed') this.update('failed', 'Local AI stopped unexpectedly. Retry initialization.')
    })
  }
  async waitUntilReady(generation) {
    const deadline = Date.now() + this.timeoutMs
    while (generation === this.generation && this.state.phase === 'starting' && Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.connection.port}/props`, { headers: { Authorization: `Bearer ${this.connection.key}` }, signal: AbortSignal.timeout(2000), redirect: 'error' })
        const data = await response.json()
        if (response.ok && typeof data.model_path === 'string' && path.resolve(data.model_path) === path.resolve(this.model) && generation === this.generation && this.state.phase === 'starting') { this.update('ready', 'Local AI ready. All inference stays on this device.'); return }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    if (generation === this.generation && this.state.phase === 'starting') { await this.stop(); this.update('failed', 'Local AI initialization timed out. Retry or choose another compatible GGUF model.') }
  }
  async request({ id, path: requestPath, body }) {
    if (this.state.phase !== 'ready' || !this.connection) throw Error('Local AI is not ready yet.')
    if (this.pending.has(id) || this.pending.size >= 4) throw Error('Too many local AI requests.')
    const controller = new AbortController(), connection = { ...this.connection }
    this.pending.set(id, controller)
    const timer = setTimeout(() => controller.abort(), 120000)
    try {
      const response = await fetch(`http://127.0.0.1:${connection.port}${requestPath}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${connection.key}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal, redirect: 'error' })
      if (!response.ok) throw Error(`Local AI request failed (HTTP ${response.status}).`)
      return await response.json()
    } catch { throw Error(controller.signal.aborted ? 'Local AI request cancelled or timed out.' : 'The managed local AI request failed.') }
    finally { clearTimeout(timer); this.pending.delete(id) }
  }
  cancel(id) { this.pending.get(id)?.abort() }
  cancelAll() { for (const request of this.pending.values()) request.abort(); this.pending.clear() }
  async stop() {
    ++this.generation; this.cancelAll(); this.connection = null
    const child = this.child, nativePid = this.nativePid
    this.child = null; this.nativePid = null
    this.update('stopped', 'Local AI is stopped.')
    if (!child || (child.exitCode !== null || child.signalCode !== null)) return
    const exit = new Promise(resolve => child.once('exit', resolve))
    if (child.connected) child.send({ type: 'stop' })
    let timer
    const timeout = new Promise(resolve => { timer = setTimeout(resolve, 6000) })
    await Promise.race([exit, timeout]); clearTimeout(timer)
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); if (nativePid) { try { process.kill(nativePid, 'SIGTERM') } catch {} } }
  }
}
module.exports = { AiManager }
