import { createContext, useContext, useRef, useCallback, useEffect, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

interface NavigationHistoryContextType {
  navigateBack: () => void
  navigateForward: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
}

const NavigationHistoryContext = createContext<NavigationHistoryContextType | null>(null)

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  
  // Browser-like navigation history
  const historyRef = useRef<string[]>([location.pathname])
  const historyIndexRef = useRef<number>(0)
  const isNavigatingRef = useRef<boolean>(false)

  // Track navigation history
  useEffect(() => {
    if (isNavigatingRef.current) {
      // Navigation was triggered by back/forward, don't add to history
      isNavigatingRef.current = false
      return
    }
    
    const currentPath = location.pathname
    const historyIndex = historyIndexRef.current
    const history = historyRef.current
    
    // If navigating normally (not back/forward), add to history
    if (history[historyIndex] !== currentPath) {
      // Truncate forward history when making a new navigation
      historyRef.current = [...history.slice(0, historyIndex + 1), currentPath]
      historyIndexRef.current = historyRef.current.length - 1
    }
  }, [location.pathname])

  const canGoBack = useCallback(() => {
    return historyIndexRef.current > 0
  }, [])

  const canGoForward = useCallback(() => {
    return historyIndexRef.current < historyRef.current.length - 1
  }, [])

  // Navigate back in history
  const navigateBack = useCallback(() => {
    if (historyIndexRef.current > 0) {
      isNavigatingRef.current = true
      historyIndexRef.current--
      navigate(historyRef.current[historyIndexRef.current])
    }
  }, [navigate])

  // Navigate forward in history
  const navigateForward = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      isNavigatingRef.current = true
      historyIndexRef.current++
      navigate(historyRef.current[historyIndexRef.current])
    }
  }, [navigate])

  return (
    <NavigationHistoryContext.Provider value={{ navigateBack, navigateForward, canGoBack, canGoForward }}>
      {children}
    </NavigationHistoryContext.Provider>
  )
}

export function useNavigationHistory() {
  const context = useContext(NavigationHistoryContext)
  if (!context) {
    throw new Error('useNavigationHistory must be used within a NavigationHistoryProvider')
  }
  return context
}
