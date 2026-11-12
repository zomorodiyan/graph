// Voice mode: the mic button listens (fake SpeechRecognition here), sends the
// transcript, reads the reply aloud (fake speechSynthesis) and listens again;
// tapping it again stops. The Claude API is mocked. Never contacts a real API.
import { BASE, check, done, launch, seed } from './helpers.mjs'

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
// A legacy localStorage key is moved into the session on load — the easiest
// way to start "ready" without touching the Keys panel.
await seed(ctx, { kg: { a: { title: 'A', children: {} } } }, { anthropic_api_key: 'sk-ant-test' })
await ctx.addInitScript(() => {
  const log = { starts: 0, spoken: [], cancelled: 0 }
  window.__voice = log
  class FakeRecognition {
    constructor() { log.rec = this }
    start() {
      log.starts++
      this.started = true
    }
    stop() { this.onend?.() }
    abort() { this.onend?.() }
    // Test hook: deliver a transcript as the browser would.
    __say(text) {
      this.onresult?.({ results: [{ 0: { transcript: text }, isFinal: false, length: 1 }] })
      this.onresult?.({ results: [{ 0: { transcript: text }, isFinal: true, length: 1 }] })
      this.onend?.()
    }
  }
  // The real ones are accessors on the window prototype — plain assignment
  // is silently ignored, so define own properties over them.
  Object.defineProperty(window, 'SpeechRecognition', { value: FakeRecognition, configurable: true })
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class { constructor(text) { this.text = text } }, configurable: true })
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      speak(u) {
        log.spoken.push(u.text)
        setTimeout(() => u.onend?.(), 20)
      },
      cancel() { log.cancelled++ },
    },
    configurable: true,
  })
})
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))

let apiCalls = 0
let lastSystem = ''
await ctx.route('https://api.anthropic.com/**', async route => {
  apiCalls++
  lastSystem = route.request().postDataJSON().system
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
  const body =
    ev('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 1 } } }) +
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }) +
    ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'You have one item, called A.' } }) +
    ev('content_block_stop', { index: 0 }) +
    ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } }) +
    ev('message_stop', {})
  await route.fulfill({ status: 200, contentType: 'text/event-stream', body })
})

await p.goto(BASE + '/g/kg')
await p.waitForSelector('.agent-chat-mic')
check('mic button shown when the browser supports speech', await p.isVisible('.agent-chat-mic'))

await p.click('.agent-chat-mic')
await p.waitForSelector('.agent-chat-mic.listening')
check('tapping the mic starts listening', (await p.evaluate(() => window.__voice.starts)) === 1)
check('placeholder says so', (await p.getAttribute('.agent-chat-input-row textarea', 'placeholder')) === 'Listening…')

await p.evaluate(() => window.__voice.rec.__say('what do I have'))
await p.waitForSelector('.agent-chat-message.assistant:has-text("You have one item")', { timeout: 10000 })
check('transcript was sent as the user message', await p.isVisible('.agent-chat-message.user:has-text("what do I have")'))
check('one API call', apiCalls === 1, String(apiCalls))
check('the model is told it is being spoken to', /read aloud/.test(lastSystem))
check('the model is told the length preferences', /titles about 40 characters/.test(lastSystem))
await p.waitForFunction(() => window.__voice.starts === 2, null, { timeout: 5000 })
// (The empty utterance is the deliberate tap-time unlock for iOS, see toggleVoiceMode.)
const log = await p.evaluate(() => ({ spoken: window.__voice.spoken.filter(Boolean), starts: window.__voice.starts }))
check('the reply was read aloud', log.spoken.join(' ') === 'You have one item, called A.', JSON.stringify(log.spoken))
check('listening again after speaking', log.starts === 2 && await p.isVisible('.agent-chat-mic.listening'))
const spend = await p.evaluate(() => JSON.parse(localStorage.getItem('agent_spend')))
check('Claude spend estimated from usage', spend.inputTokens === 1000 && spend.outputTokens === 10 && spend.usd > 0.004 && spend.usd < 0.005, JSON.stringify(spend))

// Silence a few times in a row ends voice mode by itself
await p.evaluate(() => window.__voice.rec.__say(''))
await p.waitForFunction(() => window.__voice.starts === 3)
await p.evaluate(() => window.__voice.rec.__say(''))
await p.waitForFunction(() => window.__voice.starts === 4)
await p.evaluate(() => window.__voice.rec.__say(''))
await p.waitForSelector('.agent-chat-mic:not(.active)')
check('voice mode ends after repeated silence', !(await p.isVisible('.agent-chat-mic.active')) && (await p.evaluate(() => window.__voice.starts)) === 4)
check('API not called for silence', apiCalls === 1)

// Tapping again turns it on, and tapping once more turns it off
await p.click('.agent-chat-mic')
await p.waitForSelector('.agent-chat-mic.listening')
await p.click('.agent-chat-mic')
await p.waitForSelector('.agent-chat-mic:not(.active)')
check('tap again stops listening', !(await p.isVisible('.agent-chat-mic.listening')))
check('placeholder back to normal', (await p.getAttribute('.agent-chat-input-row textarea', 'placeholder')) === 'Message AI…')

// Without speech support there's no mic button
const plain = await browser.newContext({ viewport: { width: 1200, height: 900 } })
await seed(plain, { kg: { a: { title: 'A', children: {} } } })
await plain.addInitScript(() => {
  Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true })
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true })
})
const q = await plain.newPage()
q.on('pageerror', e => errors.push(e.message))
await q.goto(BASE + '/g/kg')
await q.waitForSelector('.agent-chat-send')
check('no mic button without speech recognition', (await q.locator('.agent-chat-mic').count()) === 0)

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
