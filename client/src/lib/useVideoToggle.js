import { useState } from 'react'

// Общий тумблер фонового видео — то же localStorage-состояние, что раньше
// использовал ванильный shorts.js на всех страницах, чтобы включённость
// сохранялась между переходами между играми и хабом.
const STORAGE_KEY = 'shortsEnabled'

export function useVideoToggle() {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })

  function toggle() {
    setEnabled((prev) => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  return { enabled, toggle }
}
