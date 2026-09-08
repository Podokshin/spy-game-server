import { Sun, Moon } from '@phosphor-icons/react'

// Переключатель светлой/тёмной темы — общий для хаба и всех 9 игр.
export default function ThemeToggle({ theme, onToggle, className }) {
  const isLight = theme === 'light'
  return (
    <button
      type="button"
      onClick={onToggle}
      className={'theme-toggle-btn' + (className ? ' ' + className : '')}
      title={isLight ? 'Включить тёмную тему' : 'Включить светлую тему'}
      aria-label={isLight ? 'Включить тёмную тему' : 'Включить светлую тему'}
    >
      {isLight ? <Moon size={16} weight="bold" /> : <Sun size={16} weight="bold" />}
    </button>
  )
}
