import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Waveform,
  Lightbulb,
  Target,
  ChartBar,
  Trophy,
  SkipForward,
  Link as LinkIcon,
  Check,
} from '@phosphor-icons/react'
import { AVATARS, GUESS_TIME_MS, useWavelengthGame } from './useWavelengthGame'

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

function teamLabel(team) {
  return team === 'red' ? '🔴 Команда А' : '🔵 Команда Б'
}

function WaveBar({ left, right, markers }) {
  return (
    <div className="wave-bar">
      <div className="wave-bar-track">
        {markers.map((m, i) => (
          <div key={i} className={'wave-bar-marker ' + m.className} style={{ left: Math.min(100, Math.max(0, m.position)) + '%' }} title={m.title} />
        ))}
      </div>
      <div className="wave-bar-labels">
        <span className="wave-bar-label-left">{left}</span>
        <span className="wave-bar-label-right">{right}</span>
      </div>
    </div>
  )
}

function TeamChip({ player }) {
  return (
    <span className={'player-chip' + (player.connected === false ? ' disconnected' : '')}>
      <AvatarIcon avatar={player.avatar} /> {player.name}
      {player.isHost && <span className="host-tag"> ★</span>}
      {player.connected === false && ' ⏳'}
    </span>
  )
}
function TeamChipList({ players }) {
  if (players.length === 0) return <span className="hint">пусто</span>
  return players.map(p => <TeamChip key={p.id} player={p} />)
}

