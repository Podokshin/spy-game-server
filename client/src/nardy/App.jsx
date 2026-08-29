import { useEffect, useRef } from 'react'
import {
  ArrowLeft,
  DiceFive,
  Trophy,
  SkipForward,
  Link as LinkIcon,
  Check,
} from '@phosphor-icons/react'
import { AVATARS, useNardyGame } from './useNardyGame'
import { mountNardyBoard } from './boardIsland'

const AVATAR_LABELS = { bandit: 'Разбойник', viking: 'Викинг', astronaut: 'Космонавт', scout: 'Скаут', merc: 'Наёмник', miner: 'Шахтёр', alien: 'Пришелец', hero: 'Герой', assassin: 'Ассасин', warrior: 'Воин', nomad: 'Кочевница', sleepy: 'Соня' }
const COLOR_LABEL_CAP = { white: 'Белые', black: 'Чёрные' }

function AvatarIcon({ avatar, size = 20 }) {
  const key = AVATARS.includes(avatar) ? avatar : AVATARS[0]
  return (
    <img
      src={`/avatars/${key}.webp`} width={size} height={size} alt=""
      style={{ borderRadius: '50%', objectFit: 'cover', verticalAlign: -4 }}
    />
  )
}

function PartySection({ currentKey, standings, isHost, onSelect }) {
  const ref = useRef(null)
  useEffect(() => {
    if (window.PartyHub && ref.current) window.PartyHub.renderPartySection(ref.current, { currentKey, standings, isHost, onSelect })
  }, [currentKey, standings, isHost, onSelect])
  return <div ref={ref} />
}

function PlayerChip({ player }) {
  return (
    <span className={'player-chip' + (player.connected === false ? ' disconnected' : '')}>
      <AvatarIcon avatar={player.avatar} /> {player.name}
      {player.isHost && <span className="host-tag"> ★ хост</span>}
      {player.connected === false && ' ⏳'}
    </span>
  )
}

function MenuScreen(g) {
  const invited = !!g.inviteCode
  return (
    <section className="screen active">
      <a className="back-link" href="/"><ArrowLeft size={12} weight="bold" style={{ verticalAlign: -1 }} /> Все игры</a>
      <h1><DiceFive size={26} weight="bold" style={{ verticalAlign: -4 }} /> Длинные нарды</h1>
      <p className="subtitle">{g.menuSubtitle}</p>

      {invited && (
        <div className="room-code-box">
          <span className="room-code-label">Вас пригласили в комнату</span>
          <span className="room-code">{g.inviteCode}</span>
        </div>
      )}

      <div className="field">
        <label htmlFor="playerName">Ваше имя</label>
        <input type="text" id="playerName" maxLength={20} placeholder="Введите имя" value={g.playerName} onChange={e => g.setPlayerName(e.target.value)} />
      </div>

      <div className="field">
        <label>Аватар</label>
        <div className="avatar-grid">
          {AVATARS.map(avatar => (
            <button key={avatar} type="button" className={'avatar-btn' + (avatar === g.selectedAvatar ? ' active' : '')}
              aria-label={'Аватар ' + AVATAR_LABELS[avatar]} onClick={() => g.setSelectedAvatar(avatar)}>
              <AvatarIcon avatar={avatar} size={56} />
            </button>
          ))}
        </div>
      </div>

      {!invited && <button className="primary-btn" onClick={g.createRoom}>Создать комнату</button>}

      <p className="hint">Продолжая, вы соглашаетесь с <a href="/privacy/">политикой обработки данных</a> и <a href="/terms/">правилами сайта</a>.</p>

      {!invited && <div className="divider">или</div>}
      {!invited && (
        <div className="field">
          <label htmlFor="joinCode">Код комнаты</label>
          <input type="text" id="joinCode" maxLength={5} placeholder="ABCDE" value={g.joinCode} onChange={e => g.setJoinCode(e.target.value)} />
        </div>
      )}
      <button className={invited ? 'primary-btn' : 'secondary-btn'} onClick={g.joinRoom}>Присоединиться</button>

      {invited && <p className="link-toggle" onClick={g.switchToCreateMode}>Хотите создать свою комнату вместо этого?</p>}
      {g.menuError && <p className="error">{g.menuError}</p>}
    </section>
  )
}

