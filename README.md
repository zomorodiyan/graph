# Knowledge Graph

A personal knowledge graph editor that runs entirely in your browser — no server, no subscription, no cost.

**[Open the app →](https://zomorodiyan.github.io/graph/)**

---

## What it does

Organize anything as a hierarchy of named nodes. Each node can have a description, a progress value, and a due date. Navigate by drilling down through levels, or jump straight from a filtered view of all overdue or blocked items.

## Sync (optional)

Your data lives in your browser. To back it up or use it across devices, connect a GitHub account:

1. Generate a token at [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=gist&description=Knowledge+Graph+Sync) — tick **gist** only
2. Click the **↻** button in the app and paste the token
3. That's it — your graphs sync to a private Gist only you can see

Same token on any device → same data. No account creation, no third-party service.

## Free

| Thing | Cost |
|-------|------|
| App hosting | GitHub Pages — free |
| Data storage | GitHub Gist — free |
| Sync | GitHub API — free |

## Tech

React + TypeScript, deployed as a PWA to GitHub Pages via GitHub Actions on every push to `offline`.
