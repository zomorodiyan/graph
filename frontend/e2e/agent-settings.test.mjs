// Model settings: the Keys panel's provider/model picker persists, the
// "Other / free" provider talks to an OpenAI-compatible endpoint (mocked
// here) including a tool-call round trip that edits the graph, and spend
// is tracked. Never contacts a real API.
import { BASE, check, done, launch, seed } from './helpers.mjs'

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
await seed(ctx, { kg: { a: { title: 'A', children: {} } } })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))

// A fake OpenRouter: first call asks for add_item, second call answers.
const requests = []
const sse = chunks => chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'
await ctx.route('https://openrouter.ai/api/v1/**', async route => {
  const req = route.request()
  if (req.url().endsWith('/models')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'some/paid-model' }, { id: 'test/free-model:free' }] }) })
  }
  const body = req.postDataJSON()
  requests.push({ ...body, auth: req.headers().authorization })
  const hasToolResult = body.messages.some(m => m.role === 'tool')
  const chunks = hasToolResult
    ? [
      { choices: [{ delta: { content: 'Added ' }, finish_reason: null }] },
      { choices: [{ delta: { content: 'Buy milk.' }, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 120, completion_tokens: 6, cost: 0 } },
    ]
    : [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'add_item', arguments: '{"parent_path":"", ' } }] }, finish_reason: null }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"name":"Buy milk"}' } }] }, finish_reason: 'tool_calls' }] },
      { choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0 } },
    ]
  await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(chunks) })
})

await p.goto(BASE + '/')
await p.waitForSelector('.keys-toggle')
await p.click('.keys-toggle')
await p.waitForSelector('.keys-panel')
check('provider defaults to Anthropic', (await p.inputValue('[aria-label="AI provider"]')) === 'anthropic')
check('model defaults to Opus 5.5', (await p.inputValue('[aria-label="Claude model"]')) === 'claude-opus-5-5')
const modelOptions = await p.$$eval('[aria-label="Claude model"] option', os => os.map(o => o.textContent))
check('model options show prices', modelOptions.length === 3 && modelOptions.every(t => /\$.* in \/ \$.* out/.test(t)), JSON.stringify(modelOptions))
check('Anthropic key form is shown', await p.isVisible('input[value="Anthropic API key"]'))

// Pick Haiku + low effort; it persists across a reload
await p.selectOption('[aria-label="Claude model"]', 'claude-haiku-5-5')
await p.selectOption('[aria-label="Thinking effort"]', 'low')
await p.reload()
await p.waitForSelector('.keys-toggle')
await p.click('.keys-toggle')
await p.waitForSelector('.keys-panel')
check('model choice persists', (await p.inputValue('[aria-label="Claude model"]')) === 'claude-haiku-5-5')
check('effort persists', (await p.inputValue('[aria-label="Thinking effort"]')) === 'low')

// Switch to the free/other provider
await p.selectOption('[aria-label="AI provider"]', 'openai')
check('OpenRouter is the first preset', (await p.inputValue('[aria-label="Model service"]')) === 'openrouter')
check('base URL filled from the preset', (await p.inputValue('[aria-label="Endpoint base URL"]')) === 'https://openrouter.ai/api/v1')
check('Anthropic key form replaced by the other key form', !(await p.isVisible('input[value="Anthropic API key"]')) && await p.isVisible('input[value="Other AI key"]'))
await p.click('button:has-text("Load models")')
await p.waitForSelector('text=2 models')
const listed = await p.$$eval('#agent-model-list option', os => os.map(o => o.value))
check('models listed, free first', listed[0] === 'test/free-model:free' && listed[1] === 'some/paid-model', JSON.stringify(listed))
await p.fill('[aria-label="Model id"]', 'test/free-model:free')
await p.fill('[aria-label="Other AI key"]', 'sk-or-test')
await p.press('[aria-label="Other AI key"]', 'Enter')
await p.waitForSelector('.keys-panel', { state: 'detached' })
check('other key kept for the session only', (await p.evaluate(() => [sessionStorage.getItem('openai_compat_key'), localStorage.getItem('openai_compat_key')])).join() === 'sk-or-test,')
check('key button shows the provider is ready', await p.isVisible('.keys-toggle.active'))

// Chat through it inside a graph: the tool call adds an item
await p.goto(BASE + '/g/kg')
await p.waitForSelector('.item-title')
await p.fill('.agent-chat-input-row textarea', 'add buy milk')
await p.press('.agent-chat-input-row textarea', 'Enter')
await p.waitForSelector('.agent-chat-message.assistant:has-text("Added Buy milk.")', { timeout: 10000 })
check('two round trips to the endpoint', requests.length === 2, String(requests.length))
check('request carries the tools and system prompt', requests[0].tools?.some(t => t.function.name === 'add_item') && requests[0].messages[0].role === 'system' && /Length preferences/.test(requests[0].messages[0].content))
check('tool result sent back', requests[1].messages.some(m => m.role === 'tool' && /Created "Buy milk"/.test(m.content)))
check('bearer key sent', requests.every(r => r.auth === 'Bearer sk-or-test'), JSON.stringify(requests.map(r => r.auth)))
const added = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('offline_graph_kg')).structure))
check('item added to the graph', added.includes('buy_milk'), JSON.stringify(added))
await p.waitForSelector('.item-title:has-text("Buy milk")')
const spend = await p.evaluate(() => JSON.parse(localStorage.getItem('agent_spend')))
check('spend tracked from reported usage', spend.inputTokens === 220 && spend.outputTokens === 26 && spend.usd === 0 && spend.unpriced === false, JSON.stringify(spend))

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
