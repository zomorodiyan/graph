import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type ColorScheme = 'blue' | 'teal' | 'green' | 'amber' | 'purple' | 'red'

const SCHEMES: ColorScheme[] = ['blue', 'teal', 'green', 'amber', 'purple', 'red']

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
