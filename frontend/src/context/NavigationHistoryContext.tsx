import { createContext, useContext, useRef, useCallback, useEffect, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

interface NavigationHistoryContextType {
  navigateBack: () => void
  navigateForward: () => void
  navigateUp: (parentPath: string) => void
  canGoBack: () => boolean
  canGoForward: () => boolean
}

const NavigationHistoryContext = createContext<NavigationHistoryContextType | null>(null)

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  
  // Tree navigation: track child path when going up
  const childPathRef = useRef<string | null>(null)
  const isNavigatingRef = useRef<boolean>(false)

  // Reset child path when navigating to a new deeper path
  useEffect(() => {
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false
      return
    }
    // User clicked to go deeper - clear the child path
    childPathRef.current = null
  }, [location.pathname])

  const canGoBack = useCallback(() => {
    // For tree nav, we can always go back if not at root
    return location.pathname !== '/'
  }, [location.pathname])

  const canGoForward = useCallback(() => {
    return childPathRef.current !== null
  }, [])

  // Navigate to parent (swipe right) - remembers current path
  const navigateUp = useCallback((parentPath: string) => {
    isNavigatingRef.current = true
    childPathRef.current = location.pathname
    navigate(parentPath)
  }, [navigate, location.pathname])

  // Navigate back - same as navigateUp but auto-calculates parent
  const navigateBack = useCallback(() => {
    const path = location.pathname
    if (path === '/') return
    
    isNavigatingRef.current = true
    childPathRef.current = path
    
    if (path.startsWith('/g/')) {
      const parts = path.split('/').filter(Boolean)
      if (parts.length <= 2) {
        navigate('/')
      } else {
        navigate('/' + parts.slice(0, -1).join('/'))
      }
    } else {
      navigate('/')
    }
  }, [navigate, location.pathname])

  // Navigate forward (swipe left) - goes to saved child path
  const navigateForward = useCallback(() => {
    if (childPathRef.current) {
      isNavigatingRef.current = true
      const target = childPathRef.current
      childPathRef.current = null
      navigate(target)
    }
  }, [navigate])

  return (
    <NavigationHistoryContext.Provider value={{ navigateBack, navigateForward, navigateUp, canGoBack, canGoForward }}>
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
