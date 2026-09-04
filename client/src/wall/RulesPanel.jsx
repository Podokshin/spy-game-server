import { BookOpen, Lightbulb } from '@phosphor-icons/react'

const STEPS = [
  { title: 'Тема раунда', body: 'Всем показывают одну и ту же тему — например, самое стыдное на первом свидании.' },
  { title: 'Анонимное признание', body: 'Каждый тайно пишет свой ответ. Никто не узнает, кто что написал, пока не наступит момент угадывания.' },
  { title: 'Стена', body: 'Признания выводятся по одному. Все, кроме автора, угадывают, кто это написал.' },
  { title: 'Очки', body: 'Угадал — очко себе. Автор получает очко за каждого, кто не угадал — чем лучше маскировка, тем больше очков.' },
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
        <Lightbulb size={14} weight="bold" style={{ verticalAlign: -2 }} /> <b>Совет:</b> самое смешное — писать так, чтобы никто не поверил, что это ты.
      </div>
    </aside>
  )
}
