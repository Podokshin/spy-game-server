import { BookOpen, Lightbulb } from '@phosphor-icons/react'

const STEPS = [
  { title: 'Две команды, у каждой капитан', body: 'Капитан видит цвета всех карточек на поле, остальные — только слова.' },
  { title: 'Капитан даёт подсказку', body: 'Одно слово и число — сколько карточек команды оно описывает.' },
  { title: 'Команда угадывает', body: 'Открывайте карточки, которые, как вам кажется, подходят под подсказку — пока не ошибётесь или не закончатся попытки.' },
  { title: 'Осторожно с чёрной картой', body: 'Побеждает команда, открывшая все свои карточки первой. Открыть карточку-убийцу — мгновенное поражение.' },
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
        <Lightbulb size={14} weight="bold" style={{ verticalAlign: -2 }} /> <b>Совет:</b> капитанам лучше объединять слова по смыслу — так число угаданных карт за подсказку растёт.
      </div>
    </aside>
  )
}
