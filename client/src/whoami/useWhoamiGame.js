import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

// Ключи, не эмодзи — рендерятся в кастомные картинки (см. AvatarIcon в App.jsx).
// Должно совпадать с ALLOWED_AVATARS в lib/shared.js.
export const AVATARS = ['bandit', 'viking', 'astronaut', 'scout', 'merc', 'miner', 'alien', 'hero', 'assassin', 'warrior', 'nomad', 'sleepy']
const SESSION_KEY = 'whoami_online_session_v1'

// Один сокет на загрузку страницы — как и в vanilla-версии, не пересоздаётся
// при перерендерах/StrictMode.
const socket = io('/whoami')

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
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode, playerId }))
  } catch {
    /* ignore */
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

const DEFAULT_MENU_SUBTITLE = 'Каждому достаётся секретная личность, которую видят все, кроме него самого. Задавайте вопросы «да/нет» и угадывайте, кто вы!'
const INVITE_MENU_SUBTITLE = 'Вас пригласили сыграть! Впишите имя, выберите аватар и присоединяйтесь.'

export function useWhoamiGame() {
  const partyParams = window.PartyHub ? window.PartyHub.getPartyParams() : null
  const roomFromUrl = new URLSearchParams(window.location.search).get('room')

  const [screen, setScreen] = useState('menu')
  const [playerName, setPlayerName] = useState(partyParams?.name || '')
  const [selectedAvatar, setSelectedAvatar] = useState(
    partyParams?.avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)]
  )
  const [joinCode, setJoinCode] = useState(roomFromUrl ? roomFromUrl.toUpperCase() : '')
  const [inviteCode, setInviteCode] = useState(roomFromUrl ? roomFromUrl.toUpperCase() : null)
  const [menuError, setMenuError] = useState('')

  const [currentRoom, setCurrentRoom] = useState(null)
  const [isHost, setIsHost] = useState(false)
  const [myPlayerId, setMyPlayerId] = useState(null)

  const [latestIdentities, setLatestIdentities] = useState(null)
  const [finishedOrder, setFinishedOrder] = useState([])
  const [haveIGuessed, setHaveIGuessed] = useState(false)
  const [readyHint, setReadyHint] = useState(null) // null = мой кнопка "Готов" видна; иначе строка-подсказка

  const [endData, setEndData] = useState(null)
  const [skippedData, setSkippedData] = useState(null)
  const [skipVote, setSkipVote] = useState({ votes: 0, needed: 0, voterIds: [] })
  const [copyLinkLabel, setCopyLinkLabel] = useState('Скопировать ссылку-приглашение')

  const hasConnectedBefore = useRef(false)
  // Живые копии для чтения из обработчиков сокета без лишних зависимостей эффекта.
  const liveRef = useRef({})
  liveRef.current = { currentRoom, myPlayerId, isHost, playerName, selectedAvatar }

  function applyRoomUpdate(room) {
    const resolvedPlayerId = room.playerId || liveRef.current.myPlayerId
    const hostNow = room.players.some(p => p.id === resolvedPlayerId && p.isHost)
    setCurrentRoom(room)
    if (room.playerId) setMyPlayerId(room.playerId)
    setIsHost(hostNow)
    history.replaceState(null, '', '?room=' + room.code)
    saveSession(room.code, resolvedPlayerId)
    if (room.phase === 'lobby') setScreen('lobby')
  }

  function resetGameState() {
    setLatestIdentities(null)
    setFinishedOrder([])
    setHaveIGuessed(false)
  }

  function renderAssignedScreen(data) {
    setLatestIdentities(data)
    setFinishedOrder([])
    setHaveIGuessed(false)
    setReadyHint(null)
    setScreen('assigned')
  }

  function renderPlayingScreen() {
    setScreen('playing')
  }

  function renderEndScreen(data) {
    setEndData(data)
    setScreen('end')
  }

  function renderSkippedScreen(players, partyStandings) {
    setSkippedData({ players, partyStandings })
    setScreen('skipped')
  }

  // ---------- Socket wiring (один раз на весь жизненный цикл страницы) ----------
  useEffect(() => {
    function attemptRejoin() {
      const saved = loadSession()
      if (!saved) return
      socket.emit('rejoin', saved, (res) => {
        if (!res || !res.ok) {
          clearSession()
          return
        }
        applyRoomUpdate(res)

        if (res.phase === 'assigned') {
          if (res.identities) renderAssignedScreen(res.identities)
          if (res.alreadyReady) setReadyHint(
            typeof res.readyCount === 'number' ? `Готовы: ${res.readyCount} из ${res.total}` : 'Ждём остальных игроков…'
          )
        } else if (res.phase === 'playing') {
          if (res.identities) setLatestIdentities(res.identities)
          const order = (res.finished && res.finished.finishedOrder) || []
          setFinishedOrder(order)
          setHaveIGuessed(order.includes(res.playerId || liveRef.current.myPlayerId))
          renderPlayingScreen()
        } else if (res.phase === 'end') {
          if (res.result) renderEndScreen(res.result)
        } else if (res.phase === 'skipped' && res.skipped) {
          renderSkippedScreen(res.skipped.players, res.skipped.partyStandings)
        }

        if (res.skipVotes) {
          setSkipVote({ votes: res.skipVotes.votes, needed: res.skipVotes.needed, voterIds: res.skipVotes.voterIds || [] })
        }
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

    function onDisconnect() {
      if (liveRef.current.currentRoom) {
        setMenuError('Соединение потеряно, пробуем восстановить связь…')
      }
    }

    function onRoomUpdate(room) {
      applyRoomUpdate(Object.assign({ playerId: liveRef.current.myPlayerId }, room))
    }

    function onReadyUpdate({ readyCount, total }) {
      setReadyHint(prev => (prev !== null ? `Готовы: ${readyCount} из ${total}` : prev))
    }

    function onPlayerFinished(data) {
      setFinishedOrder(prev => (prev.includes(data.playerId) ? prev : [...prev, data.playerId]))
      if (data.playerId === liveRef.current.myPlayerId) setHaveIGuessed(true)
    }

    function onGameFinished(data) {
      renderEndScreen(data)
      if (window.fireConfetti) window.fireConfetti()
    }

    function onNextGameSelected({ gameKey }) {
      const { currentRoom, playerName, selectedAvatar, isHost } = liveRef.current
      if (window.PartyHub && currentRoom) {
        window.PartyHub.goToGame(gameKey, currentRoom.code, playerName, selectedAvatar, isHost)
      }
    }

    function onGameSkipped({ players, partyStandings }) {
      renderSkippedScreen(players, partyStandings)
    }

    function onSkipVoteUpdate({ votes, needed, voterIds }) {
      setSkipVote({ votes, needed, voterIds: voterIds || [] })
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('room_update', onRoomUpdate)
    socket.on('identities_assigned', renderAssignedScreen)
    socket.on('ready_update', onReadyUpdate)
    socket.on('playing_started', renderPlayingScreen)
    socket.on('player_finished', onPlayerFinished)
    socket.on('game_finished', onGameFinished)
    socket.on('next_game_selected', onNextGameSelected)
    socket.on('game_skipped', onGameSkipped)
    socket.on('skip_vote_update', onSkipVoteUpdate)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room_update', onRoomUpdate)
      socket.off('identities_assigned', renderAssignedScreen)
      socket.off('ready_update', onReadyUpdate)
      socket.off('playing_started', renderPlayingScreen)
      socket.off('player_finished', onPlayerFinished)
      socket.off('game_finished', onGameFinished)
      socket.off('next_game_selected', onNextGameSelected)
      socket.off('game_skipped', onGameSkipped)
      socket.off('skip_vote_update', onSkipVoteUpdate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- «Вечер игр»: авто-создание/вход при переходе из другой игры ----------
  useEffect(() => {
    if (!partyParams) return
    if (partyParams.isHost) {
      socket.emit('create_room', { name: partyParams.name, avatar: partyParams.avatar, partyCode: partyParams.code }, (res) => {
        if (!res.ok) return setMenuError('Не удалось создать комнату')
        applyRoomUpdate(res)
      })
    } else {
      let attemptsLeft = 10
      const tryJoin = () => {
        socket.emit('join_room', { code: partyParams.code, name: partyParams.name, avatar: partyParams.avatar }, (res) => {
          if (res.ok) {
            applyRoomUpdate(res)
            return
          }
          attemptsLeft -= 1
          if (attemptsLeft > 0) {
            setTimeout(tryJoin, 500)
          } else {
            setMenuError(res.error || 'Не удалось присоединиться к следующей игре — попробуйте войти по коду вручную')
          }
        })
      }
      tryJoin()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- Actions (вызываются из экранов) ----------
  function createRoom() {
    setMenuError('')
    socket.emit('create_room', { name: playerName, avatar: selectedAvatar, partyCode: partyParams ? partyParams.code : undefined }, (res) => {
      if (!res.ok) return setMenuError('Не удалось создать комнату')
      applyRoomUpdate(res)
    })
  }

  function joinRoom() {
    setMenuError('')
    socket.emit('join_room', { code: joinCode, name: playerName, avatar: selectedAvatar }, (res) => {
      if (!res.ok) return setMenuError(res.error || 'Не удалось присоединиться')
      applyRoomUpdate(res)
    })
  }

  function switchToCreateMode() {
    setInviteCode(null)
    history.replaceState(null, '', window.location.pathname)
  }

  function leaveRoom() {
    socket.emit('leave_room')
    setCurrentRoom(null)
    setIsHost(false)
    setMyPlayerId(null)
    resetGameState()
    clearSession()
    setInviteCode(null)
    setScreen('menu')
  }

  function startGame() {
    socket.emit('start_game')
  }

  function markReady() {
    socket.emit('player_ready')
    setReadyHint('Ждём остальных игроков…')
  }

  function forceStartPlaying() {
    socket.emit('force_start_playing')
  }

  function markGuessed() {
    socket.emit('i_guessed')
  }

  function forceEndPlaying() {
    socket.emit('force_end_playing')
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
      setCopyLinkLabel('Ссылка скопирована!')
      setTimeout(() => setCopyLinkLabel('Скопировать ссылку-приглашение'), 1800)
    }).catch(() => {
      setCopyLinkLabel(link)
      setTimeout(() => setCopyLinkLabel('Скопировать ссылку-приглашение'), 3000)
    })
  }

  return {
    screen,
    partyParams,
    menuSubtitle: inviteCode ? INVITE_MENU_SUBTITLE : DEFAULT_MENU_SUBTITLE,
    inviteCode,
    playerName, setPlayerName,
    selectedAvatar, setSelectedAvatar,
    joinCode, setJoinCode,
    menuError,
    createRoom, joinRoom, switchToCreateMode,

    currentRoom, isHost, myPlayerId,
    startGame, leaveRoom, copyInviteLink, copyLinkLabel,

    latestIdentities, finishedOrder, haveIGuessed, readyHint,
    markReady, forceStartPlaying, markGuessed, forceEndPlaying,

    endData, playAgain,
    skippedData,

    skipVote, myVoted: skipVote.voterIds.includes(myPlayerId),
    voteSkip, selectNextGame,
  }
}
