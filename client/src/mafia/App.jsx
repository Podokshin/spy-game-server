import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  MoonStars,
  Sun,
  CheckSquare,
  Skull,
  Bird,
  HandPalm,
  Link as LinkIcon,
  Check,
  SkipForward,
} from '@phosphor-icons/react'
import { AVATARS, ROLE_HINTS, useMafiaGame } from './useMafiaGame'

const AVATAR_LABELS = { bandit: 'Разбойник', viking: 'Викинг', astronaut: 'Космонавт', scout: 'Скаут', merc: 'Наёмник', miner: 'Шахтёр', alien: 'Пришелец', hero: 'Герой', assassin: 'Ассасин', warrior: 'Воин', nomad: 'Кочевница', sleepy: 'Соня' }
const ROLE_LABELS_RU = { mafia: 'мафия', sheriff: 'шериф', doctor: 'доктор', civilian: 'мирный житель' }

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

function PlayerChip({ player, dead, roleTag }) {
  return (
    <span className={'player-chip' + (dead ? ' dead' : '') + (player.connected === false ? ' disconnected' : '')}>
      <AvatarIcon avatar={player.avatar} /> {player.name}
      {player.isHost && <span className="host-tag"> ★ хост</span>}
      {player.connected === false && ' ⏳'}
      {roleTag && <span className="role-tag"> {roleTag}</span>}
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
  useTick(true)
  const remaining = Math.max(0, endsAt - Date.now())
  const s = Math.ceil(remaining / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function MenuScreen(g) {
  const invited = !!g.inviteCode
  return (
    <section className="screen active">
      <a className="back-link" href="/"><ArrowLeft size={12} weight="bold" style={{ verticalAlign: -1 }} /> Все игры</a>
      <h1><MoonStars size={26} weight="bold" style={{ verticalAlign: -4 }} /> Мафия</h1>
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
  const [nightSeconds, setNightSeconds] = useState(room.settings.nightSeconds)
  const [discussionSeconds, setDiscussionSeconds] = useState(room.settings.discussionSeconds)
  useEffect(() => {
    setNightSeconds(room.settings.nightSeconds)
    setDiscussionSeconds(room.settings.discussionSeconds)
  }, [room.settings.nightSeconds, room.settings.discussionSeconds])

  const enough = room.players.length >= 4
  const commit = () => {
    if (g.isHost) g.pushSettings(parseInt(nightSeconds, 10) || 45, parseInt(discussionSeconds, 10) || 90)
  }

  return (
    <section className="screen active">
      <h2>Лобби</h2>

      <div className="room-code-box">
        <span className="room-code-label">Код комнаты — скажите друзьям</span>
        <span className="room-code">{room.code}</span>
        <button type="button" className="secondary-btn copy-link-btn" onClick={g.copyInviteLink}>
          {g.copyLinkLabel.startsWith('Скопир') ? <Check size={14} weight="bold" /> : <LinkIcon size={14} weight="bold" />} {g.copyLinkLabel}
        </button>
      </div>

      <div className="field">
        <label>Игроки ({room.players.length})</label>
        <div className="chip-list">{room.players.map(p => <PlayerChip key={p.id} player={p} />)}</div>
        <p className="hint">Роли: 1 мафия на каждые ~4 игроков, шериф с 5 игроков, доктор с 6. Минимум 4 игрока.</p>
      </div>

      <div className="field">
        <label htmlFor="nightSecondsInput">Время на ночь (сек)</label>
        <input type="number" id="nightSecondsInput" min={15} max={120} disabled={!g.isHost}
          value={nightSeconds} onChange={e => setNightSeconds(e.target.value)} onBlur={commit} />
      </div>
      <div className="field">
        <label htmlFor="discussionSecondsInput">Время на обсуждение днём (сек)</label>
        <input type="number" id="discussionSecondsInput" min={30} max={300} disabled={!g.isHost}
          value={discussionSeconds} onChange={e => setDiscussionSeconds(e.target.value)} onBlur={commit} />
      </div>

      {g.isHost && <button className="primary-btn" disabled={!enough} onClick={g.startGame}>Начать игру</button>}
      {!g.isHost && <p className="hint">Ожидаем, когда хост начнёт игру…</p>}
      {g.isHost && !enough && <p className="hint">Нужно минимум 4 игрока</p>}

      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function RoleScreen(g) {
  const data = g.myRole
  return (
    <section className="screen active">
      <div className={'role-card ' + data.role}>
        <p className="role-title">{data.label}</p>
        <p className="role-hint">{ROLE_HINTS[data.role] || ''}</p>
        {data.role === 'mafia' && data.teammates && data.teammates.length > 0 && (
          <p className="hint">
            Ваши сообщники: {data.teammates.map((t, i) => (
              <span key={t.id || i}><AvatarIcon avatar={t.avatar} /> {t.name}{i < data.teammates.length - 1 ? ', ' : ''}</span>
            ))}
          </p>
        )}
      </div>
      <button className="primary-btn" onClick={() => {}}>Понятно, начинаем</button>
    </section>
  )
}

function NightActionTargets({ targets, onPick, disabled, pickedId }) {
  return (
    <div className="vote-options">
      {targets.map(t => (
        <button
          key={t.id} type="button" disabled={disabled}
          className={'vote-option-btn' + (pickedId === t.id ? ' selected' : '')}
          onClick={() => onPick(t)}
        >
          <AvatarIcon avatar={t.avatar} size={16} /> {t.name}
        </button>
      ))}
    </div>
  )
}

function NightScreen(g) {
  const [pickedId, setPickedId] = useState(null)
  const [sheriffDone, setSheriffDone] = useState(false)
  const [sheriffResult, setSheriffResult] = useState('')
  const time = useCountdown(g.nightData.endsAt)
  const turn = g.nightTurnData

  return (
    <section className="screen active">
      <h2><MoonStars size={20} weight="bold" style={{ verticalAlign: -3 }} /> Ночь #{g.nightData.round}</h2>
      <div className="timer-block"><span className="timer-display">{time}</span></div>

      {turn && turn.role === 'mafia' && (
        <>
          <p className="night-action-hint">Выберите, кого устранить сегодня ночью:</p>
          <NightActionTargets targets={turn.targets} pickedId={pickedId} onPick={t => { setPickedId(t.id); g.mafiaVote(t.id) }} />
        </>
      )}
      {turn && turn.role === 'doctor' && (
        <>
          <p className="night-action-hint">Кого спасти этой ночью?</p>
          <NightActionTargets targets={turn.targets} pickedId={pickedId} onPick={t => { setPickedId(t.id); g.doctorSave(t.id) }} />
        </>
      )}
      {turn && turn.role === 'sheriff' && (
        <>
          <p className="night-action-hint">Кого проверить этой ночью?</p>
          <NightActionTargets
            targets={turn.targets} pickedId={pickedId} disabled={sheriffDone}
            onPick={t => {
              setPickedId(t.id)
              setSheriffDone(true)
              g.sheriffCheck(t.id, (res) => {
                if (res && res.ok) setSheriffResult(res.isMafia ? `${t.name} — связан с мафией! 🔴` : `${t.name} — не мафия. 🟢`)
              })
            }}
          />
          {sheriffResult && <p className="hint">{sheriffResult}</p>}
        </>
      )}
      {!turn && <p className="hint">Город спит. Дождитесь утра…</p>}

      {g.isHost && <button className="secondary-btn" onClick={g.forceEndNight}>Завершить ночь досрочно (хост)</button>}
    </section>
  )
}

function DayScreen(g) {
  const data = g.dayData
  const time = useCountdown(data.endsAt)
  return (
    <section className="screen active">
      <h2><Sun size={20} weight="bold" style={{ verticalAlign: -3 }} /> День #{data.round}</h2>
      <p className="end-line">
        {data.victim
          ? <>Ночью погиб(ла): <b><AvatarIcon avatar={data.victim.avatar} /> {data.victim.name}</b> — роль: <b>{data.victim.role}</b></>
          : 'Этой ночью никто не погиб — доктор угадал, или мафия не смогла договориться.'}
      </p>
      <div className="timer-block"><span className="timer-display">{time}</span></div>
      <p className="hint">Обсудите, кто похож на мафию, — потом будет голосование.</p>
      {g.isHost && <button className="secondary-btn" onClick={g.forceEndDiscussion}>Перейти к голосованию (хост)</button>}
    </section>
  )
}

function VotingScreen(g) {
  const [pickedId, setPickedId] = useState(undefined)
  return (
    <section className="screen active">
      <h2><CheckSquare size={20} weight="bold" style={{ verticalAlign: -3 }} /> Голосование</h2>
      <p className="hint">Кого подозреваем? Можно воздержаться.</p>

      <div className="vote-options">
        {g.voteAlive.filter(p => p.id !== g.myPlayerId).map(p => (
          <button
            key={p.id} type="button" className={'vote-option-btn' + (pickedId === p.id ? ' selected' : '')}
            onClick={() => { setPickedId(p.id); g.castVote(p.id) }}
          >
            <AvatarIcon avatar={p.avatar} size={16} /> {p.name}
          </button>
        ))}
        <button
          type="button" className={'vote-option-btn' + (pickedId === null ? ' selected' : '')}
          onClick={() => { setPickedId(null); g.castVote(null) }}
        >
          <HandPalm size={16} weight="bold" style={{ verticalAlign: -2 }} /> Воздержаться
        </button>
      </div>

      <p className="hint">{g.voteStatusText}</p>
      {g.isHost && <button className="secondary-btn" onClick={g.forceFinishVoting}>Досрочно завершить голосование (хост)</button>}
    </section>
  )
}

function EndScreen(g) {
  const data = g.gameOver
  return (
    <section className="screen active">
      <h2>
        {data.winner === 'mafia'
          ? <><Skull size={22} weight="bold" style={{ verticalAlign: -3 }} /> Победила мафия</>
          : <><Bird size={22} weight="bold" style={{ verticalAlign: -3 }} /> Победили мирные жители</>}
      </h2>
      <div className="field">
        <label>Роли всех игроков</label>
        <div className="chip-list">
          {data.roles.map(p => <PlayerChip key={p.id} player={p} dead={!p.alive} roleTag={p.role} />)}
        </div>
      </div>
      {g.isHost ? (
        <button className="primary-btn" onClick={g.playAgain}>Новая игра (в лобби)</button>
      ) : (
        <p className="hint">Ждите, пока хост начнёт новую игру…</p>
      )}
      <PartySection currentKey="mafia" standings={data.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function SkippedScreen(g) {
  return (
    <section className="screen active">
      <h2><SkipForward size={22} weight="bold" style={{ verticalAlign: -3 }} /> Игра пропущена</h2>
      <p className="hint">Большинство игроков проголосовало пропустить эту игру.</p>
      <PartySection currentKey="mafia" standings={g.skippedData?.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

export default function App() {
  const g = useMafiaGame()
  const showSkipButton = ['role', 'night', 'day', 'voting'].includes(g.screen)

  return (
    <div id="app">
      {showSkipButton && (
        <button type="button" className={'skip-vote-btn' + (g.myVoted ? ' voted' : '')} onClick={g.voteSkip}>
          <SkipForward size={14} weight="bold" style={{ verticalAlign: -2 }} /> Скип ({g.skipVote.votes}/{g.skipVote.needed})
        </button>
      )}

      {g.screen === 'menu' && <MenuScreen {...g} />}
      {g.screen === 'lobby' && g.currentRoom && <LobbyScreen {...g} />}
      {g.screen === 'role' && g.myRole && <RoleScreen {...g} />}
      {g.screen === 'night' && g.nightData && <NightScreen {...g} key={g.nightData.round} />}
      {g.screen === 'day' && g.dayData && <DayScreen {...g} key={g.dayData.round} />}
      {g.screen === 'voting' && g.voteAlive && <VotingScreen {...g} />}
      {g.screen === 'end' && g.gameOver && <EndScreen {...g} />}
      {g.screen === 'skipped' && <SkippedScreen {...g} />}

      <div className="credit">✨ Навайбкодил <b>Papaluha</b> ✨</div>
    </div>
  )
}
