// Tag list (bottom of graph pages), cross-graph tag view, favorites.
import { BASE, check, done, launch, shot, seed, titles } from './helpers.mjs'

const g1 = {
  work: { title: 'Work', tags: ['proj'], children: {
    alpha: { title: 'Alpha', tags: ['proj', 'urgent'], children: { a1: { title: 'A1', tags: ['proj'], children: {} } } },
    beta: { title: 'Beta', children: { b1: { title: 'B1', tags: ['proj'], children: {} } } },
  } },
  misc: { title: 'Misc', children: { m1: { title: 'M1', children: {} }, m2: { title: 'M2', children: {} } } },
}
const g2 = {
  home: { title: 'Home', children: {
    chores: { title: 'Chores', tags: ['proj'], children: {} },
    solo: { title: 'Solo', tags: ['lonely'], children: {} },
  } },
}

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
await seed(ctx, { g1, g2 }, { 'active-depth': '3' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
const stored = name => page.evaluate(n => JSON.parse(localStorage.getItem('offline_graph_' + n)), name)
const sorted = async () => (await titles(page)).sort().join(',')
// Title text only — a title's pills sit inside its element.
const clickTitle = (re, opts = {}) => page.locator('.item-title', { hasText: re }).first().click({ position: { x: 4, y: 6 }, ...opts })

// Tag list (bottom of graph pages)
await page.goto(BASE + '/g/g1')
await page.waitForSelector('.tags-list')
const menu = await page.$$eval('.tags-list .tag-pill', els => els.map(e => e.textContent.trim()))
check('menu: favorite first, then by count', menu[0] === '★ favorite 0' && menu[1] === 'proj 5' && menu.some(t => t.startsWith('lonely')), JSON.stringify(menu))
await shot(page, 'menu.png')

// Cross-graph view
await page.locator('.tags-list .tag-pill', { hasText: 'proj' }).click()
await page.waitForURL(/\/tags\/proj$/)
await page.waitForSelector('.tag-view-graph')
check('grouped by graph', (await page.locator('.tag-view-graph').count()) === 2)
check('items from both graphs', (await sorted()) === 'A1,Alpha,B1,Chores,Work', await sorted())
check('count', (await page.textContent('.tag-view-count')).trim() === '5 items')

// Adding a tag from suggestions, then clicking an item right away
await page.click('.tag-view-input')
await page.locator('.tag-view-suggestions .tag-pill', { hasText: 'urgent' }).click()
await page.waitForURL(/\/tags\/proj,urgent$/)
check('suggestion list closes after picking', !(await page.isVisible('.tag-view-suggestions')))
await clickTitle(/^Alpha/)
await page.waitForURL(/\/g\/g1\/work\/alpha$/, { timeout: 3000 }).catch(() => {})
check('item click opens it in its graph', page.url().endsWith('/g/g1/work/alpha'), page.url())
await page.goBack()
await page.waitForURL(/\/tags\/proj,urgent$/, { timeout: 3000 }).catch(() => {})
check('back returns to tag view', page.url().endsWith('/tags/proj,urgent'), page.url())

// Any tag pill in a graph opens its view
await page.goto(BASE + '/g/g2')
await page.waitForSelector('.item-title')
await page.locator('.items-grid .tag-pill-clickable', { hasText: 'lonely' }).click()
await page.waitForURL(/\/tags\/lonely$/, { timeout: 3000 }).catch(() => {})
check('in-graph pill opens its tag view', page.url().endsWith('/tags/lonely'), page.url())

// Favorite via the selection toolbar
await page.goto(BASE + '/g/g1')
await page.waitForSelector('.item-title')
await clickTitle(/^M1/, { modifiers: ['Control'] })
await clickTitle(/^M2/, { modifiers: ['Control'] })
await page.click('.graph-header-buttons .favorite-toggle')
await page.waitForTimeout(500)
let s = await stored('g1')
check('star adds favorite to the selection', s.structure.misc.children.m1.tags?.includes('favorite') && s.structure.misc.children.m2.tags?.includes('favorite'))
check('favorites render as stars', (await page.locator('.items-grid .tag-favorite').count()) === 2)
await page.click('.graph-header-buttons .favorite-toggle')
await page.waitForTimeout(500)
s = await stored('g1')
check('star again removes it', !s.structure.misc.children.m1.tags && !s.structure.misc.children.m2.tags)

// Favorite via the editor keeps other tags
await page.reload()
await page.waitForSelector('.item-title')
await clickTitle(/^Alpha/, { modifiers: ['Shift'] })
await page.waitForSelector('.inline-edit')
await page.locator('.inline-tool', { hasText: '☆' }).click()
await page.locator('.inline-edit-title').press('Enter')
await page.waitForTimeout(500)
s = await stored('g1')
check('editor star adds favorite', JSON.stringify(s.structure.work.children.alpha.tags) === '["proj","urgent","favorite"]', JSON.stringify(s.structure.work.children.alpha.tags))

await page.goto(BASE + '/g/g1')
await page.waitForSelector('.tags-list')
check('menu favorite count updates', (await page.locator('.tags-list .tag-pill').first().textContent()).trim() === '★ favorite 1')

const text = await page.evaluate(async () => (await import('/src/api/localClient.ts')).fetchStructureText('g1'))
check('text format keeps #favorite', /## Alpha #proj #urgent #favorite/.test(text))

const m = await ctx.newPage()
await m.setViewportSize({ width: 390, height: 844 })
await m.goto(BASE + '/tags/proj')
await m.waitForSelector('.tag-view-graph')
check('mobile: no horizontal overflow', !(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)))

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
