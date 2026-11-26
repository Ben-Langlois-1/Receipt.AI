const { app, BrowserWindow, protocol, session, ipcMain, dialog, clipboard } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { AiManager } = require('./ai-manager.cjs')
const { validateRequest, assetPath, trustedFrame } = require('./validation.cjs')
// Some Linux launchers fall back to disabling Chromium's sandbox. Fail closed
// rather than accepting that downgrade on systems without user namespaces.
if (app.commandLine.hasSwitch('no-sandbox')) {
  dialog.showErrorBox('Receipt.AI requires sandboxing', 'Enable unprivileged user namespaces or use a supported desktop configuration. Receipt.AI cannot run with --no-sandbox.')
  app.exit(1)
}
protocol.registerSchemesAsPrivileged([{ scheme: 'receiptai', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
app.setName('Receipt.AI')
app.commandLine.appendSwitch('disable-background-networking')
app.commandLine.appendSwitch('disable-component-update')
const override = app.commandLine.getSwitchValue('user-data-dir')
app.setPath('userData', override && path.isAbsolute(override) ? override : path.join(app.getPath('appData'), 'Receipt.AI'))
if (!fs.existsSync(app.getPath('userData'))) fs.mkdirSync(app.getPath('userData'), { recursive: true, mode: 0o700 })
if (process.platform !== 'win32') process.umask(0o077)
const ownsLock = app.requestSingleInstanceLock()
if (!ownsLock) app.quit()
let window, manager, quitting = false
const resources = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '../resources')
const defaultModel = path.join(resources, 'models', 'Qwen3-1.7B-Q4_K_M.gguf')
function authorize(event) { if (!window || !trustedFrame(event, window.webContents)) throw Error('Untrusted application frame.') }
function registerIpc() {
  ipcMain.handle('receiptai:copy-report', (event, text) => { authorize(event); if (typeof text !== 'string' || text.length > 1000000) throw Error('Invalid report text.'); clipboard.writeText(text); return true })
  ipcMain.handle('receiptai:status', event => { authorize(event); return manager.status() })
  ipcMain.handle('receiptai:request', (event, request) => { authorize(event); validateRequest(request); return manager.request(request) })
  ipcMain.on('receiptai:cancel', (event, id) => { authorize(event); if (typeof id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(id)) manager.cancel(id) })
  ipcMain.handle('receiptai:retry', async event => { authorize(event); if (manager.status().phase !== 'starting') await manager.start(); return manager.status() })
  ipcMain.handle('receiptai:reset-model', async event => { authorize(event); fs.rmSync(path.join(app.getPath('userData'), 'ai-settings.json'), { force: true }); manager.model = defaultModel; await manager.start(); return manager.status() })
  ipcMain.handle('receiptai:choose-model', async event => {
    authorize(event)
    const choice = await dialog.showOpenDialog(window, { title: 'Choose a local GGUF model (Cancel keeps the current model)', properties: ['openFile'], filters: [{ name: 'GGUF model', extensions: ['gguf'] }] })
    if (!choice.canceled && choice.filePaths[0]?.toLowerCase().endsWith('.gguf')) {
      const file = choice.filePaths[0]
      if (!fs.statSync(file).isFile()) throw Error('Choose a GGUF file.')
      fs.writeFileSync(path.join(app.getPath('userData'), 'ai-settings.json'), JSON.stringify({ model: file }), { mode: 0o600 })
      manager.model = file; await manager.start()
    }
    return manager.status()
  })
}
function createWindow() {
  window = new BrowserWindow({ width: 1320, height: 900, minWidth: 900, minHeight: 600, title: 'Receipt.AI', show: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, webviewTag: false, devTools: !app.isPackaged } })
  window.setMenuBarVisibility(false)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('receiptai://app/')) event.preventDefault() })
  window.webContents.once('render-process-gone', () => { manager?.cancelAll(); app.quit() })
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  window.on('closed', () => { window = null })
  window.loadURL('receiptai://app/')
}
if (ownsLock) app.whenReady().then(async () => {
  const root = path.resolve(__dirname, '../dist')
  protocol.handle('receiptai', async request => {
    try {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
      const file = assetPath(request.url, root)
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
      return new Response(await fs.promises.readFile(file), { headers: { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'" } })
    } catch { return new Response('Not found', { status: 404 }) }
  })
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('receiptai://app/') }))
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(contents === window?.webContents && permission === 'clipboard-sanitized-write'))
  session.defaultSession.setPermissionCheckHandler((contents, permission, origin) => contents === window?.webContents && ['receiptai://app', 'receiptai://app/'].includes(origin) && permission === 'clipboard-sanitized-write')
  let model = defaultModel
  try { const saved = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'ai-settings.json'), 'utf8')); if (typeof saved.model === 'string' && path.isAbsolute(saved.model) && saved.model.toLowerCase().endsWith('.gguf')) model = saved.model } catch {}
  manager = new AiManager({ resources, model })
  manager.on('status', status => { if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('receiptai:status-update', status) })
  registerIpc(); createWindow(); await manager.start()
})
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus() } })
// Closing the last window exits on every platform, including macOS, and releases AI memory.
app.on('window-all-closed', () => app.quit())
app.on('before-quit', event => {
  if (!manager || quitting) return
  event.preventDefault(); quitting = true
  manager.stop().finally(() => app.quit())
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.quit())

// Main-process-only diagnostics for lifecycle tests; never exposed through preload.
module.exports.diagnostics = () => ({ isPackaged: app.isPackaged, mainPid: process.pid, userData: app.getPath('userData'), phase: manager?.status().phase, nativePid: manager?.nativePid, guardianPid: manager?.child?.pid, port: manager?.connection?.port })

app.receiptAiDiagnostics = module.exports.diagnostics
