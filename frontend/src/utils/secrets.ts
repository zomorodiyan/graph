// API keys and tokens live in sessionStorage only — kept while the app/tab
// is open, gone once it's closed, so nothing secret stays saved on the
// device (a password manager refills them via KeysPanel's login forms).
// Keys an older version saved in localStorage move into the session on
// first read and are removed from localStorage.

export function readSecret(name: string): string {
  try {
    const legacy = localStorage.getItem(name)
    if (legacy !== null) {
      localStorage.removeItem(name)
      if (legacy) sessionStorage.setItem(name, legacy)
    }
  } catch { /* storage unavailable */ }
  try {
    return sessionStorage.getItem(name) ?? ''
  } catch {
    return ''
  }
}

export function writeSecret(name: string, value: string) {
  const v = value.trim()
  try {
    if (v) sessionStorage.setItem(name, v)
    else sessionStorage.removeItem(name)
    localStorage.removeItem(name)
  } catch { /* storage unavailable */ }
}
