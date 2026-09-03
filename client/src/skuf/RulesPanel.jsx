import { BookOpen, Lightbulb } from '@phosphor-icons/react'

const STEPS = [
  { title: 'Секретная роль', body: 'В начале игры вы получаете тайный архетип со своей особенностью, влияющей на очки. Она раскроется остальным не сразу — а может, и вообще никогда.' },
  { title: 'Переписка', body: 'Каждую ночь можно отправить до 4 сообщений любым игрокам. Пока идёт переписка, её не видит никто, кроме вас и адресата.' },
  { title: 'Тайное свидание', body: 'После переписки каждый тайно выбирает одного человека (или никого). Совпали выборы — обоим по сердцу.' },
  { title: 'Итоги ночи', body: 'Раскрывается вся переписка этой ночи целиком и кто с кем совпал. Раз в пару ночей раскрывается роль одного из игроков.' },
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
        <Lightbulb size={14} weight="bold" style={{ verticalAlign: -2 }} /> <b>Совет:</b> 5 ночей, побеждает набравший больше всего сердец — но иногда игра заканчивается досрочно совсем другим способом.
      </div>
    </aside>
  )
}
