import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Heart,
  ChatCircleDots,
  Trophy,
  SkipForward,
  Link as LinkIcon,
  Check,
  PaperPlaneRight,
  BellRinging,
  Smiley,
} from '@phosphor-icons/react'
import { AVATARS, useSkufGame } from './useSkufGame'
import Header from '../components/Header'
import Credit from '../components/Credit'
import SidePanel from '../components/SidePanel'
import { useVideoToggle } from '../lib/useVideoToggle'
import RulesPanel from './RulesPanel'

const AVATAR_LABELS = { bandit: 'Разбойник', viking: 'Викинг', astronaut: 'Космонавт', scout: 'Скаут', merc: 'Наёмник', miner: 'Шахтёр', alien: 'Пришелец', hero: 'Герой', assassin: 'Ассасин', warrior: 'Воин', nomad: 'Кочевница', sleepy: 'Соня' }

const QUICK_EMOJIS = ['😂', '❤️', '🔥', '😍', '😅', '🥵', '💀', '😭', '🙄', '😏', '👀', '🍑', '🍆', '💅', '🤡', '🫡', '👑', '💔', '😴', '🤔', '😎', '🥺', '💯', '🎉']

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

function useCountdown(endsAt) {
  useTick(!!endsAt)
  if (!endsAt) return { mm: '00', ss: '00', warning: false, progress: 0 }
  const remaining = Math.max(0, endsAt - Date.now())
  const totalSeconds = Math.ceil(remaining / 1000)
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const ss = String(totalSeconds % 60).padStart(2, '0')
  return { mm, ss, warning: remaining <= 15000, remaining }
}

