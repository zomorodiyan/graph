// Body panel: a body-part tag pill opens the page's tagged items as cards
// over an anatomy figure, one card per part; tapping a part of the figure
// or a card's heading selects it. The figure stands on phones and lies
// down on wide panels.
import { BASE, check, done, launch, shot, seed } from './helpers.mjs'

const it = (title, tags, children = {}) => ({ title, ...(tags && { tags }), children })
const workout = {
  legs: it('Leg day', ['2h'], {
    squats: it('Squats', ['quads', 'glutes', '0.5h']),
    lunges: it('Lunges', ['Quads']),
    deadlift: it('Deadlift', ['hamstrings', 'lower_back']),
    calves: it('Calf raises', ['calf']),
    stretch: it('Stretch', ['legs']),
  }),
  upper: it('Upper body', undefined, { bench: it('Bench press', ['chest', 'triceps']), rows: it('Rows', ['back']) }),
  notes: it('Notes', undefined, { plan: it('Plan', ['proj']) }),
}

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
await seed(ctx, { workout }, { 'active-depth': '3' })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))
const parts = async cls => (await p.$$eval(`.body-figure g[data-part].${cls}`, els => els.map(e => e.dataset.part))).join()
const cards = async () => (await p.$$eval('.body-card[data-part]', els => els.map(e => e.dataset.part))).join()
const selectedCard = async () => (await p.$$eval('.body-card.sel', els => els.map(e => e.dataset.part))).join()
const cardItems = async part => (await p.$$eval(`.body-card[data-part="${part}"] .layer2 .item-title`, els => els.map(e => (e.childNodes[0]?.textContent ?? '').trim()))).join()
// A part's own card sits over it, so the click goes straight to the muscle.
const tapPart = part => p.locator(`.body-figure g[data-part="${part}"] path`).first().dispatchEvent('click')

await p.goto(BASE + '/g/workout/legs')
await p.waitForSelector('.item-title')
check('no body panel until a body tag is clicked', (await p.locator('.body-panel').count()) === 0)
await p.locator('.items-grid .tag-pill-clickable', { hasText: /^quads$/ }).click()
await p.waitForSelector('.body-panel')
await p.waitForTimeout(300)
check('scope is the page', (await p.textContent('.body-panel .tag-panel-title')).trim() === 'Leg day')
check('wide panel: the figure lies down', (await p.locator('.body-stage.lying').count()) === 1 && (await p.locator('.body-figure.lying').count()) === 1)
check('one card per part in figure order; synonyms, case and underscores fold in', (await cards()) === 'core,hips,legs,calves', await cards())
check('parts with items are tinted', (await parts('has')) === 'core,hips,legs,calves', await parts('has'))
check('the clicked part is selected on the figure and its card', (await parts('sel')) === 'legs' && (await selectedCard()) === 'legs', await parts('sel'))
check('a card lists its items under the part', (await cardItems('legs')) === 'Squats,Lunges,Deadlift,Stretch', await cardItems('legs'))
check('cards are placed in the stage', await p.$$eval('.body-card', els => els.every(e => e.style.top !== '' && e.style.left !== '')))
check('search panel untouched', (await p.locator('.search-panel-chip').count()) === 0)
await shot(p, 'body-panel.png')

// Tapping the figure, or a card's heading
await tapPart('hips')
check('tapping a part selects it', (await selectedCard()) === 'hips' && (await parts('sel')) === 'hips', await selectedCard())
await tapPart('head')
check('an empty part changes nothing', (await selectedCard()) === 'hips')
await p.locator('.body-card[data-part="core"] .layer1 .item-title').click({ position: { x: 4, y: 6 } })
check('a card heading selects too', (await selectedCard()) === 'core' && (await parts('sel')) === 'core', await selectedCard())

// Pills inside a card route like anywhere else
await p.locator('.body-card[data-part="legs"] .tag-pill-clickable', { hasText: /^0\.5h$/ }).click()
await p.waitForSelector('.budget-panel')
check('a value pill in a card opens the budget panel on that item; the body panel stays', (await p.locator('.body-panel').count()) === 1 && (await p.locator('.budget-row.focus[data-path="legs.squats"]').count()) === 1)
await p.locator('.body-card[data-part="legs"] .tag-pill-clickable', { hasText: /^glutes$/ }).first().click()
check('a body pill in a card selects that part', (await selectedCard()) === 'hips')

// Whole graph at the root; opening an item goes to it and the scope follows
await p.goto(BASE + '/g/workout')
await p.waitForSelector('.item-title')
await p.locator('.items-grid .tag-pill-clickable', { hasText: /^chest$/ }).click()
await p.waitForSelector('.body-panel')
await p.waitForTimeout(300)
check('root scope: every part in the graph', (await cards()) === 'chest,arms,core,hips,legs,calves', await cards())
check('"back" lands on chest & back', (await cardItems('chest')) === 'Bench press,Rows', await cardItems('chest'))
await p.locator('.body-card[data-part="chest"] .layer2 .item-title', { hasText: /^Bench press/ }).click({ position: { x: 4, y: 6 } })
await p.waitForURL(/\/g\/workout\/upper$/, { timeout: 3000 }).catch(() => {})
check('opening an item goes to its page', p.url().endsWith('/g/workout/upper'), p.url())
await p.waitForTimeout(300)
check('the panel stays, scoped to the new page', (await p.textContent('.body-panel .tag-panel-title')).trim() === 'Upper body' && (await cards()) === 'chest,arms', await cards())

// Collapse / close
await p.click('.body-panel .tag-panel-toggle')
check('collapses to its bar', (await p.locator('.body-content').count()) === 0 && (await p.locator('.body-panel').count()) === 1)
await p.click('.body-panel .tag-panel-close')
check('close removes it', (await p.locator('.body-panel').count()) === 0)

// Phone: the figure stands with the cards down it, the bar at the bottom, nothing overflows
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await seed(phone, { workout }, { 'active-depth': '3' })
const q = await phone.newPage()
q.on('pageerror', e => errors.push(e.message))
await q.goto(BASE + '/g/workout/legs')
await q.waitForSelector('.item-title')
await q.locator('.items-grid .tag-pill-clickable', { hasText: /^quads$/ }).tap()
await q.waitForSelector('.body-panel')
await q.waitForTimeout(400)
const rect = sel => q.locator(sel).first().evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right } })
check('phone: the figure stands', (await q.locator('.body-stage.standing').count()) === 1 && (await q.locator('.body-figure.standing').count()) === 1)
const stage = await rect('.body-stage')
const tops = await q.$$eval('.body-card', els => els.map(e => e.getBoundingClientRect().top))
check('phone: cards run down the body in part order', tops.every((t, i) => i === 0 || t > tops[i - 1]), tops.join())
const bar = await rect('.body-panel .tag-panel-bar')
check('phone: panel bar below the stage', bar.top >= stage.bottom - 1, `bar ${bar.top}, stage ${stage.bottom}`)
check('phone: no horizontal overflow', !(await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)))
await q.locator('.body-figure g[data-part="hips"] path').first().dispatchEvent('click')
check('phone: tapping a part selects it', (await q.$$eval('.body-card.sel', els => els.map(e => e.dataset.part))).join() === 'hips')
await shot(q, 'body-panel-phone.png')

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