function LobbyScreen(g) {
  const room = g.currentRoom
  const enoughPlayers = room.players.length === 2
  return (
    <section className="screen active">
      <h2>Лобби</h2>

      <div className="room-code-box">
        <span className="room-code-label">Код комнаты — скажите другу</span>
        <span className="room-code">{room.code}</span>
        <button type="button" className="secondary-btn copy-link-btn" onClick={g.copyInviteLink}>
          {g.copyLinkLabel.startsWith('Ссылка') ? <Check size={14} weight="bold" /> : <LinkIcon size={14} weight="bold" />} {g.copyLinkLabel}
        </button>
      </div>

      <div className="field">
        <label>Игроки ({room.players.length} из 2)</label>
        <div className="chip-list">{room.players.map(p => <PlayerChip key={p.id} player={p} />)}</div>
      </div>

      {g.isHost && enoughPlayers && <button className="primary-btn" onClick={g.startGame}>Начать партию</button>}
      {g.isHost && !enoughPlayers && <p className="hint">Ждём второго игрока…</p>}
      {!g.isHost && <p className="hint">Ожидаем, когда хост начнёт партию…</p>}

      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function BoardScreen(g) {
  const containerRef = useRef(null)

  useEffect(() => {
    const island = mountNardyBoard(containerRef.current, {
      socket: g.socket,
      myPlayerId: g.myPlayerId,
      myColor: g.myColor,
      initialState: g.boardInitialState,
      getRoomPlayers: () => g.currentRoom?.players || [],
    })
    return () => island.destroy()
    // Монтируем остров один раз на партию — g.boardInitialState меняется
    // только когда стартует новая партия (round_started), это и есть нужный триггер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.boardInitialState])

  return (
    <section className="screen active" ref={containerRef}>
      <div className="players-bar">
        <div className="player-badge" id="whitePlayerBadge">
          <span className="color-dot dot-white" />
          <span className="player-badge-name" id="whitePlayerName">—</span>
          <span className="player-badge-score" id="whitePlayerScore">0</span>
        </div>
        <div className="cube-box" id="cubeBox">
          <span className="cube-label">Куб</span>
          <span className="cube-value" id="cubeValueDisplay">1</span>
        </div>
        <div className="player-badge" id="blackPlayerBadge">
          <span className="color-dot dot-black" />
          <span className="player-badge-name" id="blackPlayerName">—</span>
          <span className="player-badge-score" id="blackPlayerScore">0</span>
        </div>
      </div>

      <div className="turn-banner" id="turnBanner">
        <span className="turn-team-dot" id="turnDot" />
        <span id="turnBannerText">Ход белых</span>
      </div>

      <div className="board-scroll">
        <div className="board-frame" id="boardFrame" />
        <div className="dice-throw-overlay hidden" id="diceThrowOverlay">
          <div className="throw-die" id="throwDie1">1</div>
          <div className="throw-die" id="throwDie2">1</div>
        </div>
      </div>

      <div className="dice-row" id="diceRow">
        <div className="dice-faces" id="diceFaces" />
        <div className="dice-chips" id="diceChips" />
      </div>

      <div className="action-row">
        <button id="rollDiceBtn" type="button" className="primary-btn hidden">🎲 Бросить кости</button>
        <button id="offerDoubleBtn" type="button" className="secondary-btn hidden">×2 Предложить куб</button>
      </div>

      <p className="hint hidden" id="waitTurnHint">Ход соперника…</p>

      <div className="double-offer-box hidden" id="doubleOfferBox">
        <p id="doubleOfferText">Соперник предлагает удвоить куб</p>
        <div className="double-offer-actions">
          <button id="acceptDoubleBtn" type="button" className="primary-btn">Принять</button>
          <button id="declineDoubleBtn" type="button" className="secondary-btn">Отказаться</button>
        </div>
      </div>

      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>

      <button type="button" className={'skip-vote-btn' + (g.myVoted ? ' voted' : '')} onClick={g.voteSkip}>
        <SkipForward size={14} weight="bold" style={{ verticalAlign: -2 }} /> Скип ({g.skipVote.votes}/{g.skipVote.needed})
      </button>
    </section>
  )
}

function EndScreen(g) {
  const data = g.endData
  const iWon = data.winnerColor === g.myColor
  let line = `${COLOR_LABEL_CAP[data.winnerColor]} выигрывают`
  if (data.declined) line += ' — соперник отказался от удвоения куба.'
  else if (data.marsa) line += ' МАРС! Соперник не успел вывести ни одной шашки.'
  else line += '.'
  line += ` +${data.points} ${data.points === 1 ? 'очко' : 'очка'}${data.cubeValue > 1 ? ` (куб ×${data.cubeValue})` : ''}.`

  const players = data.players || g.currentRoom?.players || []
  const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0))

  return (
    <section className="screen active">
      <h2>{iWon ? <><Trophy size={22} weight="bold" style={{ verticalAlign: -3 }} /> Вы выиграли!</> : '😔 Соперник выиграл'}</h2>
      <p className="end-line">{line}</p>

      <div className="field">
        <label>Счёт</label>
        <div className="chip-list">
          {sorted.map(p => (
            <span className="player-chip" key={p.id}>
              <span className={'color-dot dot-' + (p.color || 'white')} /> <AvatarIcon avatar={p.avatar} /> <b>{p.name}</b> <span className="score-value">{p.score || 0}</span>
            </span>
          ))}
        </div>
      </div>

      {g.isHost ? (
        <button className="primary-btn" onClick={g.playAgain}>Новая партия</button>
      ) : (
        <p className="hint">Ждите, пока хост начнёт новую партию…</p>
      )}
      <PartySection currentKey="nardy" standings={data.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function SkippedScreen(g) {
  return (
    <section className="screen active">
      <h2><SkipForward size={22} weight="bold" style={{ verticalAlign: -3 }} /> Игра пропущена</h2>
      <p className="hint">Большинство игроков проголосовало пропустить эту игру.</p>
      <PartySection currentKey="nardy" standings={g.skippedData?.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

export default function App() {
  const g = useNardyGame()
  const wide = g.screen === 'board'

  return (
    <div id="app" className={wide ? 'wide' : ''}>
      {g.screen === 'menu' && <MenuScreen {...g} />}
      {g.screen === 'lobby' && g.currentRoom && <LobbyScreen {...g} />}
      {g.screen === 'board' && g.boardInitialState && <BoardScreen {...g} />}
      {g.screen === 'end' && g.endData && <EndScreen {...g} />}
      {g.screen === 'skipped' && <SkippedScreen {...g} />}

      <div className="credit">✨ Навайбкодил <b>Papaluha</b> ✨</div>
    </div>
  )
}
