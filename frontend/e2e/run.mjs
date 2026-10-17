// End-to-end tests: `npm run test:e2e` (from frontend/).
//
// Starts its own Vite dev server, then runs every e2e/*.test.mjs against it
// in a headless browser. Each test seeds its own graphs into localStorage
// (all data is client-side), so nothing touches real data or the network.
// Needs Google Chrome installed (driven through playwright-core, no bundled
// browser download). Set SCREENSHOTS=<dir> to save screenshots.

import { spawn, spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const PORT = 5179
const BASE = `http://localhost:${PORT}`

const server = spawn(`npx vite --port ${PORT} --strictPort`, { cwd: root, shell: true, stdio: 'ignore' })
// Synchronous, so the whole server process tree is gone before we exit
// (on Windows the shell's child vite process survives a plain kill).
const stop = () => {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill()
}

let failed = 0
try {
  // Wait for the dev server (up to 60s).
  for (let i = 0; ; i++) {
    try { if ((await fetch(BASE)).ok) break } catch { /* not up yet */ }
    if (i > 120) throw new Error(`dev server did not start on ${BASE}`)
    await new Promise(r => setTimeout(r, 500))
  }
  const files = readdirSync(here).filter(f => f.endsWith('.test.mjs')).sort()
  for (const f of files) {
    console.log(`\n── ${f}`)
    const code = await new Promise(res => {
      const t = spawn(process.execPath, [join(here, f)], { stdio: 'inherit', env: { ...process.env, BASE } })
      t.on('exit', res)
    })
    if (code !== 0) failed++
  }
  console.log(failed ? `\n${failed} test file(s) FAILED` : '\nAll test files passed')
} finally {
  stop()
}
process.exit(failed ? 1 : 0)
