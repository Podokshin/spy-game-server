import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  MaskHappy,
  MagnifyingGlass,
  Trophy,
  SkipForward,
  Link as LinkIcon,
  Check,
  Confetti,
} from '@phosphor-icons/react'
import { AVATARS, useMissionGame } from './useMissionGame'
import Header from '../components/Header'
import Credit from '../components/Credit'
import SidePanel from '../components/SidePanel'
import { useVideoToggle } from '../lib/useVideoToggle'
import RulesPanel from './RulesPanel'

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

function PlayerChip({ player, showScore }) {
  return (
    <span className={'player-chip' + (player.connected === false ? ' disconnected' : '')}>
      <AvatarIcon avatar={player.avatar} /> {player.name}
      {player.isHost && <span className="host-tag"> ★ хост</span>}
      {player.connected === false && ' ⏳'}
      {showScore && <> <span className="score-value">{player.score || 0}</span></>}
    </span>
  )
}

function useTick(active, intervalMs = 250) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick(t => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])
}

function MenuScreen(g) {
  const invited = !!g.inviteCode
  return (
    <section className="screen active">
      <a className="back-link" href="/"><ArrowLeft size={12} weight="bold" style={{ verticalAlign: -1 }} /> Все игры</a>
      <h1><MaskHappy size={26} weight="bold" style={{ verticalAlign: -4 }} /> Тайная миссия</h1>
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
  const [timerEnabled, setTimerEnabled] = useState(room.settings.timerEnabled)
  const [minutes, setMinutes] = useState(room.settings.timerMinutes)
  useEffect(() => {
    setTimerEnabled(room.settings.timerEnabled)
    setMinutes(room.settings.timerMinutes)
  }, [room.settings.timerEnabled, room.settings.timerMinutes])

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
        <label className="checkbox-field-label">
          <input
            type="checkbox" checked={timerEnabled} disabled={!g.isHost}
            onChange={e => { const v = e.target.checked; setTimerEnabled(v); if (g.isHost) g.pushSettings(v, minutes) }}
          />
          Таймер на выполнение миссий
        </label>
      </div>

      {timerEnabled && (
        <div className="field">
          <label htmlFor="lobbyTimerMinutes">Минут на раунд</label>
          <input
            type="number" id="lobbyTimerMinutes" min={1} max={30} disabled={!g.isHost}
            value={minutes} onChange={e => setMinutes(e.target.value)}
            onBlur={() => g.isHost && g.pushSettings(timerEnabled, parseInt(minutes, 10) || 6)}
          />
        </div>
      )}

      <div className="field">
        <label>Игроки ({room.players.length})</label>
        <div className="chip-list">{room.players.map(p => <PlayerChip key={p.id} player={p} />)}</div>
      </div>

      {g.isHost && <button className="primary-btn" disabled={!enoughPlayers} onClick={g.startGame}>Начать игру</button>}
      {!g.isHost && <p className="hint">Ожидаем, когда хост начнёт игру…</p>}
      {g.isHost && !enoughPlayers && <p className="hint">Нужно минимум 3 игрока</p>}

      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function MissionScreen(g) {
  return (
    <section className="screen active">
      <div className="role-card normal">
        <p className="role-title"><MaskHappy size={26} weight="bold" style={{ verticalAlign: -4 }} /> Твоя секретная миссия</p>
        <p className="role-location">{g.missionData.missionText}</p>
        <p className="role-hint">Выполни это незаметно во время обычного разговора — так, чтобы никто не догадался, что это специальное задание.</p>
        {g.readyHint === null && <button className="primary-btn" onClick={g.markReady}>Я запомнил(а), готов(а)</button>}
      </div>
      {g.readyHint !== null && <p className="hint">{g.readyHint}</p>}
      {g.isHost && <button className="secondary-btn" onClick={g.forceStartDiscussion}>Начать раунд, не дожидаясь всех</button>}
    </section>
  )
}

function DiscussionScreen(g) {
  const data = g.discussionData
  useTick(data.enabled && !data.paused)

  let mm = '00', ss = '00', isWarning = false, progress = 1
  if (data.enabled) {
    const remaining = data.paused ? data.remainingMs : Math.max(0, data.endsAt - Date.now())
    const totalSeconds = Math.ceil(remaining / 1000)
    mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
    ss = String(totalSeconds % 60).padStart(2, '0')
    isWarning = remaining <= 30000
    progress = data.totalMs > 0 ? remaining / data.totalMs : 0
  }

  return (
    <section className="screen active">
      <h2>Раунд начался!</h2>
      <p className="discuss-hint">Общайтесь как обычно и постарайтесь незаметно выполнить свою миссию.</p>

      {data.enabled && (
        <div className="timer-block">
          <div className={'timer-ring' + (isWarning ? ' warning' : '')} style={{ '--progress': progress }}>
            <div className="timer-ring-inner">
              <span className={'timer-display' + (isWarning ? ' warning' : '')}>{mm}:{ss}</span>
            </div>
          </div>
          {g.isHost && <button className="secondary-btn" onClick={g.togglePause}>{data.paused ? 'Продолжить' : 'Пауза'}</button>}
        </div>
      )}

      {g.isHost ? (
        <button className="primary-btn" onClick={g.endDiscussion}>Завершить и раскрыть миссии</button>
      ) : (
        <p className="hint">Решение о завершении принимает хост.</p>
      )}
    </section>
  )
}

function GuessingScreen(g) {
  const data = g.guessingData
  const result = g.guessResult
  return (
    <section className="screen active">
      <h2><MagnifyingGlass size={22} weight="bold" style={{ verticalAlign: -3 }} /> Раскрытие миссий</h2>
      <p className="hint">Миссия {data.guessIndex + 1} из {data.total}</p>

      <div className="field">
        <label>Миссия</label>
        <p className="role-location">{data.missionText}</p>
      </div>

      {!result && (
        <div className="field">
          <label>Кто её выполнил?</label>
          <div className="vote-options">
            {data.players.map(p => (
              <button
                key={p.id} type="button" disabled={g.guessSubmitted}
                className={'vote-option-btn' + (g.guessTarget === p.id ? ' selected' : '')}
                onClick={() => g.setGuessTarget(p.id)}
              >
                <AvatarIcon avatar={p.avatar} size={16} /> {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!result && !g.guessSubmitted && (
        <button className="primary-btn" disabled={!g.guessTarget} onClick={g.castGuess}>Ответить</button>
      )}
      {!result && g.guessSubmitted && <p className="hint">{g.guessWaitText}</p>}
      {!result && g.isHost && <button className="secondary-btn" onClick={g.forceFinishGuess}>Показать ответ сейчас</button>}

      {result && (
        <div className="field">
          <label>Ответ</label>
          <p className="end-line">Миссию выполнил(а): <b><AvatarIcon avatar={result.ownerAvatar} /> {result.ownerName}</b></p>
          <p className="end-line">
            {result.caught
              ? <><Confetti size={16} weight="bold" style={{ verticalAlign: -2 }} /> Спалили! Угадали: {(result.correctGuesserNames || []).join(', ') || '—'}</>
              : <><MagnifyingGlass size={16} weight="bold" style={{ verticalAlign: -2 }} /> Никто не догадался — миссия выполнена незаметно!</>}
          </p>
        </div>
      )}

      {result && (
        g.isHost ? (
          <button className="primary-btn" onClick={g.nextGuess}>{data.guessIndex + 1 >= data.total ? 'Завершить игру' : 'Следующая миссия'}</button>
        ) : (
          <p className="hint">Хост переключит на следующую миссию…</p>
        )
      )}
    </section>
  )
}

function EndScreen(g) {
  const data = g.endData
  const sorted = [...data.players].sort((a, b) => (b.score || 0) - (a.score || 0))
  return (
    <section className="screen active">
      <h2><Trophy size={22} weight="bold" style={{ verticalAlign: -3 }} /> Итоги игры</h2>
      <div className="field">
        <label>Счёт</label>
        <div className="chip-list">{sorted.map(p => <PlayerChip key={p.id} player={p} showScore />)}</div>
      </div>
      {g.isHost ? (
        <button className="primary-btn" onClick={g.playAgain}>Новая игра (в лобби)</button>
      ) : (
        <p className="hint">Ждите, пока хост начнёт новую игру…</p>
      )}
      <PartySection currentKey="mission" standings={data.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function SkippedScreen(g) {
  return (
    <section className="screen active">
      <h2><SkipForward size={22} weight="bold" style={{ verticalAlign: -3 }} /> Игра пропущена</h2>
      <p className="hint">Большинство игроков проголосовало пропустить эту игру.</p>
      <PartySection currentKey="mission" standings={g.skippedData?.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

export default function App() {
  const g = useMissionGame()
  const video = useVideoToggle()
  const showSkipButton = g.screen === 'mission' || g.screen === 'discussion' || g.screen === 'guessing'
  const me = g.currentRoom?.players.find(p => p.id === g.myPlayerId)

  return (
    <div className="gc-page">
      <Header score={typeof me?.score === 'number' ? me.score : undefined} />

      <div className="gc-body">
        <RulesPanel />

        <div id="app">
          {showSkipButton && (
            <button type="button" className={'skip-vote-btn' + (g.myVoted ? ' voted' : '')} onClick={g.voteSkip}>
              <SkipForward size={14} weight="bold" style={{ verticalAlign: -2 }} /> Скип ({g.skipVote.votes}/{g.skipVote.needed})
            </button>
          )}

          {g.screen === 'menu' && <MenuScreen {...g} />}
          {g.screen === 'lobby' && g.currentRoom && <LobbyScreen {...g} />}
          {g.screen === 'mission' && g.missionData && <MissionScreen {...g} />}
          {g.screen === 'discussion' && g.discussionData && <DiscussionScreen {...g} />}
          {g.screen === 'guessing' && g.guessingData && <GuessingScreen {...g} />}
          {g.screen === 'end' && g.endData && <EndScreen {...g} />}
          {g.screen === 'skipped' && <SkippedScreen {...g} />}
        </div>

        <SidePanel players={g.currentRoom?.players || []} videoEnabled={video.enabled} />
      </div>

      <Credit enabled={video.enabled} onToggle={video.toggle} />
    </div>
  )
}