function MenuScreen(g) {
  const invited = !!g.inviteCode
  return (
    <section className="screen active">
      <a className="back-link" href="/"><ArrowLeft size={12} weight="bold" style={{ verticalAlign: -1 }} /> Все игры</a>
      <h1><Waveform size={26} weight="bold" style={{ verticalAlign: -4 }} /> Волна</h1>
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
  useEffect(() => setRounds(room.settings.totalRounds), [room.settings.totalRounds])

  const redPlayers = room.players.filter(p => p.team === 'red')
  const bluePlayers = room.players.filter(p => p.team === 'blue')
  const unassigned = room.players.filter(p => !p.team)
  const ready = redPlayers.length >= 2 && bluePlayers.length >= 2

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

      <div className="teams-grid">
        <div className="team-panel team-red">
          <h3>🔴 Команда А</h3>
          <div className="chip-list"><TeamChipList players={redPlayers} /></div>
          <div className="team-actions">
            <button type="button" className="secondary-btn" onClick={() => g.setTeam(g.myTeam === 'red' ? null : 'red')}>
              {g.myTeam === 'red' ? 'Покинуть команду' : 'Вступить'}
            </button>
          </div>
        </div>
        <div className="team-panel team-blue">
          <h3>🔵 Команда Б</h3>
          <div className="chip-list"><TeamChipList players={bluePlayers} /></div>
          <div className="team-actions">
            <button type="button" className="secondary-btn" onClick={() => g.setTeam(g.myTeam === 'blue' ? null : 'blue')}>
              {g.myTeam === 'blue' ? 'Покинуть команду' : 'Вступить'}
            </button>
          </div>
        </div>
      </div>

      {unassigned.length > 0 && (
        <div className="field">
          <label>Без команды</label>
          <div className="chip-list"><TeamChipList players={unassigned} /></div>
        </div>
      )}

      <div className="field">
        <label htmlFor="lobbyRounds">Раундов в игре (по очереди каждой команде)</label>
        <input
          type="number" id="lobbyRounds" min={4} max={20} step={2} disabled={!g.isHost}
          value={rounds} onChange={e => setRounds(e.target.value)}
          onBlur={() => g.isHost && g.updateSettings(parseInt(rounds, 10) || 8)}
        />
      </div>

      {g.isHost && <button className="primary-btn" disabled={!ready} onClick={g.startGame}>Начать игру</button>}
      {!g.isHost && <p className="hint">Ожидаем, когда хост начнёт игру…</p>}
      {g.isHost && !ready && <p className="hint">В каждой команде нужно минимум 2 игрока</p>}

      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function ClueScreen(g) {
  const data = g.clueData
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  if (data.mode === 'giver') {
    return (
      <section className="screen active">
        <h2><Lightbulb size={20} weight="bold" style={{ verticalAlign: -3 }} /> Подсказка</h2>
        <p className="hint">Раунд {data.round} из {data.totalRounds}</p>

        <div className="field">
          <WaveBar left={data.spectrum.left} right={data.spectrum.right} markers={[
            { className: 'marker-target', position: data.target, title: 'Секретная точка — её видите только вы' },
          ]} />
        </div>

        <div className="field">
          <label htmlFor="clueInput">Ваша подсказка (одна фраза)</label>
          <input type="text" id="clueInput" maxLength={40} placeholder='Например: «почти как отпуск»' value={text} onChange={e => setText(e.target.value)} disabled={submitted} />
        </div>
        <button className="primary-btn" disabled={submitted} onClick={() => { const t = text.trim(); if (!t) return; setSubmitted(true); g.submitClue(t) }}>Дать подсказку</button>

        {g.isHost && <button className="secondary-btn" onClick={g.forceFinalizeRound}>Пропустить раунд (подсказчик пропал)</button>}
      </section>
    )
  }

  const amOnTeam = g.myTeam === data.team
  return (
    <section className="screen active">
      <h2><Lightbulb size={20} weight="bold" style={{ verticalAlign: -3 }} /> Подсказка</h2>
      <p className="hint">Раунд {data.round} из {data.totalRounds}</p>

      <div className="field">
        <WaveBar left={data.spectrum.left} right={data.spectrum.right} markers={[]} />
      </div>

      {amOnTeam ? (
        <p className="hint">Ждём подсказку от <AvatarIcon avatar={data.giverAvatar} /> {data.giverName}…</p>
      ) : (
        <p className="hint">Сейчас ход команды {teamLabel(data.team)}, вы наблюдаете</p>
      )}
      {g.isHost && <button className="secondary-btn" onClick={g.forceFinalizeRound}>Пропустить раунд (подсказчик пропал)</button>}
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

function GuessScreen(g) {
  const data = g.guessData
  const [sliderVal, setSliderVal] = useState(data.myGuess != null ? data.myGuess : 50)
  const [answered, setAnswered] = useState(data.myGuess != null)
  useTick(true)

  const remaining = Math.max(0, data.endsAt - Date.now())
  const totalSeconds = Math.ceil(remaining / 1000)
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const ss = String(totalSeconds % 60).padStart(2, '0')
  const isWarning = remaining <= 10000
  const progress = GUESS_TIME_MS > 0 ? remaining / GUESS_TIME_MS : 0

  return (
    <section className="screen active">
      <h2><Target size={20} weight="bold" style={{ verticalAlign: -3 }} /> Угадайте позицию</h2>
      <p className="hint">Раунд {data.round} из {data.totalRounds}</p>

      <div className="clue-box">
        <span className="clue-label">Подсказка</span>
        <span className="clue-text">{data.text}</span>
      </div>

      <div className="field">
        <WaveBar left={data.spectrum.left} right={data.spectrum.right} markers={data.amGuesser ? [{ className: 'marker-preview', position: sliderVal }] : []} />
      </div>

      {data.amGuesser && (
        <div className="field">
          <input type="range" min={0} max={100} value={sliderVal} disabled={answered} onChange={e => setSliderVal(parseInt(e.target.value, 10))} />
          <button className="primary-btn" disabled={answered} onClick={() => { setAnswered(true); g.submitGuess(sliderVal) }}>
            {answered ? 'Ответ отправлен' : 'Ответить'}
          </button>
        </div>
      )}

      <div className="timer-block">
        <div className={'timer-ring' + (isWarning ? ' warning' : '')} style={{ '--progress': progress }}>
          <div className="timer-ring-inner">
            <span className={'timer-display' + (isWarning ? ' warning' : '')}>{mm}:{ss}</span>
          </div>
        </div>
      </div>

      <p className="hint">Ответили: {g.guessProgress.count} из {g.guessProgress.total}</p>
      {g.isHost && <button className="secondary-btn" onClick={g.forceFinalizeRound}>Показать результат сейчас</button>}
    </section>
  )
}

function pointsWord(n) {
  const mod10 = n % 10, mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return 'очков'
  if (mod10 === 1) return 'очко'
  if (mod10 >= 2 && mod10 <= 4) return 'очка'
  return 'очков'
}

function RevealScreen(g) {
  const data = g.revealData
  const markers = [
    { className: 'marker-target', position: data.target, title: 'Секретная точка: ' + data.target },
    { className: 'marker-avg', position: data.avg, title: 'Средний ответ команды: ' + Math.round(data.avg) },
    ...(data.guessDetail || []).map(gd => ({ className: 'marker-guess', position: gd.position, title: `${gd.name}: ${gd.position}` })),
  ]
  const isLast = data.round >= data.totalRounds

  return (
    <section className="screen active">
      <h2><ChartBar size={20} weight="bold" style={{ verticalAlign: -3 }} /> Результат раунда</h2>
      <p className="hint">Раунд {data.round} из {data.totalRounds}</p>

      <div className="field">
        <WaveBar left={data.spectrum.left} right={data.spectrum.right} markers={markers} />
      </div>

      <p className="end-line">{teamLabel(data.team)} получает <b>{data.pts}</b> {pointsWord(data.pts)}{data.timeUp ? ' (время вышло)' : ''}</p>

      <div className="score-row">
        <span className="score-pill score-red">🔴 {data.teamScores.red}</span>
        <span className="score-pill score-blue">🔵 {data.teamScores.blue}</span>
      </div>

      <div className="field">
        <label>Кто как ответил</label>
        <div className="chip-list">
          {(data.guessDetail || []).length === 0 && <span className="hint">Никто не успел ответить</span>}
          {(data.guessDetail || []).map((gd, i) => (
            <span className="player-chip" key={i}><AvatarIcon avatar={gd.avatar} /> {gd.name} <span className="guess-value">{gd.position}</span></span>
          ))}
        </div>
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
  const scores = data.teamScores
  const winner = scores.red === scores.blue ? null : (scores.red > scores.blue ? 'red' : 'blue')
  return (
    <section className="screen active">
      <h2><Trophy size={22} weight="bold" style={{ verticalAlign: -3 }} /> Итоги игры</h2>
      <p className="end-line">{winner ? <>🏆 Победила команда <b>{teamLabel(winner)}</b>!</> : '🤝 Ничья!'}</p>

      <div className="score-row">
        <span className="score-pill score-red">🔴 {scores.red}</span>
        <span className="score-pill score-blue">🔵 {scores.blue}</span>
      </div>

      {g.isHost ? (
        <button className="primary-btn" onClick={g.playAgain}>Новая игра (в лобби)</button>
      ) : (
        <p className="hint">Ждите, пока хост начнёт новую игру…</p>
      )}
      <PartySection currentKey="wavelength" standings={data.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function SkippedScreen(g) {
  return (
    <section className="screen active">
      <h2><SkipForward size={22} weight="bold" style={{ verticalAlign: -3 }} /> Игра пропущена</h2>
      <p className="hint">Большинство игроков проголосовало пропустить эту игру.</p>
      <PartySection currentKey="wavelength" standings={g.skippedData?.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

export default function App() {
  const g = useWavelengthGame()
  const showSkipButton = ['clue', 'guess', 'reveal'].includes(g.screen)

  return (
    <div id="app">
      {showSkipButton && (
        <button type="button" className={'skip-vote-btn' + (g.myVoted ? ' voted' : '')} onClick={g.voteSkip}>
          <SkipForward size={14} weight="bold" style={{ verticalAlign: -2 }} /> Скип ({g.skipVote.votes}/{g.skipVote.needed})
        </button>
      )}

      {g.screen === 'menu' && <MenuScreen {...g} />}
      {g.screen === 'lobby' && g.currentRoom && <LobbyScreen {...g} />}
      {g.screen === 'clue' && g.clueData && <ClueScreen {...g} key={g.clueData.round + g.clueData.mode} />}
      {g.screen === 'guess' && g.guessData && <GuessScreen {...g} key={g.guessData.round} />}
      {g.screen === 'reveal' && g.revealData && <RevealScreen {...g} />}
      {g.screen === 'end' && g.endData && <EndScreen {...g} />}
      {g.screen === 'skipped' && <SkippedScreen {...g} />}

      <div className="credit">✨ Навайбкодил <b>Papaluha</b> ✨</div>
    </div>
  )
}
