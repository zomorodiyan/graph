// Shared bits for the e2e tests (see run.mjs).
import { chromium } from 'playwright-core'

export const BASE = process.env.BASE ?? 'http://localhost:5173'

let fails = 0
export function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) fails++
}
export function done(browser) {
  return browser.close().then(() => {
    console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
    process.exit(fails ? 1 : 0)
  })
}

export function launch() {
  return chromium.launch({ channel: 'chrome', headless: true })
}

// Saves a screenshot only when SCREENSHOTS=<dir> is set.
export function shot(page, name) {
  const dir = process.env.SCREENSHOTS
  return dir ? page.screenshot({ path: `${dir}/${name}`, fullPage: true }) : Promise.resolve()
}

// Seeds the given graphs ({ name: structureObject }) into localStorage once
// per browser context (sessionStorage guards against reseeding on reload).
export function seed(context, graphs, extra = {}) {
  return context.addInitScript(([graphs, extra]) => {
    if (sessionStorage.getItem('e2e-seeded')) return
    localStorage.clear()
    localStorage.setItem('offline_graphs', JSON.stringify(Object.keys(graphs)))
    for (const [name, structure] of Object.entries(graphs)) {
      localStorage.setItem('offline_graph_' + name, JSON.stringify({ metadata: { title: name, description: '', version: '1.0' }, structure }))
    }
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v)
    sessionStorage.setItem('e2e-seeded', '1')
  }, [graphs, extra])
}

// YYYY-MM-DD, `offset` days from today (local time).
export function isoFromToday(offset) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Item titles in render order, without their badges/pills.
export function titles(page) {
  return page.$$eval('.item-title', els => els.map(e => (e.childNodes[0]?.textContent ?? '').trim()))
}
