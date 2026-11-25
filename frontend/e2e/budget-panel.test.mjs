// Budget panel: a value tag pill (2h, $50) opens the page's items as shares
// of a pool — the page item's own value, or the graph's budget at the root —
// with +/- buttons that edit the tags one token at a time.
import { BASE, check, done, launch, shot, seed } from './helpers.mjs'

const it = (title, tags, children = {}) => ({ title, ...(tags && { tags }), children })
const week = {
  monday: it('Monday', ['8h'], {
    deep: it('Deep work', ['3h'], { paper: it('Write paper', ['1.5h']), review: it('Review', ['1h']) }),
    email: it('Email', ['1h', 'proj']),
    gym: it('Gym', ['1.5h']),
    reading: it('Reading'),
  }),
  tuesday: it('Tuesday', ['8h'], { standup: it('Standup', ['0.5h']) }),
  money: it('Money', ['$300'], { rent: it('Rent', ['$120']), fun: it('Fun', ['$60']) }),
}

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
await seed(ctx, { week }, { 'active-depth': '3' })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))
const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('offline_graph_week')).structure)
const poolText = async () => (await p.textContent('.budget-pool-text')).replace(/\s+/g, ' ').trim()
const rows = async () => (await p.$$eval('.budget-row[data-path]', els => els.map(e => e.dataset.path))).join()
const value = async path => (await p.textContent(`.budget-row[data-path="${path}"] > .budget-row-head .budget-value`)).trim()
const step = (path, which) => p.locator(`.budget-row[data-path="${path}"] > .budget-row-head .budget-step`).nth(which === '+' ? 1 : 0).click()

// A page whose item has its own value: that's the pool
await p.goto(BASE + '/g/week/monday')
await p.waitForSelector('.item-title')
check('no budget panel until a value tag is clicked', (await p.locator('.budget-panel').count()) === 0)
await p.locator('.items-grid .tag-pill-clickable', { hasText: /^3h$/ }).click()
await p.waitForSelector('.budget-panel')
check('a value tag opens the hours budget', (await p.locator('.budget-panel[data-kind="hours"]').count()) === 1)
check("pool: used of the page item's own tag, remainder", (await poolText()) === '5.5h of 8h · 2.5h left', await poolText())
check('rows in page order, branches open to the view depth', (await rows()) === 'monday.deep,monday.deep.paper,monday.deep.review,monday.email,monday.gym', await rows())
check('a branch with its own value shows what its children took of it', (await value('monday.deep')) === '2.5h of 3h', await value('monday.deep'))
check('one pool block per valued top-level item', (await p.locator('.budget-pool-seg').count()) === 3)
check('the clicked item is focused', (await p.locator('.budget-row.focus[data-path="monday.deep"]').count()) === 1)
check('untagged items listed apart', (await p.textContent('.budget-empty-toggle')).includes('1 without hours'))
check('search panel untouched', (await p.locator('.search-panel-chip').count()) === 0)
await shot(p, 'budget-panel.png')

// +/- move one token (half an hour), editing the tag in place
await step('monday.email', '+')
await p.waitForTimeout(300)
let s = await stored()
check('+ adds half an hour to the tag, in place', JSON.stringify(s.monday.children.email.tags) === '["1.5h","proj"]', JSON.stringify(s.monday.children.email.tags))
check('pool follows', (await poolText()) === '6h of 8h · 2h left', await poolText())
for (let i = 0; i < 3; i++) { await step('monday.gym', '-'); await p.waitForTimeout(250) }
s = await stored()
check('- down to zero removes the tag', !s.monday.children.gym.tags, JSON.stringify(s.monday.children.gym.tags))
check('an item without hours moves to the untagged list', !(await rows()).includes('monday.gym') && (await p.textContent('.budget-empty-toggle')).includes('2 without hours'))
await p.click('.budget-empty-toggle')
await p.locator('.budget-row.empty[data-path="monday.reading"] .budget-step').click()
await p.waitForTimeout(300)
s = await stored()
check('+ on an untagged item gives it one token', JSON.stringify(s.monday.children.reading.tags) === '["0.5h"]', JSON.stringify(s.monday.children.reading.tags))

