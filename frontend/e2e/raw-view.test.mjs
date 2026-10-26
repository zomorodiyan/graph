// Raw view (depth R) follows the note button: tap toggles notes (Default /
// Context), long-press switches to Minimal — titles only.
import { BASE, check, done, launch, seed } from './helpers.mjs'

const rv = {
  a: { title: 'Alpha', date: '2030-01-05', tags: ['proj'], context: 'alpha note', children: {
    b: { title: 'Beta', context: 'beta note', children: {} },
  } },
}

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
await seed(ctx, { rv }, { 'active-depth': '0' })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))
const raw = async () => (await p.textContent('.section-raw')).trim()
const nButton = '.graph-header-buttons .ctx-toggle'
const longPress = async sel => {
  await p.hover(sel)
  await p.mouse.down()
  await p.waitForTimeout(650)
  await p.mouse.up()
  await p.waitForTimeout(150)
}

await p.goto(BASE + '/g/rv')
await p.waitForSelector('.section-raw')
const full = '# Alpha (2030-01-05) #proj\nalpha note\n## Beta\nbeta note'
check('Context (default): notes shown', (await raw()) === full, JSON.stringify(await raw()))
check('N button on', await p.isVisible(nButton + '.active'))

await p.click(nButton)
await p.waitForTimeout(150)
check('tap: Default hides the notes, keeps dates and tags', (await raw()) === '# Alpha (2030-01-05) #proj\n## Beta', JSON.stringify(await raw()))
check('N button off', !(await p.isVisible(nButton + '.active')))
await p.click(nButton)
await p.waitForTimeout(150)
check('tap again: notes back', (await raw()) === full, JSON.stringify(await raw()))

await longPress(nButton)
check('long-press: Minimal shows titles only', (await raw()) === '# Alpha\n## Beta', JSON.stringify(await raw()))
check('N button marked minimal', await p.isVisible(nButton + '.minimal'))
await p.click(nButton)
await p.waitForTimeout(150)
check('tap leaves Minimal', (await raw()) === full, JSON.stringify(await raw()))

// Copy still gets the full text, whatever the view shows
await p.click(nButton)
const text = await p.evaluate(async () => (await import('/src/api/localClient.ts')).fetchStructureText('rv'))
check('stored text keeps notes', text.includes('alpha note') && text.includes('#proj'))

// Phone: the compose row's N button drives the raw view the same way
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await seed(phone, { rv }, { 'active-depth': '0' })
const m = await phone.newPage()
m.on('pageerror', e => errors.push(e.message))
await m.goto(BASE + '/g/rv')
await m.waitForSelector('.section-raw')
await m.tap('.agent-chat-input-row .ctx-toggle')
await m.waitForTimeout(150)
check('phone: N hides the notes in raw view', !(await m.textContent('.section-raw')).includes('alpha note'))
await m.tap('.agent-chat-input-row .ctx-toggle')
await m.waitForTimeout(150)
check('phone: N shows them again', (await m.textContent('.section-raw')).includes('alpha note'))

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
