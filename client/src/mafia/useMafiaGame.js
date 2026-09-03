import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { playRoundStartSound, playResultSound, unlockAudio } from '../lib/sound'

export const AVATARS = ['bandit', 'viking', 'astronaut', 'scout', 'merc', 'miner', 'alien', 'hero', 'assassin', 'warrior', 'nomad', 'sleepy']
const SESSION_KEY = 'mafia_online_session_v1'

const socket = io('/mafia')

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function saveSession(roomCode, playerId) {
  if (!roomCode || !playerId) return
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode, playerId })) } catch { /* ignore */ }
}
function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
}

const DEFAULT_MENU_SUBTITLE = 'Мафия ночью выбирает жертву, город днём ищет, кому не доверять. Выживут либо все мирные, либо мафия сравняется числом.'
const INVITE_MENU_SUBTITLE = 'Вас пригласили сыграть! Впишите имя, выберите аватар и присоединяйтесь.'

export const ROLE_HINTS = {
  mafia: 'Ночью выбирайте вместе с сообщниками, кого устранить. Днём притворяйтесь мирным жителем.',
  sheriff: 'Каждую ночь можете тайно проверить одного игрока — мафия он или нет.',
  doctor: 'Каждую ночь можете выбрать, кого спасти от нападения мафии (можно себя).',
  civilian: 'У вас нет ночных действий. Слушайте, наблюдайте и голосуйте с умом днём.',
}

