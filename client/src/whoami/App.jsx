import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Question,
  Link as LinkIcon,
  Check,
  MaskHappy,
  GameController,
  Confetti,
  Trophy,
  SkipForward,
} from '@phosphor-icons/react'
import { AVATARS, useWhoamiGame } from './useWhoamiGame'
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
    if (window.PartyHub && ref.current) {
      window.PartyHub.renderPartySection(ref.current, { currentKey, standings, isHost, onSelect })
    }
  }, [currentKey, standings, isHost, onSelect])
  return <div ref={ref} />
}

function PlayerChip({ player, rank }) {
  return (
    <span className={'player-chip' + (player.connected === false ? ' disconnected' : '')}>
      {rank != null && <span className="rank-num">{rank}</span>}
      <span className="player-avatar"><AvatarIcon avatar={player.avatar} /></span> {player.name}
      {player.isHost && <span className="host-tag"> ★ хост</span>}
      {player.connected === false && ' ⏳'}
    </span>
  )
}

function IdentityList({ players, myPlayerId, haveIGuessed, finishedOrder, showFinishedTags }) {
  if (!players) return null
  return (
    <div className="identity-list">
      {players.map(p => {
        const isMe = p.id === myPlayerId
        const masked = isMe && !haveIGuessed
        const finished = finishedOrder.includes(p.id)
        const value = masked ? '❓❓❓' : p.identity
        return (
          <div key={p.id} className={'identity-row' + (isMe ? ' me' : '') + (showFinishedTags && finished ? ' finished' : '')}>
            <span className="identity-avatar"><AvatarIcon avatar={p.avatar} /></span>
            <span className="identity-body">
              <span className="identity-name">{p.name}{isMe ? ' (это вы)' : ''}</span>
              <span className="identity-value">{value}</span>
            </span>
            {showFinishedTags && finished && (
              <span className="identity-tag">✅ #{finishedOrder.indexOf(p.id) + 1}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function MenuScreen(g) {
  const invited = !!g.inviteCode
  return (
    <section className="screen active">
      <a className="back-link" href="/"><ArrowLeft size={12} weight="bold" style={{ verticalAlign: -1 }} /> Все игры</a>
      <h1><Question size={26} weight="bold" style={{ verticalAlign: -4 }} /> Кто я?</h1>
      <p className="subtitle">{g.menuSubtitle}</p>

      {invited && (
        <div className="room-code-box">
          <span className="room-code-label">Вас пригласили в комнату</span>
          <span className="room-code">{g.inviteCode}</span>
        </div>
      )}

      <div className="field">
        <label htmlFor="playerName">Ваше имя</label>
        <input
          type="text" id="playerName" maxLength={20} placeholder="Введите имя"
          value={g.playerName} onChange={e => g.setPlayerName(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Аватар</label>
        <div className="avatar-grid">
          {AVATARS.map(avatar => (
            <button
              key={avatar} type="button"
              className={'avatar-btn' + (avatar === g.selectedAvatar ? ' active' : '')}
              aria-label={'Аватар ' + AVATAR_LABELS[avatar]}
              onClick={() => g.setSelectedAvatar(avatar)}
            >
              <AvatarIcon avatar={avatar} size={56} />
            </button>
          ))}
        </div>
      </div>

      {!invited && (
        <button className="primary-btn" onClick={g.createRoom}>Создать комнату</button>
      )}

      <p className="hint">Продолжая, вы соглашаетесь с <a href="/privacy/">политикой обработки данных</a> и <a href="/terms/">правилами сайта</a>.</p>

      {!invited && <div className="divider">или</div>}

      {!invited && (
        <div className="field">
          <label htmlFor="joinCode">Код комнаты</label>
          <input
            type="text" id="joinCode" maxLength={5} placeholder="ABCDE"
            value={g.joinCode} onChange={e => g.setJoinCode(e.target.value)}
          />
        </div>
      )}
      <button className={invited ? 'primary-btn' : 'secondary-btn'} onClick={g.joinRoom}>Присоединиться</button>

      {invited && (
        <p className="link-toggle" onClick={g.switchToCreateMode}>Хотите создать свою комнату вместо этого?</p>
      )}

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
        <label>Игроки ({room.players.length})</label>
        <div className="chip-list">
          {room.players.map(p => <PlayerChip key={p.id} player={p} />)}
        </div>
      </div>

      {g.isHost && (
        <button className="primary-btn" disabled={!enoughPlayers} onClick={g.startGame}>Начать игру</button>
      )}
      {!g.isHost && <p className="hint">Ожидаем, когда хост начнёт игру…</p>}
      {g.isHost && !enoughPlayers && <p className="hint">Нужно минимум 3 игрока</p>}

      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function AssignedScreen(g) {
  return (
    <section className="screen active">
      <h2><MaskHappy size={22} weight="bold" style={{ verticalAlign: -3 }} /> Личности розданы!</h2>
      <p className="subtitle">Каждый видит личности всех, кроме своей. Посмотрите на список — свою строку вы узнаете по маске «❓❓❓».</p>

      <div className="field">
        <label>Кто есть кто</label>
        <IdentityList
          players={g.latestIdentities?.players} myPlayerId={g.myPlayerId}
          haveIGuessed={false} finishedOrder={[]} showFinishedTags={false}
        />
      </div>

      {g.readyHint === null ? (
        <button className="primary-btn" onClick={g.markReady}>Готов(а)!</button>
      ) : (
        <p className="hint">{g.readyHint}</p>
      )}
      {g.isHost && (
        <button className="secondary-btn" onClick={g.forceStartPlaying}>Начать раунд, не дожидаясь всех</button>
      )}
    </section>
  )
}

function PlayingScreen(g) {
  const [guessing, setGuessing] = useState(false)
  return (
    <section className="screen active">
      <h2><GameController size={22} weight="bold" style={{ verticalAlign: -3 }} /> Раунд начался!</h2>
      <p className="discuss-hint">Спрашивайте у других игроков «да/нет» вопросы, чтобы понять, кто вы. Подсказки — в списке ниже.</p>

      {!g.haveIGuessed && (
        <button className="primary-btn" disabled={guessing} onClick={() => { setGuessing(true); g.markGuessed() }}>
          <Confetti size={16} weight="bold" style={{ verticalAlign: -2 }} /> Я угадал(а), кто я!
        </button>
      )}

      <div className="field">
        <label>Уже угадали ({g.finishedOrder.length} из {g.latestIdentities?.players.length || 0})</label>
        <div className="chip-list">
          {g.finishedOrder.map((id, i) => {
            const p = g.latestIdentities?.players.find(pl => pl.id === id)
            return p ? <PlayerChip key={id} player={p} rank={i + 1} /> : null
          })}
        </div>
      </div>

      <div className="field">
        <label>Кто есть кто</label>
        <IdentityList
          players={g.latestIdentities?.players} myPlayerId={g.myPlayerId}
          haveIGuessed={g.haveIGuessed} finishedOrder={g.finishedOrder} showFinishedTags
        />
      </div>

      {g.isHost && (
        <button className="secondary-btn" onClick={g.forceEndPlaying}>Завершить раньше времени</button>
      )}
    </section>
  )
}

function EndScreen(g) {
  const data = g.endData
  const identityByPlayerId = data.identityByPlayerId || {}
  const order = data.finishedOrder || []
  const medals = ['🥇', '🥈', '🥉']
  const sorted = [...data.players].sort((a, b) => (b.score || 0) - (a.score || 0))

  return (
    <section className="screen active">
      <h2><Trophy size={22} weight="bold" style={{ verticalAlign: -3 }} /> Итоги игры</h2>

      <div className="field">
        <label>Результаты и настоящие личности</label>
        <div className="chip-list">
          {sorted.map((p, i) => {
            const rankIdx = order.indexOf(p.id)
            const medal = rankIdx >= 0 && rankIdx < 3 ? medals[rankIdx] : (i < 3 ? medals[i] : '')
            return (
              <span className="player-chip" key={p.id}>
                {medal ? medal + ' ' : ''}<AvatarIcon avatar={p.avatar} /> <b>{p.name}</b> — {identityByPlayerId[p.id] || '—'} <span className="score-value">{p.score || 0}</span>
              </span>
            )
          })}
        </div>
      </div>

      {g.isHost ? (
        <button className="primary-btn" onClick={g.playAgain}>Новая игра (в лобби)</button>
      ) : (
        <p className="hint">Ждите, пока хост начнёт новую игру…</p>
      )}

      <PartySection currentKey="whoami" standings={data.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />

      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function SkippedScreen(g) {
  return (
    <section className="screen active">
      <h2><SkipForward size={22} weight="bold" style={{ verticalAlign: -3 }} /> Игра пропущена</h2>
      <p className="hint">Большинство игроков проголосовало пропустить эту игру.</p>

      <PartySection currentKey="whoami" standings={g.skippedData?.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />

      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

export default function App() {
  const g = useWhoamiGame()
  const video = useVideoToggle()
  const showSkipButton = g.screen === 'assigned' || g.screen === 'playing'
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
          {g.screen === 'assigned' && <AssignedScreen {...g} />}
          {g.screen === 'playing' && <PlayingScreen {...g} />}
          {g.screen === 'end' && g.endData && <EndScreen {...g} />}
          {g.screen === 'skipped' && <SkippedScreen {...g} />}
        </div>

        <SidePanel players={g.currentRoom?.players || []} videoEnabled={video.enabled} />
      </div>

      <Credit enabled={video.enabled} onToggle={video.toggle} />
    </div>
  )
}
