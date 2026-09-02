import { BookOpen, Lightbulb } from '@phosphor-icons/react'

const STEPS = [
  { title: 'Капитан даёт подсказку', body: 'Одну фразу, которая описывает некую позицию на скрытой шкале.' },
  { title: 'Команда угадывает', body: 'Участники устанавливают позицию точки на шкале с помощью слайдера.' },
  { title: 'Чем точнее — тем больше очков', body: 'Очки начисляются в зависимости от того, насколько близко ваш ответ к реальной точке.' },
  { title: 'Игра продолжается', body: 'Новые раунды, новые подсказки, больше очков!' },
]

export default function RulesPanel() {
  return (
    <aside className="gc-rules-panel">
      <h3 className="gc-rules-title"><BookOpen size={18} weight="bold" /> Правила игры</h3>
      {STEPS.map((s, i) => (
        <div className="gc-rules-step" key={i}>
          <span className="gc-rules-step-num">{i + 1}</span>
          <div>
            <p className="gc-rules-step-title">{s.title}</p>
            <p className="gc-rules-step-body">{s.body}</p>
          </div>
        </div>
      ))}
      <div className="gc-rules-tip">
        <Lightbulb size={14} weight="bold" style={{ verticalAlign: -2 }} /> <b>Совет:</b> используйте яркие ассоциации, сравнения и конкретику. Чем понятнее подсказка — тем интереснее игра!
      </div>
    </aside>
  )
}
