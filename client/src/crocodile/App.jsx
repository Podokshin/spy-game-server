import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  PaintBrush,
  Palette,
  Eye,
  Trophy,
  SkipForward,
  Link as LinkIcon,
  Check,
  Circle,
  Eraser,
  ArrowCounterClockwise,
  Trash,
  PaperPlaneRight,
} from '@phosphor-icons/react'
import { AVATARS, useCrocodileGame } from './useCrocodileGame'
import Header from '../components/Header'
import Credit from '../components/Credit'
import SidePanel from '../components/SidePanel'
import { useVideoToggle } from '../lib/useVideoToggle'
import RulesPanel from './RulesPanel'
import { mountDrawingIsland } from './drawingIsland'

const AVATAR_LABELS = { bandit: 'Разбойник', viking: 'Викинг', astronaut: 'Космонавт', scout: 'Скаут', merc: 'Наёмник', miner: 'Шахтёр', alien: 'Пришелец', hero: 'Герой', assassin: 'Ассасин', warrior: 'Воин', nomad: 'Кочевница', sleepy: 'Соня' }

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

function SkipVoteButton(g) {
  return (
    <button type="button" className={'skip-vote-btn' + (g.myVoted ? ' voted' : '')} onClick={g.voteSkip}>
      <SkipForward size={14} weight="bold" style={{ verticalAlign: -2 }} /> Скип ({g.skipVote.votes}/{g.skipVote.needed})
    </button>
  )
}

