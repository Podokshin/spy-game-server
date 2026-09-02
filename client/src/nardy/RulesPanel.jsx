import { BookOpen, Lightbulb } from '@phosphor-icons/react'

const STEPS = [
  { title: 'Выводите шашки с головы', body: 'Каждый ход бросайте кости и двигайте шашки по своей половине доски согласно выпавшим числам.' },
  { title: 'Точка соперника закрыта', body: 'Нельзя ставить шашку на пункт, где уже стоит хотя бы одна шашка соперника — здесь шашки не бьются, а просто блокируют дорогу.' },
  { title: 'Выведите все шашки', body: 'Когда все ваши шашки дойдут до дома, начинайте снимать их с доски бросками костей.' },
  { title: 'Марс и куб', body: 'Если соперник не успел снять ни одной шашки — марс, очки удваиваются. Куб позволяет поднять ставку партии ещё выше.' },
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
        <Lightbulb size={14} weight="bold" style={{ verticalAlign: -2 }} /> <b>Совет:</b> не спешите выводить все шашки с головы сразу — оставьте себе манёвр на случай неудачных костей.
      </div>
    </aside>
  )
}