export function useMafiaGame() {
  const partyParams = window.PartyHub ? window.PartyHub.getPartyParams() : null
  const roomFromUrl = new URLSearchParams(window.location.search).get('room')

  const [screen, setScreen] = useState('menu')
  const [playerName, setPlayerName] = useState(partyParams?.name || '')
  const [selectedAvatar, setSelectedAvatar] = useState(partyParams?.avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)])
  const [joinCode, setJoinCode] = useState(roomFromUrl ? roomFromUrl.toUpperCase() : '')
  const [inviteCode, setInviteCode] = useState(roomFromUrl ? roomFromUrl.toUpperCase() : null)
  const [menuError, setMenuError] = useState('')

  const [currentRoom, setCurrentRoom] = useState(null)
  const [isHost, setIsHost] = useState(false)
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [copyLinkLabel, setCopyLinkLabel] = useState('Скопировать ссылку-приглашение')

  const [myRole, setMyRole] = useState(null) // {role, label, teammates}

  const [nightData, setNightData] = useState(null) // {round, endsAt}
  const [nightTurnData, setNightTurnData] = useState(null) // {role, targets} | null = waiting

  const [dayData, setDayData] = useState(null) // {round, endsAt, victim}

  const [voteAlive, setVoteAlive] = useState(null)
  const [voteStatusText, setVoteStatusText] = useState('')

  const [gameOver, setGameOver] = useState(null)
  const [skippedData, setSkippedData] = useState(null)
  const [skipVote, setSkipVote] = useState({ votes: 0, needed: 0, voterIds: [] })

  const hasConnectedBefore = useRef(false)
  const liveRef = useRef({})
  liveRef.current = { currentRoom, myPlayerId, isHost, playerName, selectedAvatar }

  function applyRoomUpdate(room) {
    const resolvedPlayerId = room.playerId || liveRef.current.myPlayerId
    setCurrentRoom(prev => Object.assign({}, prev, room))
    const hostNow = room.players.some(p => p.id === resolvedPlayerId && p.isHost)
    setIsHost(hostNow)
    if (room.phase === 'lobby') setScreen('lobby')
  }

  function enterRoom(res) {
    setMyPlayerId(res.playerId)
    setCurrentRoom(res)
    saveSession(res.code, res.playerId)
    applyRoomUpdate(res)
  }

  function renderNightStarted(data) {
    saveSession(liveRef.current.currentRoom?.code, liveRef.current.myPlayerId)
    setNightData({ round: data.round, endsAt: data.endsAt })
    setNightTurnData(null)
    setScreen('night')
  }

  function renderYourNightTurn(data) {
    setNightTurnData(data)
    setScreen('night')
  }

  function renderDayStarted(data) {
    setDayData({ round: data.round, endsAt: data.endsAt, victim: data.victim || null })
    setScreen('day')
  }

  function renderVotingStarted(alive) {
    setVoteAlive(alive)
    setVoteStatusText('')
    setScreen('voting')
  }

  function renderGameOver(data) {
    setGameOver(data)
    setScreen('end')
  }

  function renderSkippedScreen(players, partyStandings) {
    setSkippedData({ players, partyStandings })
    setScreen('skipped')
  }

  useEffect(() => {
    function attemptRejoin() {
      const saved = loadSession()
      if (!saved) return
      socket.emit('rejoin', saved, (res) => {
        if (!res || !res.ok) { clearSession(); return }
        setMyPlayerId(res.playerId)
        applyRoomUpdate(res)

        if (res.yourRole && res.phase !== 'lobby') {
          setMyRole(res.yourRole)
        }

        if (res.phase === 'night' && res.night) {
          setNightData({ round: res.night.round, endsAt: res.night.endsAt })
          setScreen('night')
        } else if (res.phase === 'day' && res.day) {
          setDayData({ round: res.day.round, endsAt: res.day.endsAt, victim: res.day.victim || null })
          setScreen('day')
        } else if (res.phase === 'voting' && res.voting) {
          renderVotingStarted(res.voting.alive)
        } else if (res.phase === 'end' && res.gameOver) {
          renderGameOver(res.gameOver)
        } else if (res.phase === 'skipped' && res.skipped) {
          renderSkippedScreen(res.skipped.players, res.skipped.partyStandings)
        }

        if (res.skipVotes) setSkipVote({ votes: res.skipVotes.votes, needed: res.skipVotes.needed, voterIds: res.skipVotes.voterIds || [] })
      })
    }

    function onConnect() {
      if (hasConnectedBefore.current) {
        if (liveRef.current.currentRoom && liveRef.current.myPlayerId) {
          saveSession(liveRef.current.currentRoom.code, liveRef.current.myPlayerId)
          attemptRejoin()
        }
      } else {
        hasConnectedBefore.current = true
        attemptRejoin()
      }
    }

    function onRoomUpdate(room) {
      applyRoomUpdate(room)
    }

    function onYourRole(data) {
      playRoundStartSound()
      setMyRole(data)
      setScreen('role')
    }

    function onVoteUpdate({ votedCount, total }) {
      setVoteStatusText(`Проголосовало: ${votedCount} из ${total}`)
    }

    function onVotingResult({ eliminated }) {
      playResultSound()
      setVoteStatusText(eliminated
        ? `По итогам голосования выбывает: ${eliminated.name} (${eliminated.role})`
        : 'Голоса разделились — никто не выбывает.')
    }

    function onGameOver(data) {
      renderGameOver(data)
      if (window.fireConfetti) window.fireConfetti()
    }

    function onNextGameSelected({ gameKey }) {
      const { currentRoom, playerName, selectedAvatar, isHost } = liveRef.current
      if (window.PartyHub && currentRoom) window.PartyHub.goToGame(gameKey, currentRoom.code, playerName, selectedAvatar, isHost)
    }

    function onSkipVoteUpdate({ votes, needed, voterIds }) {
      setSkipVote({ votes, needed, voterIds: voterIds || [] })
    }

    socket.on('connect', onConnect)
    socket.on('room_update', onRoomUpdate)
    socket.on('your_role', onYourRole)
    socket.on('night_started', renderNightStarted)
    socket.on('your_night_turn', renderYourNightTurn)
    socket.on('day_started', renderDayStarted)
    socket.on('voting_started', (data) => renderVotingStarted(data.alive))
    socket.on('vote_update', onVoteUpdate)
    socket.on('voting_result', onVotingResult)
    socket.on('game_over', onGameOver)
    socket.on('next_game_selected', onNextGameSelected)
    socket.on('game_skipped', ({ players, partyStandings }) => renderSkippedScreen(players, partyStandings))
    socket.on('skip_vote_update', onSkipVoteUpdate)

    return () => {
      socket.off('connect', onConnect)
      socket.off('room_update', onRoomUpdate)
      socket.off('your_role', onYourRole)
      socket.off('night_started', renderNightStarted)
      socket.off('your_night_turn', renderYourNightTurn)
      socket.off('day_started', renderDayStarted)
      socket.off('vote_update', onVoteUpdate)
      socket.off('voting_result', onVotingResult)
      socket.off('game_over', onGameOver)
      socket.off('next_game_selected', onNextGameSelected)
      socket.off('skip_vote_update', onSkipVoteUpdate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!partyParams) return
    if (partyParams.isHost) {
      socket.emit('create_room', { name: partyParams.name, avatar: partyParams.avatar, partyCode: partyParams.code }, (res) => {
        if (!res || !res.ok) return setMenuError((res && res.error) || 'Не удалось создать комнату')
        enterRoom(res)
      })
    } else {
      let attemptsLeft = 10
      const tryJoin = () => {
        socket.emit('join_room', { code: partyParams.code, name: partyParams.name, avatar: partyParams.avatar }, (res) => {
          if (res && res.ok) return enterRoom(res)
          attemptsLeft -= 1
          if (attemptsLeft > 0) setTimeout(tryJoin, 500)
          else setMenuError((res && res.error) || 'Не удалось присоединиться к следующей игре — попробуйте войти по коду вручную')
        })
      }
      tryJoin()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function createRoom() {
    unlockAudio()
    if (!playerName.trim()) return setMenuError('Введите имя')
    setMenuError('')
    socket.emit('create_room', { name: playerName, avatar: selectedAvatar, partyCode: partyParams ? partyParams.code : undefined }, (res) => {
      if (!res || !res.ok) return setMenuError((res && res.error) || 'Не удалось создать комнату')
      enterRoom(res)
    })
  }

  function joinRoom() {
    unlockAudio()
    if (!playerName.trim()) return setMenuError('Введите имя')
    if (!joinCode.trim()) return setMenuError('Введите код комнаты')
    setMenuError('')
    socket.emit('join_room', { code: joinCode, name: playerName, avatar: selectedAvatar }, (res) => {
      if (!res || !res.ok) return setMenuError((res && res.error) || 'Не удалось присоединиться')
      enterRoom(res)
    })
  }

  function switchToCreateMode() {
    setInviteCode(null)
    history.replaceState(null, '', window.location.pathname)
  }

  function leaveRoom() {
    socket.emit('leave_room')
    clearSession()
    window.location.href = window.location.pathname
  }

  function pushSettings(nightSeconds, discussionSeconds) {
    socket.emit('update_settings', { nightSeconds, discussionSeconds })
  }

  function startGame() {
    socket.emit('start_game')
  }

  function mafiaVote(targetId) {
    socket.emit('mafia_vote', { targetId })
  }

  function doctorSave(targetId) {
    socket.emit('doctor_save', { targetId })
  }

  function sheriffCheck(targetId, cb) {
    socket.emit('sheriff_check', { targetId }, cb)
  }

  function forceEndNight() {
    if (!window.confirm('Завершить ночь досрочно? Используйте, если кто-то с ролью пропал и не может завершить свой ход.')) return
    socket.emit('force_end_night')
  }

  function forceEndDiscussion() {
    socket.emit('force_end_discussion')
  }

  function castVote(targetId) {
    socket.emit('cast_vote', { targetId })
  }

  function forceFinishVoting() {
    socket.emit('force_finish_voting')
  }

  function playAgain() {
    socket.emit('play_again')
  }

  function voteSkip() {
    socket.emit('vote_skip')
  }

  function selectNextGame(gameKey) {
    socket.emit('select_next_game', { gameKey })
  }

  function copyInviteLink() {
    if (!currentRoom) return
    const link = window.location.origin + window.location.pathname + '?room=' + currentRoom.code
    navigator.clipboard.writeText(link).then(() => {
      setCopyLinkLabel('Скопировано!')
      setTimeout(() => setCopyLinkLabel('Скопировать ссылку-приглашение'), 1800)
    }).catch(() => {
      setCopyLinkLabel(link)
      setTimeout(() => setCopyLinkLabel('Скопировать ссылку-приглашение'), 3000)
    })
  }

  return {
    screen,
    menuSubtitle: inviteCode ? INVITE_MENU_SUBTITLE : DEFAULT_MENU_SUBTITLE,
    inviteCode,
    playerName, setPlayerName,
    selectedAvatar, setSelectedAvatar,
    joinCode, setJoinCode,
    menuError, createRoom, joinRoom, switchToCreateMode,

    currentRoom, isHost, myPlayerId,
    startGame, leaveRoom, copyInviteLink, copyLinkLabel, pushSettings,

    myRole,

    nightData, nightTurnData, mafiaVote, doctorSave, sheriffCheck, forceEndNight,

    dayData, forceEndDiscussion,

    voteAlive, voteStatusText, castVote, forceFinishVoting,

    gameOver, playAgain,
    skippedData,

    skipVote, myVoted: skipVote.voterIds.includes(myPlayerId),
    voteSkip, selectNextGame,
  }
}
