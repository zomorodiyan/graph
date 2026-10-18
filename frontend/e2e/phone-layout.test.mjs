// Phone (portrait) layout: pages open bottom-anchored above the bottom bar,
// the first items can be scrolled down within thumb reach, the tag list sits
// just below the fold, and the tag view's controls are at the bottom. Also
// editing items from the tag view, on phone and desktop.
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

// Short page: sits at the bottom, breadcrumb just above the bar
await p.goto(BASE + '/g/short')
await p.waitForSelector('.item-title')
await p.waitForTimeout(300)
let bar = await barTop()
let crumb = await rect('.breadcrumb--footer')
check('short page: breadcrumb ends at the bottom bar', near(crumb.bottom, bar), `${crumb.bottom} vs bar ${bar}`)
let first = await rect('.items-grid .section-wrapper')
check('short page: items sit in the lower half', first.top > vh / 2, `first item top ${first.top}`)
const tags = await rect('.tags-list')
check('tag list starts below the visible area', tags.top >= bar - 2, `tags top ${tags.top}`)
await shot(p, 'phone-short.png')

// Long page: opens at the end; scrolling to the top brings item 0 down near the bar
await p.goto(BASE + '/g/long/list')
await p.waitForSelector('.item-title')
await p.waitForTimeout(300)
bar = await barTop()
crumb = await rect('.breadcrumb--footer')
check('long page: opens with its end at the bottom bar', near(crumb.bottom, bar), `${crumb.bottom} vs bar ${bar}`)
first = await rect('.items-grid .section-wrapper')
check('long page: first item starts off-screen above', first.top < 0, `first item top ${first.top}`)
await p.evaluate(() => window.scrollTo(0, 0))
await p.waitForTimeout(200)
first = await rect('.items-grid .section-wrapper')
check('scrolled to top: first item comes down near the bar', first.top > vh * 0.6 && first.bottom <= bar, `first item ${first.top}-${first.bottom}, bar ${bar}`)
await shot(p, 'phone-long-top.png')
check('no horizontal overflow', !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)))

// Tag view: controls below the items, input visible above the bar
await p.goto(BASE + '/tags/proj')
await p.waitForSelector('.tag-view-graph')
await p.waitForTimeout(300)
bar = await barTop()
const input = await rect('.tag-view-input')
const lastSection = await p.locator('.tag-view-group .section-wrapper').last().evaluate(el => el.getBoundingClientRect().bottom)
check('tag view: controls sit below the items', input.top > lastSection, `input ${input.top}, last item ${lastSection}`)
check('tag view: input visible just above the bar', input.bottom <= bar && input.bottom > bar - 120, `input bottom ${input.bottom}, bar ${bar}`)
await shot(p, 'phone-tagview.png')

// Tag view on phone: long-press edits (bottom sheet), tap opens
const alpha = p.locator('.tag-view-group .layer1', { hasText: 'Alpha' })
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
check('edit from tag view saves, keeps tags', s.alpha_two?.title === 'Alpha Two' && JSON.stringify(s.alpha_two.tags) === '["proj","@sara"]', JSON.stringify(s))
check('edited item still shows in the tag view', (await titles(p)).includes('Alpha Two'), (await titles(p)).join())
await p.locator('.tag-view-group .item-title', { hasText: /^Alpha Two/ }).tap({ position: { x: 4, y: 6 } })
await p.waitForURL(/\/g\/short$/, { timeout: 3000 }).catch(() => {})
check('tap opens the item in its graph', new URL(p.url()).pathname === '/g/short', p.url())

// Tag view: swipe right goes home
const swipeRight = (pg, sel) => pg.locator(sel).first().evaluate(el => {
  const touch = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
  const fire = (type, x, y) => el.dispatchEvent(new TouchEvent(type, {
    bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [touch(x, y)], changedTouches: [touch(x, y)],
  }))
  fire('touchstart', 40, 400); fire('touchmove', 120, 402); fire('touchmove', 220, 404); fire('touchend', 240, 404)
})
await p.goto(BASE + '/tags/proj')
await p.waitForSelector('.tag-view-graph')
await swipeRight(p, '.tag-view-page')
await p.waitForURL(BASE + '/', { timeout: 3000 }).catch(() => {})
check('swipe right in a tag view goes home', new URL(p.url()).pathname === '/', p.url())

// Main page: Favorites card, disabled until something is starred; no tag list
await p.goto(BASE + '/')
await p.waitForSelector('.graph-card')
check('main page has no tag list', (await p.locator('.tags-list').count()) === 0)
check('Favorites shows 0 and is disabled', (await p.locator('.favorites-card').getAttribute('aria-disabled')) === 'true' && (await p.locator('.favorites-count').textContent()) === '0')
await p.locator('.favorites-card').tap()
await p.waitForTimeout(400)
check('tapping empty Favorites does nothing', new URL(p.url()).pathname === '/', p.url())
await p.evaluate(() => {
  const g = JSON.parse(localStorage.getItem('offline_graph_short'))
  g.structure.b.tags = ['favorite']
  localStorage.setItem('offline_graph_short', JSON.stringify(g))
})
await p.reload()
await p.waitForSelector('.favorites-card')
check('Favorites count updates', (await p.locator('.favorites-count').textContent()) === '1' && (await p.locator('.favorites-card').getAttribute('aria-disabled')) === 'false')
await p.locator('.favorites-card').tap()
await p.waitForURL(/\/tags\/favorite$/, { timeout: 3000 }).catch(() => {})
check('Favorites card opens the favorite tag view', p.url().endsWith('/tags/favorite'), p.url())

// Desktop: edit in the tag view with Shift+click
const desk = await browser.newContext({ viewport: { width: 1200, height: 900 } })
await seed(desk, { short }, { 'active-depth': '3' })
const d = await desk.newPage()
d.on('pageerror', e => errors.push(e.message))
await d.goto(BASE + '/tags/@sara')
await d.waitForSelector('.tag-view-graph')
const dInput = await d.locator('.tag-view-input').boundingBox()
const dFirst = await d.locator('.tag-view-group').first().boundingBox()
check('desktop: tag view controls stay above the items', dInput.y < dFirst.y)
await d.locator('.item-title', { hasText: /^Alpha/ }).click({ modifiers: ['Shift'], position: { x: 4, y: 6 } })
await d.waitForSelector('.inline-edit-title')
await d.locator('.inline-tool', { hasText: 'Tags' }).click()
await d.waitForFunction(() => document.activeElement?.classList.contains('tag-draft-input'))
await d.keyboard.type('urgent')
await d.keyboard.press('Enter')
await d.locator('.inline-edit-title').press('Enter')
await d.waitForTimeout(500)
s = await d.evaluate(() => JSON.parse(localStorage.getItem('offline_graph_short')).structure)
check('desktop: tag edit keeps the active tag', JSON.stringify(s.a.tags) === '["proj","@sara","urgent"]', JSON.stringify(s.a.tags))

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
