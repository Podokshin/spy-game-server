import { useEffect, useState } from 'react'

// Светлая/тёмная тема сайта — тот же localStorage-паттерн, что уже
// используют radio.js/shorts.js/useVideoToggle для сквозных настроек между
// хабом и играми. data-theme на <html> перебивает :root в каждом style.css
// (см. :root[data-theme="light"] блоки) без лишней специфичности.
const STORAGE_KEY = 'siteTheme'

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark' } catch { return 'dark' }
  })

  useEffect(() => { applyTheme(theme) }, [theme])

  function toggle() {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light'
      try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
      return next
    })
  }

  return { theme, toggle }
}
