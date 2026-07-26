# Graph Gist format samples

These two files mirror exactly what lives in the private Gist the app syncs
to (see `~/.claude/skills/graph/SKILL.md` and its `scripts/gist.mjs`):

- `sample.txt` — one graph's content, keyed by name (`sample` here). Real
  Markdown, byte-identical to what the app's Raw view / copy-handle produces
  and what `gist.mjs write` expects on stdin/file. Demonstrates every format
  feature in one place:
  - nesting depth via `#`/`##`/`###`
  - progress `(x/y)` — `Pay Off Loan`, `Marathon Training`
  - checkpoints (a due date is just a checkpoint where done===total) — both items above
  - cost, both symbol-prefixed (`$950`) and alphanumeric-suffixed (`3hr`)
  - a parent's own cost acting as a target against its children's summed
    cost (`Fixed Costs`, `Finances`) — see `sumValues`/`formatValueTotals`
    in `frontend/src/api/localClient.ts`
  - free-text context lines under a heading (e.g. under `Rent`, `Marathon Training`)
- `_graph_meta.json` — the sidecar `_graph_meta.json` file from the same Gist,
  keyed by the same graph name, holding display metadata (never structure data).

Regenerated/verified against the real parser with:
`parseStructureText(sample.txt)` → `serializeStructure(...)` round-trips
byte-for-byte back to `sample.txt`. If you change the Markdown format in
`localClient.ts`, re-run that check and update `sample.txt` so it stays a
faithful reference for rebuilding the `graph` skill.
