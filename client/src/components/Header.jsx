import { House } from '@phosphor-icons/react'
import ThemeToggle from './ThemeToggle'
import { useTheme } from '../lib/useTheme'

// Общая шапка для всех 9 игр: бренд-лого слева, "Игра"/"Хаб" по центру,
// переключатель темы + счёт справа (если у этой игры вообще есть личный
// счёт игрока).
export default function Header({ score }) {
  const { theme, toggle } = useTheme()

  return (
    <header className="gc-header">
      <a className="gc-header-brand" href="/">
        <img src="/favicon.svg" alt="" width="22" height="22" /> <span className="gc-header-brand-text">Игротека</span>
      </a>

      <nav className="gc-header-nav">
        <span className="gc-header-nav-item active">Игра</span>
        <a className="gc-header-nav-item link" href="/">
          <House size={14} weight="bold" style={{ verticalAlign: -2 }} /> Хаб
        </a>
      </nav>

      <div className="gc-header-right">
        <ThemeToggle theme={theme} onToggle={toggle} />
        {typeof score === 'number' && <span className="gc-header-score">🎫 Счёт: {score}</span>}
      </div>
    </header>
  )
}
