const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process')
class ReleaseMetrics {
  constructor(output) { this.output = output; this.roots = new Set(); this.samples = []; this.phase = 'startup' }
  register(child) { this.roots.add(child.pid); child.once('exit', () => this.roots.delete(child.pid)) }
  start() { if (process.platform === 'linux') { this.sample(); this.timer = setInterval(() => this.sample(), 1000) } }
  sample() {
    if (process.platform !== 'linux') return
    try {
      const rows = execFileSync('ps', ['-eo', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\n').map(line => line.trim().split(/\s+/).map(Number))
      const owned = new Set(this.roots)
      let changed
      do { changed = false; for (const [pid, parent] of rows) if (owned.has(parent) && !owned.has(pid)) { owned.add(pid); changed = true } } while (changed)
      let rssKiB = 0, pssKiB = 0, pssReadable = 0, processes = 0
      for (const pid of owned) {
        try {
          const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8')
          rssKiB += Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0); processes++
          try { pssKiB += Number(fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8').match(/^Pss:\s+(\d+)/m)?.[1] || 0); pssReadable++ } catch {}
        } catch {}
      }
      const cgroupPath = fs.readFileSync('/proc/self/cgroup', 'utf8').trim().split('\n').find(line => line.startsWith('0::'))?.slice(3)
      const cgroup = {}
      if (cgroupPath !== undefined) for (const file of ['memory.current', 'memory.peak', 'memory.max', 'memory.swap.max', 'memory.events']) {
        try { cgroup[file] = fs.readFileSync(path.join('/sys/fs/cgroup', cgroupPath, file), 'utf8').trim() } catch {}
      }
      this.samples.push({ elapsedMs: this.started ? Date.now() - this.started : 0, phase: this.phase, processes, rssKiB, pssKiB, pssReadable, cgroup })
      this.started ??= Date.now()
    } catch {}
  }
  stop() {
    clearInterval(this.timer); this.sample()
    const summary = { method: 'One-second Linux process-tree RSS and /proc PSS sampling; optional cgroup v2 counters', hostMemTotalKiB: Number(fs.readFileSync('/proc/meminfo', 'utf8').match(/^MemTotal:\s+(\d+)/m)?.[1] || 0), peakAppRssMiB: Math.max(0, ...this.samples.map(s => s.rssKiB / 1024)), peakAppPssMiB: Math.max(0, ...this.samples.map(s => s.pssKiB / 1024)), pssComplete: this.samples.every(s => s.pssReadable === s.processes), peakCgroupBytes: Math.max(0, ...this.samples.map(s => Number(s.cgroup['memory.peak']) || 0)), notes: ['RSS sums double-count shared pages; use PSS for resident app attribution.', 'Cgroup includes harness/display and file cache, but excludes host OS/user applications.', 'A cgroup limit is not a physical 8 GB system test; OS/desktop headroom must be estimated separately.'], samples: this.samples }
    fs.writeFileSync(path.join(this.output, 'memory.json'), JSON.stringify(summary, null, 2))
  }
}
module.exports = { ReleaseMetrics }
