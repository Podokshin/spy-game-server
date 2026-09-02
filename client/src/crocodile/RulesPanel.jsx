import { BookOpen, Lightbulb } from '@phosphor-icons/react'

const STEPS = [
  { title: 'Художник получает слово', body: 'Один игрок по очереди выбирает слово из трёх вариантов и рисует его на общем холсте.' },
  { title: 'Остальные угадывают', body: 'Пишите варианты ответа в чат — рисовать можно только линиями, буквы и цифры под запретом.' },
  { title: 'Кто быстрее — больше очков', body: 'Угадавшие раньше получают больше очков. Художник получает очки за каждого, кто угадал.' },
  { title: 'Художник меняется', body: 'Каждый следующий раунд рисует новый игрок по кругу.' },
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
        <Lightbulb size={14} weight="bold" style={{ verticalAlign: -2 }} /> <b>Совет:</b> рисуйте от общего к частному — сначала силуэт, потом детали.
      </div>
    </aside>
  )
}
