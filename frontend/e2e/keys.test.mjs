// Keys: session-only storage (with migration off localStorage) and the
// password-manager-friendly Keys panel. Never contacts GitHub or Anthropic.
import { BASE, check, done, launch, shot, seed } from './helpers.mjs'

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
await seed(ctx, { kg: { a: { title: 'A', children: {} } } })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))
const storage = page => page.evaluate(() => ({
  local: [localStorage.getItem('anthropic_api_key'), localStorage.getItem('gist_pat')],
  session: [sessionStorage.getItem('anthropic_api_key'), sessionStorage.getItem('gist_pat')],
}))

// An older version left both keys in localStorage
await p.goto(BASE + '/')
await p.evaluate(() => { localStorage.setItem('anthropic_api_key', 'sk-ant-legacy'); localStorage.setItem('gist_pat', 'ghp_legacy') })
await p.reload()
await p.waitForSelector('.keys-toggle')
let st = await storage(p)
check('legacy keys removed from localStorage', st.local[0] === null && st.local[1] === null, JSON.stringify(st))
check('legacy keys kept for this session', st.session[0] === 'sk-ant-legacy' && st.session[1] === 'ghp_legacy', JSON.stringify(st))
check('key button shows keys are set', await p.isVisible('.keys-toggle.active'))

// The panel: two separate login forms a password manager can save
await p.click('.keys-toggle')
await p.waitForSelector('.keys-panel')
const forms = await p.$$eval('.keys-panel form', fs => fs.map(f => {
  const user = f.querySelector('input[autocomplete="username"]')
  const pw = f.querySelectorAll('input[type="password"]')
  return { user: user?.value, pwCount: pw.length, pwAuto: pw[0]?.getAttribute('autocomplete'), pwValue: pw[0]?.value, submit: !!f.querySelector('button[type="submit"]') }
}))
check('two login forms', forms.length === 2, JSON.stringify(forms))
check('each has a fixed username, one password field and a submit button',
  forms.every(f => f.pwCount === 1 && f.pwAuto === 'current-password' && f.submit) &&
  forms[0].user === 'Anthropic API key' && forms[1].user === 'GitHub token (gist)', JSON.stringify(forms))
check('current keys are filled in (so they can be saved to the password manager)', forms[0].pwValue === 'sk-ant-legacy' && forms[1].pwValue === 'ghp_legacy')
await shot(p, 'keys-panel.png')

// Forget the API key
await p.locator('.key-form', { hasText: 'Anthropic' }).getByRole('button', { name: 'Forget' }).click()
st = await storage(p)
check('Forget clears the API key', st.session[0] === null && st.local[0] === null, JSON.stringify(st))
await p.getByRole('button', { name: 'Close' }).click()

// Sending a chat with no API key opens the panel instead, keeping the draft
await p.fill('.agent-chat-input-row textarea', 'hello agent')
await p.press('.agent-chat-input-row textarea', 'Enter')
await p.waitForSelector('.keys-panel')
check('send without a key opens the Keys panel', await p.isVisible('.keys-panel'))
const focused = await p.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Anthropic API key', null, { timeout: 2000 }).then(() => true, () => false)
check('API key field is focused', focused)
check('the draft is kept', (await p.inputValue('.agent-chat-input-row textarea')) === 'hello agent')
await p.keyboard.type('sk-ant-new')
await p.keyboard.press('Enter')
await p.waitForTimeout(200)
st = await storage(p)
check('saving stores the key for the session only', st.session[0] === 'sk-ant-new' && st.local[0] === null, JSON.stringify(st))
check('panel closes after saving', !(await p.isVisible('.keys-panel')))
check('the chat box is a plain chat box', (await p.getAttribute('.agent-chat-input-row textarea', 'placeholder')) === 'Message AI…')

// A new tab (like reopening the app) starts with no keys
const p2 = await ctx.newPage()
p2.on('pageerror', e => errors.push(e.message))
await p2.goto(BASE + '/')
await p2.waitForSelector('.keys-toggle')
const st2 = await storage(p2)
check('new session has no keys', st2.session.every(v => v === null) && st2.local.every(v => v === null), JSON.stringify(st2))
check('key button shows no keys', !(await p2.isVisible('.keys-toggle.active')))

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
