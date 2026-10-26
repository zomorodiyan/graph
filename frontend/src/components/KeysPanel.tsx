import { useEffect, useRef, useState } from 'react'

export type KeyKind = 'anthropic' | 'github'

interface KeysPanelProps {
  focus: KeyKind
  apiKey: string
  pat: string
  onSaveApiKey: (key: string) => void
  onSavePat: (token: string) => void
  onClose: () => void
}

// Entry for the two secrets the app uses: the Anthropic API key (agent chat)
// and the GitHub token (Gist sync). Each is its own login form — a fixed
// username plus a password field and a submit button — which is what
// password managers (Bitwarden etc.) look for to offer saving and filling;
// the usernames tell the two apart. Keys only last until the app closes
// (see utils/secrets.ts), so the password manager is how they come back.
function KeysPanel({ focus, apiKey, pat, onSaveApiKey, onSavePat, onClose }: KeysPanelProps) {
  const [apiKeyInput, setApiKeyInput] = useState(apiKey)
  const [patInput, setPatInput] = useState(pat)
  const apiKeyRef = useRef<HTMLInputElement>(null)
  const patRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => (focus === 'anthropic' ? apiKeyRef : patRef).current?.focus(), 50)
    return () => clearTimeout(t)
  }, [focus])

  const onKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Escape') onClose() }

  return (
    <div className="gist-config-panel keys-panel" onKeyDown={onKeyDown}>
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
