import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { validateRequest, assetPath, trustedFrame } = require('../desktop/validation.cjs')
const { AiManager } = require('../desktop/ai-manager.cjs')
const request = () => ({ id: 'test-id', path: '/v1/chat/completions', body: { model: 'receiptai-local', stream: false, temperature: 0.2, max_tokens: 400, messages: [{ role: 'system', content: 'data only' }, { role: 'user', content: 'Synthetic question' }] } })
test('desktop IPC only permits bounded model discovery and completion operations', () => {
  assert.doesNotThrow(() => validateRequest({ id: 'uuid-123', path: '/v1/models' }))
  assert.doesNotThrow(() => validateRequest(request()))
  for (const invalid of [null, {}, { id: '../escape', path: '/v1/models' }, { id: 'ok', path: 'https://example.com/' }, { id: 'ok', path: '/props' }, { id: 'ok', path: '/v1/models', body: {} }]) assert.throws(() => validateRequest(invalid))
  for (const body of [{ ...request().body, tools: [] }, { ...request().body, stream: true }, { ...request().body, max_tokens: 99999 }, { ...request().body, messages: [{ role: 'tool', content: 'cmd' }] }, { ...request().body, messages: [{ role: 'user', content: 'x'.repeat(100001) }] }]) assert.throws(() => validateRequest({ ...request(), body }))
})
test('only the owned main frame can call privileged IPC', () => {
  const frame = { url: 'receiptai://app/' }, contents = { mainFrame: frame }
  assert.equal(trustedFrame({ sender: contents, senderFrame: frame }, contents), true)
  assert.equal(trustedFrame({ sender: {}, senderFrame: frame }, contents), false)
  assert.equal(trustedFrame({ sender: contents, senderFrame: { url: 'receiptai://app/' } }, contents), false)
  frame.url = 'https://example.com/'
  assert.equal(trustedFrame({ sender: contents, senderFrame: frame }, contents), false)
})
test('custom protocol cannot escape the packaged UI assets', () => {
  const root = path.resolve('fixture-dist')
  assert.equal(assetPath('receiptai://app/', root), path.join(root, 'index.html'))
  assert.equal(assetPath('receiptai://app/assets/test.js', root), path.join(root, 'assets/test.js'))
  for (const url of ['https://app/index.html', 'receiptai://evil/index.html', 'receiptai://app/%2e%2e%2fdesktop/main.cjs', 'receiptai://app/%00', 'receiptai://app/%5c../secrets']) assert.throws(() => assetPath(url, root))
})
test('missing model/runtime fails without launching or adopting any external service', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'receiptai-manager-unit-'))
  try {
    const manager = new AiManager({ resources: root, model: path.join(root, 'missing.gguf'), runAsNode: false })
    await manager.start()
    assert.equal(manager.status().phase, 'failed')
    assert.equal(manager.nativePid, null)
    await assert.rejects(() => manager.request({ id: 'abc', path: '/v1/models' }), /not ready/)
    const controller = new AbortController()
    manager.pending.set('test', controller)
    await manager.stop()
    assert.equal(controller.signal.aborted, true)
    assert.equal(manager.status().phase, 'stopped')
    assert.equal(manager.pending.size, 0)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
