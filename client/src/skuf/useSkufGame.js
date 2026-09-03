import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { playTimeUpSound, playRoundStartSound, playResultSound, playPingSound, unlockAudio } from '../lib/sound'

export const AVATARS = ['bandit', 'viking', 'astronaut', 'scout', 'merc', 'miner', 'alien', 'hero', 'assassin', 'warrior', 'nomad', 'sleepy']
const SESSION_KEY = 'skuf_online_session_v1'

const socket = io('/skuf')

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

function groupByContact(messages, myId) {
  const map = {}
  messages.forEach(m => {
    const contactId = m.from === myId ? m.to : m.from
    if (!map[contactId]) map[contactId] = []
    map[contactId].push(m)
  })
  return map
}

const DEFAULT_MENU_SUBTITLE = 'Несколько ночей переписки и тайных свиданий — у каждого своя секретная роль, которая тихо влияет на очки.'
const INVITE_MENU_SUBTITLE = 'Вас пригласили сыграть! Впишите имя, выберите аватар и присоединяйтесь.'

export function useSkufGame() {
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

  const [roleData, setRoleData] = useState(null)
  const [readyHint, setReadyHint] = useState(null)

  const [messagingData, setMessagingData] = useState(null)
  const [messagesByContact, setMessagesByContact] = useState({})
  const [activeContactId, setActiveContactIdState] = useState(null)
  const [unreadByContact, setUnreadByContact] = useState({})
  const [toasts, setToasts] = useState([])

  const [pickingData, setPickingData] = useState(null)
  const [myPick, setMyPick] = useState(undefined) // undefined = not chosen yet, null = "никого"
  const [pickSubmitted, setPickSubmitted] = useState(false)
  const [pickProgress, setPickProgress] = useState({ count: 0, total: 0 })

  const [revealData, setRevealData] = useState(null)

  const [endData, setEndData] = useState(null)
  const [skippedData, setSkippedData] = useState(null)
  const [skipVote, setSkipVote] = useState({ votes: 0, needed: 0, voterIds: [] })

  const hasConnectedBefore = useRef(false)
  const liveRef = useRef({})
  liveRef.current = { currentRoom, myPlayerId, isHost, playerName, selectedAvatar, activeContactId }

  function setActiveContactId(contactId) {
    setActiveContactIdState(contactId)
    if (contactId) setUnreadByContact(prev => (prev[contactId] ? { ...prev, [contactId]: 0 } : prev))
  }

  function pushToast(toast) {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { ...toast, id }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }

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

  function renderRoleScreen(data) {
    setRoleData(data)
    setReadyHint(null)
    setScreen('role')
  }

  function renderMessagingScreen(data) {
    setMessagingData(data)
    setMessagesByContact(groupByContact(data.myMessages || [], liveRef.current.myPlayerId))
    setActiveContactId(null)
    setUnreadByContact({})
    setToasts([])
    setScreen('messaging')
  }

  function renderPickingScreen(data) {
    setPickingData(data)
    setMyPick(undefined)
    setPickSubmitted(!!data.alreadyPicked)
    setPickProgress({ count: 0, total: data.players ? data.players.length + 1 : 0 })
    setScreen('picking')
  }

  function renderRevealStep(data) {
    setRevealData(data)
    setScreen('reveal')
  }

  function renderEndScreen(data) {
    setEndData(data)
    setScreen('end')
  }

  function renderSkippedScreen(players, partyStandings) {
    setSkippedData({ players, partyStandings })
    setScreen('skipped')
  }

  function onYourRole(data) {
    playRoundStartSound()
    renderRoleScreen(data)
  }

  function onNightRevealStep(data) {
    if (data.stepIndex === 0) playResultSound()
    renderRevealStep(data)
  }

  useEffect(() => {
    function attemptRejoin() {
      const saved = loadSession()
      if (!saved) return
      socket.emit('rejoin', saved, (res) => {
        if (!res || !res.ok) { clearSession(); return }
        applyRoomUpdate(res)
        if (res.yourRole) setRoleData(res.yourRole)

        if (res.phase === 'roles') {
          if (res.yourRole) renderRoleScreen(res.yourRole)
        } else if (res.phase === 'messaging' && res.messaging) {
          renderMessagingScreen(res.messaging)
        } else if (res.phase === 'picking' && res.picking) {
          renderPickingScreen(res.picking)
        } else if (res.phase === 'reveal' && res.reveal) {
          renderRevealStep(res.reveal)
        } else if (res.phase === 'end') {
          renderEndScreen({ players: res.players, partyStandings: res.partyStandings, rolesByPlayerId: res.rolesByPlayerId, specialWinner: res.specialWinner || null })
        } else if (res.phase === 'skipped') {
          renderSkippedScreen(res.players, res.partyStandings)
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

    function onDisconnect() {
      if (liveRef.current.currentRoom) setMenuError('Соединение потеряно, пробуем восстановить связь…')
    }

    function onRoomUpdate(room) {
      applyRoomUpdate(Object.assign({ playerId: liveRef.current.myPlayerId }, room))
    }

    function onReadyUpdate({ readyCount, total }) {
      setReadyHint(prev => (prev !== null ? `Готовы: ${readyCount} из ${total}` : prev))
    }

    function appendMessage(msg) {
      const contactId = msg.from === liveRef.current.myPlayerId ? msg.to : msg.from
      setMessagesByContact(prev => {
        const list = prev[contactId] || []
        return { ...prev, [contactId]: [...list, msg] }
      })
      return contactId
    }

    function onMessageSent(msg) {
      appendMessage(msg)
    }

    function onMessageReceived(msg) {
      const contactId = appendMessage(msg)
      if (liveRef.current.activeContactId === contactId) return
      playPingSound()
      setUnreadByContact(prev => ({ ...prev, [contactId]: (prev[contactId] || 0) + 1 }))
      const sender = (liveRef.current.currentRoom?.players || []).find(p => p.id === contactId)
      pushToast({ contactId, name: sender ? sender.name : '???', avatar: sender ? sender.avatar : null, text: msg.text })
    }

    function onNightMessagingStarted(data) {
      renderMessagingScreen({ ...data, myMessages: [] })
    }

    function onNightPickingStarted(data) {
      renderPickingScreen(data)
    }

    function onPickProgress({ count, total }) {
      setPickProgress({ count, total })
    }

    function onGameFinished(data) {
      renderEndScreen(data)
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
    socket.on('disconnect', onDisconnect)
    socket.on('room_update', onRoomUpdate)
    socket.on('your_role', onYourRole)
    socket.on('ready_update', onReadyUpdate)
    socket.on('night_messaging_started', onNightMessagingStarted)
    socket.on('message_sent', onMessageSent)
    socket.on('message_received', onMessageReceived)
    socket.on('night_picking_started', onNightPickingStarted)
    socket.on('pick_progress', onPickProgress)
    socket.on('night_reveal_step', onNightRevealStep)
    socket.on('game_finished', onGameFinished)
    socket.on('next_game_selected', onNextGameSelected)
    socket.on('game_skipped', ({ players, partyStandings }) => renderSkippedScreen(players, partyStandings))
    socket.on('skip_vote_update', onSkipVoteUpdate)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room_update', onRoomUpdate)
      socket.off('your_role', onYourRole)
      socket.off('ready_update', onReadyUpdate)
      socket.off('night_messaging_started', onNightMessagingStarted)
      socket.off('message_sent', onMessageSent)
      socket.off('message_received', onMessageReceived)
      socket.off('night_picking_started', onNightPickingStarted)
      socket.off('pick_progress', onPickProgress)
      socket.off('night_reveal_step', onNightRevealStep)
      socket.off('game_finished', onGameFinished)
      socket.off('next_game_selected', onNextGameSelected)
      socket.off('skip_vote_update', onSkipVoteUpdate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          if (res.ok) return applyRoomUpdate(res)
          attemptsLeft -= 1
          if (attemptsLeft > 0) setTimeout(tryJoin, 500)
          else setMenuError(res.error || 'Не удалось присоединиться к следующей игре — попробуйте войти по коду вручную')
        })
      }
      tryJoin()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function createRoom() {
    unlockAudio()
    setMenuError('')
    socket.emit('create_room', { name: playerName, avatar: selectedAvatar, partyCode: partyParams ? partyParams.code : undefined }, (res) => {
      if (!res.ok) return setMenuError('Не удалось создать комнату')
      applyRoomUpdate(res)
    })
  }

  function joinRoom() {
    unlockAudio()
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
    setRoleData(null)
    setMessagingData(null)
    setPickingData(null)
    setRevealData(null)
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

  function forceStartNight() {
    socket.emit('force_start_night')
  }

  function sendMessage(to, text) {
    if (!text || !text.trim()) return
    socket.emit('send_message', { to, text: text.trim() })
  }

  function forceStartPicking() {
    socket.emit('force_start_picking')
  }

  function submitPick(pickedId) {
    if (pickSubmitted) return
    setMyPick(pickedId ?? null)
    setPickSubmitted(true)
    socket.emit('submit_pick', { pickedId: pickedId || undefined })
  }

  function forceFinishPicking() {
    socket.emit('force_finish_picking')
  }

  function nextRevealStep() {
    socket.emit('next_reveal_step')
  }

  function nextNight() {
    socket.emit('next_night')
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

  const totalSentThisNight = Object.values(messagesByContact).reduce(
    (sum, list) => sum + list.filter(m => m.from === myPlayerId).length, 0
  )

  return {
    screen,
    menuSubtitle: inviteCode ? INVITE_MENU_SUBTITLE : DEFAULT_MENU_SUBTITLE,
    inviteCode,
    playerName, setPlayerName,
    selectedAvatar, setSelectedAvatar,
    joinCode, setJoinCode,
    menuError, createRoom, joinRoom, switchToCreateMode,

    currentRoom, isHost, myPlayerId,
    startGame, leaveRoom, copyInviteLink, copyLinkLabel,

    roleData, readyHint, markReady, forceStartNight,

    messagingData, messagesByContact, activeContactId, setActiveContactId, sendMessage, totalSentThisNight, forceStartPicking,
    unreadByContact, toasts,

    pickingData, myPick, submitPick, pickSubmitted, pickProgress, forceFinishPicking,

    revealData, nextRevealStep, nextNight,

    endData, playAgain,
    skippedData,

    skipVote, myVoted: skipVote.voterIds.includes(myPlayerId),
    voteSkip, selectNextGame,
  }
}
