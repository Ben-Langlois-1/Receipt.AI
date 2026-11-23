// Build-time only: no application/runtime code imports this downloader.
const fs = require('node:fs'), path = require('node:path'), { Readable } = require('node:stream'), { pipeline } = require('node:stream/promises'), crypto = require('node:crypto')
async function main() {
  const url = new URL(process.env.RECEIPTAI_MODEL_URL || '')
  if (url.protocol !== 'https:' || url.username || url.password) throw Error('Configure an HTTPS build-artifact URL for the approved GGUF.')
  const target = path.resolve(__dirname, '../resources/models/Qwen3-1.7B-Q4_K_M.gguf'), temporary = target + '.download'
  fs.mkdirSync(path.dirname(target), { recursive: true })
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(600000) })
    if (!response.ok || !response.body) throw Error('Download failed.')
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary))
    const sum = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(temporary)) sum.update(chunk)
    if (sum.digest('hex') !== 'd2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5') throw Error('Checksum mismatch.')
    fs.renameSync(temporary, target)
    console.log('Approved build-time model artifact downloaded and verified.')
  } catch { fs.rmSync(temporary, { force: true }); throw Error('Model staging failed. Check the configured URL and approved SHA-256; do not substitute different weights silently.') }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
