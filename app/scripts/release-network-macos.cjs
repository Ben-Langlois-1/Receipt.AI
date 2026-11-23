// CI-only network boundary. An outer Seatbelt profile prevents Chromium from
// initializing its own sandbox; PF restricts sockets without nesting sandboxes.
const fs = require('node:fs'), path = require('node:path'), net = require('node:net'), { spawnSync } = require('node:child_process')
function tcp(host, port) { return new Promise(resolve => { const socket = net.connect({ host, port }); let done = false; const finish = result => { if (done) return; done = true; socket.destroy(); resolve(result) }; socket.setTimeout(3000, () => finish(false)); socket.once('error', () => finish(false)); socket.once('connect', () => finish(true)) }) }
function pf(args) {
  const r = spawnSync('/usr/bin/sudo', ['-n', '/sbin/pfctl', ...args], { encoding: 'utf8' })
  if (r.error || r.status !== 0) throw r.error || Error('PF operation failed: ' + r.stderr)
  return r.stdout + r.stderr
}
async function macLoopbackPolicy(temporary, evidence) {
  if (process.platform !== 'darwin' || process.env.GITHUB_ACTIONS !== 'true') throw Error('Mac network policy changes are restricted to disposable GitHub runners.')
  const rootRules = pf(['-sr'])
  if (!/anchor "com\.apple\/\*"/.test(rootRules)) throw Error('Expected existing Apple wildcard anchor; refusing to replace root PF rules.')
  if (!await tcp('1.1.1.1', 443)) throw Error('External TCP control is unavailable before the policy; cannot verify enforcement.')
  const anchor = 'com.apple/ReceiptAI-' + process.pid, rules = path.join(temporary, 'receiptai-network.pf')
  const uid = process.getuid()
  // Only new external connections are denied. Existing CI-agent connections
  // continue, while this freshly launched app has no prior external sockets.
  fs.writeFileSync(rules, `block drop out quick inet proto tcp from any to !127.0.0.0/8 user ${uid} flags S/SA\nblock drop out quick inet6 proto tcp from any to !::1 user ${uid} flags S/SA\nblock drop out quick proto udp from any to any user ${uid}\n`)
  let token, loaded = false
  const record = { method: 'Owned PF anchor denies new non-loopback TCP and user UDP; existing CI connections preserved', rootRulesReplaced: false, uid, externalControlBefore: true, externalBlocked: false, loopbackAllowed: false, cleanedUp: false }
  const save = () => fs.writeFileSync(path.join(evidence, 'network-policy.json'), JSON.stringify(record, null, 2))
  const cleanup = () => { try { if (loaded) pf(['-a', anchor, '-F', 'rules']) } finally { if (token) pf(['-X', token]); record.cleanedUp = true; save() } }
  try {
    pf(['-n', '-a', anchor, '-f', rules]); pf(['-a', anchor, '-f', rules]); loaded = true
    token = pf(['-E']).match(/Token\s*:\s*(\d+)/i)?.[1]
    if (!token) throw Error('PF did not return the owned enable reference.')
    record.externalBlocked = !await tcp('1.1.1.1', 443)
    const server = net.createServer(socket => socket.destroy())
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    try { record.loopbackAllowed = await tcp('127.0.0.1', server.address().port) } finally { await new Promise(resolve => server.close(resolve)) }
    save()
    if (!record.externalBlocked || !record.loopbackAllowed) throw Error('PF network control did not enforce the intended boundary.')
    return cleanup
  } catch (error) { cleanup(); throw error }
}
if (require.main === module) {
  const os = require('node:os'), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'receiptai-pf-probe-'))
  macLoopbackPolicy(directory, directory).then(cleanup => { cleanup(); console.log(fs.readFileSync(path.join(directory, 'network-policy.json'), 'utf8')) }).catch(error => { console.error(error.message); process.exitCode = 1 })
}
module.exports = { macLoopbackPolicy, tcp }
