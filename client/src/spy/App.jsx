import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Globe,
  MagnifyingGlass,
  CheckSquare,
  SkipForward,
  Link as LinkIcon,
  Check,
  Confetti,
} from '@phosphor-icons/react'
import { AVATARS, subcategoryMetaFor, useSpyGame } from './useSpyGame'
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

function PlayerChip({ player, extra, showScore }) {
  return (
    <span className={'player-chip' + (player.connected === false ? ' disconnected' : '')}>
      <AvatarIcon avatar={player.avatar} /> {player.name}
      {player.isHost && <span className="host-tag"> ★ хост</span>}
      {player.connected === false && ' ⏳'}
      {extra}
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
      <h1><Globe size={26} weight="bold" style={{ verticalAlign: -4 }} /> Шпион Online</h1>
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
  const s = room.settings
  const [category, setCategory] = useState(s.category)
  const [subCategory, setSubCategory] = useState(s.subCategory)
  const [twoSpies, setTwoSpies] = useState(!!s.twoSpies)
  const [decoyMode, setDecoyMode] = useState(!!s.decoyMode)
  const [timerEnabled, setTimerEnabled] = useState(s.timerEnabled)
  const [timerMinutes, setTimerMinutes] = useState(s.timerMinutes)

  useEffect(() => {
    setCategory(s.category)
    setSubCategory(s.subCategory)
    setTwoSpies(!!s.twoSpies)
    setDecoyMode(!!s.decoyMode)
    setTimerEnabled(s.timerEnabled)
    setTimerMinutes(s.timerMinutes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.category, s.subCategory, s.twoSpies, s.decoyMode, s.timerEnabled, s.timerMinutes])

  const commit = (overrides) => {
    const next = { category, subCategory, twoSpies, decoyMode, timerEnabled, timerMinutes, ...overrides }
    g.pushSettings(next)
  }

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
        <label>Категория</label>
        <div className="category-toggle">
          <button type="button" className={'cat-btn' + (category === 'places' ? ' active' : '')} disabled={!g.isHost}
            onClick={() => { setCategory('places'); setSubCategory('mix'); commit({ category: 'places', subCategory: 'mix' }) }}>📍 Места</button>
          <button type="button" className={'cat-btn' + (category === 'characters' ? ' active' : '')} disabled={!g.isHost}
            onClick={() => { setCategory('characters'); setSubCategory('mix'); commit({ category: 'characters', subCategory: 'mix' }) }}>🎭 Персонажи</button>
        </div>
      </div>

      <div className="field">
        <label>Тема</label>
        <div className="subcat-toggle">
          {subcategoryMetaFor(category).map(sub => (
            <button key={sub.key} type="button" className={'subcat-btn' + (subCategory === sub.key ? ' active' : '')} disabled={!g.isHost}
              onClick={() => { setSubCategory(sub.key); commit({ subCategory: sub.key }) }}>
              {sub.icon} {sub.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="checkbox-field-label">
          <input type="checkbox" checked={twoSpies} disabled={!g.isHost || decoyMode}
            onChange={e => { const v = e.target.checked; setTwoSpies(v); commit({ twoSpies: v }) }} />
          Два шпиона (нужно от 6 игроков)
        </label>
      </div>

      <div className="field">
        <label className="checkbox-field-label">
          <input type="checkbox" checked={decoyMode} disabled={!g.isHost}
            onChange={e => { const v = e.target.checked; setDecoyMode(v); if (v) setTwoSpies(false); commit({ decoyMode: v, twoSpies: v ? false : twoSpies }) }} />
          🎭 Двойник — шпион сам не знает, что он шпион
        </label>
        {decoyMode && <p className="hint">Шпиону вместо пустой роли достанется похожая, но другая тема (например, вместо «Ким Чен Ын» — «Дональд Трамп»). Работает только с одним шпионом.</p>}
      </div>

      <div className="field">
        <label className="checkbox-field-label">
          <input type="checkbox" checked={timerEnabled} disabled={!g.isHost}
            onChange={e => { const v = e.target.checked; setTimerEnabled(v); commit({ timerEnabled: v }) }} />
          Таймер обсуждения
        </label>
      </div>

      {timerEnabled && (
        <div className="field">
          <label htmlFor="lobbyTimerMinutes">Минут на обсуждение</label>
          <input type="number" id="lobbyTimerMinutes" min={1} max={30} disabled={!g.isHost}
            value={timerMinutes} onChange={e => setTimerMinutes(e.target.value)}
            onBlur={() => g.isHost && commit({ timerMinutes: parseInt(timerMinutes, 10) || 8 })} />
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

function RoleScreen(g) {
  const data = g.roleData
  return (
    <section className="screen active">
      <div className={'role-card ' + (data.isSpy ? 'spy' : 'normal')}>
        {data.isSpy ? (
          <>
            <p className="role-title"><MagnifyingGlass size={22} weight="bold" style={{ verticalAlign: -3 }} /> ТЫ ШПИОН</p>
            <p className="role-hint">
              {data.category === 'characters'
                ? 'Ты не знаешь персонажа. Слушай факты, которые называют остальные, и попробуй понять, кто это — не спались.'
                : 'Ты не знаешь локацию. Слушай остальных, пытайся понять где вы находитесь — и не спались.'}
              {data.twoSpies ? ' В игре есть ещё один шпион, но ты не знаешь, кто это.' : ''}
            </p>
          </>
        ) : data.category === 'characters' ? (
          <>
            <p className="role-location">🎭 {data.topicName}</p>
            <p className="role-hint">Когда дойдёт очередь — назови один факт об этом персонаже, не называя его имя напрямую.</p>
          </>
        ) : (
          <>
            <p className="role-location">📍 {data.topicName}</p>
            <p className="role-role">🎭 Твоя роль: {data.role}</p>
            <p className="role-hint">Не называй локацию напрямую — задавай и отвечай на вопросы намёками.</p>
          </>
        )}
        {g.readyHint === null && <button className="primary-btn" onClick={g.markReady}>Я запомнил(а), готов(а)</button>}
      </div>
      {g.readyHint !== null && <p className="hint">{g.readyHint}</p>}
      {g.isHost && <button className="secondary-btn" onClick={g.forceStartDiscussion}>Начать обсуждение, не дожидаясь всех</button>}
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
      <h2>Обсуждение началось!</h2>
      <p className="discuss-hint">{g.discussHints[data.category] || g.discussHints.places}</p>

      <div className="field">
        <label>Порядок хода (кто говорит первым)</label>
        <div className="chip-list">
          {data.turnOrder.map((p, i) => (
            <span className="player-chip" key={p.id || i}><span className="turn-num">{i + 1}</span> <AvatarIcon avatar={p.avatar} /> {p.name}</span>
          ))}
        </div>
      </div>

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
        <button className="primary-btn" onClick={g.endDiscussion}>Завершить обсуждение</button>
      ) : (
        <p className="hint">Решение о завершении принимает хост.</p>
      )}
    </section>
  )
}

function VotingScreen(g) {
  const [pickedId, setPickedId] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  return (
    <section className="screen active">
      <h2><CheckSquare size={20} weight="bold" style={{ verticalAlign: -3 }} /> Голосование</h2>
      <p className="discuss-hint">Кто, по-вашему, шпион? Голос анонимный — никто не увидит, за кого вы проголосовали.</p>

      <div className="field">
        <div className="vote-options">
          {g.votingPlayers.filter(p => p.id !== g.myPlayerId).map(p => (
            <button
              key={p.id} type="button" disabled={submitted}
              className={'vote-option-btn' + (pickedId === p.id ? ' selected' : '')}
              onClick={() => setPickedId(p.id)}
            >
              <AvatarIcon avatar={p.avatar} size={16} /> {p.name}
            </button>
          ))}
        </div>
      </div>

      {!submitted && (
        <button className="primary-btn" disabled={!pickedId} onClick={() => { setSubmitted(true); g.castVote(pickedId) }}>Проголосовать</button>
      )}
      {submitted && <p className="hint">Голос принят. Ждём остальных…</p>}
      {g.isHost && <button className="secondary-btn" onClick={g.forceFinishVoting}>Завершить голосование сейчас</button>}
    </section>
  )
}

function voteWord(n) {
  const mod10 = n % 10, mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'голос'
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'голоса'
  return 'голосов'
}

function EndScreen(g) {
  return (
    <section className="screen active">
      <h2><MagnifyingGlass size={22} weight="bold" style={{ verticalAlign: -3 }} /> Результаты раунда</h2>

      {g.tally && (
        <div className="field">
          <label>Результаты голосования</label>
          <div className="chip-list">
            {g.tally.map(p => (
              <span className="player-chip" key={p.id}><AvatarIcon avatar={p.avatar} /> {p.name} <span className="vote-count">{p.votes} {voteWord(p.votes)}</span></span>
            ))}
          </div>
        </div>
      )}

      {g.revealStage === 0 && (
        g.isHost ? <button className="primary-btn" onClick={g.revealSpy}>Раскрыть шпиона</button> : <p className="hint">Хост раскроет шпиона…</p>
      )}

      {g.revealStage >= 1 && g.spiesData && (
        <div className="field">
          <label>{g.spiesData.spies.length > 1 ? 'Шпионы' : 'Шпион'}</label>
          <div className="chip-list">
            {g.spiesData.spies.map(sp => (
              <PlayerChip key={sp.id} player={sp} extra={
                sp.caught === true ? <span className="caught-tag"> <Confetti size={12} weight="bold" style={{ verticalAlign: -1 }} /> поймали</span>
                  : sp.caught === false ? <span className="escaped-tag"> <MagnifyingGlass size={12} weight="bold" style={{ verticalAlign: -1 }} /> сбежал(а)</span>
                  : null
              } />
            ))}
          </div>
          {g.spiesData.decoyTopicName && (
            <p className="hint">🎭 Шпион сам не знал, что он шпион — ему казалось, что тема: «{g.spiesData.decoyTopicName}»</p>
          )}
        </div>
      )}

      {g.revealStage === 1 && g.isHost && (
        <button className="primary-btn" onClick={g.revealTopic}>{g.spiesData?.category === 'characters' ? 'Раскрыть персонажа' : 'Раскрыть локацию'}</button>
      )}

      {g.revealStage >= 2 && g.topicData && (
        <>
          <p className="end-line">{g.topicData.topicLabel}: <b>{g.topicData.topicName}</b></p>
          <div className="field">
            <label>🏆 Счёт</label>
            <div className="chip-list">
              {[...g.currentRoom.players].sort((a, b) => (b.score || 0) - (a.score || 0)).map(p => (
                <PlayerChip key={p.id} player={p} showScore />
              ))}
            </div>
          </div>
          {g.isHost ? (
            <button className="primary-btn" onClick={g.playAgain}>Новая игра (в лобби)</button>
          ) : (
            <p className="hint">Ждите, пока хост начнёт новую игру…</p>
          )}
          <PartySection currentKey="spy" standings={g.topicData.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
        </>
      )}

      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function SkippedScreen(g) {
  return (
    <section className="screen active">
      <h2><SkipForward size={22} weight="bold" style={{ verticalAlign: -3 }} /> Игра пропущена</h2>
      <p className="hint">Большинство игроков проголосовало пропустить эту игру.</p>
      <PartySection currentKey="spy" standings={g.skippedData?.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

export default function App() {
  const g = useSpyGame()
  const video = useVideoToggle()
  const showSkipButton = ['role', 'discussion', 'voting'].includes(g.screen)
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
          {g.screen === 'discussion' && g.discussionData && <DiscussionScreen {...g} />}
          {g.screen === 'voting' && g.votingPlayers && <VotingScreen {...g} />}
          {g.screen === 'end' && <EndScreen {...g} />}
          {g.screen === 'skipped' && <SkippedScreen {...g} />}
        </div>

        <SidePanel players={g.currentRoom?.players || []} videoEnabled={video.enabled} />
      </div>

      <Credit enabled={video.enabled} onToggle={video.toggle} />
    </div>
  )
}
