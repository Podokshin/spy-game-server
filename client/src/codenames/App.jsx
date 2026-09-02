import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  TextAa,
  Trophy,
  SkipForward,
  Link as LinkIcon,
  Check,
} from '@phosphor-icons/react'
import { AVATARS, useCodenamesGame } from './useCodenamesGame'
import Header from '../components/Header'
import Credit from '../components/Credit'
import SidePanel from '../components/SidePanel'
import { useVideoToggle } from '../lib/useVideoToggle'
import RulesPanel from './RulesPanel'

const AVATAR_LABELS = { bandit: 'Разбойник', viking: 'Викинг', astronaut: 'Космонавт', scout: 'Скаут', merc: 'Наёмник', miner: 'Шахтёр', alien: 'Пришелец', hero: 'Герой', assassin: 'Ассасин', warrior: 'Воин', nomad: 'Кочевница', sleepy: 'Соня' }
const CLUE_NUMBERS = Array.from({ length: 10 }, (_, i) => i)

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

function TeamChip({ player }) {
  return (
    <span className={'player-chip' + (player.connected === false ? ' disconnected' : '')}>
      <AvatarIcon avatar={player.avatar} /> {player.name}
      {player.isHost && <span className="host-tag"> ★</span>}
      {player.role === 'spymaster' && <span className="captain-tag"> КАПИТАН</span>}
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
      <h1><TextAa size={26} weight="bold" style={{ verticalAlign: -4 }} /> Кодовые имена</h1>
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

function TeamActions({ g, team }) {
  const me = g.currentRoom.players.find(p => p.id === g.myPlayerId)
  if (!me) return null
  if (me.team !== team) {
    return <div className="team-actions"><button type="button" className="secondary-btn" onClick={() => g.setTeam(team)}>Вступить</button></div>
  }
  return (
    <div className="team-actions">
      <button type="button" className="secondary-btn" onClick={() => g.setTeam(null)}>Покинуть команду</button>
      <button type="button" className="secondary-btn" onClick={() => g.setRole(me.role === 'spymaster' ? 'operative' : 'spymaster')}>
        {me.role === 'spymaster' ? 'Стать обычным агентом' : 'Стать капитаном'}
      </button>
    </div>
  )
}

function teamValid(members) {
  return members.length >= 2 && members.some(p => p.role === 'spymaster')
}

function LobbyScreen(g) {
  const room = g.currentRoom
  const redPlayers = room.players.filter(p => p.team === 'red')
  const bluePlayers = room.players.filter(p => p.team === 'blue')
  const unassigned = room.players.filter(p => !p.team)
  const wordSet = (room.settings && room.settings.wordSet) || 'classic'
  const ready = teamValid(redPlayers) && teamValid(bluePlayers)

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
          <h3>🔴 Красные</h3>
          <div className="chip-list"><TeamChipList players={redPlayers} /></div>
          <TeamActions g={g} team="red" />
        </div>
        <div className="team-panel team-blue">
          <h3>🔵 Синие</h3>
          <div className="chip-list"><TeamChipList players={bluePlayers} /></div>
          <TeamActions g={g} team="blue" />
        </div>
      </div>

      {unassigned.length > 0 && (
        <div className="field">
          <label>Без команды</label>
          <div className="chip-list"><TeamChipList players={unassigned} /></div>
        </div>
      )}

      <div className="field">
        <label>Набор слов</label>
        <div className="category-toggle">
          <button type="button" className={'cat-btn' + (wordSet === 'classic' ? ' active' : '')} disabled={!g.isHost} onClick={() => g.updateWordSet('classic')}>Классика</button>
          <button type="button" className={'cat-btn' + (wordSet === 'zoomer' ? ' active' : '')} disabled={!g.isHost} onClick={() => g.updateWordSet('zoomer')}>Зумерский сленг 😎</button>
        </div>
      </div>

      {g.isHost && <button className="primary-btn" disabled={!ready} onClick={g.startGame}>Начать игру</button>}
      {!g.isHost && <p className="hint">Ожидаем, когда хост начнёт игру…</p>}
      {g.isHost && !ready && <p className="hint">В каждой команде нужно минимум 2 игрока и один капитан</p>}

      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function BoardScreen(g) {
  const gs = g.gameState
  const room = g.currentRoom
  const [clueWord, setClueWord] = useState('')
  const [clueNumber, setClueNumber] = useState(1)

  const redPlayers = room.players.filter(p => p.team === 'red')
  const bluePlayers = room.players.filter(p => p.team === 'blue')
  const isMyTurn = gs.currentTeam === g.myTeam
  const teamLabel = gs.currentTeam === 'red' ? 'Красные' : 'Синие'
  const showClueForm = isMyTurn && g.myRole === 'spymaster' && !gs.currentClue
  const canGuess = isMyTurn && g.myRole === 'operative' && !!gs.currentClue
  const showEndTurn = isMyTurn && !!gs.currentClue

  return (
    <section className="screen active">
      <div className="my-role-badge">Вы: {g.myTeam === 'red' ? '🔴' : g.myTeam === 'blue' ? '🔵' : '—'} {g.myRole === 'spymaster' ? 'Капитан' : 'Агент'}</div>

      <div className="turn-banner">
        <span className={'turn-team-dot dot-' + gs.currentTeam} />
        <span>{gs.currentClue ? `Ход: ${teamLabel} — агенты угадывают` : `Ход: ${teamLabel} — капитан думает над подсказкой`}</span>
      </div>

      <div className="score-row">
        <span className="score-pill score-red">🔴 {gs.remainingCounts.red}</span>
        <span className="score-pill score-blue">🔵 {gs.remainingCounts.blue}</span>
      </div>

      <div className="teams-grid board-teams-grid">
        <div className={'team-panel team-blue' + (gs.currentTeam === 'blue' ? ' active-turn' : '')}>
          <h3>🔵 Синие</h3>
          <div className="chip-list"><TeamChipList players={bluePlayers} /></div>
        </div>
        <div className={'team-panel team-red' + (gs.currentTeam === 'red' ? ' active-turn' : '')}>
          <h3>🔴 Красные</h3>
          <div className="chip-list"><TeamChipList players={redPlayers} /></div>
        </div>
      </div>

      {gs.currentClue && (
        <div className="clue-box">
          <span className="clue-label">Подсказка</span>
          <span className="clue-text">{gs.currentClue.word} — {gs.currentClue.number}</span>
        </div>
      )}

      {showClueForm && (
        <div className="clue-form">
          <input type="text" placeholder="Слово-подсказка" maxLength={30} autoComplete="off" value={clueWord} onChange={e => setClueWord(e.target.value)} />
          <select value={clueNumber} onChange={e => setClueNumber(e.target.value)}>
            {CLUE_NUMBERS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="primary-btn" onClick={() => { const w = clueWord.trim(); if (w) g.submitClue(w, parseInt(clueNumber, 10) || 0) }}>Дать подсказку</button>
        </div>
      )}

      <div className="board-grid">
        {gs.board.map((card, index) => {
          if (card.revealed) {
            return <button key={index} type="button" className={'board-card revealed revealed-' + card.color} disabled>{card.word}</button>
          }
          const hintClass = g.myRole === 'spymaster' && g.colorKey ? ' hint-' + g.colorKey[index] : ''
          return (
            <button
              key={index} type="button" className={'board-card' + hintClass}
              disabled={!canGuess} onClick={() => canGuess && g.guessCard(index)}
            >
              {card.word}
            </button>
          )
        })}
      </div>

      {showEndTurn && <button className="secondary-btn" onClick={g.endTurn}>Завершить ход</button>}
      {!isMyTurn && (
        <p className="hint">{gs.currentClue ? `${teamLabel} угадывают слова…` : `Капитан команды «${teamLabel}» думает над подсказкой…`}</p>
      )}
      {g.isHost && <button className="secondary-btn" onClick={g.forceEndTurn}>⚠️ Пропустить ход (капитан пропал)</button>}

      <div className="field">
        <label>История подсказок</label>
        <div className="clue-history-list">
          {gs.clueHistory.length === 0 && <span className="hint">Пока нет подсказок</span>}
          {[...gs.clueHistory].reverse().map((c, i) => (
            <div key={i} className={'clue-history-item hist-' + c.team}>
              <span>{c.team === 'red' ? '🔴' : '🔵'} {c.word}</span>
              <span>{c.number}</span>
            </div>
          ))}
        </div>
      </div>

      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function EndScreen(g) {
  const gs = g.gameState
  const winnerLabel = gs.winner === 'red' ? '🔴 Красные' : '🔵 Синие'
  return (
    <section className="screen active">
      <h2><Trophy size={22} weight="bold" style={{ verticalAlign: -3 }} /> Победили: {winnerLabel}</h2>
      <p className="hint">{gs.winReason === 'assassin' ? 'Соперники наткнулись на чёрную карту!' : 'Все слова команды найдены!'}</p>

      <div className="board-grid">
        {gs.board.map((card, i) => (
          <div key={i} className={'board-card revealed revealed-' + card.color}>{card.word}</div>
        ))}
      </div>

      {g.isHost ? (
        <button className="primary-btn" onClick={g.playAgain}>Новая игра (в лобби)</button>
      ) : (
        <p className="hint">Ждите, пока хост начнёт новую игру…</p>
      )}
      <PartySection currentKey="codenames" standings={gs.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

function SkippedScreen(g) {
  return (
    <section className="screen active">
      <h2><SkipForward size={22} weight="bold" style={{ verticalAlign: -3 }} /> Игра пропущена</h2>
      <p className="hint">Большинство игроков проголосовало пропустить эту игру.</p>
      <PartySection currentKey="codenames" standings={g.skippedData?.partyStandings || []} isHost={g.isHost} onSelect={g.selectNextGame} />
      <button className="secondary-btn" onClick={g.leaveRoom}>Выйти из комнаты</button>
    </section>
  )
}

export default function App() {
  const g = useCodenamesGame()
  const video = useVideoToggle()
  const wide = g.screen === 'board' || g.screen === 'end'
  const me = g.currentRoom?.players.find(p => p.id === g.myPlayerId)

  return (
    <div className="gc-page">
      <Header score={typeof me?.score === 'number' ? me.score : undefined} />

      <div className="gc-body">
        <RulesPanel />

        <div id="app" className={wide ? 'wide' : ''}>
          {g.screen === 'board' && (
            <button type="button" className={'skip-vote-btn' + (g.myVoted ? ' voted' : '')} onClick={g.voteSkip}>
              <SkipForward size={14} weight="bold" style={{ verticalAlign: -2 }} /> Скип ({g.skipVote.votes}/{g.skipVote.needed})
            </button>
          )}

          {g.screen === 'menu' && <MenuScreen {...g} />}
          {g.screen === 'lobby' && g.currentRoom && <LobbyScreen {...g} />}
          {g.screen === 'board' && g.gameState && g.currentRoom && <BoardScreen {...g} />}
          {g.screen === 'end' && g.gameState && <EndScreen {...g} />}
          {g.screen === 'skipped' && <SkippedScreen {...g} />}
        </div>

        <SidePanel players={g.currentRoom?.players || []} videoEnabled={video.enabled} />
      </div>

      <Credit enabled={video.enabled} onToggle={video.toggle} />
    </div>
  )
}
