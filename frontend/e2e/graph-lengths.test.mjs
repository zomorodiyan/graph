// Per-graph preferred title/note lengths: set from the graph editor's
// Lengths button, saved in the graph's metadata (synced like its name and
// description), blank fields mean the app default. Never contacts GitHub.
import { BASE, check, done, launch, seed, shot } from './helpers.mjs'

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
await seed(ctx, { kg: { a: { title: 'A', children: {} } } })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))
const meta = () => p.evaluate(() => JSON.parse(localStorage.getItem('offline_meta_kg') ?? '{}'))

await p.goto(BASE + '/')
await p.waitForSelector('.graph-card')
// The card's left edit zone opens the graph editor (the "+" card has one too, so pick by name)
const editZone = () => p.locator('.graph-card', { hasText: /^Kg/i }).locator('.card-edit-zone')
await editZone().click()
await p.waitForSelector('.graph-inline-edit')
check('editor has a Lengths button', await p.isVisible('.inline-tool:has-text("Lengths")'))
check('lengths are hidden until asked for', !(await p.isVisible('.graph-lengths')))
await p.locator('.inline-tool', { hasText: 'Lengths' }).click()
await p.waitForSelector('.graph-lengths')
const placeholders = await p.$$eval('.graph-lengths input', els => els.map(e => e.placeholder))
check('fields show the defaults as placeholders', placeholders[0] === '40' && placeholders[1] === '200', JSON.stringify(placeholders))
await shot(p, 'graph-lengths.png')
await p.fill('[aria-label="Preferred title length in characters"]', '30')
await p.fill('[aria-label="Preferred note length in characters"]', '150')
await p.press('[aria-label="Preferred note length in characters"]', 'Enter')
await p.waitForSelector('.graph-inline-edit', { state: 'detached' })
let m = await meta()
check('lengths saved to the graph metadata', m.title_length === 30 && m.note_length === 150, JSON.stringify(m))

// Reopen: the values come back and the Lengths section is open
await p.reload()
await p.waitForSelector('.graph-card')
await editZone().click()
await p.waitForSelector('.graph-inline-edit')
check('Lengths shown when set', await p.isVisible('.graph-lengths'))
check('values come back', (await p.inputValue('[aria-label="Preferred title length in characters"]')) === '30'
  && (await p.inputValue('[aria-label="Preferred note length in characters"]')) === '150')

// Clearing a field returns it to the default (not stored); out-of-range is clamped
await p.fill('[aria-label="Preferred title length in characters"]', '')
await p.fill('[aria-label="Preferred note length in characters"]', '99999')
await p.press('[aria-label="Preferred note length in characters"]', 'Enter')
await p.waitForSelector('.graph-inline-edit', { state: 'detached' })
m = await meta()
check('blank means default (not stored)', m.title_length === undefined, JSON.stringify(m))
check('huge value is clamped', m.note_length === 2000, JSON.stringify(m))
check('name and description untouched', m.display_name === 'Kg' || m.display_name === 'kg', m.display_name)

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
