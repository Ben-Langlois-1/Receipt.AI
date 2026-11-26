const fs = require('node:fs'), path = require('node:path'), { hash } = require('./verify-package.cjs')
async function main() {
  const root = path.resolve(__dirname, '../release'), version = require('../package.json').version
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const artifact = new RegExp(`^Receipt\\.AI-${escapedVersion}-(?:linux-x86_64\\.(?:AppImage|rpm)|win-x64\\.exe|mac-(?:arm64|x64)\\.(?:dmg|zip))$`)
  const files = fs.readdirSync(root, { recursive: true }).filter(name => artifact.test(name) || /^sources[/\\].*\.tar$/.test(name)).sort()
  if (!files.length) throw Error('No current release artifacts found.')
  const inventory = []
  for (const name of files) inventory.push({ file: name.split(path.sep).join('/'), bytes: fs.statSync(path.join(root, name)).size, sha256: await hash(path.join(root, name)) })
  fs.writeFileSync(path.join(root, 'SHA256SUMS'), inventory.map(item => `${item.sha256}  ${item.file}\n`).join(''))
  fs.writeFileSync(path.join(root, 'artifact-inventory.json'), JSON.stringify({ version, artifacts: inventory }, null, 2) + '\n')
  console.log(JSON.stringify(inventory, null, 2))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
