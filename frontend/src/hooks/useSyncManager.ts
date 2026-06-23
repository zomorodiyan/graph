import { useState, useCallback } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { Structure } from '../api/client'
import {
  fetchGraphs as fetchLocalGraphs,
  fetchStructure as fetchLocalStructure,
  importStructure,
  serializeStructure,
  parseStructureText,
} from '../api/localClient'
import {
  getPAT, getGistId, savePAT, saveGistId,
  createGist, fetchGist, patchGist,
  META_FILE,
} from '../api/gistClient'
import type { GistGraphMeta } from '../api/gistClient'

export type SyncDirection = 'push' | 'pull' | 'none'

export interface GraphSyncStatus {
  direction: SyncDirection
  lastSync:  string
  error?:    string
}

const STATUS_KEY = (name: string) => `sync_status_${name}`

export function loadSyncStatus(name: string): GraphSyncStatus | null {
  try {
    const raw = localStorage.getItem(STATUS_KEY(name))
    return raw ? (JSON.parse(raw) as GraphSyncStatus) : null
  } catch { return null }
}

function persistStatus(name: string, status: GraphSyncStatus) {
  localStorage.setItem(STATUS_KEY(name), JSON.stringify(status))
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSyncManager(queryClient: QueryClient) {
  const [isSyncing,    setIsSyncing]    = useState(false)
  const [syncError,    setSyncError]    = useState<string | null>(null)
  const [pat,          setPATState]     = useState(getPAT)
  const [gistId,       setGistIdState]  = useState(getGistId)
  const [syncStatuses, setSyncStatuses] = useState<Record<string, GraphSyncStatus>>(() => {
    try {
      const names: string[] = JSON.parse(localStorage.getItem('offline_graphs') ?? '["default"]')
      const result: Record<string, GraphSyncStatus> = {}
      for (const n of names) {
        const s = loadSyncStatus(n)
        if (s) result[n] = s
      }
      return result
    } catch { return {} }
  })

  const configure = useCallback((newPAT: string, newGistId: string) => {
    savePAT(newPAT)
    saveGistId(newGistId)
    setPATState(newPAT.trim())
    setGistIdState(newGistId.trim())
    setSyncError(null)
  }, [])

  const syncAll = useCallback(async (): Promise<{ error: string | null }> => {
    const token = getPAT()
    if (!token) {
      const msg = 'No GitHub token configured.'
      setSyncError(msg)
      return { error: msg, pushed: 0, pulled: 0 }
    }

    setIsSyncing(true)
    setSyncError(null)

    try {
      // Auto-create Gist on first sync
      let gid = getGistId()
      if (!gid) {
        gid = await createGist(token)
        saveGistId(gid)
        setGistIdState(gid)
      }

      // Fetch Gist and local graphs in parallel
      const [gistData, localGraphs] = await Promise.all([
        fetchGist(token, gid),
        fetchLocalGraphs(),
      ])

      const remoteMeta: Record<string, GistGraphMeta> = JSON.parse(
        gistData.files[META_FILE]?.content ?? '{}'
      )
      const localMap   = new Map(localGraphs.map(g => [g.name, g]))
      const remoteNames = new Set(
        Object.keys(gistData.files)
          .filter(f => f.endsWith('.txt'))
          .map(f => f.slice(0, -4))
      )
      const allNames = new Set([...localMap.keys(), ...remoteNames])

      const newStatuses: Record<string, GraphSyncStatus> = {}
      const errors: string[] = []

      // Collect files to push in one PATCH call
      const filesToPatch: Record<string, { content: string } | null> = {}
      const updatedMeta: Record<string, GistGraphMeta> = { ...remoteMeta }

      for (const name of allNames) {
        const local      = localMap.get(name)
        const remoteMeta_ = remoteMeta[name]
        const hasRemote  = remoteNames.has(name)

        let direction: SyncDirection = 'none'
        let error: string | undefined

        try {
          if (local && !hasRemote) {
            // Only local → push (skip if structure is empty)
            const s = await fetchLocalStructure(name)
            const content = serializeStructure(s.structure).trim()
            if (content) {
              filesToPatch[`${name}.txt`] = { content }
              updatedMeta[name] = metaFrom(local)
              direction = 'push'
            }
          } else if (!local && hasRemote) {
            // Only remote → pull
            const content = gistData.files[`${name}.txt`]?.content ?? ''
            await pullGraph(name, content, remoteMeta_, queryClient)
            direction = 'pull'
          } else if (local && hasRemote) {
            const lt = new Date(local.modified_at).getTime()
            const rt = remoteMeta_ ? new Date(remoteMeta_.modified_at).getTime() : 0

            if (lt > rt) {
              const s = await fetchLocalStructure(name)
              const content = serializeStructure(s.structure).trim()
              if (content) {
                filesToPatch[`${name}.txt`] = { content }
                updatedMeta[name] = metaFrom(local)
                direction = 'push'
              }
            } else if (rt > lt) {
              const content = gistData.files[`${name}.txt`]?.content ?? ''
              await pullGraph(name, content, remoteMeta_, queryClient)
              direction = 'pull'
            }
          }
        } catch (err) {
          error = (err as Error).message || String(err)
          console.error(`[sync] ${name}:`, err)
          errors.push(`${name}: ${error}`)
        }

        const status: GraphSyncStatus = { direction, lastSync: new Date().toISOString(), error }
        newStatuses[name] = status
        persistStatus(name, status)
      }

      // Single PATCH for all pushed graphs + updated meta
      if (Object.keys(filesToPatch).length > 0) {
        filesToPatch[META_FILE] = { content: JSON.stringify(updatedMeta, null, 2) }
        await patchGist(token, gid, filesToPatch)
      }

      setSyncStatuses(newStatuses)
      queryClient.invalidateQueries({ queryKey: ['graphs'] })

      const pushed = Object.values(newStatuses).filter(s => s.direction === 'push' && !s.error).length
      const pulled = Object.values(newStatuses).filter(s => s.direction === 'pull' && !s.error).length

      if (errors.length) {
        const msg = errors.join('; ')
        setSyncError(msg)
        return { error: msg, pushed, pulled }
      }
      return { error: null, pushed, pulled }
    } catch (err) {
      const msg = (err as Error).message || String(err)
      console.error('[sync] fatal:', err)
      setSyncError(msg)
      return { error: msg, pushed: 0, pulled: 0 }
    } finally {
      setIsSyncing(false)
    }
  }, [queryClient])

  return { isSyncing, syncError, pat, gistId, syncStatuses, configure, syncAll }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function metaFrom(g: { display_name: string; description: string; icon: string; modified_at: string }): GistGraphMeta {
  return { display_name: g.display_name, description: g.description, icon: g.icon, modified_at: g.modified_at }
}

async function pullGraph(
  name: string,
  content: string,
  meta: GistGraphMeta | undefined,
  queryClient: QueryClient,
) {
  const structure: Structure = {
    metadata: {
      title:       meta?.display_name ?? name,
      description: meta?.description  ?? '',
      version:     '1.0',
    },
    structure: parseStructureText(content),
  }
  await importStructure(name, structure, {
    display_name: meta?.display_name,
    description:  meta?.description,
    icon:         meta?.icon,
    modified_at:  meta?.modified_at,
  })
  queryClient.invalidateQueries({ queryKey: ['structure', name] })
}
