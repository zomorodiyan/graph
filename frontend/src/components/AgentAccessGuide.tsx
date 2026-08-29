import { useEffect, useState } from 'react'

interface AgentAccessGuideProps {
  onClose: () => void
}

const SETUP_COMMAND = `New-Item -ItemType Directory -Force -Path "$HOME\\.graph-agent" | Out-Null; @{ pat = (Get-Clipboard).Trim() } | ConvertTo-Json | Set-Content -Encoding utf8 "$HOME\\.graph-agent\\config.json"; if (Test-Path "$HOME\\.graph-agent\\config.json") { "Saved OK" } else { "FAILED" }`

const SKILL_MD = `---
name: graph
description: Read and edit the user's Knowledge Graph app data (personal graphs synced via a private GitHub Gist) — list graphs, view one as Markdown, or edit/add items in it
---

# Knowledge Graph access

The user has a personal graph app (github.com/zomorodiyan/graph) whose data lives
in one private GitHub Gist — one \`<name>.txt\` file per graph, plus \`_graph_meta.json\`.
Each \`.txt\` file's content is real Markdown, the same text the app's "Raw view" shows.
This skill reads/writes that Gist directly via \`scripts/gist.mjs\`, using the same
token the user pastes into the app.

## One-time setup (only if \`~/.graph-agent/config.json\` doesn't exist yet)

Tell the user to run this themselves in their own terminal (not through you), so
the token never passes through the chat transcript. See the setup command above.

## Commands

Run with Node from anywhere (no install step, no network except GitHub's API):

\`\`\`
node ~/.claude/skills/graph/scripts/gist.mjs list
node ~/.claude/skills/graph/scripts/gist.mjs read <name>
node ~/.claude/skills/graph/scripts/gist.mjs write <name> <file>   # or pipe via stdin with "-"
\`\`\`

\`write\` replaces the whole graph's content — always \`read\` first, edit the text,
then \`write\` the full result back (there's no partial/line-level edit endpoint).

## Markdown format (mirrors \`frontend/src/api/localClient.ts\` in the graph repo)

- Heading depth = nesting depth: \`#\` top level, \`##\` its children, \`###\` grandchildren, etc.
- Heading line: \`#+ Title (date)? tags?\`
  - a trailing \`(YYYY-MM-DD)\` = the item's date, e.g. \`## Ship v2 (2026-07-15)\`
  - trailing \`#word\` tokens = tags, e.g. \`### Server #infra #urgent\`
  - both can appear together, date before tags: \`## Ship v2 (2026-07-15) #launch\`
- Non-heading lines right after a heading = free-text context/description for that item,
  verbatim (blank lines inside preserved).
- Item keys (used internally, not shown here) are derived from the title — don't worry
  about them, only edit the visible Markdown.

## Caveats

- **No merge.** Sync is last-write-wins on \`modified_at\`. If the user edits the same
  graph in the app around the same time you write it, whichever write lands last on
  the Gist wins and the other is silently lost. Mention this if timing seems close.
- \`write\` always stamps \`modified_at = now\`, so the app will pull your change on its
  next sync.
- If \`list\`/\`read\`/\`write\` errors with "No gist found", the user hasn't connected sync
  in the app yet — that has to happen once from the app itself.
`

