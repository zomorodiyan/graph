// Auto tags (date ranges, money, schedule, people) and multi-tag views.
import { BASE, check, done, launch, shot, seed, isoFromToday, titles } from './helpers.mjs'

const it = (title, off, tags) => ({ title, ...(off !== null && { date: isoFromToday(off) }), ...(tags && { tags }), children: {} })
const ag = { plans: { title: 'Plans', children: {
  d0: it('D0', 0, ['proj', '$50', '1.5h', '@sara']), d2: it('D2', 2, ['2h']), d5: it('D5', 5, ['$20.5']), d20: it('D20', 20),
  d29: it('D29', 29), d30: it('D30', 30), dm3: it('Dm3', -3, ['proj']), n: it('N', null, ['proj', '@sara', '@john']),
} } }

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
await seed(ctx, { ag }, { 'active-depth': '3' })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))
const sorted = async () => (await titles(p)).sort().join(',')
const url = () => decodeURIComponent(new URL(p.url()).pathname)
const count = async () => (await p.textContent('.tag-view-count')).trim()

await p.goto(BASE + '/g/ag')
await p.waitForSelector('.tags-list')
const menu = await p.$$eval('.tags-list .tag-pill', els => els.map(e => e.textContent.trim()))
const want = ['Today 1', '3days 2', '7days 3', '30days 5', 'long-term 1', 'history 1', 'money 2', 'schedule 2', 'people 2', '@sara 2', '@john 1', 'proj 3']
check('menu tags, order and counts; no $/h pills', JSON.stringify(menu) === JSON.stringify(want), JSON.stringify(menu))
await shot(p, 'auto-tags-menu.png')

const expected = { 'Today': 'D0', '3days': 'D0,D2', '7days': 'D0,D2,D5', '30days': 'D0,D2,D20,D29,D5', 'long-term': 'D30', 'history': 'Dm3',
  'money': 'D0,D5', 'schedule': 'D0,D2', 'people': 'D0,N', '@sara': 'D0,N', '@john': 'N' }
for (const [label, items] of Object.entries(expected)) {
  await p.goto(BASE + '/g/ag')
  await p.waitForSelector('.tags-list')
  await p.locator('.tags-list .tag-pill', { hasText: new RegExp(`^${label} `) }).click()
  await p.waitForSelector('.tag-view-graph')
  check(`${label} -> ${items}`, (await sorted()) === items, await sorted())
}

await p.goto(BASE + '/tags/~money')
await p.waitForSelector('.tag-view-graph')
check('money totals', (await count()) === '2 items · $70.5 · 1.5h', await count())

// Several tags: items with any of them
await p.goto(BASE + '/tags/proj')
await p.waitForSelector('.tag-view-graph')
await p.click('.tag-view-input')
await p.keyboard.type('7d')
await p.keyboard.press('Enter')
await p.waitForURL(/7days/)
check('typed tag is added', url() === '/tags/proj,~7days', url())
check('proj OR 7days', (await sorted()) === 'D0,D2,D5,Dm3,N', await sorted())
check('count and totals cover all shown', (await count()) === '5 items · $70.5 · 3.5h', await count())
await p.locator('.tag-view-chip', { hasText: 'proj' }).locator('.tag-view-chip-remove').click()
await p.waitForURL(u => !decodeURIComponent(u.pathname).includes('proj'))
check('removing a chip', url() === '/tags/~7days', url())
await p.locator('.tag-pill-clickable', { hasText: '$20.5' }).click()
await p.waitForURL(/money/)
check('value pill adds its group', url() === '/tags/~7days,~money', url())
await p.click('.tag-view-input')
await p.keyboard.press('Backspace')
await p.waitForURL(u => !u.pathname.includes('money'))
check('backspace removes the last tag', url() === '/tags/~7days', url())
await p.locator('.tag-view-chip-remove').click()
await p.waitForURL(BASE + '/')
check('removing the last chip goes home', new URL(p.url()).pathname === '/')

// Person pill opens that person
await p.goto(BASE + '/g/ag')
await p.waitForSelector('.item-title')
await p.locator('.items-grid .tag-pill-clickable', { hasText: '@john' }).click()
await p.waitForURL(/john/)
check('@john pill opens @john', url() === '/tags/@john', url())

// Text format keeps value/person tags; editor accepts them
const rt = await p.evaluate(async () => {
  const m = await import('/src/api/localClient.ts')
  const parsed = m.parseStructureText(await m.fetchStructureText('ag'))
  return Object.values(Object.values(parsed)[0].children).find(c => c.title === 'D0').tags
})
check('text format round trip', JSON.stringify(rt) === '["proj","$50","1.5h","@sara"]', JSON.stringify(rt))

await p.goto(BASE + '/g/ag')
await p.waitForSelector('.item-title')
await p.locator('.item-title', { hasText: /^D20/ }).click({ modifiers: ['Shift'], position: { x: 4, y: 6 } })
await p.waitForSelector('.inline-edit')
await p.locator('.inline-tool', { hasText: 'Tags' }).click()
await p.waitForFunction(() => document.activeElement?.classList.contains('tag-draft-input'))
for (const t of ['$12', '0.5h', '@kim']) { await p.keyboard.type(t); await p.keyboard.press('Enter') }
await p.locator('.inline-edit-title').press('Enter')
await p.waitForTimeout(500)
const d20 = await p.evaluate(() => JSON.parse(localStorage.getItem('offline_graph_ag')).structure.plans.children.d20.tags)
check('editor saves $, h and @ tags', JSON.stringify(d20) === '["$12","0.5h","@kim"]', JSON.stringify(d20))

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
