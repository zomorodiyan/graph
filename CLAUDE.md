# Graph App — Project Context

## What This Is

A personal knowledge graph editor. Users maintain YAML-based hierarchical graphs (body/finance/mind/time etc.) that render as interactive web UIs. Data can sync to Google Cloud Storage and Firestore.

## Tech Stack

- **Backend**: Python 3.11, FastAPI, Uvicorn (port 8080 in prod, 8000 in dev)
- **Frontend**: React 18 + TypeScript + Vite (proxied to backend in dev, built into container in prod)
- **Storage**: File system (YAML/text), GCS for sync, Firestore for real-time multi-device
- **Deploy**: Docker + Google Cloud Run (`graph-api` in project `zomograph-personal`, region `us-central1`)

## Key Files

| Path | Role |
|------|------|
| `src/api.py` | FastAPI app — all endpoints (1849 lines) |
| `src/firestore_graph_store.py` | Firestore persistence layer |
| `src/gcs_graph_store.py` | GCS sync layer |
| `src/file_utils.py` | YAML parsing, ID injection |
| `src/structures_manager.py` | Multi-graph management |
| `frontend/src/api/client.ts` | TypeScript API client |
| `frontend/src/hooks/useGraph.ts` | React Query hooks w/ optimistic updates |
| `deploy-cloud-run.sh` | Deploy script (Linux/Mac) |
| `deploy-cloud-run.ps1` | Deploy script (Windows) |
| `config.example.yaml` | Config template (copy → `config.yaml`, git-ignored) |
| `doc/FIRESTORE_BACKEND.md` | Firestore modes, env vars, API endpoints |
| `CLOUD_DEPLOY.md` | Full Cloud Run setup guide |

## Structure File Format

Graphs are stored as indentation-based text (`structure.txt`, `structures/*.txt`):

```
metadata
  title: My Graph

structure
  body
    progress: 50
    context: Physical health
    habit
      evening
```

Items auto-get `id` (from path), `title` (from key), children dict.

## Backend Modes (`GRAPH_STATE_BACKEND`)

| Value | Behavior |
|-------|----------|
| `file` | Default. YAML files + GCS sync only |
| `dual` | Write to file AND Firestore; read from Firestore with file fallback |
| `firestore` | Firestore as sole backend |

Set via env var or `config.yaml → graph_state.backend`.

## Cloud Run Deployment

**Service**: `graph-api` | **Project**: `zomograph-personal` | **Region**: `us-central1`

**Image**: `gcr.io/zomograph-personal/graph-api`

**Secrets mounted**:
- `config.yaml` ← Secret Manager `graph-config:latest`
- `token.pickle` ← Secret Manager `graph-token:latest`

**Key env vars**:
- `PRODUCTION=true` — serves React frontend
- `GRAPH_STATE_BACKEND` — `file|dual|firestore`
- `FIRESTORE_GRAPH_COLLECTION` — root Firestore collection (default: `graph_state`)
- `GRAPH_BUCKET_NAME` — GCS bucket override

**Full deploy command** (builds image via Cloud Build then deploys):
```bash
gcloud builds submit --tag gcr.io/zomograph-personal/graph-api && \
gcloud run deploy graph-api \
  --image gcr.io/zomograph-personal/graph-api \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --set-env-vars "PRODUCTION=true,GRAPH_STATE_BACKEND=dual,FIRESTORE_GRAPH_COLLECTION=graph_state" \
  --set-secrets "config.yaml=graph-config:latest,token.pickle=graph-token:latest"
```

**Health check**: `GET /health` → returns `graph_state_backend` and `firestore_available`.

## Development

```bash
# Backend only
python run.py

# Frontend (separate terminal)
cd frontend && npm run dev   # Vite on :3000, proxies /api → :8000
```

## Firestore Schema (per graph)

Collection: `{FIRESTORE_GRAPH_COLLECTION}/{graph_name}`

Sub-collections: `nodes`, `edges`, `mutations` (append-only log), `snapshots` (optional).

New API endpoints for real-time sync:
- `GET /api/graphs/{name}/state-version`
- `GET /api/graphs/{name}/mutations?since_version=0&limit=200`

Concurrency headers: `x-base-version` (optimistic lock), `x-actor-id` (stamp mutations).

## Multi-Graph System

- Default graph: `structure.txt`
- Extra graphs: `structures/{name}.txt`
- Default API: `/api/items/{path}`
- Graph-specific: `/api/graphs/{name}/items/{path}`

## Limits (api.py:34-42)

Max 1000 items, 20 nesting depth, 200 children per item, 50 graphs, 100 char names, 10K char context.
