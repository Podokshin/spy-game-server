import { BookOpen, Lightbulb } from '@phosphor-icons/react'

const STEPS = [
  { title: 'Выпадает буква и 5 категорий', body: 'Каждый раунд случайная буква и пять категорий — например, «страны» или «еда».' },
  { title: 'Пишите слова на скорость', body: 'Пока не закончилось время, придумайте слово на эту букву для каждой категории.' },
  { title: 'Уникальные ответы ценнее', body: 'Слово, которое не повторили другие игроки — 2 очка. Совпавшее с чужим — 1 очко. Пустое или неверное — 0.' },
  { title: 'Новый раунд, новая буква', body: 'Раунды повторяются с другой буквой — побеждает набравший больше всего очков за игру.' },
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
        <Lightbulb size={14} weight="bold" style={{ verticalAlign: -2 }} /> <b>Совет:</b> ищите редкие, но настоящие слова — они реже совпадают с чужими ответами.
      </div>
    </aside>
  )
}
