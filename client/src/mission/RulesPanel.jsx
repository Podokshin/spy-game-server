import { BookOpen, Lightbulb } from '@phosphor-icons/react'

const STEPS = [
  { title: 'У каждого своё задание', body: 'В начале раунда вы получаете смешную секретную миссию, которую нужно выполнить.' },
  { title: 'Обычный разговор', body: 'Выполните своё задание незаметно во время общей беседы, пока остальные не догадались.' },
  { title: 'Угадывание', body: 'По очереди все пытаются угадать, чью миссию выполнял каждый игрок.' },
  { title: 'Очки', body: 'Угадавшие чужую миссию получают очко. Если вашу миссию не раскрыли — получаете два очка.' },
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
        <Lightbulb size={14} weight="bold" style={{ verticalAlign: -2 }} /> <b>Совет:</b> чем естественнее вплетаете миссию в разговор, тем сложнее её вычислить.
      </div>
    </aside>
  )
}
