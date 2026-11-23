import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { askLocalAdvisor, getLocalModel, LOCAL_AI_BASE_URL } from '../src/ai/local-advisor.ts'
import { buildAdvisorContext } from '../src/ai/financial-context.ts'

const context = buildAdvisorContext([{
  date: '2026-11-01', posted_date: '', description: 'SECRET', amount: -10,
  currency: 'USD', direction: 'outflow', category: 'Dining', category_source: 'rule',
  account: 'SECRET', source_bank: 'SECRET', external_id: 'SECRET',
}])
const completion = (content: unknown, finish_reason: unknown = 'stop') => ({
  choices: [{ finish_reason, message: { content, reasoning_content: 'SECRET' } }],
})
function mock(t: TestContext, handler: typeof fetch) {
  const original = globalThis.fetch
  globalThis.fetch = handler
  t.after(() => { globalThis.fetch = original })
}
const ask = (options = {}) => askLocalAdvisor('Explain', context, undefined, { model: 'Qwen3', ...options })
for (const [content, expected] of [
  ['  Final.  ', 'Final.'],
  ['<think>\n\n</think>Final.', 'Final.'],
  ['<think>secret</think>Final.', 'Final.'],
  ['<think>a</think>First. <THINK>b</THINK>Second.', 'First. Second.'],
  [[{ type: 'text', text: '<think>secret' }, { type: 'text', text: '</think>Final.' }], 'Final.'],
] as const) {
  test(`cleans ${JSON.stringify(content)}`, async (t) => {
    mock(t, async () => new Response(JSON.stringify(completion(content))))
    assert.equal(await ask(), expected)
  })
}
for (const content of ['', ' ', null, undefined, '<think>secret</think>', '<think>unfinished',
  'Final.<think>unfinished', 'secret</think>Final.', '<think>a<think>b</think></think>Final.',
  'Final.<thi', 'Final.</think', 'Final.<think broken>', 42, {}, [{ type: 'text' }],
  [{ type: 'image', text: 'ignored' }], [null]]) {
  test(`rejects incomplete/malformed content ${JSON.stringify(content)}`, async (t) => {
    mock(t, async () => new Response(JSON.stringify(completion(content))))
    await assert.rejects(ask)
  })
}
for (const reason of ['length', null, 'tool_calls', 'content_filter', 'unknown']) {
  test(`rejects finish reason ${reason}`, async (t) => {
    mock(t, async () => new Response(JSON.stringify(completion('Plausible answer.', reason))))
    await assert.rejects(ask, reason === 'length' ? /truncated/ : /finish reason/)
  })
}
for (const value of [null, [], {}, { choices: [] }, { choices: [null] },
  { choices: [{ message: { content: 'No finish reason' } }] },
  { choices: [{ finish_reason: 'stop', message: null }] },
  { choices: [{ finish_reason: 'stop', message: { content: 'Answer', tool_calls: [{}] } }] },
  { ...completion('Answer'), error: { message: 'SECRET' } }]) {
  test(`rejects malformed completion ${JSON.stringify(value)}`, async (t) => {
    mock(t, async () => new Response(JSON.stringify(value)))
    await assert.rejects(ask)
  })
}
for (const status of [200, 400, 500]) {
  test(`handles HTTP ${status} and invalid JSON`, async (t) => {
    mock(t, async () => new Response('SECRET', { status }))
    await assert.rejects(ask, status === 200 ? /malformed JSON/ : /HTTP/)
  })
}
for (const model of ['Qwen3-1.7B-Q4_K_M.gguf', 'Qwen3-4B-Q4_K_M.gguf']) {
  test(`supports ${model} locally with thinking control`, async (t) => {
    mock(t, async (url, init) => {
      assert.equal(String(url), `${LOCAL_AI_BASE_URL}/v1/chat/completions`)
      assert.equal(init?.redirect, 'error')
      assert.equal(init?.credentials, 'omit')
      assert.ok(init && typeof init.body === 'string')
      const body = JSON.parse(init.body)
      assert.equal(body.model, model)
      assert.equal(body.stream, false)
      assert.ok(body.messages.at(-1).content.endsWith('/no_think'))
      assert.equal(body.chat_template_kwargs, undefined)
      assert.ok(!init.body.includes('SECRET'))
      return new Response(JSON.stringify(completion('Answer.')))
    })
    assert.equal(await ask({ model }), 'Answer.')
  })
}
for (const value of [null, {}, { data: null }, { data: [] }, { data: [null, { id: 4 }, { id: ' ' }] }]) {
  test(`rejects malformed model list ${JSON.stringify(value)}`, async (t) => {
    mock(t, async () => new Response(JSON.stringify(value)))
    await assert.rejects(() => getLocalModel())
  })
}
for (const stage of ['discovery', 'generation', 'body']) {
  for (const mode of ['timeout', 'cancel']) {
    test(`${mode} interrupts ${stage}`, async (t) => {
      const controller = new AbortController()
      mock(t, async (_url, init) => {
        const signal = init!.signal!
        if (mode === 'cancel') queueMicrotask(() => controller.abort())
        const pending = new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
        })
        if (stage === 'body') return { ok: true, json: () => pending } as unknown as Response
        return pending
      })
      await assert.rejects(() => askLocalAdvisor('Explain', context, controller.signal,
        { timeoutMs: 15, ...(stage === 'discovery' ? {} : { model: 'Qwen3' }) }),
      mode === 'timeout' ? /timed out/ : /cancelled/)
    })
  }
}
test('pre-cancellation and invalid options never fetch', async (t) => {
  mock(t, async () => { assert.fail('Unexpected network request') })
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(() => askLocalAdvisor('Explain', context, controller.signal), /cancelled/)
  await assert.rejects(() => getLocalModel(controller.signal), /cancelled/)
  for (const timeoutMs of [0, -1, NaN, Infinity, 1.5, 2147483648]) await assert.rejects(() => ask({ timeoutMs }), /timeout/)
  await assert.rejects(() => ask({ model: ' ' }), /model ID/)
  await assert.rejects(() => askLocalAdvisor(' ', context), /question/)
  await assert.rejects(() => askLocalAdvisor('x'.repeat(1001), context), /1,000/)
})
test('connection failures have actionable errors', async (t) => {
  mock(t, async () => { throw new TypeError('fetch failed') })
  await assert.rejects(ask, /Cannot connect/)
  await assert.rejects(() => getLocalModel(), /Cannot connect/)
})

test('discovery and generation share a deadline signal and remove the caller listener', async (t) => {
  const controller = new AbortController()
  const remove = t.mock.method(controller.signal, 'removeEventListener')
  let discoverySignal: AbortSignal | null | undefined
  mock(t, async (url, init) => {
    if (String(url).endsWith('/v1/models')) {
      discoverySignal = init?.signal
      return new Response(JSON.stringify({ data: [{ id: 'local-alias' }] }))
    }
    assert.equal(init?.signal, discoverySignal)
    assert.equal(JSON.parse(String(init?.body)).model, 'local-alias')
    return new Response(JSON.stringify(completion('Final.')))
  })
  assert.equal(await askLocalAdvisor('Explain', context, controller.signal), 'Final.')
  assert.equal(remove.mock.calls.length, 1)
  controller.abort()
  assert.equal(discoverySignal?.aborted, false)
})

test('standalone discovery supports a configurable timeout', async (t) => {
  mock(t, async (_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  }))
  await assert.rejects(() => getLocalModel(undefined, { timeoutMs: 10 }), /timed out/)
})
