import { useState } from 'react'

const STORAGE_KEY = 'theme'

// Which theme is showing, and a way to switch it. The theme lives in a
// `data-theme` attribute on <html>, which index.css reads to pick the colours;
// a small script in index.html sets it before the page first paints.
export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light')

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    // Set straight away, not in an effect, so the new colours are already in
    // place by the time anything reacts to `theme` changing.
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage can be blocked (private windows); the theme still switches.
    }
    setTheme(next)
  }

  return { theme, toggleTheme }
}
