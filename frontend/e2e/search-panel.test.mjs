// Search panel at the bottom of graph pages (text search, tag groups),
// editing from its results, and favorites.
import { BASE, check, done, launch, shot, seed, titles } from './helpers.mjs'

const g1 = {
  work: { title: 'Work', tags: ['proj'], children: {
    alpha: { title: 'Alpha', tags: ['proj', 'urgent'], children: { a1: { title: 'A1', tags: ['proj'], children: {} } } },
    beta: { title: 'Beta', children: { b1: { title: 'B1', tags: ['proj'], children: {} } } },
  } },
  misc: { title: 'Misc', children: { m1: { title: 'M1', context: 'oat milk for later', children: {} }, m2: { title: 'M2', children: {} } } },
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
const results = async () => (await page.$$eval('.results .item-title', els => els.map(e => (e.childNodes[0]?.textContent ?? '').trim()))).sort().join(',')
const pills = () => page.$$eval('.search-panel-tags .tag-pill', els => els.map(e => e.textContent.trim()))
const chips = () => page.$$eval('.search-panel-chip', els => els.map(e => e.childNodes[0].textContent.trim()))
const count = async () => (await page.textContent('.search-panel-count')).trim()
const input = '.search-panel-input'
const type = async text => { await page.fill(input, ''); await page.type(input, text); await page.waitForTimeout(100) }
// Title text only — a title's pills sit inside its element.
const clickTitle = (re, opts = {}) => page.locator('.items-grid .item-title', { hasText: re }).first().click({ position: { x: 4, y: 6 }, ...opts })

// New name
await page.goto(BASE + '/')
await page.waitForSelector('.structures-header h1')
check('home page is titled Graph Memory', (await page.textContent('.structures-header h1')).trim() === 'Graph Memory')
check('document title', (await page.title()) === 'Graph Memory', await page.title())

// Collapsed: just the input bar
await page.goto(BASE + '/g/g1')
await page.waitForSelector('.search-panel-input')
check('panel starts collapsed', !(await page.isVisible('.search-panel-tags')) && (await page.locator('.results').count()) === 0)
check('no separate tag list any more', (await page.locator('.tags-list').count()) === 0)

// Focusing opens it with this graph's tags
await page.click(input)
await page.waitForSelector('.search-panel-tags')
check("open: lists only this graph's tags, with counts", JSON.stringify(await pills()) === '["proj 4","urgent 1"]', JSON.stringify(await pills()))
await shot(page, 'panel-open.png')

// Plain text searches titles and notes as you type
await type('alp')
check('text matches titles', (await results()) === 'Alpha', await results())
check('count', (await count()) === '1 item', await count())
check('tag pills hidden while searching text', !(await page.isVisible('.search-panel-tags')))
await type('b')
check('nested matches keep their structure', (await results()) === 'B1,Beta', await results())
await type('milk')
check('text matches notes', (await results()) === 'M1', await results())
await type('zzz')
check('no matches says so', (await page.textContent('.search-panel .empty-state')).trim() === 'No matches')

// A symbol starts a tag query
await type('#ur')
check('#… filters the tag pills', JSON.stringify(await pills()) === '["urgent 1"]', JSON.stringify(await pills()))
await page.press(input, 'Enter')
check('Enter pulls in the tag', JSON.stringify(await chips()) === '["urgent"]' && (await page.inputValue(input)) === '', JSON.stringify(await chips()))
check('urgent group', (await results()) === 'Alpha', await results())
await type('#pro')
await page.locator('.search-panel-tags .tag-pill', { hasText: 'proj' }).click()
check('several tags: items with any of them', (await results()) === 'A1,Alpha,B1,Work', await results())
check('count covers all', (await count()) === '4 items', await count())
await type('a')
check('text narrows the tag groups', (await results()) === 'A1,Alpha', await results())
await page.fill(input, '')
await page.press(input, 'Backspace')
check('Backspace on empty removes the last tag', JSON.stringify(await chips()) === '["urgent"]', JSON.stringify(await chips()))
await page.locator('.search-panel-chip-remove').click()
check('removing the last chip shows the tags again', (await chips()).length === 0 && (await pills()).length === 2)

// Collapse keeps the query
await type('alp')
await page.click('.search-panel-toggle')
check('collapse hides the results', (await page.locator('.results').count()) === 0)
await page.click('.search-panel-toggle')
check('reopening shows them again', (await results()) === 'Alpha')

// Opening a result goes to it in the graph and collapses the panel
await page.locator('.results .item-title', { hasText: /^Alpha/ }).click({ position: { x: 4, y: 6 } })
await page.waitForURL(/\/g\/g1\/work\/alpha$/, { timeout: 3000 }).catch(() => {})
check('result click opens it in the graph', page.url().endsWith('/g/g1/work/alpha'), page.url())
check('panel collapsed after opening', (await page.locator('.results').count()) === 0)
check('query kept for next time', (await page.inputValue(input)) === 'alp')

// A tag pill on a page item opens the panel on that tag (this graph only)
await page.goto(BASE + '/g/g2')
await page.waitForSelector('.item-title')
await page.locator('.items-grid .tag-pill-clickable', { hasText: 'proj' }).click()
await page.waitForTimeout(200)
check('in-graph pill stays on the page', new URL(page.url()).pathname === '/g/g2', page.url())
check('…and pulls its items into the panel', JSON.stringify(await chips()) === '["proj"]' && (await results()) === 'Chores', await results())

// Editing a result (Shift+click) saves and updates the page too
await page.locator('.results .item-title', { hasText: /^Chores/ }).click({ modifiers: ['Shift'], position: { x: 4, y: 6 } })
await page.waitForSelector('.results .inline-edit-title')
await page.fill('.results .inline-edit-title', 'Chores Two')
await page.locator('.results .inline-edit-title').press('Enter')
await page.waitForTimeout(500)
let s = await stored('g2')
check('edit from results saves, keeps tags', s.structure.home.children.chores_two?.title === 'Chores Two' && JSON.stringify(s.structure.home.children.chores_two.tags) === '["proj"]', JSON.stringify(s.structure.home.children))
const pageTitles = await page.$$eval('.items-grid .item-title', els => els.map(e => (e.childNodes[0]?.textContent ?? '').trim()))
check('the page shows the edit too', pageTitles.includes('Chores Two'), pageTitles.join())
check('result shows the edit', (await results()) === 'Chores Two', await results())

// Favorite via the selection toolbar
await page.goto(BASE + '/g/g1')
await page.waitForSelector('.item-title')
await clickTitle(/^M1/, { modifiers: ['Control'] })
await clickTitle(/^M2/, { modifiers: ['Control'] })
await page.click('.graph-header-buttons .favorite-toggle')
await page.waitForTimeout(500)
s = await stored('g1')
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
await page.click(input)
await page.waitForSelector('.search-panel-tags')
check('favorite tag listed first once this graph has one', (await pills())[0] === '★ favorite 1', JSON.stringify(await pills()))

const text = await page.evaluate(async () => (await import('/src/api/localClient.ts')).fetchStructureText('g1'))
check('text format keeps #favorite', /## Alpha #proj #urgent #favorite/.test(text))

await page.goto(BASE + '/tags/proj')
await page.waitForURL(BASE + '/', { timeout: 3000 }).catch(() => {})
check('old tag view links go home', new URL(page.url()).pathname === '/', page.url())
check('home has no Favorites card', (await page.locator('.favorites-card').count()) === 0)
await page.goto(BASE + '/favorites')
await page.waitForURL(BASE + '/', { timeout: 3000 }).catch(() => {})
check('no Favorites page', new URL(page.url()).pathname === '/', page.url())

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