function MenuScreen(g) {
  const invited = !!g.inviteCode
  return (
    <section className="screen active">
      <a className="back-link" href="/"><ArrowLeft size={12} weight="bold" style={{ verticalAlign: -1 }} /> Все игры</a>
      <h1><PaintBrush size={26} weight="bold" style={{ verticalAlign: -4 }} /> Крокодил</h1>
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
  const enoughPlayers = room.players.length >= 3
  return (
    <section className="screen active">
      <h2>Лобби</h2>

      <div className="room-code-box">
        <span className="room-code-label">Код комнаты — скажите друзьям</span>
        <span className="room-code">{room.code}</span>
        <button type="button" className="secondary-btn copy-link-btn" onClick={g.copyInviteLink}>
          {g.copyLinkLabel.startsWith('Ссылка') ? <Check size={14} weight="bold" /> : <LinkIcon size={14} weight="bold" />} {g.copyLinkLabel}
        </button>
      </div>

      <div className="field">
        <label htmlFor="totalRoundsInput">Раундов</label>
        <input type="number" id="totalRoundsInput" min={1} max={20} value={room.settings.totalRounds} disabled={!g.isHost}
          onChange={e => g.updateSettings({ totalRounds: parseInt(e.target.value, 10) || 6 })} />
      </div>

      <div className="field">
        <label htmlFor="roundSecondsInput">Секунд на раунд</label>
        <input type="number" id="roundSecondsInput" min={30} max={180} value={room.settings.roundSeconds} disabled={!g.isHost}
          onChange={e => g.updateSettings({ roundSeconds: parseInt(e.target.value, 10) || 80 })} />
      </div>

      <div className="field">
        <label>Игроки ({room.players.length})</label>
        <div className="chip-list">{room.players.map(p => <PlayerChip key={p.id} player={p} />)}</div>
      </div>

      {g.isHost && <button className="primary-btn" onClick={g.startGame} disabled={!enoughPlayers}>Начать игру</button>}
      {!g.isHost && <p className="hint">Ожидаем, когда хост начнёт игру…</p>}
      {g.isHost && !enoughPlayers && <p className="hint">Нужно минимум 3 игрока</p>}

      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function ChoosingScreen(g) {
  const c = g.choosingData
  const [chosen, setChosen] = useState(false)
  useEffect(() => { setChosen(false) }, [c.artistId, c.round])

  function pick(word) {
    setChosen(true)
    g.chooseWord(word)
  }

  return (
    <section className="screen active">
      <p className="subtitle">Раунд {c.round} из {c.totalRounds}</p>
      <h2><Palette size={22} weight="bold" style={{ verticalAlign: -3 }} /> Выберите слово</h2>

      {c.isArtist && c.choices.length > 0 && (
        <div className="word-choice-grid">
          {c.choices.map(w => (
            <button key={w} type="button" className="word-choice-btn" disabled={chosen} onClick={() => pick(w)}>{w}</button>
          ))}
        </div>
      )}
      {!c.isArtist && <p className="hint">✏️ {c.artistName || 'Игрок'} выбирает слово…</p>}

      <SkipVoteButton {...g} />
    </section>
  )
}

const BRUSH_SIZES = [
  ['brushThinBtn', 10, 'Тонкая кисть'],
  ['brushMediumBtn', 16, 'Средняя кисть'],
  ['brushThickBtn', 22, 'Толстая кисть'],
]

function DrawingScreen(g) {
  const containerRef = useRef(null)
  const d = g.drawingRoundData

  useEffect(() => {
    const island = mountDrawingIsland(containerRef.current, {
      socket: g.socket,
      myPlayerId: g.myPlayerId,
      isArtist: d.isArtist,
      artistId: d.artistId,
      artistName: d.artistName,
      wordLength: d.wordLength,
      endsAt: d.endsAt,
      totalMs: d.totalMs,
      initialStrokes: d.initialStrokes,
      initialCorrectGuessers: d.initialCorrectGuessers,
      initiallyGuessed: d.initiallyGuessed,
      totalGuessers: (g.currentRoom?.players.length || 1) - 1,
      initialArtistWord: g.artistWord,
    })
    return () => island.destroy()
    // Монтируем остров один раз на раунд — d меняется только при старте
    // нового раунда (round_started/rejoin), это и есть нужный триггер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d])

  useEffect(() => {
    // Событие 'your_word' от сервера может прийти раньше, чем остров успеет
    // подписаться на него сам (races с монтированием эффекта выше) — этот
    // хук слушает то же состояние на уровне игры (useCrocodileGame подписан
    // с самого первого рендера, гонка ему не грозит) и досылает слово в
    // DOM бейджа напрямую, без пересоздания острова.
    if (d.isArtist && g.artistWord && containerRef.current) {
      const badge = containerRef.current.querySelector('#drawArtistBadge')
      if (badge) badge.textContent = `✏️ Вы рисуете: ${g.artistWord}`
    }
  }, [g.artistWord, d.isArtist])

  return (
    <section className="screen active" ref={containerRef}>
      <div className="draw-top-bar">
        <span className="draw-artist-badge" id="drawArtistBadge">—</span>
        <span className="draw-timer" id="drawTimer">—</span>
        <span className="draw-progress" id="drawProgress">—</span>
      </div>

      <div className="word-hint hidden" id="wordHintRow" />

      <div className="canvas-wrap">
        <canvas id="drawCanvas" />
      </div>

      <div className="tool-row hidden" id="toolRow">
        <div className="color-swatches" id="colorSwatches" />
        <div className="tool-buttons">
          {BRUSH_SIZES.map(([id, size, title]) => (
            <button key={id} type="button" className={'tool-btn' + (id === 'brushThinBtn' ? ' active' : '')} id={id} title={title}>
              <Circle size={size} weight="fill" />
            </button>
          ))}
          <button type="button" className="tool-btn" id="eraserBtn" title="Ластик"><Eraser size={16} weight="bold" /></button>
          <button type="button" className="tool-btn" id="undoBtn" title="Отменить последний штрих"><ArrowCounterClockwise size={16} weight="bold" /></button>
          <button type="button" className="tool-btn" id="clearCanvasBtn" title="Очистить холст"><Trash size={16} weight="bold" /></button>
        </div>
      </div>

      <div className="guess-chat" id="guessChat" />

      <form className="guess-form hidden" id="guessForm">
        <input type="text" id="guessInput" maxLength={60} placeholder="Ваш ответ…" autoComplete="off" />
        <button type="submit" className="primary-btn"><PaperPlaneRight size={16} weight="bold" /></button>
      </form>
      <p className="hint hidden" id="alreadyGuessedHint">✅ Вы угадали! Ждём остальных…</p>

      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>

      <SkipVoteButton {...g} />
    </section>
  )
}

function RevealScreen(g) {
  const r = g.revealData
  return (
    <section className="screen active">
      <h2><Eye size={22} weight="bold" style={{ verticalAlign: -3 }} /> Слово было: {r.word}</h2>
      {r.timeUp !== null && <p className="hint">{r.timeUp ? '⏰ Время вышло!' : '🎉 Все угадали!'}</p>}

      <div className="field">
        <label>Кто угадал</label>
        <div className="chip-list">
          {r.correctGuessers.length
            ? r.correctGuessers.map(gu => (
              <span className="player-chip correct-guesser" key={gu.playerId}>
                #{gu.rank} <AvatarIcon avatar={gu.avatar} /> {gu.name} <span className="score-value">+{gu.points}</span>
              </span>
            ))
            : <span className="player-chip">Никто не угадал</span>}
        </div>
      </div>

      <div className="field">
        <label>Общий счёт</label>
        <div className="chip-list">
          {[...r.players].sort((a, b) => (b.score || 0) - (a.score || 0)).map(p => (
            <span className="player-chip" key={p.id}><AvatarIcon avatar={p.avatar} /> {p.name} <span className="score-value">{p.score || 0}</span></span>
          ))}
        </div>
      </div>

      {g.isHost ? (
        <button className="primary-btn" onClick={g.nextRound}>Следующий раунд</button>
      ) : (
        <p className="hint">Ждите, хост начнёт следующий раунд…</p>
      )}

      <SkipVoteButton {...g} />
    </section>
  )
}

function EndScreen(g) {
  const data = g.endData
  const sorted = [...data.players].sort((a, b) => (b.score || 0) - (a.score || 0))
  return (
    <section className="screen active">
      <h2><Trophy size={22} weight="bold" style={{ verticalAlign: -3 }} /> Игра окончена</h2>

      <div className="field">
        <label>Итоговый счёт</label>
        <div className="chip-list">
          {sorted.map(p => (
            <span className="player-chip" key={p.id}><AvatarIcon avatar={p.avatar} /> {p.name} <span className="score-value">{p.score || 0}</span></span>
          ))}
        </div>
      </div>

      {g.isHost ? (
        <button className="primary-btn" onClick={g.playAgain}>Новая игра</button>
      ) : (
        <p className="hint">Ждите, пока хост начнёт новую игру…</p>
      )}

      <PartySection currentKey="crocodile" standings={data.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function SkippedScreen(g) {
  return (
    <section className="screen active">
      <h2><SkipForward size={22} weight="bold" style={{ verticalAlign: -3 }} /> Игра пропущена</h2>
      <p className="hint">Большинство игроков проголосовало пропустить эту игру.</p>
      <PartySection currentKey="crocodile" standings={g.skippedData?.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

export default function App() {
  const g = useCrocodileGame()
  const video = useVideoToggle()
  const wide = g.screen === 'drawing'
  const me = g.currentRoom?.players.find(p => p.id === g.myPlayerId)

  return (
    <div className="gc-page">
      <Header score={typeof me?.score === 'number' ? me.score : undefined} />

      <div className="gc-body">
        <RulesPanel />

        <div id="app" className={wide ? 'wide' : ''}>
          {g.screen === 'menu' && <MenuScreen {...g} />}
          {g.screen === 'lobby' && g.currentRoom && <LobbyScreen {...g} />}
          {g.screen === 'choosing' && g.choosingData && <ChoosingScreen {...g} />}
          {g.screen === 'drawing' && g.drawingRoundData && <DrawingScreen {...g} />}
          {g.screen === 'reveal' && g.revealData && <RevealScreen {...g} />}
          {g.screen === 'end' && g.endData && <EndScreen {...g} />}
          {g.screen === 'skipped' && <SkippedScreen {...g} />}
        </div>

        <SidePanel players={g.currentRoom?.players || []} videoEnabled={video.enabled} />
      </div>

      <Credit enabled={video.enabled} onToggle={video.toggle} />
    </div>
  )
}
