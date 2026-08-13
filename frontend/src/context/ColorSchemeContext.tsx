import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type ColorScheme = 'blue' | 'indigo' | 'green' | 'red'

const SCHEMES: ColorScheme[] = ['blue', 'indigo', 'green', 'red']

// Mirrors each scheme's --blue-medium value from index.css — the accent the
// agent toggle button (and everything else accented "blue") renders in.
// Drives the <meta name="theme-color"> tag so the browser's own chrome
// (address bar/toolbar on mobile) matches the in-app accent instead of a
// static color that only happens to be right for one scheme.
const THEME_COLORS: Record<ColorScheme, string> = {
  blue: '#1976D2',
  indigo: '#231BBB',
  green: '#1BBB5B',
  red: '#BB331B',
}

interface ColorSchemeContextType {
  colorScheme: ColorScheme
  toggleColorScheme: () => void
}

const ColorSchemeContext = createContext<ColorSchemeContextType | undefined>(undefined)

export function ColorSchemeProvider({ children }: { children: ReactNode }) {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(() => {
    const saved = localStorage.getItem('color-scheme')
    return (SCHEMES.includes(saved as ColorScheme) ? saved : 'blue') as ColorScheme
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-color-scheme', colorScheme)
    localStorage.setItem('color-scheme', colorScheme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[colorScheme])
  }, [colorScheme])

  const toggleColorScheme = () => {
    setColorScheme(prev => {
      const idx = SCHEMES.indexOf(prev)
      return SCHEMES[(idx + 1) % SCHEMES.length]
    })
  }

  return (
    <ColorSchemeContext.Provider value={{ colorScheme, toggleColorScheme }}>
      {children}
    </ColorSchemeContext.Provider>
  )
}

export function useColorScheme() {
  const context = useContext(ColorSchemeContext)
  if (!context) {
    throw new Error('useColorScheme must be used within a ColorSchemeProvider')
  }
  return context
}
