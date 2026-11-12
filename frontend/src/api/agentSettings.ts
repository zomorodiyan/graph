// Which model the in-app agent talks to, and what it has cost so far. Plain
// preferences (never secrets) live in localStorage like the theme; keys stay
// session-only via utils/secrets.ts.
//
// Two providers:
//  - 'anthropic': the Claude API through the official SDK (agentClient.ts),
//    with a model picker so cheap tasks can run on Haiku instead of Opus.
//  - 'openai': any OpenAI-compatible chat-completions endpoint
//    (openaiCompatClient.ts) — OpenRouter's free models, Groq's and Google
//    Gemini's free tiers, or a local Ollama — for running the agent at no
//    cost when the task doesn't need Claude.

import { readSecret, writeSecret } from '../utils/secrets'

export type Provider = 'anthropic' | 'openai'
export type Effort = '' | 'low' | 'medium' | 'high'

export interface AnthropicModel {
  id: string
  label: string
  // USD per million tokens (first-party API list prices, Nov 2026).
  inputPerM: number
  outputPerM: number
  // Whether the model supports the server-side refusal fallback chain
  // (Haiku 5.5 doesn't).
  fallback: boolean
}

export const ANTHROPIC_MODELS: AnthropicModel[] = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5 — best', inputPerM: 4, outputPerM: 20, fallback: true },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 — balanced', inputPerM: 2, outputPerM: 10, fallback: true },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5 — cheapest', inputPerM: 0.1, outputPerM: 0.5, fallback: false },
]
export const DEFAULT_ANTHROPIC_MODEL = ANTHROPIC_MODELS[0].id

export interface OpenAICompatPreset {
  id: string
  label: string
  baseUrl: string
  keyUrl?: string
  suggestedModel: string
  hint: string
}

// Base URLs verified to answer browser CORS preflights (so the app can call
// them directly, no server) on 2026-11-11. Model names change often — the
// "Load models" button in KeysPanel lists what each one currently serves.
export const OPENAI_COMPAT_PRESETS: OpenAICompatPreset[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter (free models)',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    suggestedModel: 'google/gemma-4-31b-it:free',
    hint: 'Models ending in ":free" cost nothing (rate-limited). Tool use works on most of them.',
  },
  {
    id: 'groq',
    label: 'Groq (free tier)',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    suggestedModel: '',
    hint: 'Free tier with daily limits; very fast. Use Load models to pick one.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini (free tier)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyUrl: 'https://aistudio.google.com/apikey',
    suggestedModel: '',
    hint: 'Flash models have a free tier. Use Load models to pick one.',
  },
  {
    id: 'ollama',
    label: 'Ollama (on this computer)',
    baseUrl: 'http://localhost:11434/v1',
    suggestedModel: 'qwen3',
    hint: 'Free and offline. Run "ollama pull qwen3", then start Ollama with OLLAMA_ORIGINS set to this site\'s origin so the browser may call it. No key needed.',
  },
  { id: 'custom', label: 'Custom', baseUrl: '', suggestedModel: '', hint: 'Any OpenAI-compatible /chat/completions endpoint that allows browser requests.' },
]

export interface AgentSettings {
  provider: Provider
  model: string
  effort: Effort
  openai: { preset: string; baseUrl: string; model: string }
}

const SETTINGS_KEY = 'agent_settings'
export const OPENAI_KEY_KEY = 'openai_compat_key'

const DEFAULTS: AgentSettings = {
  provider: 'anthropic',
  model: DEFAULT_ANTHROPIC_MODEL,
  effort: '',
  openai: { preset: 'openrouter', baseUrl: OPENAI_COMPAT_PRESETS[0].baseUrl, model: OPENAI_COMPAT_PRESETS[0].suggestedModel },
}

export function readAgentSettings(): AgentSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULTS, openai: { ...DEFAULTS.openai } }
    const parsed = JSON.parse(raw)
    const model = ANTHROPIC_MODELS.some(m => m.id === parsed.model) ? parsed.model : DEFAULTS.model
    return {
      provider: parsed.provider === 'openai' ? 'openai' : 'anthropic',
      model,
      effort: ['low', 'medium', 'high'].includes(parsed.effort) ? parsed.effort : '',
      openai: { ...DEFAULTS.openai, ...(parsed.openai ?? {}) },
    }
  } catch {
    return { ...DEFAULTS, openai: { ...DEFAULTS.openai } }
  }
}

export function writeAgentSettings(settings: AgentSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage unavailable */ }
}

export function getOpenAIKey(): string { return readSecret(OPENAI_KEY_KEY) }
export function saveOpenAIKey(key: string) { writeSecret(OPENAI_KEY_KEY, key) }

// Whether the chosen provider has enough configured to send a message. The
// Anthropic key is checked by the caller (it's React state there); an
// OpenAI-compatible endpoint only needs a URL and a model — a key is
// optional (Ollama has none).
export function openAIConfigured(s: AgentSettings): boolean {
  return Boolean(s.openai.baseUrl.trim() && s.openai.model.trim())
}

// ── Spend tracking ──────────────────────────────────────────────────────────
// A running estimate, accumulated from each reply's usage, so it's visible
// how much the chat has cost. For Claude it's computed from the price table
// above (cache reads at 10% of input, cache writes at 125% — close enough
// for a running total); for OpenAI-compatible endpoints only when the
// endpoint reports a cost itself (OpenRouter does; most don't).

export interface Spend { usd: number; inputTokens: number; outputTokens: number; unpriced: boolean }
const SPEND_KEY = 'agent_spend'
const EMPTY_SPEND: Spend = { usd: 0, inputTokens: 0, outputTokens: 0, unpriced: false }

export function readSpend(): Spend {
  try {
    const raw = localStorage.getItem(SPEND_KEY)
    return raw ? { ...EMPTY_SPEND, ...JSON.parse(raw) } : { ...EMPTY_SPEND }
  } catch {
    return { ...EMPTY_SPEND }
  }
}

export function resetSpend() {
  try { localStorage.removeItem(SPEND_KEY) } catch { /* storage unavailable */ }
}

export function addSpend(delta: { usd?: number; inputTokens: number; outputTokens: number }) {
  const s = readSpend()
  const next: Spend = {
    usd: s.usd + (delta.usd ?? 0),
    inputTokens: s.inputTokens + delta.inputTokens,
    outputTokens: s.outputTokens + delta.outputTokens,
    unpriced: s.unpriced || delta.usd === undefined,
  }
  try { localStorage.setItem(SPEND_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
}

export function anthropicCost(modelId: string, usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): number {
  const m = ANTHROPIC_MODELS.find(x => x.id === modelId)
  if (!m) return 0
  const perTok = (perM: number) => perM / 1_000_000
  return usage.input_tokens * perTok(m.inputPerM)
    + usage.output_tokens * perTok(m.outputPerM)
    + (usage.cache_read_input_tokens ?? 0) * perTok(m.inputPerM) * 0.1
    + (usage.cache_creation_input_tokens ?? 0) * perTok(m.inputPerM) * 1.25
}

export function formatUsd(usd: number): string {
  if (usd === 0) return '$0'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}