// Typing a value; over budget
await p.locator('.budget-row[data-path="monday.deep"] > .budget-row-head .budget-value').click()
await p.fill('.budget-input', '7')
await p.press('.budget-input', 'Enter')
await p.waitForTimeout(300)
check('typing a value sets it', (await value('monday.deep')) === '2.5h of 7h', await value('monday.deep'))
check('over budget is said and marked', (await poolText()) === '9h of 8h · 1h over' && (await p.locator('.budget-pool-limit').count()) === 1, await poolText())

// The pool itself is the page item's tag
await p.click('.budget-pool-text')
await p.fill('.budget-input', '12')
await p.press('.budget-input', 'Enter')
await p.waitForTimeout(300)
s = await stored()
check('setting the pool tags the page item', JSON.stringify(s.monday.tags) === '["12h"]', JSON.stringify(s.monday.tags))
check('pool text follows', (await poolText()) === '9h of 12h · 3h left', await poolText())

// Collapse / close
await p.click('.budget-panel .tag-panel-toggle')
check('collapses to its bar', (await p.locator('.budget-body').count()) === 0 && (await p.locator('.budget-panel').count()) === 1)
await p.click('.budget-panel .tag-panel-close')
check('close removes it', (await p.locator('.budget-panel').count()) === 0)

// Root: the pool is the graph's budget, set on the panel; money kind
await p.goto(BASE + '/g/week')
await p.waitForSelector('.item-title')
await p.locator('.items-grid .tag-pill-clickable', { hasText: /^\$120$/ }).click()
await p.waitForSelector('.budget-panel[data-kind="money"]')
check('a money tag opens the money budget; no pool yet at the root', (await poolText()) === '$300 · set budget', await poolText())
check('kind toggle offered when the page has both kinds', (await p.locator('.budget-kind button').count()) === 2)
await p.click('.budget-pool-text')
await p.fill('.budget-input', '1000')
await p.press('.budget-input', 'Enter')
await p.waitForTimeout(300)
const meta = await p.evaluate(() => JSON.parse(localStorage.getItem('offline_meta_week')))
check('root budget saved to the graph metadata', meta.money_budget === 1000, JSON.stringify(meta))
check('root pool text', (await poolText()) === '$300 of $1000 · $700 left', await poolText())
await p.locator('.budget-kind button').first().click()
await p.waitForSelector('.budget-panel[data-kind="hours"]')
check('switching kind: hours at the root', (await poolText()) === '20h · set budget', await poolText())
check('text format keeps the edited tags', /^# Monday #12h$/m.test(await p.evaluate(async () => (await import('/src/api/localClient.ts')).fetchStructureText('week'))))

// Phone: the bar sits at the bottom of the panel, above the search panel
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await seed(phone, { week }, { 'active-depth': '3' })
const q = await phone.newPage()
q.on('pageerror', e => errors.push(e.message))
await q.goto(BASE + '/g/week/monday')
await q.waitForSelector('.item-title')
await q.locator('.items-grid .tag-pill-clickable', { hasText: /^3h$/ }).tap()
await q.waitForSelector('.budget-panel')
await q.waitForTimeout(300)
const rect = sel => q.locator(sel).first().evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom } })
const bar = await rect('.budget-panel .tag-panel-bar')
const body = await rect('.budget-body')
const search = await rect('.search-panel')
check('phone: panel bar below its rows', bar.top >= body.bottom - 1, `bar ${bar.top}, body bottom ${body.bottom}`)
check('phone: budget panel above the search panel', bar.bottom <= search.top + 1, `bar bottom ${bar.bottom}, search top ${search.top}`)
check('phone: no horizontal overflow', !(await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)))
await shot(q, 'budget-panel-phone.png')

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
