import { BookOpen, Lightbulb } from '@phosphor-icons/react'

const STEPS = [
  { title: 'Ночь', body: 'Мафия тайно выбирает жертву, шериф проверяет одного игрока, доктор может кого-то спасти.' },
  { title: 'День', body: 'Город узнаёт, кто погиб ночью, и обсуждает, кто похож на мафию.' },
  { title: 'Голосование', body: 'Город голосует, кого изгнать. У выбывшего раскрывается роль.' },
  { title: 'Победа', body: 'Мафия побеждает, если сравнялась числом с мирными жителями. Город побеждает, если вся мафия изгнана.' },
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
        <Lightbulb size={14} weight="bold" style={{ verticalAlign: -2 }} /> <b>Совет:</b> следите, кто слишком активно направляет голосование — часто так себя выдаёт мафия.
      </div>
    </aside>
  )
}
