import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  NotePencil,
  Trophy,
  SkipForward,
  Link as LinkIcon,
  Check,
} from '@phosphor-icons/react'
import { AVATARS, useWallGame } from './useWallGame'
import Header from '../components/Header'
import Credit from '../components/Credit'
import SidePanel from '../components/SidePanel'
import { useVideoToggle } from '../lib/useVideoToggle'
import RulesPanel from './RulesPanel'

const AVATAR_LABELS = { bandit: 'Разбойник', viking: 'Викинг', astronaut: 'Космонавт', scout: 'Скаут', merc: 'Наёмник', miner: 'Шахтёр', alien: 'Пришелец', hero: 'Герой', assassin: 'Ассасин', warrior: 'Воин', nomad: 'Кочевница', sleepy: 'Соня' }

function AvatarIcon({ avatar, size = 20, className }) {
  const key = AVATARS.includes(avatar) ? avatar : AVATARS[0]
  return (
    <img
      src={`/avatars/${key}.webp`} width={size} height={size} alt="" className={className}
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

function useTick(active, intervalMs = 250) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick(t => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])
}

function useCountdown(endsAt) {
  useTick(!!endsAt)
  if (!endsAt) return { mm: '00', ss: '00', warning: false }
  const remaining = Math.max(0, endsAt - Date.now())
  const totalSeconds = Math.ceil(remaining / 1000)
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const ss = String(totalSeconds % 60).padStart(2, '0')
  return { mm, ss, warning: remaining <= 10000 }
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

function DeltaBadge({ value }) {
  const sign = value > 0 ? 'positive' : value < 0 ? 'negative' : 'zero'
  return <span className={'match-delta ' + sign}>{value > 0 ? '+' : ''}{value}</span>
}

function MenuScreen(g) {
  const invited = !!g.inviteCode
  return (
    <section className="screen active">
      <a className="back-link" href="/"><ArrowLeft size={12} weight="bold" style={{ verticalAlign: -1 }} /> Все игры</a>
      <h1><NotePencil size={26} weight="fill" style={{ verticalAlign: -4, color: 'var(--accent)' }} /> Стена признаний</h1>
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
  const tooMany = room.players.length > 10
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
        <label>Игроки ({room.players.length} / 10)</label>
        <div className="chip-list">{room.players.map(p => <PlayerChip key={p.id} player={p} />)}</div>
      </div>

      {g.isHost && <button className="primary-btn" disabled={!enoughPlayers || tooMany} onClick={g.startGame}>Начать игру</button>}
      {!g.isHost && <p className="hint">Ожидаем, когда хост начнёт игру…</p>}
      {g.isHost && !enoughPlayers && <p className="hint">Нужно минимум 3 игрока</p>}
      {g.isHost && tooMany && <p className="hint">Максимум 10 игроков</p>}

      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function WritingScreen(g) {
  const data = g.writingData
  const { mm, ss, warning } = useCountdown(data.endsAt)
  const [draft, setDraft] = useState('')
  const remaining = data.maxLen - draft.length

  return (
    <section className="screen active">
      <div className="night-header">
        <div className="night-num">Раунд {data.round} из {data.totalRounds}</div>
        <div className={'night-timer' + (warning ? ' warning' : '')}>{mm}:{ss}</div>
      </div>

      <div className="field">
        <label>Тема раунда</label>
        <p className="wall-prompt-text">{data.prompt}</p>
      </div>

      {!g.mySubmitted ? (
        <div className="field">
          <textarea
            className="wall-textarea"
            maxLength={data.maxLen}
            placeholder="Твоё анонимное признание…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />
          <div className="wall-char-count">{remaining} символов осталось</div>
          <button className="primary-btn" disabled={!draft.trim()} onClick={() => g.submitConfession(draft)}>Отправить анонимно</button>
        </div>
      ) : (
        <p className="hint">Признание отправлено. Никто не узнает, что это ты, пока не угадает. Ждём остальных… ({g.confessionProgress.count} из {g.confessionProgress.total})</p>
      )}

      {g.isHost && <button className="secondary-btn" onClick={g.forceFinishWriting}>Перейти к раскрытию сейчас</button>}
    </section>
  )
}

function VoteStep(g) {
  const data = g.wallStep
  const { mm, ss, warning } = useCountdown(data.endsAt)

  return (
    <>
      <div className="night-header">
        <div className={'night-timer' + (warning ? ' warning' : '')}>{mm}:{ss}</div>
      </div>
      <div className="field">
        <label>{data.isAuthor ? 'Твоё признание сейчас угадывают' : 'Кто это написал?'}</label>
        <p className="wall-confession-text">«{data.confessionText}»</p>
      </div>

      {data.isAuthor ? (
        <p className="hint">Не подавай виду — сохраняй лицо, пока остальные думают.</p>
      ) : (
        <>
          {!g.guessSubmitted && (
            <div className="field">
              <div className="vote-options">
                {data.candidates.map(p => (
                  <button key={p.id} type="button" className={'vote-option-btn' + (g.myGuess === p.id ? ' selected' : '')} onClick={() => g.submitGuess(p.id)}>
                    <AvatarIcon avatar={p.avatar} size={16} /> {p.name}
                  </button>
                ))}
                <button type="button" className={'vote-option-btn' + (g.myGuess === null ? ' selected' : '')} onClick={() => g.submitGuess(null)}>
                  🤷 Без понятия
                </button>
              </div>
            </div>
          )}
          {g.guessSubmitted && <p className="hint">Ответ принят. Ждём остальных… ({g.guessProgress.count} из {g.guessProgress.total})</p>}
        </>
      )}

      {g.isHost && <button className="secondary-btn" onClick={g.forceFinishVote}>Показать итог сейчас</button>}
    </>
  )
}

const GUESS_STAGGER_MS = 450
const PRE_AUTHOR_PAUSE_MS = 700
const POST_AUTHOR_PAUSE_MS = 600

function ResultStep({ data, onDone }) {
  const [visibleGuesses, setVisibleGuesses] = useState(0)
  const [authorRevealed, setAuthorRevealed] = useState(false)
  const [scoresShown, setScoresShown] = useState(false)

  useEffect(() => {
    setVisibleGuesses(0); setAuthorRevealed(false); setScoresShown(false)
    const timers = []
    let t = 400
    data.guesses.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleGuesses(i + 1), t))
      t += GUESS_STAGGER_MS
    })
    t += PRE_AUTHOR_PAUSE_MS
    timers.push(setTimeout(() => setAuthorRevealed(true), t))
    t += POST_AUTHOR_PAUSE_MS
    timers.push(setTimeout(() => { setScoresShown(true); onDone && onDone() }, t))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.round, data.confessionIndex])

  return (
    <div className="field">
      <p className="wall-confession-text">«{data.confessionText}»</p>

      <div className="wall-guess-log">
        {data.guesses.slice(0, visibleGuesses).map((guess) => (
          <div key={guess.voterId} className={'wall-guess-row' + (guess.correct ? ' correct' : ' wrong')}>
            <AvatarIcon avatar={guess.voterAvatar} />
            <span className="wall-guess-text"><b>{guess.voterName}</b> подумал(а) на {guess.guessedName ? <b>{guess.guessedName}</b> : 'никого'}</span>
            <span className="wall-guess-mark">{guess.correct ? '✅' : '❌'}</span>
          </div>
        ))}
      </div>

      {!authorRevealed && visibleGuesses >= data.guesses.length && (
        <p className="hint wall-drumroll">Кто же это был?..</p>
      )}

      {authorRevealed && data.author && (
        <div className="wall-author-reveal">
          <AvatarIcon avatar={data.author.avatar} size={56} className="wall-author-avatar" />
          <p className="wall-author-text">Это написал(а): <b>{data.author.name}</b>!</p>
        </div>
      )}

      {scoresShown && data.author && (
        <div className="reveal-log">
          {data.guesses.filter(guess => guess.correct).map(guess => (
            <div key={guess.voterId} className="match-row matched">
              <AvatarIcon avatar={guess.voterAvatar} />
              <span className="match-outcome"><b>{guess.voterName}</b> угадал(а)</span>
              <DeltaBadge value={1} />
            </div>
          ))}
          <div className="match-row">
            <AvatarIcon avatar={data.author.avatar} />
            <span className="match-outcome"><b>{data.author.name}</b> удачно замаскировался(лась)</span>
            <DeltaBadge value={data.authorBonus} />
          </div>
        </div>
      )}
    </div>
  )
}

