# Graph Gist format samples

These two files mirror exactly what lives in the private Gist the app syncs
to (see `~/.claude/skills/graph/SKILL.md` and its `scripts/gist.mjs`):

- `sample.txt` — one graph's content, keyed by name (`sample` here). Real
  Markdown, byte-identical to what the app's Raw view / copy-handle produces
  and what `gist.mjs write` expects on stdin/file. Demonstrates every format
  feature in one place:
  - nesting depth via `#`/`##`/`###`
  - a date `(YYYY-MM-DD)` — `Pay Off Loan`, `Marathon Training`
  - tags `#word` — `Pay Off Loan #debt`, `Marathon Training #race`, `Cross Training #recurring`
  - value tags — money `#$950`, hours `#3h` / `#0.5h` (a number then `h`). An item's
    own value is what it costs; a parent with its own value (`Fixed Costs #$1200`,
    `Marathon Training #8h`) is the budget its children spend from, and a parent
    without one (`Investments`) adds its children up. The app's budget panel shows a
    page's items as shares of a pool this way (see "Value tags and budgets" in
    SKILL.md).
  - body-part tags — `#legs`, `#calves`, `#hamstrings`, `#core`, `#hips`,
    `#lower-back`: the app's body view places these items on a human figure (see
    "Body-part tags" in SKILL.md for the full list of names).
  - free-text context lines under a heading (e.g. under `Rent`, `Marathon Training`),
    verbatim — the dollar amounts there are just prose; the structured amount is the tag
- `_graph_meta.json` — the sidecar `_graph_meta.json` file from the same Gist,
  keyed by the same graph name, holding display metadata (never structure data),
  including the optional `title_length` / `note_length` preferences (characters)
  an agent writing into the graph keeps to without dropping information, and the
  optional top-level budgets `hours_budget` / `money_budget` (plain numbers) — the
  pool the app's budget panel measures the root items against. Budgets are set
  from the app; `gist.mjs list` prints them.

Regenerated/verified against the real parser with:
`parseStructureText(sample.txt)` → `serializeStructure(...)` round-trips
byte-for-byte back to `sample.txt`. If you change the Markdown format in
`localClient.ts`, re-run that check and update `sample.txt` so it stays a
faithful reference for rebuilding the `graph` skill.
