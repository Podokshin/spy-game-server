import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// Игра использует только свой собственный /whoami/style.css (без Tailwind-
// классов) — импорт общего index.css сюда не нужен, а был вреден: его
// shadcn-тема переопределяет :root-переменные --accent/--muted/--border/
// --radius теми же именами, что и у игры, и ломает контраст.

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
