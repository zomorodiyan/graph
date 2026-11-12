// The read-aloud button speaks what's on screen with labels (a, b; a1, a2;
// a1.1) following the view's depth and note settings, and the phone bar has
// the toolbar on one row and the message box on its own row below.
// speechSynthesis is faked; never contacts a real API.
import { BASE, check, done, launch, seed, shot } from './helpers.mjs'

const graph = {
  trip: {
    title: 'Plan the trip', context: 'Fly in May', children: {
      flights: { title: 'Book flights', children: { compare: { title: 'Compare prices', children: {} } } },
      hotel: { title: 'Hotel', date: '2026-03-05', children: {} },
    },
  },
  groceries: { title: 'Groceries', children: {} },
}
const fakes = () => {
  const log = { spoken: [], cancelled: 0, starts: 0 }
  window.__voice = log
  class FakeRecognition { start() { log.starts++ } stop() {} abort() {} }
  Object.defineProperty(window, 'SpeechRecognition', { value: FakeRecognition, configurable: true })
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class { constructor(text) { this.text = text } }, configurable: true })
  Object.defineProperty(window, 'speechSynthesis', {
    value: { speak(u) { log.spoken.push(u.text); setTimeout(() => u.onend?.(), 15) }, cancel() { log.cancelled++ } },
    configurable: true,
  })
}
const spoken = page => page.evaluate(() => window.__voice.spoken.filter(Boolean).join(' '))
const resetSpoken = page => page.evaluate(() => { window.__voice.spoken = [] })

const browser = await launch()
const errors = []

// Desktop, depth 2, notes on
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
// (The key makes the chat "ready", so the mic starts voice mode instead of opening the Keys panel.)
await seed(ctx, { kg: graph }, { 'active-depth': '2', 'active-view-mode': 'context', anthropic_api_key: 'sk-ant-test' })
await ctx.addInitScript(fakes)
const p = await ctx.newPage()
p.on('pageerror', e => errors.push(e.message))
await p.goto(BASE + '/g/kg')
await p.waitForSelector('.agent-chat-read')
await p.click('.agent-chat-read')
await p.waitForSelector('.agent-chat-read.active')
check('placeholder says it is reading', (await p.getAttribute('.agent-chat-input-row textarea', 'placeholder')) === 'Reading the view aloud…')
await p.waitForSelector('.agent-chat-read:not(.active)')
check('depth 2 with notes: top level, then each parent\'s children',
  (await spoken(p)) === '2 items here. a, Plan the trip. Note: Fly in May. b, Groceries. Under a, Plan the trip: a1, Book flights. a2, Hotel, March 5.',
  await spoken(p))

// Depth 3, notes off
await p.evaluate(() => { localStorage.setItem('active-depth', '3'); localStorage.setItem('active-view-mode', 'default') })
await p.reload()
await p.waitForSelector('.agent-chat-read')
await resetSpoken(p)
await p.click('.agent-chat-read')
await p.waitForSelector('.agent-chat-read.active')
await p.waitForSelector('.agent-chat-read:not(.active)')
check('depth 3 without notes adds the third level as a1.1',
  (await spoken(p)) === '2 items here. a, Plan the trip. b, Groceries. Under a, Plan the trip: a1, Book flights. a2, Hotel, March 5. Under a1, Book flights: a1.1, Compare prices.',
  await spoken(p))

// Inside an item, the view's own children are the top level
await p.goto(BASE + '/g/kg/trip')
await p.waitForSelector('.agent-chat-read')
await resetSpoken(p)
await p.click('.agent-chat-read')
await p.waitForSelector('.agent-chat-read:not(.active)')
check('inside an item: its children are a, b',
  (await spoken(p)) === '2 items here. a, Book flights. b, Hotel, March 5. Under a, Book flights: a1, Compare prices.',
  await spoken(p))

// Graphs list
await p.goto(BASE + '/')
await p.waitForSelector('.agent-chat-read')
await resetSpoken(p)
await p.click('.agent-chat-read')
await p.waitForSelector('.agent-chat-read:not(.active)')
check('graphs list is read too', (await spoken(p)) === 'One graph. a, Kg.', await spoken(p))

// Tapping again stops; starting voice mode also stops reading
await p.evaluate(() => { window.speechSynthesis.speak = u => { window.__voice.spoken.push(u.text) } }) // never ends on its own
await p.click('.agent-chat-read')
await p.waitForSelector('.agent-chat-read.active')
const before = await p.evaluate(() => window.__voice.cancelled)
await p.click('.agent-chat-read')
await p.waitForSelector('.agent-chat-read:not(.active)')
check('tap again cancels speech', (await p.evaluate(() => window.__voice.cancelled)) > before)
await p.click('.agent-chat-read')
await p.waitForSelector('.agent-chat-read.active')
await p.click('.agent-chat-mic')
await p.waitForSelector('.agent-chat-mic.listening')
check('starting voice mode stops reading', !(await p.isVisible('.agent-chat-read.active')))

// Phone: toolbar row above, message box on its own full-width row
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await seed(phone, { kg: graph })
await phone.addInitScript(fakes)
const q = await phone.newPage()
q.on('pageerror', e => errors.push(e.message))
await q.goto(BASE + '/g/kg')
await q.waitForSelector('.agent-chat-read')
await q.waitForTimeout(300)
const rects = await q.evaluate(() => {
  const r = sel => document.querySelector(sel).getBoundingClientRect()
  return { toolbar: r('.agent-chat-toolbar'), compose: r('.agent-chat-compose'), box: r('.agent-chat-input-row textarea'), bar: r('.agent-chat-input-row'), mic: r('.agent-chat-mic'), read: r('.agent-chat-read') }
})
check('message box is on its own row below the buttons', rects.toolbar.bottom <= rects.compose.top + 1, JSON.stringify(rects))
check('message box spans most of the width', rects.box.width > 390 * 0.7, String(rects.box.width))
check('voice buttons sit at the right of the top row', rects.read.left > 390 / 2 && rects.mic.left > rects.read.left)
check('bar height matches the space pages reserve', Math.abs(rects.bar.height - 6.1 * 16) < 10, String(rects.bar.height))
check('no horizontal overflow', !(await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)))
await shot(q, 'phone-two-row-bar.png')

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
