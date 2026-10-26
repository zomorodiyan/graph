// Auto tags (date ranges, money, schedule, people) and multi-tag searches.
import { BASE, check, done, launch, shot, seed, isoFromToday } from './helpers.mjs'

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
const results = async () => (await p.$$eval('.results .item-title', els => els.map(e => (e.childNodes[0]?.textContent ?? '').trim()))).sort().join(',')
const chips = () => p.$$eval('.search-panel-chip', els => els.map(e => e.childNodes[0].textContent.trim()))
const count = async () => (await p.textContent('.search-panel-count')).trim()
const input = '.search-panel-input'
const openPanel = async () => {
  await p.goto(BASE + '/g/ag')
  await p.click(input)
  await p.waitForSelector('.search-panel-tags')
}

await openPanel()
const menu = await p.$$eval('.search-panel-tags .tag-pill', els => els.map(e => e.textContent.trim()))
const want = ['Today 1', '3days 2', '7days 3', '30days 5', 'long-term 1', 'history 1', 'money 2', 'schedule 2', 'people 2', '@sara 2', '@john 1', 'proj 3']
check('panel tags, order and counts; no $/h pills', JSON.stringify(menu) === JSON.stringify(want), JSON.stringify(menu))
await shot(p, 'auto-tags-menu.png')

const expected = { 'Today': 'D0', '3days': 'D0,D2', '7days': 'D0,D2,D5', '30days': 'D0,D2,D20,D29,D5', 'long-term': 'D30', 'history': 'Dm3',
  'money': 'D0,D5', 'schedule': 'D0,D2', 'people': 'D0,N', '@sara': 'D0,N', '@john': 'N' }
for (const [label, items] of Object.entries(expected)) {
  await openPanel()
  await p.locator('.search-panel-tags .tag-pill', { hasText: new RegExp(`^${label} `) }).click()
  await p.waitForSelector('.results')
  check(`${label} -> ${items}`, (await results()) === items, await results())
}

// Typed tag queries reach auto tags by their names
await openPanel()
await p.type(input, '$')
check('$ suggests money', (await p.$$eval('.search-panel-tags .tag-pill', els => els.map(e => e.textContent.trim()))).join() === 'money 2')
await p.press(input, 'Enter')
check('money totals', (await count()) === '2 items · $70.5 · 1.5h', await count())

// Several tags: items with any of them
await p.fill(input, '')
await p.locator('.search-panel-chip-remove').click()
await p.type(input, '#proj')
await p.press(input, 'Enter')
await p.type(input, '#7d')
await p.press(input, 'Enter')
check('typed tags are added', JSON.stringify(await chips()) === '["proj","7days"]', JSON.stringify(await chips()))
check('proj OR 7days', (await results()) === 'D0,D2,D5,Dm3,N', await results())
check('count and totals cover all shown', (await count()) === '5 items · $70.5 · 3.5h', await count())
await p.locator('.search-panel-chip', { hasText: 'proj' }).locator('.search-panel-chip-remove').click()
check('removing a chip', JSON.stringify(await chips()) === '["7days"]', JSON.stringify(await chips()))
await p.locator('.results .tag-pill-clickable', { hasText: '$20.5' }).click()
check('value pill in the results adds its group', JSON.stringify(await chips()) === '["7days","money"]', JSON.stringify(await chips()))

// Person pill on the page opens that person
await p.goto(BASE + '/g/ag')
await p.waitForSelector('.item-title')
await p.locator('.items-grid .tag-pill-clickable', { hasText: '@john' }).click()
check('@john pill opens @john', JSON.stringify(await chips()) === '["@john"]' && (await results()) === 'N', JSON.stringify(await chips()))

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
