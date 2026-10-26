// Phone (portrait) layout: pages open bottom-anchored above the bottom bar,
// the first items can be scrolled down within thumb reach, the search panel's
// input sits just above the bar with its results above it, and the selection
// bar sticks to the top while scrolling. Also editing from the panel's
// results.
import { BASE, check, done, launch, shot, seed, titles } from './helpers.mjs'

const many = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`i${i}`, { title: `Item ${i}`, tags: i % 5 === 0 ? ['proj'] : undefined, children: {} }]))
const long = { list: { title: 'List', children: many } }
const short = { a: { title: 'Alpha', tags: ['proj', '@sara'], children: {} }, b: { title: 'Beta', children: {} } }

const browser = await launch()
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await seed(phone, { long, short }, { 'active-depth': '3' })
const p = await phone.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))
const vh = 844
const barTop = async () => p.evaluate(() => {
  const bar = document.querySelector('.agent-chat-input-row')
  return bar ? bar.getBoundingClientRect().top : window.innerHeight
})
const rect = (sel) => p.locator(sel).first().evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom } })
const near = (a, b, tol = 6) => Math.abs(a - b) <= tol

// Short page: sits at the bottom, the search bar just above the bottom bar
await p.goto(BASE + '/g/short')
await p.waitForSelector('.item-title')
await p.waitForTimeout(300)
let bar = await barTop()
let panel = await rect('.search-panel')
check('short page: search panel ends at the bottom bar', near(panel.bottom, bar), `${panel.bottom} vs bar ${bar}`)
const crumb = await rect('.breadcrumb--footer')
check('breadcrumb just above the search panel', near(crumb.bottom, panel.top, 12), `${crumb.bottom} vs ${panel.top}`)
let first = await rect('.items-grid .section-wrapper')
check('short page: items sit in the lower half', first.top > vh / 2, `first item top ${first.top}`)
await shot(p, 'phone-short.png')

// Long page: opens at the end; scrolling to the top brings item 0 down near the bar
await p.goto(BASE + '/g/long/list')
await p.waitForSelector('.item-title')
await p.waitForTimeout(300)
bar = await barTop()
panel = await rect('.search-panel')
check('long page: opens with its end at the bottom bar', near(panel.bottom, bar), `${panel.bottom} vs bar ${bar}`)
first = await rect('.items-grid .section-wrapper')
check('long page: first item starts off-screen above', first.top < 0, `first item top ${first.top}`)
await p.evaluate(() => window.scrollTo(0, 0))
await p.waitForTimeout(200)
first = await rect('.items-grid .section-wrapper')
check('scrolled to top: first item comes down near the bar', first.top > vh * 0.6 && first.bottom <= bar, `first item ${first.top}-${first.bottom}, bar ${bar}`)
await shot(p, 'phone-long-top.png')
check('no horizontal overflow', !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)))

// Selection bar sticks to the top while scrolling
await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
await p.waitForTimeout(200)
await p.locator('.items-grid .layer1', { hasText: /^Item 24/ }).tap()
await p.waitForTimeout(200)
check('tap selects (shows the selection bar)', (await p.locator('.items-grid .selection-toolbar').count()) > 0)
await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.5))
await p.waitForTimeout(200)
const tb = await rect('.items-grid .selection-toolbar')
check('selection bar stays at the top while scrolled', tb.top >= -1 && tb.top < 80, `toolbar top ${tb.top}`)
await shot(p, 'phone-sticky-selection.png')

// Search panel: results above the input, input just above the bar
await p.goto(BASE + '/g/long')
await p.waitForSelector('.search-panel-input')
await p.tap('.search-panel-input')
await p.waitForSelector('.search-panel-tags')
await p.locator('.search-panel-tags .tag-pill', { hasText: /^proj / }).tap()
await p.waitForSelector('.results')
await p.waitForTimeout(300)
bar = await barTop()
const input = await rect('.search-panel-input')
const lastResult = await p.locator('.results .section-wrapper').last().evaluate(el => el.getBoundingClientRect().bottom)
check('panel: results sit above the input', input.top > lastResult, `input ${input.top}, last result ${lastResult}`)
check('panel: input just above the bar', input.bottom <= bar && input.bottom > bar - 80, `input bottom ${input.bottom}, bar ${bar}`)
check('panel: 5 proj items', (await p.locator('.results .layer1').count()) === 5)
await shot(p, 'phone-panel.png')
check('panel: no horizontal overflow', !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)))

// Panel results on phone: long-press edits (bottom sheet), tap opens
await p.goto(BASE + '/g/short')
await p.waitForSelector('.search-panel-input')
await p.tap('.search-panel-input')
await p.keyboard.type('alp')
await p.waitForSelector('.results .layer1')
const alpha = p.locator('.results .layer1', { hasText: 'Alpha' })
const box = await alpha.boundingBox()
const at = { clientX: box.x + 10, clientY: box.y + box.height / 2, pointerType: 'touch', bubbles: true }
await alpha.dispatchEvent('pointerdown', at)
await p.waitForTimeout(700)
await alpha.dispatchEvent('pointerup', at)
await p.waitForSelector('.mobile-edit-sheet .inline-edit-title', { timeout: 3000 }).catch(() => {})
check('long-press opens the edit sheet', await p.isVisible('.mobile-edit-sheet .inline-edit-title'))
await p.fill('.mobile-edit-sheet .inline-edit-title', 'Alpha Two')
await p.locator('.mobile-edit-sheet .inline-edit-title').press('Enter')
await p.waitForTimeout(500)
let s = await p.evaluate(() => JSON.parse(localStorage.getItem('offline_graph_short')).structure)
check('edit from results saves, keeps tags', s.alpha_two?.title === 'Alpha Two' && JSON.stringify(s.alpha_two.tags) === '["proj","@sara"]', JSON.stringify(s))
check('edited item still matches', (await p.$$eval('.results .item-title', els => els.map(e => (e.childNodes[0]?.textContent ?? '').trim()))).includes('Alpha Two'))
await p.locator('.results .item-title', { hasText: /^Alpha Two/ }).tap({ position: { x: 4, y: 6 } })
await p.waitForTimeout(300)
check('tap opens it (panel collapses)', new URL(p.url()).pathname === '/g/short' && (await p.locator('.results').count()) === 0, p.url())

// Main page: no search panel there
await p.goto(BASE + '/')
await p.waitForSelector('.graph-card')
check('main page has no search panel', (await p.locator('.search-panel').count()) === 0)

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
