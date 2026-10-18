// Graph page editing: rename, right-click selection with the toolbar's
// add/edit/delete, select + copy/delete, and drag to reorder or nest.
import { BASE, check, done, launch, seed, titles } from './helpers.mjs'

const gv = {
  alpha: { title: 'Alpha', children: { a1: { title: 'A1', children: {} } } },
  beta: { title: 'Beta', children: { b1: { title: 'B1', children: {} } } },
  gamma: { title: 'Gamma', children: {} },
  delta: { title: 'Delta', children: {} },
}

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
await seed(ctx, { gv }, { 'active-depth': '3' })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))
p.on('dialog', d => d.accept())
const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('offline_graph_gv')).structure)
const title = re => p.locator('.item-title', { hasText: re }).first()
const level1 = async () => p.$$eval('.items-grid .section-wrapper > .section .layer1 .item-title', els => els.map(e => (e.childNodes[0]?.textContent ?? '').trim()))

await p.goto(BASE + '/g/gv')
await p.waitForSelector('.item-title')
check('renders level 1 in order', (await level1()).join() === 'Alpha,Beta,Gamma,Delta', (await level1()).join())

// Rename (Shift+click opens the editor)
await title(/^Gamma/).click({ modifiers: ['Shift'], position: { x: 4, y: 6 } })
await p.waitForSelector('.inline-edit-title')
await p.fill('.inline-edit-title', 'Gamma Ray')
await p.locator('.inline-edit-title').press('Enter')
await p.waitForTimeout(400)
let s = await stored()
check('rename saves under a new key', s.gamma_ray?.title === 'Gamma Ray' && !s.gamma, Object.keys(s).join())
check('rename shows immediately', (await level1()).includes('Gamma Ray'))

// Right-click selects (no menu); the toolbar then acts on the selection
const rightClick = async re => { await title(re).click({ button: 'right', position: { x: 4, y: 6 } }); await p.waitForTimeout(200) }
await rightClick(/^Delta/)
check('right-click selects the item', (await p.locator('.user-highlighted').count()) === 1)
check('no pop-up menu', (await p.locator('.context-menu').count()) === 0)
await p.click('.graph-header-buttons .addsub-toggle')
await p.waitForSelector('.inline-edit-title')
await p.fill('.inline-edit-title', 'D1')
await p.locator('.inline-edit-title').press('Enter')
await p.waitForTimeout(400)
s = await stored()
check('add sub-item from the toolbar', s.delta.children?.d1?.title === 'D1', JSON.stringify(s.delta))
check('new child shows', (await titles(p)).includes('D1'))
await rightClick(/^Delta/)
check('right-click again deselects', (await p.locator('.user-highlighted').count()) === 0)

// Edit button for a single selection (desktop toolbar)
await rightClick(/^D1/)
await p.click('.graph-header-buttons .edit-toggle')
await p.waitForSelector('.inline-edit-title')
await p.fill('.inline-edit-title', 'D One')
await p.locator('.inline-edit-title').press('Enter')
await p.waitForTimeout(400)
s = await stored()
check('toolbar Edit renames the selected item', s.delta.children?.d_one?.title === 'D One', JSON.stringify(s.delta))
check('editing ends the selection', (await p.locator('.user-highlighted').count()) === 0)

// Delete the selection from the toolbar
await rightClick(/^D One/)
await p.locator('.graph-header-buttons .delete-toggle').click()
await p.waitForTimeout(400)
s = await stored()
check('toolbar Delete removes the selected item', !s.delta.children?.d_one && !(await titles(p)).includes('D One'), JSON.stringify(s.delta))

// Select two items, copy them, delete them
await title(/^A1/).click({ modifiers: ['Control'], position: { x: 4, y: 6 } })
await title(/^B1/).click({ modifiers: ['Control'], position: { x: 4, y: 6 } })
await p.click('.graph-header-buttons .copy-toggle')
await p.waitForTimeout(200)
// Windows' clipboard turns \n into \r\n.
const clip = (await p.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')
check('copy selection as text', clip === '# A1\n\n# B1', JSON.stringify(clip))
await p.click('.graph-header-buttons .delete-toggle')
await p.waitForTimeout(400)
s = await stored()
check('delete selection', !s.alpha.children?.a1 && !s.beta.children?.b1)
check('deleted items disappear', !(await titles(p)).some(t => t === 'A1' || t === 'B1'))

// Drag Delta (level 1) onto the top edge of Alpha: reorder before it
const wrapper = re => p.locator('.items-grid .section-wrapper', { has: p.locator('.layer1 .item-title', { hasText: re }) })
const dragTo = async (from, to, targetFrac) => {
  const src = await wrapper(from).boundingBox()
  const dst = await wrapper(to).boundingBox()
  await wrapper(from).dragTo(wrapper(to), {
    sourcePosition: { x: src.width - 4, y: src.height - 3 },
    targetPosition: { x: dst.width / 2, y: dst.height * targetFrac },
  })
  await p.waitForTimeout(500)
}
await dragTo(/^Delta/, /^Alpha/, 0.04)
check('drag to top edge reorders', (await level1()).join() === 'Delta,Alpha,Beta,Gamma Ray', (await level1()).join())
s = await stored()
check('reorder saved', Object.keys(s).join() === 'delta,alpha,beta,gamma_ray', Object.keys(s).join())

// Drag Gamma Ray into the middle of Beta: nest under it
await dragTo(/^Gamma Ray/, /^Beta/, 0.5)
s = await stored()
check('drag to middle nests', s.beta.children?.gamma_ray?.title === 'Gamma Ray' && !s.gamma_ray, JSON.stringify(Object.keys(s)))
check('nested item shows under Beta', !(await level1()).includes('Gamma Ray') && (await titles(p)).includes('Gamma Ray'))

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
