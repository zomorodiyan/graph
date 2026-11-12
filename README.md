# Graph Memory

A personal graph of notes, plans and lists that runs entirely in your browser — no server, no subscription, no cost.

**[Open the app →](https://zomorodiyan.github.io/graph/)**

---

## What it does

Organize anything as a hierarchy of named nodes. Each node can have a note, a date, and tags. Navigate by drilling down through levels.

## AI chat (optional)

The chat panel can read, edit and add items in the open graph. Pick what answers it from the Keys panel:

- **Claude** with your own Anthropic API key — Opus, Sonnet or Haiku, plus an effort level, so cheap tasks don't cost Opus money. The panel shows a running cost estimate.
- **Other / free** — any OpenAI-compatible endpoint the browser can call directly: OpenRouter's free models, Groq's or Google Gemini's free tiers, or a local Ollama (e.g. Qwen). Nothing is routed through a server.

**Voice mode:** tap the microphone to talk instead of typing. It listens, sends what you said, reads the reply aloud and listens again, until you tap it off. Uses the browser's built-in speech recognition and synthesis (Chrome, Edge, Safari), so it's free.

**Preferred lengths:** each graph can set a preferred title and note length (edit the graph on the home page → Lengths). Agents, in-app or external, aim for those without dropping information.

## Sync (optional)

Your data lives in your browser. To back it up or use it across devices, connect with a GitHub token:

1. Generate a token at [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=gist&description=Graph+Memory+Sync) — tick **gist** only
2. Click the **↻** button in the app and paste the token
3. That's it — your graphs sync to a private Gist only you can see

Same token on any device → same data. Save your token somewhere safe — you'll need to paste it on each new browser or device to connect them to the same graphs. No account creation, no third-party service.

## Free

| Thing | Cost |
|-------|------|
| App hosting | GitHub Pages — free |
| Data storage | GitHub Gist — free |
| Sync | GitHub API — free |

## Tech

React + TypeScript, with React Query for data and React Router for navigation. Deployed as a PWA to GitHub Pages via GitHub Actions on every push to `main`.
