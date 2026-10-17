// Date badges and the item editor's tag suggestions.
import { BASE, check, done, launch, shot, seed, isoFromToday } from './helpers.mjs'

const eg = { a: { title: 'A', children: {
  t0: { title: 'T0', date: isoFromToday(0), children: {} },
  t1: { title: 'T1', date: isoFromToday(1), tags: ['@sara', 'proj'], children: {} },
  t2: { title: 'T2', date: isoFromToday(2), tags: ['@sarah'], children: {} },
  t7: { title: 'T7', date: isoFromToday(7), children: {} },
  tm2: { title: 'Tm2', date: isoFromToday(-2), children: {} },
  blank: { title: 'Blank', children: {} },
} } }

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
await seed(ctx, { eg }, { 'active-depth': '3' })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))
const badge = title => p.locator('.item-title', { hasText: new RegExp('^' + title) }).locator('.item-due').textContent()
const storedTags = () => p.evaluate(() => JSON.parse(localStorage.getItem('offline_graph_eg')).structure.a.children.blank.tags)

await p.goto(BASE + '/g/eg')
await p.waitForSelector('.item-title')
check('today -> Today', (await badge('T0')).trim() === 'Today')
check('tomorrow -> 1d', (await badge('T1')).trim() === '1d', await badge('T1'))
check('in 2 days -> 2d', (await badge('T2')).trim() === '2d', await badge('T2'))
check('in 7 days -> 7d', (await badge('T7')).trim() === '7d', await badge('T7'))
check('2 days ago -> 2d overdue', (await badge('Tm2')).trim() === '2d overdue', await badge('Tm2'))
check('no agenda strip under the graph', (await p.locator('.time-view').count()) === 0)

// Tag suggestions in the editor
const openTags = async () => {
  await p.locator('.item-title', { hasText: /^Blank/ }).click({ modifiers: ['Shift'], position: { x: 4, y: 6 } })
  await p.waitForSelector('.inline-edit')
  await p.locator('.inline-tool', { hasText: 'Tags' }).click()
  await p.waitForFunction(() => document.activeElement?.classList.contains('tag-draft-input'))
}
await openTags()
await p.keyboard.type('@sa')
const sugg = await p.$$eval('.tag-suggestions .tag-pill', els => els.map(e => e.textContent.trim()))
check('typing "@sa" suggests existing people', JSON.stringify(sugg.sort()) === '["@sara","@sarah"]', JSON.stringify(sugg))
await shot(p, 'tag-suggestions.png')
await p.locator('.tag-suggestions .tag-pill', { hasText: /^@sarah$/ }).click()
check('clicking a suggestion adds it', (await p.$$eval('.tag-chip span', els => els.map(e => e.textContent))).join() === '@sarah')
check('draft clears after adding', (await p.inputValue('.tag-draft-input')) === '')
await p.keyboard.type('PRO')
await p.keyboard.press('Tab')
await p.keyboard.type('@SARA')
await p.keyboard.press('Enter')
await p.keyboard.type('brand-new')
await p.keyboard.press('Enter')
await p.locator('.inline-edit-title').press('Enter')
await p.waitForTimeout(500)
check('Tab picks the first suggestion; Enter reuses existing spelling; new tags still allowed',
  JSON.stringify(await storedTags()) === '["@sarah","proj","@sara","brand-new"]', JSON.stringify(await storedTags()))

await openTags()
await p.keyboard.type('@sar')
const left = await p.$$eval('.tag-suggestions .tag-pill', els => els.map(e => e.textContent.trim()))
check('tags already on the item are not suggested', left.length === 0, JSON.stringify(left))
await p.keyboard.press('Escape')

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