function MenuScreen(g) {
  const invited = !!g.inviteCode
  return (
    <section className="screen active">
      <a className="back-link" href="/"><ArrowLeft size={12} weight="bold" style={{ verticalAlign: -1 }} /> Все игры</a>
      <h1><Heart size={26} weight="fill" style={{ verticalAlign: -4, color: 'var(--accent)' }} /> Скуф ищет альтушку</h1>
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
  const tooMany = room.players.length > 8
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
        <label>Игроки ({room.players.length} / 8)</label>
        <div className="chip-list">{room.players.map(p => <PlayerChip key={p.id} player={p} />)}</div>
      </div>

      {g.isHost && <button className="primary-btn" disabled={!enoughPlayers || tooMany} onClick={g.startGame}>Начать игру</button>}
      {!g.isHost && <p className="hint">Ожидаем, когда хост начнёт игру…</p>}
      {g.isHost && !enoughPlayers && <p className="hint">Нужно минимум 3 игрока</p>}
      {g.isHost && tooMany && <p className="hint">Максимум 8 игроков</p>}

      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function RoleScreen(g) {
  const r = g.roleData
  return (
    <section className="screen active">
      <div className="role-card">
        <span className="role-icon">{r.icon}</span>
        <p className="role-title">{r.name}</p>
        <p className="role-hint">{r.desc}</p>
        <p className="role-hint">Твоя роль — секрет. Она может раскрыться остальным позже, а может и не раскрыться никогда.</p>
        {g.readyHint === null && <button className="primary-btn" onClick={g.markReady}>Понял(а), готов(а)</button>}
      </div>
      {g.readyHint !== null && <p className="hint">{g.readyHint}</p>}
      {g.isHost && <button className="secondary-btn" onClick={g.forceStartNight}>Начать первую ночь, не дожидаясь всех</button>}
    </section>
  )
}

function ToastStack(g) {
  return (
    <div className="toast-stack">
      {g.toasts.map(t => (
        <div key={t.id} className="toast" onClick={() => g.setActiveContactId(t.contactId)}>
          <AvatarIcon avatar={t.avatar} size={28} />
          <span className="toast-text"><b>{t.name}</b>: {t.text}</span>
          <BellRinging size={16} weight="fill" style={{ color: 'var(--accent)', flexShrink: 0 }} />
        </div>
      ))}
    </div>
  )
}

function MessagingScreen(g) {
  const data = g.messagingData
  const { mm, ss, warning } = useCountdown(data.endsAt)
  const [draft, setDraft] = useState('')
  const [showEmojis, setShowEmojis] = useState(false)
  const others = (g.currentRoom?.players || []).filter(p => p.id !== g.myPlayerId)
  const remaining = 4 - g.totalSentThisNight
  const activeContact = others.find(p => p.id === g.activeContactId)

  function addEmoji(emoji) {
    setDraft(d => (d + emoji).slice(0, 200))
  }

  useEffect(() => { setShowEmojis(false) }, [g.activeContactId])

  return (
    <section className="screen active">
      <ToastStack {...g} />
      <div className="night-header">
        <div className="night-num">Ночь {data.night} из {data.totalNights}</div>
        <div className={'night-timer' + (warning ? ' warning' : '')}>{mm}:{ss}</div>
      </div>
      <div className="phone-frame">
        <div className="phone-notch" />
        <div className="phone-screen">
          {activeContact ? (
            <>
              <div className="phone-topbar">
                <button type="button" className="phone-back-btn" onClick={() => g.setActiveContactId(null)}><ArrowLeft size={18} weight="bold" /></button>
                <AvatarIcon avatar={activeContact.avatar} size={26} />
                <span className="phone-topbar-title">{activeContact.name}</span>
              </div>
              <div className="chat-thread">
                {(g.messagesByContact[activeContact.id] || []).length === 0 && <p className="hint">Сообщений пока нет — начните переписку первым.</p>}
                {(g.messagesByContact[activeContact.id] || []).map((m, i) => (
                  <div key={i} className={'chat-bubble ' + (m.from === g.myPlayerId ? 'mine' : 'theirs')}>{m.text}</div>
                ))}
              </div>
              {showEmojis && (
                <div className="emoji-picker">
                  {QUICK_EMOJIS.map(emoji => (
                    <button key={emoji} type="button" className="emoji-btn" onClick={() => addEmoji(emoji)}>{emoji}</button>
                  ))}
                </div>
              )}
              <div className="chat-input-row">
                <button type="button" className={'emoji-toggle-btn' + (showEmojis ? ' active' : '')} onClick={() => setShowEmojis(v => !v)} disabled={remaining <= 0}>
                  <Smiley size={22} weight={showEmojis ? 'fill' : 'regular'} />
                </button>
                <input
                  type="text" maxLength={200} placeholder={remaining > 0 ? 'Написать сообщение…' : 'Лимит сообщений исчерпан'}
                  value={draft} disabled={remaining <= 0}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && draft.trim() && remaining > 0) { g.sendMessage(activeContact.id, draft); setDraft('') } }}
                />
                <button type="button" className="primary-btn" disabled={!draft.trim() || remaining <= 0}
                  onClick={() => { g.sendMessage(activeContact.id, draft); setDraft('') }}>
                  <PaperPlaneRight size={16} weight="bold" />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="phone-topbar"><span className="phone-topbar-title">Сообщения</span></div>
              <div className="contact-list">
                {others.map(p => {
                  const count = (g.messagesByContact[p.id] || []).length
                  const unread = g.unreadByContact[p.id] || 0
                  return (
                    <button key={p.id} type="button" className={'contact-btn' + (count > 0 ? ' has-unread' : '')} onClick={() => g.setActiveContactId(p.id)}>
                      <AvatarIcon avatar={p.avatar} size={30} /> {p.name}
                      {unread > 0
                        ? <span className="unread-badge">{unread}</span>
                        : (count > 0 && <span className="contact-count">{count} сообщ.</span>)}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="messages-left-badge">Осталось сообщений на эту ночь: {remaining} из 4</p>

      {!activeContact && (
        <p className="discuss-hint"><ChatCircleDots size={16} weight="bold" style={{ verticalAlign: -2 }} /> Пишите кому хотите — никто, кроме адресата, не увидит переписку до утра.</p>
      )}

      {g.isHost && <button className="secondary-btn" onClick={g.forceStartPicking}>Перейти к выбору свидания сейчас</button>}
    </section>
  )
}

function PickingScreen(g) {
  const data = g.pickingData
  const { mm, ss, warning } = useCountdown(data.endsAt)
  const others = (g.currentRoom?.players || []).filter(p => p.id !== g.myPlayerId)

  return (
    <section className="screen active">
      <div className="night-header">
        <div className="night-num">Ночь {data.night} — тайное свидание</div>
        <div className={'night-timer' + (warning ? ' warning' : '')}>{mm}:{ss}</div>
      </div>

      {!g.pickSubmitted && (
        <div className="field">
          <label>С кем хотите встретиться этой ночью?</label>
          <div className="vote-options">
            {others.map(p => (
              <button key={p.id} type="button" className={'vote-option-btn' + (g.myPick === p.id ? ' selected' : '')} onClick={() => g.submitPick(p.id)}>
                <AvatarIcon avatar={p.avatar} size={16} /> {p.name}
              </button>
            ))}
            <button type="button" className={'vote-option-btn' + (g.myPick === null ? ' selected' : '')} onClick={() => g.submitPick(null)}>
              🚫 Никого
            </button>
          </div>
        </div>
      )}

      {g.pickSubmitted && <p className="hint">Выбор сделан. Ждём остальных… ({g.pickProgress.count} из {g.pickProgress.total})</p>}
      {g.isHost && <button className="secondary-btn" onClick={g.forceFinishPicking}>Показать итоги сейчас</button>}
    </section>
  )
}

function OverviewStep({ data }) {
  return (
    <div className="field">
      <label>Кто с кем встречался этой ночью</label>
      <div className="reveal-log">
        {data.players.map((p, i) => {
          const partner = p.matchedWith ? data.players.find(x => x.id === p.matchedWith) : null
          const outcome = partner ? `💘 Свидание с ${partner.name}` : (p.pickedId ? '🚫 Выбрал(а), но не совпало' : '➖ Никого не выбрал(а)')
          return (
            <div key={p.id} className={'match-row overview-row' + (partner ? ' matched' : '')} style={{ animationDelay: (i * 0.08) + 's' }}>
              <AvatarIcon avatar={p.avatar} />
              <span className="match-outcome"><b>{p.name}</b> — {outcome}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DeltaBadge({ value }) {
  const sign = value > 0 ? 'positive' : value < 0 ? 'negative' : 'zero'
  return <span className={'match-delta ' + sign}>{value > 0 ? '+' : ''}{value}</span>
}

// Тайминги поэтапной сцены "кто кому писал": сперва инициатор, потом
// адресат, потом переписка реплика за репликой (с "печатает…" перед каждой),
// и только в конце — взаимно или нет. Целиком по таймеру, без кликов хоста.
const REVEAL_A_DELAY = 150
const REVEAL_B_DELAY = 650
const REVEAL_MESSAGES_START = 1500
const REVEAL_TYPING_MS = 550
const REVEAL_MESSAGE_GAP = 350
const REVEAL_OUTCOME_PAUSE = 650

function TypingIndicator({ side }) {
  return (
    <div className={'typing-indicator ' + side}>
      <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
    </div>
  )
}

function PairStep({ data, onDone }) {
  const [stageA, setStageA] = useState(false)
  const [stageB, setStageB] = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)
  const [typingSide, setTypingSide] = useState(null)
  const [showOutcome, setShowOutcome] = useState(false)

  useEffect(() => {
    setStageA(false); setStageB(false); setVisibleCount(0); setTypingSide(null); setShowOutcome(false)
    const timers = []
    timers.push(setTimeout(() => setStageA(true), REVEAL_A_DELAY))
    timers.push(setTimeout(() => setStageB(true), REVEAL_B_DELAY))

    let t = REVEAL_MESSAGES_START
    data.messages.forEach((m, i) => {
      const side = m.from === data.a.id ? 'theirs' : 'mine'
      timers.push(setTimeout(() => setTypingSide(side), t))
      t += REVEAL_TYPING_MS
      timers.push(setTimeout(() => { setTypingSide(null); setVisibleCount(i + 1) }, t))
      t += REVEAL_MESSAGE_GAP
    })
    timers.push(setTimeout(() => { setShowOutcome(true); onDone && onDone() }, t + REVEAL_OUTCOME_PAUSE))

    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.a.id, data.b.id])

  const isMatch = data.pairKind === 'match'

  return (
    <div className="field">
      <div className="pair-reveal-header">
        <div className={'pair-reveal-side' + (stageA ? ' visible' : '')}>
          <AvatarIcon avatar={data.a.avatar} size={56} className="pair-reveal-avatar" />
          <span className="pair-reveal-side-name">{data.a.name}</span>
        </div>
        <span className={'pair-reveal-heart' + (showOutcome ? (isMatch ? ' is-match' : ' is-crush') : '')}>
          {showOutcome ? (isMatch ? '💘' : '💔') : '✉️'}
        </span>
        <div className={'pair-reveal-side' + (stageB ? ' visible' : '')}>
          <AvatarIcon avatar={data.b.avatar} size={56} className="pair-reveal-avatar" />
          <span className="pair-reveal-side-name">{data.b.name}</span>
        </div>
      </div>

      {stageB && (
        <p className="pair-reveal-names"><b>{data.a.name}</b> позвал(а) на свидание <b>{data.b.name}</b></p>
      )}

      {stageB && (
        <div className="chat-thread" style={{ maxHeight: 'none' }}>
          {data.messages.length === 0 && visibleCount === 0 && !typingSide && (
            <p className="hint">Они не обменялись друг с другом ни словом.</p>
          )}
          {data.messages.slice(0, visibleCount).map((m, i) => (
            <div key={i} className={'chat-bubble animated ' + (m.from === data.a.id ? 'theirs' : 'mine')}>{m.text}</div>
          ))}
          {typingSide && <TypingIndicator side={typingSide} />}
        </div>
      )}

      {showOutcome && (
        <div className={'pair-outcome' + (isMatch ? '' : ' crush')}>
          <p className="pair-outcome-text">
            {isMatch ? 'Взаимно! Свидание состоялось 💘' : <><b>{data.b.name}</b> не ответил(а) взаимностью</>}
          </p>
          <div className="reveal-log">
            <div className={'match-row' + (isMatch ? ' matched' : '')}>
              <AvatarIcon avatar={data.a.avatar} />
              <span className="match-outcome"><b>{data.a.name}</b>{data.infectedA && <span className="infection-badge">💊 завербован(а)</span>}</span>
              <DeltaBadge value={data.a.delta} />
            </div>
            {isMatch && (
              <div className="match-row matched">
                <AvatarIcon avatar={data.b.avatar} />
                <span className="match-outcome"><b>{data.b.name}</b>{data.infectedB && <span className="infection-badge">💊 завербован(а)</span>}</span>
                <DeltaBadge value={data.b.delta} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FinalStep({ data }) {
  return (
    <>
      {data.mlmWin && <div className="special-win-banner">💊 Все теперь в сети — МЛМ-щица побеждает мгновенно!</div>}
      <div className="field">
        <label>Итог ночи</label>
        <div className="reveal-log">
          {data.players.map(p => (
            <div key={p.id} className="match-row">
              <AvatarIcon avatar={p.avatar} />
              <span className="match-outcome"><b>{p.name}</b>
                {(data.newlyInfected || []).includes(p.id) && <span className="infection-badge">💊 завербован(а)</span>}
              </span>
              <DeltaBadge value={p.delta} />
            </div>
          ))}
        </div>
      </div>
      {data.revealedRole && (
        <div className="role-reveal-banner">
          {data.revealedRole.icon} Роль игрока <AvatarIcon avatar={data.revealedRole.playerAvatar} /> <b>{data.revealedRole.playerName}</b> раскрыта:
          {' '}<b>{data.revealedRole.name}</b> — {data.revealedRole.desc}
        </div>
      )}
    </>
  )
}

function RevealScreen(g) {
  const data = g.revealData
  const isFinalStep = data.stepIndex >= data.totalSteps - 1
  const isLastNight = data.night >= data.totalNights
  const finishing = isLastNight || data.mlmWin

  // Для 'pair' кнопка "Дальше" ждёт, пока доиграет сцена (аватарки → чат →
  // итог) — иначе хост может кликнуть раньше и оборвать анимацию на середине.
  const [stepReady, setStepReady] = useState(data.kind !== 'pair')
  useEffect(() => {
    setStepReady(data.kind !== 'pair')
  }, [data.stepIndex, data.kind])

  return (
    <section className="screen active">
      <h2>Итоги ночи {data.night}</h2>
      <p className="reveal-progress">Шаг {data.stepIndex + 1} из {data.totalSteps}</p>
      {data.timeUp && data.kind === 'overview' && <p className="hint">Время вышло — доигрывали не все.</p>}

      {data.kind === 'overview' && <OverviewStep data={data} />}
      {data.kind === 'pair' && <PairStep key={data.a.id + '-' + data.b.id} data={data} onDone={() => setStepReady(true)} />}
      {data.kind === 'final' && <FinalStep data={data} />}

      {g.isHost ? (
        stepReady ? (
          <button className="primary-btn" onClick={isFinalStep ? g.nextNight : g.nextRevealStep}>
            {isFinalStep ? (finishing ? 'Завершить игру' : 'Следующая ночь') : 'Дальше'}
          </button>
        ) : (
          <p className="hint">Досматриваем сцену…</p>
        )
      ) : (
        <p className="hint">{!stepReady ? 'Досматриваем сцену…' : (isFinalStep ? 'Хост переключит дальше…' : 'Хост покажет следующий шаг…')}</p>
      )}
    </section>
  )
}

function EndScreen(g) {
  const data = g.endData
  const sorted = [...data.players].sort((a, b) => (b.score || 0) - (a.score || 0))
  const roles = data.rolesByPlayerId || {}
  return (
    <section className="screen active">
      <h2><Trophy size={22} weight="bold" style={{ verticalAlign: -3 }} /> Итоги игры</h2>

      {data.specialWinner && (
        <div className="special-win-banner">💊 {data.specialWinner.name} была МЛМ-щицей и завербовала абсолютно всех — победа вне зависимости от сердец!</div>
      )}

      <div className="field">
        <label>Сердца</label>
        <div className="chip-list">{sorted.map(p => <PlayerChip key={p.id} player={p} showScore />)}</div>
      </div>

      {Object.keys(roles).length > 0 && (
        <div className="field">
          <label>Кто кем был</label>
          <div className="reveal-log">
            {data.players.map(p => {
              const role = roles[p.id]
              return (
                <div key={p.id} className="match-row">
                  <AvatarIcon avatar={p.avatar} />
                  <span className="match-outcome"><b>{p.name}</b>{role ? ` — ${role.icon} ${role.name}` : ''}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {g.isHost ? (
        <button className="primary-btn" onClick={g.playAgain}>Новая игра (в лобби)</button>
      ) : (
        <p className="hint">Ждите, пока хост начнёт новую игру…</p>
      )}
      <PartySection currentKey="skuf" standings={data.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function SkippedScreen(g) {
  return (
    <section className="screen active">
      <h2><SkipForward size={22} weight="bold" style={{ verticalAlign: -3 }} /> Игра пропущена</h2>
      <p className="hint">Большинство игроков проголосовало пропустить эту игру.</p>
      <PartySection currentKey="skuf" standings={g.skippedData?.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

export default function App() {
  const g = useSkufGame()
  const video = useVideoToggle()
  const showSkipButton = ['role', 'messaging', 'picking', 'reveal'].includes(g.screen)
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
          {g.screen === 'role' && g.roleData && <RoleScreen {...g} />}
          {g.screen === 'messaging' && g.messagingData && <MessagingScreen {...g} />}
          {g.screen === 'picking' && g.pickingData && <PickingScreen {...g} />}
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
