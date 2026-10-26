// Weekly repeating items: the engine, the Repeat editor, badges, the
// routine auto tag and the text format.
import { BASE, check, done, launch, shot } from './helpers.mjs'

const b = await launch()
const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } })
const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message))
await p.goto(BASE + '/')

// ── Engine (reference "today" = Fri 2026-10-16) ─────────────────────────
const eng = await p.evaluate(async () => {
  const r = await import('/src/utils/recurrence.ts')
  const fri = new Date(2026, 9, 16)
  return {
    parse: r.parseDays('FREQ=WEEKLY;BYDAY=WE,MO'),
    google: r.parseDays('RRULE:FREQ=WEEKLY;BYDAY=MO'),
    rejMonthly: r.parseDays('FREQ=MONTHLY;BYDAY=3FR'),
    rejInterval: r.parseDays('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO'),
    rejDup: r.parseDays('FREQ=WEEKLY;BYDAY=MO,MO'),
    fmt: r.formatDays(['FR', 'MO', 'SU']),
    fmtNone: r.formatDays([]),
    nextToday: r.effectiveDate({ repeat: 'FREQ=WEEKLY;BYDAY=FR' }, fri),
    nextMon: r.effectiveDate({ repeat: 'FREQ=WEEKLY;BYDAY=MO,WE' }, fri),
    pastStart: r.effectiveDate({ date: '2026-01-01', repeat: 'FREQ=WEEKLY;BYDAY=SA' }, fri),
    futureStart: r.effectiveDate({ date: '2026-11-02', repeat: 'FREQ=WEEKLY;BYDAY=WE' }, fri),
    plain: r.effectiveDate({ date: '2026-01-01' }, fri),
    dEvery: r.describeRepeat({ repeat: 'FREQ=WEEKLY;BYDAY=WE,MO' }),
    dDay: r.describeRepeat({ repeat: 'FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA' }),
    dWeekday: r.describeRepeat({ repeat: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' }),
    dWeekend: r.describeRepeat({ repeat: 'FREQ=WEEKLY;BYDAY=SA,SU' }),
  }
})
check('parses weekdays Sunday-first', JSON.stringify(eng.parse) === '["MO","WE"]', JSON.stringify(eng.parse))
check('accepts Google RRULE: prefix', JSON.stringify(eng.google) === '["MO"]')
check('rejects anything but weekly-on-days', eng.rejMonthly === null && eng.rejInterval === null && eng.rejDup === null)
check('formats Sunday-first', eng.fmt === 'FREQ=WEEKLY;BYDAY=SU,MO,FR', eng.fmt)
check('no days = no repeat', eng.fmtNone === '')
check('repeat day today -> today', eng.nextToday === '2026-10-16', eng.nextToday)
check('next Monday', eng.nextMon === '2026-10-19', eng.nextMon)
check('past start date -> next Saturday', eng.pastStart === '2026-10-17', eng.pastStart)
check('future start date -> first Wednesday on/after it', eng.futureStart === '2026-11-04', eng.futureStart)
check('non-repeating keeps its date', eng.plain === '2026-01-01')
check('describe', eng.dEvery === 'Every Monday, Wednesday' && eng.dDay === 'Every day' && eng.dWeekday === 'Every weekday' && eng.dWeekend === 'Every weekend', [eng.dEvery, eng.dDay, eng.dWeekday, eng.dWeekend].join(' / '))

// ── App ─────────────────────────────────────────────────────────────────
const today = new Date(); today.setHours(0, 0, 0, 0)
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const todayCode = DAYS[today.getDay()]
const iso = off => { const d = new Date(today); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const g = { metadata: { title: 'rg', description: '', version: '1.0' }, structure: { life: { title: 'Life', children: {
  gym: { title: 'Gym', repeat: `FREQ=WEEKLY;BYDAY=${todayCode}`, children: {} },
  plain: { title: 'Plain', date: iso(5), children: {} },
  other: { title: 'Other', children: {} },
} } } }
await ctx.addInitScript(g => { if (!sessionStorage.getItem('s')) { localStorage.clear(); localStorage.setItem('offline_graphs', '["rg"]'); localStorage.setItem('offline_graph_rg', JSON.stringify(g)); localStorage.setItem('active-depth', '3'); sessionStorage.setItem('s', '1') } }, g)
const q = await ctx.newPage(); q.on('pageerror', e => errors.push(e.message))
const stored = () => q.evaluate(() => JSON.parse(localStorage.getItem('offline_graph_rg')).structure.life.children)

await q.goto(BASE + '/g/rg'); await q.click('.search-panel-input'); await q.waitForSelector('.search-panel-tags')
const menu = await q.$$eval('.search-panel-tags .tag-pill', els => els.map(e => e.textContent.trim()))
check('menu: routine 1, undated Gym counts as Today', menu.includes('routine 1') && menu.includes('Today 1'), JSON.stringify(menu))
await q.locator('.search-panel-tags .tag-pill', { hasText: /^routine / }).click()
await q.waitForSelector('.results')
check('routine search lists Gym', (await q.$$eval('.results .item-title', els => els.map(e => (e.childNodes[0]?.textContent ?? '').trim()))).join() === 'Gym')

await q.goto(BASE + '/g/rg'); await q.waitForSelector('.item-title')
const gymBadge = q.locator('.item-title', { hasText: /^Gym/ }).locator('.item-due')
check('Gym badge shows Today ↻', (await gymBadge.textContent()).trim() === 'Today ↻', await gymBadge.textContent())
check('Gym badge tooltip', (await gymBadge.getAttribute('title') ?? '').startsWith('Every '), await gymBadge.getAttribute('title'))

// Editor: pick Mon + Wed on an item with no date
const openEditor = async (title) => {
  await q.locator('.item-title', { hasText: new RegExp('^' + title) }).click({ modifiers: ['Shift'], position: { x: 4, y: 6 } })
  await q.waitForSelector('.inline-edit')
}
await openEditor('Other')
await q.locator('.inline-tool', { hasText: 'Repeat' }).click()
await q.locator('.repeat-day[title="Wednesday"]').click()
await q.locator('.repeat-day[title="Monday"]').click()
await shot(q, 'rp-days.png')
await q.locator('.inline-edit-title').press('Enter')
await q.waitForTimeout(400)
let s = await stored()
check('saves Mon+Wed without a date', s.other.repeat === 'FREQ=WEEKLY;BYDAY=MO,WE' && s.other.date === undefined, JSON.stringify(s.other))
check('undated repeating item gets a badge', await q.locator('.item-title', { hasText: /^Other/ }).locator('.item-due').count() === 1)

// Unpick all days -> no repeat
await openEditor('Other')
check('editor reopens with days shown', await q.locator('.repeat-day.active').count() === 2)
await q.locator('.repeat-day[title="Monday"]').click()
await q.locator('.repeat-day[title="Wednesday"]').click()
await q.locator('.inline-edit-title').press('Enter')
await q.waitForTimeout(400)
s = await stored()
check('unpicking all days stops repeating', s.other.repeat === undefined, JSON.stringify(s.other))

// Dated item + repeat, then clear the date: repeat stays
await openEditor('Plain')
await q.locator('.inline-tool', { hasText: 'Repeat' }).click()
await q.locator('.repeat-day[title="Friday"]').click()
await q.locator('.inline-edit-title').press('Enter')
await q.waitForTimeout(400)
s = await stored()
check('dated item keeps date and gains repeat', s.plain.date === iso(5) && s.plain.repeat === 'FREQ=WEEKLY;BYDAY=FR', JSON.stringify(s.plain))

// Text format round trip
const rt = await q.evaluate(async () => {
  const m = await import('/src/api/localClient.ts')
  const text = await m.fetchStructureText('rg')
  const parsed = Object.values(m.parseStructureText(text))[0].children
  return { gym: text.split('\n').find(l => l.includes('Gym')), plain: text.split('\n').find(l => l.includes('Plain')), pGym: parsed.gym, pPlain: parsed.plain,
    bad: Object.values(m.parseStructureText('# X (FREQ=MONTHLY;BYDAY=3FR)'))[0] }
})
check('text: undated repeat', rt.gym === `## Gym (FREQ=WEEKLY;BYDAY=${todayCode})`, rt.gym)
check('text: date + repeat', rt.plain === `## Plain (${iso(5)} FREQ=WEEKLY;BYDAY=FR)`, rt.plain)
check('parse restores both', rt.pGym.repeat === `FREQ=WEEKLY;BYDAY=${todayCode}` && rt.pGym.title === 'Gym' && rt.pPlain.date === iso(5) && rt.pPlain.repeat === 'FREQ=WEEKLY;BYDAY=FR', JSON.stringify([rt.pGym, rt.pPlain]))
check('unsupported rule stays in the title', rt.bad.title === 'X (FREQ=MONTHLY;BYDAY=3FR)' && !rt.bad.repeat, JSON.stringify(rt.bad))

check('no page errors', !errors.length, errors.join(' | '))
await done(b)
