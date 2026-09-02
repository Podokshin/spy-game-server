import { BookOpen, Lightbulb } from '@phosphor-icons/react'

const STEPS = [
  { title: 'Все получают тему, шпион — нет', body: 'Каждому приходит локация или персонаж. Шпион не знает тему и должен притворяться.' },
  { title: 'Обсуждение по кругу', body: 'По очереди называйте факты о теме, не произнося её напрямую — так вы ищете шпиона и он ищет подсказки.' },
  { title: 'Голосование', body: 'Все одновременно и анонимно голосуют, кто, по их мнению, шпион.' },
  { title: 'Раскрытие', body: 'Если шпиона поймали — очки получают проголосовавшие верно. Если сбежал — очки получает шпион.' },
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
        <Lightbulb size={14} weight="bold" style={{ verticalAlign: -2 }} /> <b>Совет:</b> не молчите и не говорите слишком общими фразами — оба варианта сразу выдают шпиона.
      </div>
    </aside>
  )
}
