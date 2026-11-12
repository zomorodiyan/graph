import { useEffect, useRef, useState } from 'react'
import {
  AgentSettings, ANTHROPIC_MODELS, Effort, formatUsd, OPENAI_COMPAT_PRESETS, readSpend, resetSpend, Spend,
} from '../api/agentSettings'
import { listModels } from '../api/openaiCompatClient'

export type KeyKind = 'anthropic' | 'github' | 'model'

interface KeysPanelProps {
  focus: KeyKind
  apiKey: string
  pat: string
  otherKey: string
  settings: AgentSettings
  onSaveApiKey: (key: string) => void
  onSavePat: (token: string) => void
  onSaveOtherKey: (key: string) => void
  onChangeSettings: (next: AgentSettings) => void
  onClose: () => void
}

// Entry for the secrets the app uses — the Anthropic API key (agent chat),
// the key of an OpenAI-compatible endpoint (free models), and the GitHub
// token (Gist sync) — plus which model the chat talks to and what it has
// cost so far. Each secret is its own login form — a fixed username plus a
// password field and a submit button — which is what password managers
// (Bitwarden etc.) look for to offer saving and filling; the usernames tell
// them apart. Keys only last until the app closes (see utils/secrets.ts),
// so the password manager is how they come back.
function KeysPanel({ focus, apiKey, pat, otherKey, settings, onSaveApiKey, onSavePat, onSaveOtherKey, onChangeSettings, onClose }: KeysPanelProps) {
  const [apiKeyInput, setApiKeyInput] = useState(apiKey)
  const [patInput, setPatInput] = useState(pat)
  const [otherKeyInput, setOtherKeyInput] = useState(otherKey)
  const [spend, setSpend] = useState<Spend>(readSpend)
  const [models, setModels] = useState<string[]>([])
  const [modelsStatus, setModelsStatus] = useState<string | null>(null)
  const apiKeyRef = useRef<HTMLInputElement>(null)
  const patRef = useRef<HTMLInputElement>(null)
  const providerRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    const target = focus === 'anthropic' ? apiKeyRef : focus === 'github' ? patRef : providerRef
    const t = setTimeout(() => target.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [focus])

  const onKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Escape') onClose() }

  const preset = OPENAI_COMPAT_PRESETS.find(p => p.id === settings.openai.preset) ?? OPENAI_COMPAT_PRESETS[OPENAI_COMPAT_PRESETS.length - 1]
  const setOpenAI = (patch: Partial<AgentSettings['openai']>) =>
    onChangeSettings({ ...settings, openai: { ...settings.openai, ...patch } })

  const choosePreset = (id: string) => {
    const p = OPENAI_COMPAT_PRESETS.find(x => x.id === id)
    if (!p) return
    setModels([])
    setModelsStatus(null)
    setOpenAI({ preset: id, baseUrl: p.baseUrl, model: p.suggestedModel })
  }

  const loadModels = async () => {
    setModelsStatus('Loading…')
    try {
      const ids = await listModels(settings.openai.baseUrl, otherKey)
      setModels(ids)
      setModelsStatus(ids.length ? `${ids.length} models — pick one below` : 'The endpoint listed no models.')
    } catch (err) {
      setModels([])
      setModelsStatus(err instanceof Error ? err.message : String(err))
    }
  }

  const spendLine = spend.inputTokens + spend.outputTokens === 0
    ? 'Nothing spent yet.'
    : `${spend.unpriced ? 'At least ' : ''}${formatUsd(spend.usd)} so far (${spend.inputTokens.toLocaleString()} in, ${spend.outputTokens.toLocaleString()} out tokens${spend.unpriced ? '; some replies had no price' : ''}).`

  return (
    <div className="gist-config-panel keys-panel" onKeyDown={onKeyDown}>
      <div className="key-form model-section">
        <p className="gist-guide-title">AI chat — model</p>
        <label className="key-field">
          <span>Provider</span>
          <select
            ref={providerRef}
            value={settings.provider}
            onChange={e => onChangeSettings({ ...settings, provider: e.target.value as AgentSettings['provider'] })}
            aria-label="AI provider"
          >
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">Other / free (OpenAI-compatible)</option>
          </select>
        </label>

        {settings.provider === 'anthropic' ? (
          <>
            <label className="key-field">
              <span>Model</span>
              <select
                value={settings.model}
                onChange={e => onChangeSettings({ ...settings, model: e.target.value })}
                aria-label="Claude model"
              >
                {ANTHROPIC_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.label} · ${m.inputPerM} in / ${m.outputPerM} out per M tokens</option>
                ))}
              </select>
            </label>
            <label className="key-field">
              <span>Effort</span>
              <select
                value={settings.effort}
                onChange={e => onChangeSettings({ ...settings, effort: e.target.value as Effort })}
                aria-label="Thinking effort"
              >
                <option value="">Model default</option>
                <option value="low">Low — cheapest, terse</option>
                <option value="medium">Medium</option>
                <option value="high">High — most thorough</option>
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="key-field">
              <span>Service</span>
              <select value={preset.id} onChange={e => choosePreset(e.target.value)} aria-label="Model service">
                {OPENAI_COMPAT_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <p className="key-form-hint">{preset.hint}</p>
            <label className="key-field">
              <span>URL</span>
              <input
                value={settings.openai.baseUrl}
                onChange={e => setOpenAI({ baseUrl: e.target.value })}
                placeholder="https://…/v1"
                aria-label="Endpoint base URL"
                spellCheck={false}
              />
            </label>
            <label className="key-field">
              <span>Model</span>
              <input
                list="agent-model-list"
                value={settings.openai.model}
                onChange={e => setOpenAI({ model: e.target.value })}
                placeholder="model id"
                aria-label="Model id"
                spellCheck={false}
              />
              <datalist id="agent-model-list">
                {models.map(id => <option key={id} value={id} />)}
              </datalist>
            </label>
            <div className="gist-config-actions">
              <button type="button" className="btn-cancel-url" onClick={loadModels} disabled={!settings.openai.baseUrl.trim()}>Load models</button>
            </div>
            {modelsStatus && <p className="key-form-hint">{modelsStatus}</p>}
          </>
        )}

        <p className="key-form-hint key-spend">
          {spendLine}
          {spend.inputTokens + spend.outputTokens > 0 && (
            <> <button type="button" className="link-button" onClick={() => { resetSpend(); setSpend(readSpend()) }}>Reset</button></>
          )}
        </p>
      </div>

      {settings.provider === 'anthropic' ? (
        <form
          className="key-form"
          onSubmit={(e) => { e.preventDefault(); if (apiKeyInput.trim()) onSaveApiKey(apiKeyInput) }}
        >
          <p className="gist-guide-title">AI chat — Anthropic API key</p>
          <p className="key-form-hint">
            From <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com → API Keys</a>
          </p>
          <input className="key-form-user" name="username" autoComplete="username" value="Anthropic API key" readOnly aria-label="Account" />
          <input
            ref={apiKeyRef}
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="sk-ant-…"
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            aria-label="Anthropic API key"
          />
          <div className="gist-config-actions">
            <button type="submit" className="btn-save-url" disabled={!apiKeyInput.trim()}>Save</button>
            {apiKey && <button type="button" className="btn-cancel-url" onClick={() => { setApiKeyInput(''); onSaveApiKey('') }}>Forget</button>}
          </div>
        </form>
      ) : (
        <form
          className="key-form"
          onSubmit={(e) => { e.preventDefault(); if (otherKeyInput.trim()) onSaveOtherKey(otherKeyInput) }}
        >
          <p className="gist-guide-title">AI chat — {preset.label} key</p>
          <p className="key-form-hint">
            {preset.keyUrl
              ? <>From <a href={preset.keyUrl} target="_blank" rel="noreferrer">{preset.keyUrl.replace(/^https?:\/\//, '')}</a></>
              : 'Only if the endpoint needs one.'}
          </p>
          <input className="key-form-user" name="username" autoComplete="username" value="Other AI key" readOnly aria-label="Account" />
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="key (optional for Ollama)"
            value={otherKeyInput}
            onChange={e => setOtherKeyInput(e.target.value)}
            aria-label="Other AI key"
          />
          <div className="gist-config-actions">
            <button type="submit" className="btn-save-url" disabled={!otherKeyInput.trim()}>Save</button>
            {otherKey && <button type="button" className="btn-cancel-url" onClick={() => { setOtherKeyInput(''); onSaveOtherKey('') }}>Forget</button>}
          </div>
        </form>
      )}

      <form
        className="key-form"
        onSubmit={(e) => { e.preventDefault(); if (patInput.trim()) onSavePat(patInput) }}
      >
        <p className="gist-guide-title">Sync — GitHub token</p>
        <p className="key-form-hint">
          <a href="https://github.com/settings/tokens/new?scopes=gist&description=Graph+Memory+Sync" target="_blank" rel="noreferrer">Create one</a> with only the <strong>gist</strong> scope; your graphs sync to a private Gist.
        </p>
        <input className="key-form-user" name="username" autoComplete="username" value="GitHub token (gist)" readOnly aria-label="Account" />
        <input
          ref={patRef}
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="ghp_… or github_pat_…"
          value={patInput}
          onChange={e => setPatInput(e.target.value)}
          aria-label="GitHub token"
        />
        <div className="gist-config-actions">
          <button type="submit" className="btn-save-url" disabled={!patInput.trim()}>Connect</button>
          {pat && <button type="button" className="btn-cancel-url" onClick={() => { setPatInput(''); onSavePat('') }}>Forget</button>}
        </div>
      </form>

      <p className="key-form-hint">Keys are kept only until you close the app.</p>
      <div className="gist-config-actions">
        <button type="button" className="btn-cancel-url" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

export default KeysPanel
