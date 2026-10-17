---
name: verify
description: Build, launch, and drive the graph frontend to verify changes end-to-end
---

# Verifying the graph frontend

React + Vite PWA in `frontend/`. All data is client-side (localStorage via
`src/api/localClient.ts`); no backend needed. Gist sync (`useSyncManager`) is the
only network surface — it needs a GitHub PAT, so verify its serializer/parser
through local surfaces instead (see below).

## Build / launch

```bash
cd frontend && npm run build     # tsc + vite build
cd frontend && npm run dev       # dev server on http://localhost:5173
cd frontend && npm run test:e2e  # browser test suite (starts its own server on :5179)
```

## Drive (headless browser)

`frontend/e2e/` holds the browser tests (`*.test.mjs`, shared helpers in
`helpers.mjs`: `seed`, `check`, `shot`, `isoFromToday`, `titles`). They use
`playwright-core` (a devDependency) with system Chrome:
`chromium.launch({ channel: 'chrome', headless: true })`. Add a new
`*.test.mjs` there for new behavior; `SCREENSHOTS=<dir>` saves screenshots.

Seed data before app load with `context.addInitScript`:
- `offline_graphs` = `'["testg"]'`
- `offline_graph_testg` = `{"metadata":{...},"structure":{...}}` (items: `{title, children: {}, context?, date?, tags?}`)

Then drive `http://localhost:5173/g/testg`.

Clipboard flows (Paste cards, copy handles) need
`context.grantPermissions(['clipboard-read','clipboard-write'], { origin })`.

## Useful selectors / surfaces

- Item cards: `.section-wrapper .section`; levels: `.layer1`, `.layer2`, `.layer3-item`; titles: `.item-title`
- "+" sub-item chips: `.layer2.add-sub`, `.layer3-item.add-sub`
- Inline editor: `.inline-edit`, title input `.inline-edit-title`
- Bottom bar: `.depth-toggle` (3/2/R), `.ctx-toggle`, `.theme-toggle`; breadcrumb `.breadcrumb`
- Raw view: `.section-raw` (click the `R` depth button)
- Text format round-trip: paste via the `Paste` card exercises `parseMarkdownStructure`;
  the copy handle on the menu page (`/`, `.copy-handle`) exercises `serializeStructure`
- Verify state via `localStorage.getItem('offline_graph_<name>')` in `page.evaluate`

## Gotchas

- Item keys are normalized titles (`"New Item"` → `new_item`); createItem suffixes
  duplicates (`new_item_2`).
- Clicking an item title only navigates when the item has children.
