// GitHub Gist API client for offline sync.
// Each user has one private Gist: one .txt file per graph + one _meta.json.
// Auth: GitHub personal access token scoped to `gist` only.

const GITHUB_API = 'https://api.github.com'

export const PAT_KEY     = 'gist_pat'
export const GIST_ID_KEY = 'gist_id'
export const META_FILE   = '_graph_meta.json'

export interface GistGraphMeta {
  display_name: string
  description:  string
  icon:         string
  modified_at:  string
}

export function getPAT():    string { return localStorage.getItem(PAT_KEY)     ?? '' }
export function getGistId(): string { return localStorage.getItem(GIST_ID_KEY) ?? '' }

export function savePAT(token: string) {
  const t = token.trim()
  if (t) localStorage.setItem(PAT_KEY, t)
  else   localStorage.removeItem(PAT_KEY)
}

export function saveGistId(id: string) {
  const t = id.trim()
  if (t) localStorage.setItem(GIST_ID_KEY, t)
  else   localStorage.removeItem(GIST_ID_KEY)
}

function ghHeaders(pat: string): Record<string, string> {
  return {
    'Authorization':  `token ${pat}`,
    'Accept':         'application/vnd.github+json',
    'Content-Type':   'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function ghFetch(pat: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: { ...ghHeaders(pat), ...(init?.headers ?? {}) },
  })
}

async function ghError(res: Response, fallback: string): Promise<never> {
  try {
    const json = await res.json()
    throw new Error(json.message ?? fallback)
  } catch (e) {
    if (e instanceof Error && e.message !== fallback) throw e
    throw new Error(`${fallback} (HTTP ${res.status})`)
  }
}

export const GIST_DESCRIPTION = 'Knowledge Graph Data'

// Find the existing knowledge-graph Gist or create a new one.
// Searches all user Gists so a second device auto-reconnects.
export async function findOrCreateGist(pat: string): Promise<string> {
  const stored = getGistId()
  if (stored) return stored

  // Search existing gists for one we already created
  const res = await ghFetch(pat, '/gists?per_page=100')
  if (!res.ok) await ghError(res, 'Failed to list gists')
  const list: Array<{ id: string; description: string }> = await res.json()
  const found = list.find(g => g.description === GIST_DESCRIPTION)
  if (found) {
    saveGistId(found.id)
    return found.id
  }

  // Nothing found — create a fresh one
  const createRes = await ghFetch(pat, '/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: { [META_FILE]: { content: '{}' } },
    }),
  })
  if (!createRes.ok) await ghError(createRes, 'Failed to create gist')
  const data = await createRes.json()
  saveGistId(data.id as string)
  return data.id as string
}

export interface GistFile {
  content?:   string
  truncated?: boolean
  raw_url?:   string
}

export interface GistData {
  id:         string
  files:      Record<string, GistFile>
  updated_at: string
}

// Fetch all files from a Gist. For truncated files, fetches raw content.
export async function fetchGist(pat: string, gistId: string): Promise<GistData> {
  const res = await ghFetch(pat, `/gists/${gistId}`)
  if (!res.ok) await ghError(res, 'Failed to fetch gist')
  const data: GistData = await res.json()

  // Fetch truncated files individually via raw_url
  await Promise.all(
    Object.entries(data.files).map(async ([name, file]) => {
      if (file.truncated && file.raw_url) {
        const raw = await fetch(file.raw_url)
        if (raw.ok) data.files[name].content = await raw.text()
      }
    })
  )

  return data
}

// PATCH a Gist: pass null for a filename to delete it
export async function patchGist(
  pat: string,
  gistId: string,
  files: Record<string, { content: string } | null>,
): Promise<void> {
  const res = await ghFetch(pat, `/gists/${gistId}`, {
    method: 'PATCH',
    body: JSON.stringify({ files }),
  })
  if (!res.ok) await ghError(res, 'Failed to update gist')
}
