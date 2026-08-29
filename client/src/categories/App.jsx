import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Lightning,
  Trophy,
  SkipForward,
  Link as LinkIcon,
  Check,
} from '@phosphor-icons/react'
import { AVATARS, useCategoriesGame } from './useCategoriesGame'

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

function PlayerChip({ player, medalClass, medal, showScore }) {
  return (
    <span className={'player-chip' + (medalClass || '') + (player.connected === false ? ' disconnected' : '')}>
      {medal || ''}<AvatarIcon avatar={player.avatar} /> {player.name}
      {player.isHost && <span className="host-tag"> ★ хост</span>}
      {player.connected === false && ' ⏳'}
      {showScore && <> <span className="score-value">{player.score || 0}</span></>}
    </span>
  )
}

function MenuScreen(g) {
  const invited = !!g.inviteCode
  return (
    <section className="screen active">
      <a className="back-link" href="/"><ArrowLeft size={12} weight="bold" style={{ verticalAlign: -1 }} /> Все игры</a>
      <h1><Lightning size={26} weight="bold" style={{ verticalAlign: -4 }} /> Категории</h1>
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
  const [rounds, setRounds] = useState(room.settings.totalRounds)
  const [seconds, setSeconds] = useState(room.settings.roundSeconds)
  useEffect(() => {
    setRounds(room.settings.totalRounds)
    setSeconds(room.settings.roundSeconds)
  }, [room.settings.totalRounds, room.settings.roundSeconds])

  const enoughPlayers = room.players.length >= 2
  const commitSettings = () => {
    if (g.isHost) g.pushSettings(parseInt(rounds, 10) || 5, parseInt(seconds, 10) || 60)
  }

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
        <label htmlFor="lobbyTotalRounds">Раундов</label>
        <input type="number" id="lobbyTotalRounds" min={1} max={10} disabled={!g.isHost}
          value={rounds} onChange={e => setRounds(e.target.value)} onBlur={commitSettings} />
      </div>

      <div className="field">
        <label htmlFor="lobbyRoundSeconds">Секунд на раунд</label>
        <input type="number" id="lobbyRoundSeconds" min={20} max={120} disabled={!g.isHost}
          value={seconds} onChange={e => setSeconds(e.target.value)} onBlur={commitSettings} />
      </div>

      <div className="field">
        <label>Игроки ({room.players.length})</label>
        <div className="chip-list">{room.players.map(p => <PlayerChip key={p.id} player={p} />)}</div>
      </div>

      {g.isHost && <button className="primary-btn" disabled={!enoughPlayers} onClick={g.startGame}>Начать игру</button>}
      {!g.isHost && <p className="hint">Ожидаем, когда хост начнёт игру…</p>}
      {g.isHost && !enoughPlayers && <p className="hint">Нужно минимум 2 игрока</p>}

      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
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

function WritingScreen(g) {
  const data = g.writingData
  useTick(!data.submitted && !g.submitted)

  const remaining = Math.max(0, data.endsAt - Date.now())
  const totalSeconds = Math.ceil(remaining / 1000)
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const ss = String(totalSeconds % 60).padStart(2, '0')
  const warnThreshold = Math.min(10000, data.totalMs * 0.25)
  const isWarning = remaining <= warnThreshold
  const progress = data.totalMs > 0 ? remaining / data.totalMs : 0

  return (
    <section className="screen active">
      <p className="hint">Раунд {data.round} из {data.totalRounds}</p>

      <div className="letter-badge-wrap">
        <div className="letter-badge">{data.letter}</div>
      </div>

      <div className="timer-block">
        <div className={'timer-ring' + (isWarning ? ' warning' : '')} style={{ '--progress': progress }}>
          <div className="timer-ring-inner">
            <span className={'timer-display' + (isWarning ? ' warning' : '')}>{mm}:{ss}</span>
          </div>
        </div>
      </div>

      <div className="answers-container">
        {data.categories.map((cat, i) => (
          <div className="answer-field" key={cat}>
            <label>{cat}</label>
            <input
              type="text" maxLength={30} autoComplete="off"
              placeholder={`Слово на «${data.letter}»…`}
              disabled={g.submitted}
              value={g.answers[i] || ''}
              onChange={e => g.setAnswers(a => { const next = [...a]; next[i] = e.target.value; return next })}
            />
          </div>
        ))}
      </div>

      {!g.submitted && <button className="primary-btn" onClick={g.submitAnswers}>Ответить</button>}
      {g.submitted && (
        <p className="hint">
          {g.submitProgress ? `Ответили: ${g.submitProgress.submittedCount} из ${g.submitProgress.total}` : 'Ответ принят. Ждём остальных…'}
        </p>
      )}
      {g.isHost && <button className="secondary-btn" onClick={g.forceFinalizeRound}>Завершить раунд досрочно</button>}
    </section>
  )
}

function ResultsScreen(g) {
  const data = g.resultsData
  const isLast = data.round >= data.totalRounds
  return (
    <section className="screen active">
      <p className="hint">Раунд {data.round} из {data.totalRounds}</p>
      <h2>Буква «{data.letter}»</h2>

      <div className="results-container">
        {data.resultsByCategory.map(cat => (
          <div className="category-result-block" key={cat.category}>
            <span className="category-result-title">{cat.category}</span>
            {cat.entries.map((e, i) => (
              <div className={'result-entry' + (e.valid ? '' : ' invalid')} key={i}>
                <span className="result-entry-name">
                  <AvatarIcon avatar={e.avatar} /><span className="rn-name">{e.name}</span>
                </span>
                <span className="result-entry-answer">{e.answer && e.answer.length ? e.answer : '—'}</span>
                <span className={'points-badge' + (e.points === 2 ? ' pts-2' : e.points === 1 ? ' pts-1' : '')}>{e.points}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {g.isHost ? (
        <button className="primary-btn" onClick={g.nextRound}>{isLast ? 'Завершить игру' : 'Следующий раунд'}</button>
      ) : (
        <p className="hint">Хост переключит на следующий раунд…</p>
      )}
    </section>
  )
}

function EndScreen(g) {
  const data = g.endData
  const medals = ['🥇 ', '🥈 ', '🥉 ']
  const medalClasses = [' medal-1', ' medal-2', ' medal-3']
  const sorted = [...data.players].sort((a, b) => (b.score || 0) - (a.score || 0))
  return (
    <section className="screen active">
      <h2><Trophy size={22} weight="bold" style={{ verticalAlign: -3 }} /> Итоги игры</h2>
      <div className="field">
        <label>Финальный счёт</label>
        <div className="chip-list">
          {sorted.map((p, i) => (
            <PlayerChip key={p.id} player={p} medal={i < 3 ? medals[i] : ''} medalClass={i < 3 ? medalClasses[i] : ''} showScore />
          ))}
        </div>
      </div>
      {g.isHost ? (
        <button className="primary-btn" onClick={g.playAgain}>Новая игра (в лобби)</button>
      ) : (
        <p className="hint">Ждите, пока хост начнёт новую игру…</p>
      )}
      <PartySection currentKey="categories" standings={data.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function SkippedScreen(g) {
  return (
    <section className="screen active">
      <h2><SkipForward size={22} weight="bold" style={{ verticalAlign: -3 }} /> Игра пропущена</h2>
      <p className="hint">Большинство игроков проголосовало пропустить эту игру.</p>
      <PartySection currentKey="categories" standings={g.skippedData?.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

export default function App() {
  const g = useCategoriesGame()
  const showSkipButton = g.screen === 'writing' || g.screen === 'results'

  return (
    <div id="app">
      {showSkipButton && (
        <button type="button" className={'skip-vote-btn' + (g.myVoted ? ' voted' : '')} onClick={g.voteSkip}>
          <SkipForward size={14} weight="bold" style={{ verticalAlign: -2 }} /> Скип ({g.skipVote.votes}/{g.skipVote.needed})
        </button>
      )}

      {g.screen === 'menu' && <MenuScreen {...g} />}
      {g.screen === 'lobby' && g.currentRoom && <LobbyScreen {...g} />}
      {g.screen === 'writing' && g.writingData && <WritingScreen {...g} />}
      {g.screen === 'results' && g.resultsData && <ResultsScreen {...g} />}
      {g.screen === 'end' && g.endData && <EndScreen {...g} />}
      {g.screen === 'skipped' && <SkippedScreen {...g} />}

      <div className="credit">✨ Навайбкодил <b>Papaluha</b> ✨</div>
    </div>
  )
}
