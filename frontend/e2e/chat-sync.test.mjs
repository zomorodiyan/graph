// The chat draft survives a reload; the sync button shows inside a graph
// only while that graph has unsynced changes. Never contacts GitHub.
import { BASE, check, done, launch, seed } from './helpers.mjs'

const now = new Date()
const hourAgo = new Date(now.getTime() - 3600e3).toISOString()
const meta = (name, modified) => JSON.stringify({ name, display_name: name, path: `structures/${name}.txt`, modified_at: modified, size: 0, description: '', version: '1.0', icon: '📊' })

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
await ctx.route('https://api.github.com/**', r => r.abort())
await seed(ctx, {
  synced: { a: { title: 'A', children: {} } },
  fresh: { f: { title: 'F', children: {} } },
}, {
  // An older version's localStorage token — moved into the session on first read.
  gist_pat: 'ghp_test',
  offline_meta_synced: meta('synced', hourAgo),
  offline_meta_fresh: meta('fresh', hourAgo),
  sync_status_synced: JSON.stringify({ direction: 'none', lastSync: now.toISOString() }),
})
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))
const syncButtons = () => p.locator('.agent-chat-input-row .sync-toggle').count()

// Draft
await p.goto(BASE + '/')
await p.waitForSelector('.agent-chat-input-row textarea')
await p.fill('.agent-chat-input-row textarea', 'remember this\nsecond line')
await p.reload()
await p.waitForSelector('.agent-chat-input-row textarea')
check('draft survives a reload', (await p.inputValue('.agent-chat-input-row textarea')) === 'remember this\nsecond line')
await p.fill('.agent-chat-input-row textarea', 'my key is sk-ant-abc123')
await p.reload()
await p.waitForSelector('.agent-chat-input-row textarea')
check('key-like text is not saved', (await p.inputValue('.agent-chat-input-row textarea')) === '' && (await p.evaluate(() => localStorage.getItem('agent-chat-draft'))) === null)

// Sync button
check('home always has the sync button', (await syncButtons()) === 1)
await p.goto(BASE + '/g/synced')
await p.waitForSelector('.item-title')
check('synced graph: no sync button', (await syncButtons()) === 0)
await p.locator('.item-title', { hasText: /^A/ }).click({ modifiers: ['Shift'], position: { x: 4, y: 6 } })
await p.waitForSelector('.inline-edit-title')
await p.fill('.inline-edit-title', 'A changed')
await p.locator('.inline-edit-title').press('Enter')
await p.waitForTimeout(400)
check('after an edit: sync button appears', (await syncButtons()) === 1)
await p.goto(BASE + '/g/fresh')
await p.waitForSelector('.item-title')
check('never-synced graph: sync button shown', (await syncButtons()) === 1)

// Without a token there's nothing to sync to from inside a graph
const noPat = await browser.newContext({ viewport: { width: 1200, height: 900 } })
await seed(noPat, { fresh: { f: { title: 'F', children: {} } } })
const q = await noPat.newPage()
q.on('pageerror', e => errors.push(e.message))
await q.goto(BASE + '/g/fresh')
await q.waitForSelector('.item-title')
check('no token: no sync button inside a graph', (await q.locator('.agent-chat-input-row .sync-toggle').count()) === 0)

check('no page errors', !errors.length, errors.join(' | '))
await done(browser)