function RoundEndStep({ data }) {
  const sorted = [...data.players].sort((a, b) => (b.score || 0) - (a.score || 0))
  return (
    <div className="field">
      <label>Итоги раунда</label>
      <div className="chip-list">{sorted.map(p => <PlayerChip key={p.id} player={p} showScore />)}</div>
    </div>
  )
}

function RevealScreen(g) {
  const data = g.wallStep
  const [stepReady, setStepReady] = useState(data.kind !== 'result')
  useEffect(() => {
    setStepReady(data.kind !== 'result')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.kind, data.confessionIndex, data.round])

  const isLastConfession = data.kind !== 'roundEnd' && data.confessionIndex >= data.totalConfessions - 1
  const isLastRound = data.round >= data.totalRounds

  return (
    <section className="screen active">
      <h2>Раунд {data.round} из {data.totalRounds}</h2>
      {data.kind !== 'roundEnd' && <p className="reveal-progress">Признание {data.confessionIndex + 1} из {data.totalConfessions}</p>}

      {data.kind === 'vote' && <VoteStep {...g} />}
      {data.kind === 'result' && <ResultStep key={data.round + '-' + data.confessionIndex} data={data} onDone={() => setStepReady(true)} />}
      {data.kind === 'roundEnd' && <RoundEndStep data={data} />}

      {data.kind === 'result' && (
        g.isHost ? (
          stepReady
            ? <button className="primary-btn" onClick={g.nextStep}>{isLastConfession ? 'Итоги раунда' : 'Дальше'}</button>
            : <p className="hint">Барабанная дробь…</p>
        ) : (
          <p className="hint">{stepReady ? 'Хост покажет дальше…' : 'Раскрываем автора…'}</p>
        )
      )}

      {data.kind === 'roundEnd' && (
        g.isHost ? (
          <button className="primary-btn" onClick={g.nextStep}>{isLastRound ? 'Завершить игру' : 'Следующий раунд'}</button>
        ) : (
          <p className="hint">Хост запустит {isLastRound ? 'итоги игры' : 'следующий раунд'}…</p>
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
        <label>Очки</label>
        <div className="chip-list">{sorted.map(p => <PlayerChip key={p.id} player={p} showScore />)}</div>
      </div>

      {g.isHost ? (
        <button className="primary-btn" onClick={g.playAgain}>Новая игра (в лобби)</button>
      ) : (
        <p className="hint">Ждите, пока хост начнёт новую игру…</p>
      )}
      <PartySection currentKey="wall" standings={data.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function SkippedScreen(g) {
  return (
    <section className="screen active">
      <h2><SkipForward size={22} weight="bold" style={{ verticalAlign: -3 }} /> Игра пропущена</h2>
      <p className="hint">Большинство игроков проголосовало пропустить эту игру.</p>
      <PartySection currentKey="wall" standings={g.skippedData?.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

export default function App() {
  const g = useWallGame()
  const video = useVideoToggle()
  const showSkipButton = ['writing', 'reveal'].includes(g.screen)
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
          {g.screen === 'writing' && g.writingData && <WritingScreen {...g} />}
          {g.screen === 'reveal' && g.wallStep && <RevealScreen {...g} />}
          {g.screen === 'end' && g.endData && <EndScreen {...g} />}
          {g.screen === 'skipped' && <SkippedScreen {...g} />}
        </div>

        <SidePanel players={g.currentRoom?.players || []} videoEnabled={video.enabled} />
      </div>

      <Credit enabled={video.enabled} onToggle={video.toggle} />
    </div>
  )
}
