export interface ViewPreferences {
  showTime: boolean
  showProgress: boolean
  showContext: boolean
}

const STORAGE_KEY = 'graph-view-preferences'

export const DEFAULT_VIEW_PREFERENCES: ViewPreferences = {
  showTime: true,
  showProgress: true,
  showContext: true,
}

export function loadViewPreferences(): ViewPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_VIEW_PREFERENCES
    const parsed = JSON.parse(raw) as Partial<ViewPreferences>
    return {
      showTime: parsed.showTime ?? DEFAULT_VIEW_PREFERENCES.showTime,
      showProgress: parsed.showProgress ?? DEFAULT_VIEW_PREFERENCES.showProgress,
      showContext: parsed.showContext ?? DEFAULT_VIEW_PREFERENCES.showContext,
    }
  } catch {
    return DEFAULT_VIEW_PREFERENCES
  }
}

export function saveViewPreferences(preferences: ViewPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
}
