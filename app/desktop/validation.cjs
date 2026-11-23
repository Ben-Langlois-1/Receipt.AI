const path = require('node:path')
function validateRequest(request) {
  if (!request || !/^[a-zA-Z0-9-]{1,80}$/.test(request.id || '')) throw Error('Invalid request ID.')
  if (!['/v1/models', '/v1/chat/completions'].includes(request.path)) throw Error('Unsupported local AI operation.')
  if (request.path === '/v1/models') { if (request.body !== undefined) throw Error('Unexpected request body.'); return }
  const b = request.body
  if (!b || typeof b !== 'object' || Array.isArray(b) || JSON.stringify(b).length > 256000) throw Error('Invalid completion request.')
  if (Object.keys(b).some(k => !['model', 'temperature', 'max_tokens', 'stream', 'messages'].includes(k))) throw Error('Unsupported completion option.')
  if (typeof b.model !== 'string' || b.model.length > 512 || !b.model.trim() || b.stream !== false || !Number.isInteger(b.max_tokens) || b.max_tokens < 1 || b.max_tokens > 1024 || !Number.isFinite(b.temperature) || b.temperature < 0 || b.temperature > 2) throw Error('Invalid generation settings.')
  if (!Array.isArray(b.messages) || b.messages.length < 1 || b.messages.length > 4 || b.messages.some(m => !m || !['system', 'user'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 100000 || Object.keys(m).some(k => !['role', 'content'].includes(k)))) throw Error('Invalid prompt messages.')
}
function assetPath(url, root) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'receiptai:' || parsed.host !== 'app') throw Error('Invalid application origin.')
  const name = decodeURIComponent(parsed.pathname)
  if (name.includes('\0') || name.includes('\\') || name.split('/').includes('..')) throw Error('Invalid asset path.')
  const target = path.resolve(root, '.' + (name === '/' ? '/index.html' : name))
  if (target !== root && !target.startsWith(root + path.sep)) throw Error('Asset path escapes application.')
  return target
}
function trustedFrame(event, webContents) {
  return event.sender === webContents && event.senderFrame === webContents.mainFrame && event.senderFrame?.url.startsWith('receiptai://app/')
}
module.exports = { validateRequest, assetPath, trustedFrame }
