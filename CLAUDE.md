# Graph App

Personal knowledge graph editor. Hierarchical graphs (body/finance/mind/time) rendered as interactive web UIs. Syncs to GCS and optionally Firestore.

## Stack

- **Backend**: Python 3.11, FastAPI, Uvicorn — port 8000 dev / 8080 prod
- **Frontend**: React 18 + TypeScript + Vite — port 3000 dev, proxies `/api` → backend
- **Deploy**: Docker → Google Cloud Run (`graph-api`, project `zomograph-personal`, `us-central1`)

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Old HTML version — abandoned |
| `dev` | Active — server-backed React/TS app |
| `offline` | Incomplete PWA attempt on top of `dev` (see below) |

Work on `dev`. The `offline` branch diverged at `06aa2ab`.

## Key Files

| Path | Role |
|------|------|
| `src/api.py` | All FastAPI endpoints + limits |
| `src/file_utils.py` | Indented-text parser, ID injection |
| `src/structures_manager.py` | Multi-graph CRUD |
| `src/firestore_graph_store.py` | Firestore backend |
| `src/gcs_graph_store.py` | GCS sync |
| `frontend/src/pages/GraphView.tsx` | Main editor — CRUD, drag-drop, virtual sections |
| `frontend/src/pages/StructuresView.tsx` | Graph list/management |
| `frontend/src/components/Section.tsx` | 3-level hierarchical renderer |
| `frontend/src/api/client.ts` | Server-backed API client |
| `frontend/src/api/localClient.ts` | Offline localStorage client |
| `frontend/src/hooks/useGraph.ts` | React Query + optimistic updates |
| `frontend/vite.config.ts` | `@api` alias switches client at build time |
| `config.example.yaml` | Config template (copy → `config.yaml`, git-ignored) |

## Data Format

Graphs stored as indented plain text (`structures/*.txt`):

```
metadata
  title: My Graph

structure
  body
    progress: 50
    context: Physical health
    habit
      evening
        due: 2026-01-15
```

Items auto-get `id` (dot-path), `title` (from key), and `children` dict at parse time — stripped before save.

## Backend Modes (`GRAPH_STATE_BACKEND`)

| Value | Behavior |
|-------|----------|
| `file` | Default. Local files + optional GCS sync |
| `dual` | Write both file + Firestore; read from Firestore with file fallback |
| `firestore` | Firestore only |

Set via env var or `config.yaml → graph_state.backend`.

## Limits (`src/api.py`)

1000 items/graph · depth 20 · 200 children · 50 graphs · 100-char names · 10K-char context

## Development

```bash
# Backend
python run.py

# Frontend (separate terminal)
cd frontend && npm run dev
```

## Deploy (Cloud Run)

```bash
gcloud builds submit --tag gcr.io/zomograph-personal/graph-api && \
gcloud run deploy graph-api \
  --image gcr.io/zomograph-personal/graph-api \
  --platform managed --region us-central1 \
  --allow-unauthenticated --port 8080 \
  --memory 512Mi --cpu 1 \
  --set-env-vars "PRODUCTION=true,GRAPH_STATE_BACKEND=dual,FIRESTORE_GRAPH_COLLECTION=graph_state" \
  --set-secrets "config.yaml=graph-config:latest,token.pickle=graph-token:latest"
```

Secrets: `config.yaml` ← `graph-config:latest`, `token.pickle` ← `graph-token:latest`  
Health check: `GET /health`

## Firestore Schema

Collection: `{FIRESTORE_GRAPH_COLLECTION}/{graph_name}`  
Sub-collections: `nodes`, `edges`, `mutations` (append-only), `snapshots` (optional)  
Concurrency: `x-base-version` header (optimistic lock), `x-actor-id` (mutation stamp)

## Offline Sync (GitHub Gist)

In `VITE_OFFLINE_MODE=true` builds a **Sync** button (↕) appears at the bottom-left of the graphs page. Each user brings their own GitHub personal access token (`gist` scope only — no repo access).

**Storage layout:** one private Gist per user. Each graph = `{name}.txt` (serialised structure body). Metadata (display_name, description, icon, modified_at) stored in `_graph_meta.json`.

**Sync logic:** compares local `modified_at` vs `_graph_meta.json` timestamp per graph → pushes if local is newer, pulls if remote is newer. All pushes batched in a single `PATCH /gists/{id}` call.

**First-time setup:** click ↕ → enter GitHub token → Gist ID is auto-created and saved to localStorage.

Key files:
| Path | Role |
|------|------|
| `frontend/src/api/gistClient.ts` | GitHub Gist API (create, fetch, patch) |
| `frontend/src/hooks/useSyncManager.ts` | Sync state, PAT/Gist config, `syncAll()` |
| `localClient.ts` → `serializeStructure`, `parseStructureText`, `importStructure` | Serialise for push / parse + overwrite for pull |

## Offline PWA (Incomplete — `offline` branch)

What exists: `localClient.ts` mirrors full API surface via localStorage, `vite-plugin-pwa` service worker, `build:offline` npm script, GitHub Actions deploy to GitHub Pages.

**Known bug**: `main.tsx` hardcodes `BrowserRouter basename="/graph/"` for all builds — breaks routing outside GitHub Pages. Fix: make `basename` conditional on `VITE_BASE_URL`/`VITE_OFFLINE_MODE`.
