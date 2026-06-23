// Finds all "Knowledge Graph Data" gists, keeps the one with the most content,
// deletes the rest. Run with:
//   node scripts/cleanup-gists.mjs <YOUR_GITHUB_PAT>

const [,, pat] = process.argv
if (!pat) { console.error('Usage: node scripts/cleanup-gists.mjs <PAT>'); process.exit(1) }

const DESCRIPTION = 'Knowledge Graph Data'
const API = 'https://api.github.com'
const headers = {
  Authorization: `token ${pat}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers, ...init.headers } })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub ${res.status}: ${body}`)
  }
  return res.status === 204 ? null : res.json()
}

// List all gists (handles pagination up to 10 pages)
async function listAllGists() {
  const all = []
  for (let page = 1; page <= 10; page++) {
    const batch = await api(`/gists?per_page=100&page=${page}`)
    all.push(...batch)
    if (batch.length < 100) break
  }
  return all
}

const all = await listAllGists()
const ours = all.filter(g => g.description === DESCRIPTION)

if (ours.length === 0) {
  console.log('No "Knowledge Graph Data" gists found.')
  process.exit(0)
}

console.log(`Found ${ours.length} gist(s) with description "${DESCRIPTION}":\n`)

// Score each gist: prefer the one with the most files and largest content
const scored = await Promise.all(ours.map(async (g) => {
  const detail = await api(`/gists/${g.id}`)
  const files = Object.entries(detail.files)
  const totalSize = files.reduce((sum, [, f]) => sum + (f.size ?? 0), 0)
  const graphFiles = files.filter(([name]) => name.endsWith('.txt')).length
  console.log(`  ${g.id} — ${files.length} files, ${graphFiles} graph(s), ${totalSize} bytes, updated ${g.updated_at}`)
  return { id: g.id, score: totalSize * 10 + graphFiles, updated_at: g.updated_at, detail }
}))

// Pick winner: highest score, tie-break by most recent update
scored.sort((a, b) => b.score - a.score || new Date(b.updated_at) - new Date(a.updated_at))
const [winner, ...losers] = scored

console.log(`\nKeeping: ${winner.id}`)

if (losers.length === 0) {
  console.log('No duplicates to delete.')
  process.exit(0)
}

console.log(`Deleting ${losers.length} duplicate(s)...`)
for (const loser of losers) {
  await api(`/gists/${loser.id}`, { method: 'DELETE' })
  console.log(`  Deleted ${loser.id}`)
}

console.log(`\nDone. Winning gist ID: ${winner.id}`)
console.log(`\nRun this in your browser console to set it as the active gist:`)
console.log(`  localStorage.setItem('gist_id', '${winner.id}')`)
