// Живой список игроков комнаты — показывается справа, пока фоновое видео
// выключено (или файлов для него ещё нет). avatar уже провалидирован
// сервером (sanitizeAvatar), поэтому здесь просто рендерим картинку по ключу.
export default function PlayerListPanel({ players }) {
  const total = players.length
  return (
    <div className="gc-players-panel">
      <div className="gc-players-header">👥 Игроки <span className="gc-players-count">{total}</span></div>
      <div className="gc-players-list">
        {players.map((p) => (
          <div key={p.id} className={'gc-player-row' + (p.connected === false ? ' disconnected' : '')}>
            <img className="gc-player-avatar" src={`/avatars/${p.avatar}.webp`} width={28} height={28} alt="" />
            <span className="gc-player-name">{p.name}{p.isHost && ' 👑'}</span>
            {typeof p.score === 'number' && <span className="gc-player-score">{p.score}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
