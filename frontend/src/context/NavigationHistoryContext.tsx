import { createContext, useContext, useRef, useCallback, useEffect, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

interface NavigationHistoryContextType {
  navigateUp: () => void
  navigateForward: () => void
  canGoForward: () => boolean
}

const NavigationHistoryContext = createContext<NavigationHistoryContextType | null>(null)

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  
  // Stack of forward paths (deeper paths we've visited and can return to)
  const forwardStackRef = useRef<string[]>([])
  const isNavigatingRef = useRef<boolean>(false)
  const lastPathRef = useRef<string>(location.pathname)

  // Track navigation - clear forward stack on normal navigation (clicking items)
  useEffect(() => {
    const currentPath = location.pathname
    
    if (isNavigatingRef.current) {
      // Navigation was triggered by swipe, don't clear forward stack
      isNavigatingRef.current = false
    } else {
      // Normal navigation (user clicked) - clear forward history
      // This happens when user branches to a different path
      forwardStackRef.current = []
    }
    
    lastPathRef.current = currentPath
  }, [location.pathname])

  const canGoForward = useCallback(() => {
    return forwardStackRef.current.length > 0
  }, [])

  // Navigate up (swipe right) - go to parent, remember current path
  const navigateUp = useCallback(() => {
    const path = location.pathname
    if (path === '/') return // Already at root
    
    isNavigatingRef.current = true
    
    // Push current path to forward stack
    forwardStackRef.current.push(path)
    
    // Calculate parent path
    if (path.startsWith('/g/')) {
      const parts = path.split('/').filter(Boolean) // ['g', 'graphName', ...rest]
      if (parts.length <= 2) {
        // At graph root (/g/graphName), go to main structures page
        navigate('/')
      } else {
        // Go to parent path within graph
        navigate('/' + parts.slice(0, -1).join('/'))
      }
    } else {
      navigate('/')
    }
  }, [navigate, location.pathname])

  // Navigate forward (swipe left) - pop from forward stack
  const navigateForward = useCallback(() => {
    if (forwardStackRef.current.length > 0) {
      isNavigatingRef.current = true
      const target = forwardStackRef.current.pop()!
      navigate(target)
    }
  }, [navigate])

  return (
    <NavigationHistoryContext.Provider value={{ navigateUp, navigateForward, canGoForward }}>
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
