// Живой список игроков комнаты — показывается справа, пока фоновое видео
// выключено (или файлов для него ещё нет). avatar уже провалидирован
// сервером (sanitizeAvatar), поэтому здесь просто рендерим картинку по ключу.
//
// maxDisplay: сколько мест рисовать пустыми "Ожидает игрока...", пока
// комната не заполнена — для игр с технической мягкой ёмкостью (лимит 20)
// это условное 8, а не реальный лимит (иначе было бы 19 пустых строк).
// Для игр с маленьким осмысленным лимитом (Нарды — 2, Крокодил — 12)
// сюда передаётся их настоящий предел. Если реальных игроков больше
// maxDisplay, пустые слоты просто не рисуются — список показывает всех
// и прокручивается.
export default function PlayerListPanel({ players, maxDisplay = 8 }) {
  const total = players.length
  const emptySlots = Math.max(0, maxDisplay - total)

  return (
    <div className="gc-players-panel">
      <div className="gc-players-header">
        👥 Игроки <span className="gc-players-count">{total}{emptySlots > 0 ? ` / ${maxDisplay}` : ''}</span>
      </div>
      <div className="gc-players-list">
        {players.map((p) => (
          <div key={p.id} className={'gc-player-row' + (p.connected === false ? ' disconnected' : '')}>
            <img className="gc-player-avatar" src={`/avatars/${p.avatar}.webp`} width={40} height={40} alt="" />
            <span className="gc-player-name">{p.name}{p.isHost && ' 👑'}</span>
            {typeof p.score === 'number' && <span className="gc-player-score">{p.score}</span>}
          </div>
        ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div className="gc-player-row gc-player-row-empty" key={'empty-' + i}>
            <span className="gc-player-avatar-placeholder" />
            <span className="gc-player-name">Ожидает игрока...</span>
            <span className="gc-player-score">–</span>
          </div>
        ))}
      </div>
    </div>
  )
}