const GIST_MJS = `#!/usr/bin/env node
// Reads/writes the same GitHub Gist the Knowledge Graph app syncs to.
// Config (PAT + cached gist id) lives in ~/.graph-agent/config.json — created
// by the user directly (see SKILL.md), never written by this script from a
// value passed on argv/stdin, so the token never has to pass through chat.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CONFIG_PATH = join(homedir(), '.graph-agent', 'config.json')
const GITHUB_API = 'https://api.github.com'
const GIST_DESCRIPTION = 'Knowledge Graph Data'
const META_FILE = '_graph_meta.json'

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(\`No config at \${CONFIG_PATH}. Create it with { "pat": "<your gist-scoped token>" } first — see SKILL.md.\`)
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8').replace(/^\\uFEFF/, ''))
}

function saveConfig(cfg) {
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}

function headers(pat) {
  return {
    Authorization: \`token \${pat}\`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function ghFetch(pat, path, init) {
  const res = await fetch(\`\${GITHUB_API}\${path}\`, { ...init, headers: { ...headers(pat), ...(init?.headers ?? {}) } })
  if (!res.ok) {
    let msg = \`HTTP \${res.status}\`
    try { msg = (await res.json()).message ?? msg } catch {}
    throw new Error(msg)
  }
  return res
}

async function resolveGistId(cfg) {
  if (cfg.gistId) return cfg.gistId
  const res = await ghFetch(cfg.pat, '/gists?per_page=100')
  const list = await res.json()
  const found = list.find(g => g.description === GIST_DESCRIPTION)
  if (!found) throw new Error(\`No gist found with description "\${GIST_DESCRIPTION}" — open the app once and connect sync first.\`)
  cfg.gistId = found.id
  saveConfig(cfg)
  return cfg.gistId
}

async function fetchGist(cfg) {
  const gistId = await resolveGistId(cfg)
  const res = await ghFetch(cfg.pat, \`/gists/\${gistId}\`)
  const data = await res.json()
  await Promise.all(Object.entries(data.files).map(async ([name, file]) => {
    if (file.truncated && file.raw_url) {
      const raw = await fetch(file.raw_url)
      if (raw.ok) data.files[name].content = await raw.text()
    }
  }))
  return { gistId, data }
}

async function patchGist(cfg, gistId, files) {
  await ghFetch(cfg.pat, \`/gists/\${gistId}\`, { method: 'PATCH', body: JSON.stringify({ files }) })
}

function graphNames(files) {
  return Object.keys(files).filter(f => f.endsWith('.txt')).map(f => f.slice(0, -4))
}

async function cmdList(cfg) {
  const { data } = await fetchGist(cfg)
  const meta = JSON.parse(data.files[META_FILE]?.content ?? '{}')
  for (const name of graphNames(data.files)) {
    const m = meta[name]
    console.log(\`\${name}\${m ? \`  — \${m.display_name} (modified \${m.modified_at})\` : ''}\`)
  }
}

async function cmdRead(cfg, name) {
  const { data } = await fetchGist(cfg)
  const file = data.files[\`\${name}.txt\`]
  if (!file) throw new Error(\`No graph named "\${name}" in the gist.\`)
  process.stdout.write(file.content ?? '')
}

async function cmdWrite(cfg, name, content) {
  const { gistId, data } = await fetchGist(cfg)
  const exists = graphNames(data.files).includes(name)
  const meta = JSON.parse(data.files[META_FILE]?.content ?? '{}')
  const now = new Date().toISOString()
  meta[name] = {
    display_name: meta[name]?.display_name ?? name,
    description: meta[name]?.description ?? '',
    icon: meta[name]?.icon ?? '',
    modified_at: now,
  }
  await patchGist(cfg, gistId, {
    [\`\${name}.txt\`]: { content: content.trim() + '\\n' },
    [META_FILE]: { content: JSON.stringify(meta, null, 2) },
  })
  console.log(\`\${exists ? 'Updated' : 'Created'} "\${name}", stamped modified_at=\${now}\`)
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const cfg = loadConfig()

  if (cmd === 'list') return cmdList(cfg)
  if (cmd === 'read') return cmdRead(cfg, rest[0])
  if (cmd === 'write') {
    const name = rest[0]
    const content = rest[1] && rest[1] !== '-' ? readFileSync(rest[1], 'utf8') : readFileSync(0, 'utf8')
    return cmdWrite(cfg, name, content)
  }
  console.error('Usage:\\n  node gist.mjs list\\n  node gist.mjs read <name>\\n  node gist.mjs write <name> [<file>|-]')
  process.exit(1)
}

main().catch(err => { console.error('Error:', err.message); process.exit(1) })
`

const BLOCKS: { id: string; label: string; content: string; download?: string }[] = [
  { id: 'setup', label: 'One-time setup — run in your own terminal (copy your token to the clipboard first)', content: SETUP_COMMAND },
  { id: 'skill', label: 'Save as ~/.claude/skills/graph/SKILL.md', content: SKILL_MD, download: 'SKILL.md' },
  { id: 'script', label: 'Save as ~/.claude/skills/graph/scripts/gist.mjs', content: GIST_MJS, download: 'gist.mjs' },
]

function AgentAccessGuide({ onClose }: AgentAccessGuideProps) {
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleCopy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedBlock(id)
      setTimeout(() => setCopiedBlock(null), 2000)
    } catch { /* clipboard unavailable — no-op */ }
  }

  const handleDownload = (filename: string, content: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal agent-guide-modal" onClick={e => e.stopPropagation()}>
        <h2>Let an agent edit your graphs</h2>
        <p className="agent-guide-intro">
          Any AI coding agent (Claude Code, etc.) can read and edit these same graphs
          directly through your Gist — same token you already use for sync, no new account.
        </p>

        {BLOCKS.map(block => (
          <div className="agent-guide-block" key={block.id}>
            <div className="agent-guide-block-header">
              <span>{block.label}</span>
              {block.download ? (
                <button
                  className="agent-guide-download-btn"
                  onClick={() => handleDownload(block.download!, block.content)}
                >
                  Download
                </button>
              ) : (
                <button
                  className="agent-guide-copy-btn"
                  onClick={() => handleCopy(block.id, block.content)}
                  title="Copy to clipboard"
                >
                  {copiedBlock === block.id ? <span className="copy-check">✔</span> : <span className="copy-handle" />}
                </button>
              )}
            </div>
            {!block.download && <pre className="agent-guide-code">{block.content}</pre>}
          </div>
        ))}

        <p className="agent-guide-caveat">
          Sync is last-write-wins — editing the same graph in the app and via an agent
          around the same time can overwrite one of the two changes.
        </p>
      </div>
    </div>
  )
}

export default AgentAccessGuide
