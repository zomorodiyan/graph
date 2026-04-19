# Firestore Graph State Backend

This project now supports three graph state modes controlled by `GRAPH_STATE_BACKEND`:

- `file`: current behavior (`structure.txt` + `structures/*.txt` with GCS sync)
- `dual`: write to both file/GCS and Firestore, read from Firestore with file fallback
- `firestore`: use Firestore as primary read/write backend

## Environment Variables

- `GRAPH_STATE_BACKEND`: `file` | `dual` | `firestore` (default: `file`)
- `FIRESTORE_GRAPH_COLLECTION`: root collection name (default: `graph_state`)
- `FIRESTORE_WRITE_SNAPSHOTS`: `1/true` to store full snapshots per version (default: off)
- `GOOGLE_APPLICATION_CREDENTIALS`: credentials path for local runs (Cloud Run uses service account)

## Firestore Layout

`{root_collection}/{graph_name}` document stores graph metadata/version.

Subcollections:
- `nodes`: node entities (`path`, `key`, `parent_path`, `order`, fields)
- `edges`: edge entities (`parent_path`, `child_path`, `order`)
- `mutations`: append-only mutation log with monotonic `version`
- `snapshots` (optional): full graph snapshots per version

## New API Endpoints

- `GET /api/graphs/{graph_name}/state-version`
- `GET /api/graphs/{graph_name}/mutations?since_version=0&limit=200`

## Concurrency Support

Mutation endpoints accept optional headers:
- `x-base-version`: optimistic concurrency version check
- `x-actor-id`: actor identifier to stamp mutation log entries

If the version does not match, API returns `409`.

## Recommended Rollout

1. Deploy with `GRAPH_STATE_BACKEND=dual`.
2. Validate reads/writes and mutation logs in Firestore.
3. Update clients to consume `state-version` + `mutations` for live sync.
4. Switch to `GRAPH_STATE_BACKEND=firestore` after validation.
