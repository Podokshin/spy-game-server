import { House } from '@phosphor-icons/react'

// Общая шапка для всех 9 игр: бренд-лого слева, "Игра"/"Хаб" по центру,
// счёт справа (если у этой игры вообще есть личный счёт игрока).
export default function Header({ score }) {
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

      {typeof score === 'number' ? (
        <span className="gc-header-score">🎫 Счёт: {score}</span>
      ) : (
        <span className="gc-header-score-spacer" />
      )}
    </header>
  )
}
