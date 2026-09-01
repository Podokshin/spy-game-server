import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

export const AVATARS = ['bandit', 'viking', 'astronaut', 'scout', 'merc', 'miner', 'alien', 'hero', 'assassin', 'warrior', 'nomad', 'sleepy']
const SESSION_KEY = 'spy_online_session_v1'

export const CHARACTER_CATEGORY_META = [
  { key: 'mix', label: 'Микс', icon: '🎲' },
  { key: 'dota', label: 'Dota 2', icon: '⚔️' },
  { key: 'marvel', label: 'Marvel', icon: '🦸' },
  { key: 'anime', label: 'Аниме', icon: '🍥' },
  { key: 'games', label: 'Видеоигры', icon: '🎮' },
  { key: 'cartoons', label: 'Мультфильмы', icon: '🎬' },
  { key: 'sport', label: 'Спорт', icon: '⚽' },
]
export const PLACE_CATEGORY_META = [
  { key: 'mix', label: 'Микс', icon: '🎲' },
  { key: 'dota', label: 'Dota 2', icon: '⚔️' },
  { key: 'minecraft', label: 'Minecraft', icon: '🧱' },
  { key: 'valorant', label: 'Valorant / CS', icon: '🔫' },
]
export function subcategoryMetaFor(category) {
  return category === 'characters' ? CHARACTER_CATEGORY_META : PLACE_CATEGORY_META
}

const DISCUSS_HINTS = {
  places: 'Игроки по очереди рассказывают, что они «видят» на локации. Найдите шпиона.',
  characters: 'Игроки по очереди называют факт о персонаже. Найдите шпиона.',
}

// Корневой namespace (как и в vanilla-версии — registerSpyGame регистрируется на io(), а не на io.of('/x')).
const socket = io()

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

const DEFAULT_MENU_SUBTITLE = 'Создайте комнату или присоединитесь по коду — играйте с друзьями, у каждого свой телефон.'
const INVITE_MENU_SUBTITLE = 'Вас пригласили сыграть! Впишите имя, выберите аватар и присоединяйтесь.'

let audioCtx = null
function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    audioCtx = Ctx ? new Ctx() : null
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}
function beep(freq, startTime, duration, peakGain) {
  const ctx = getAudioCtx()
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  osc.connect(gain)
  gain.connect(ctx.destination)
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.02)
  gain.gain.linearRampToValueAtTime(0, startTime + duration)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.02)
}
function playTimeUpSound() {
  const ctx = getAudioCtx()
  if (!ctx) return
  const now = ctx.currentTime
  beep(660, now, 0.16, 0.28)
  beep(660, now + 0.22, 0.16, 0.28)
  beep(880, now + 0.44, 0.35, 0.3)
}

export function useSpyGame() {
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

  const [discussionData, setDiscussionData] = useState(null)

  const [votingPlayers, setVotingPlayers] = useState(null)

  const [tally, setTally] = useState(null)
  const [revealStage, setRevealStage] = useState(0)
  const [spiesData, setSpiesData] = useState(null) // {spies, category}
  const [topicData, setTopicData] = useState(null) // {topicLabel, topicName, partyStandings}

  const [skippedData, setSkippedData] = useState(null)
  const [skipVote, setSkipVote] = useState({ votes: 0, needed: 0, voterIds: [] })

  const hasConnectedBefore = useRef(false)
  const liveRef = useRef({})
  liveRef.current = { currentRoom, myPlayerId, isHost, playerName, selectedAvatar }

  function applyRoomUpdate(room) {
    const resolvedPlayerId = room.playerId || liveRef.current.myPlayerId
    const hostNow = room.players.some(p => p.id === resolvedPlayerId && p.isHost)
    setCurrentRoom(room)
    if (room.playerId) setMyPlayerId(room.playerId)
    setIsHost(hostNow)
    if (room.phase === 'lobby') setScreen('lobby')
  }

  function renderRoleCard(data) {
    setRoleData(data)
    setReadyHint(null)
    setScreen('role')
  }

  function renderDiscussionScreen(data) {
    setDiscussionData({
      category: data.category,
      turnOrder: data.turnOrder || [],
      endsAt: data.endsAt,
      totalMs: data.totalMs,
      enabled: data.timerEnabled,
      remainingMs: data.remainingMs != null ? data.remainingMs : data.totalMs,
      paused: !!data.paused,
    })
    setScreen('discussion')
  }

  function renderVotingScreen(players) {
    setVotingPlayers(players)
    setScreen('voting')
  }

  function resetEndScreen() {
    setRevealStage(0)
    setSpiesData(null)
    setTopicData(null)
  }

  function renderTally(t) {
    setTally(t)
  }

  function renderSpies(spies, category, decoyTopicName) {
    setSpiesData({ spies, category, decoyTopicName: decoyTopicName || null })
    setRevealStage(1)
  }

  function renderTopic(topicLabel, topicName, partyStandings) {
    setTopicData({ topicLabel, topicName, partyStandings })
    setRevealStage(2)
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
        applyRoomUpdate(res)

        if (res.phase === 'roles') {
          if (res.yourRole) renderRoleCard(res.yourRole)
        } else if (res.phase === 'discussion') {
          if (res.discussion) renderDiscussionScreen(res.discussion)
        } else if (res.phase === 'voting') {
          if (res.voting) renderVotingScreen(res.voting.players)
        } else if (res.phase === 'end') {
          resetEndScreen()
          if (res.tally) renderTally(res.tally)
          if (res.revealStage >= 1 && res.spies) renderSpies(res.spies, res.yourRole ? res.yourRole.category : undefined, res.decoyTopicName)
          if (res.revealStage >= 2 && res.topicName) renderTopic(res.topicLabel, res.topicName, res.partyStandings)
          setScreen('end')
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

    function onDisconnect() {
      if (liveRef.current.currentRoom) setMenuError('Соединение потеряно, пробуем восстановить связь…')
    }

    function onRoomUpdate(room) {
      applyRoomUpdate(Object.assign({ playerId: liveRef.current.myPlayerId }, room))
    }

    function onReadyUpdate({ readyCount, total }) {
      setReadyHint(prev => (prev !== null ? `Готовы: ${readyCount} из ${total}` : prev))
    }

    function onTimerPaused({ remainingMs }) {
      setDiscussionData(prev => (prev ? { ...prev, paused: true, remainingMs } : prev))
    }
    function onTimerResumed({ endsAt }) {
      setDiscussionData(prev => (prev ? { ...prev, paused: false, endsAt } : prev))
    }

    function onVotingStarted(data) {
      if (data.timeUp) playTimeUpSound()
      renderVotingScreen(data.players)
    }

    function onVotingResult({ tally }) {
      renderTally(tally)
      resetEndScreen()
      setScreen('end')
      if (window.fireConfetti) window.fireConfetti()
    }

    function onSpyRevealed({ spies, category, decoyTopicName }) {
      renderSpies(spies, category, decoyTopicName)
    }

    function onTopicRevealed({ topicLabel, topicName, partyStandings }) {
      renderTopic(topicLabel, topicName, partyStandings)
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
    socket.on('your_role', renderRoleCard)
    socket.on('ready_update', onReadyUpdate)
    socket.on('discussion_started', renderDiscussionScreen)
    socket.on('timer_paused', onTimerPaused)
    socket.on('timer_resumed', onTimerResumed)
    socket.on('voting_started', onVotingStarted)
    socket.on('voting_result', onVotingResult)
    socket.on('spy_revealed', onSpyRevealed)
    socket.on('topic_revealed', onTopicRevealed)
    socket.on('next_game_selected', onNextGameSelected)
    socket.on('game_skipped', ({ players, partyStandings }) => renderSkippedScreen(players, partyStandings))
    socket.on('skip_vote_update', onSkipVoteUpdate)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room_update', onRoomUpdate)
      socket.off('your_role', renderRoleCard)
      socket.off('ready_update', onReadyUpdate)
      socket.off('discussion_started', renderDiscussionScreen)
      socket.off('timer_paused', onTimerPaused)
      socket.off('timer_resumed', onTimerResumed)
      socket.off('voting_started', onVotingStarted)
      socket.off('voting_result', onVotingResult)
      socket.off('spy_revealed', onSpyRevealed)
      socket.off('topic_revealed', onTopicRevealed)
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
    getAudioCtx()
    setMenuError('')
    socket.emit('create_room', { name: playerName, avatar: selectedAvatar, partyCode: partyParams ? partyParams.code : undefined }, (res) => {
      if (!res.ok) return setMenuError('Не удалось создать комнату')
      applyRoomUpdate(res)
    })
  }

  function joinRoom() {
    getAudioCtx()
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
    setDiscussionData(null)
    setVotingPlayers(null)
    setTally(null)
    resetEndScreen()
    clearSession()
    setInviteCode(null)
    setScreen('menu')
  }

  function pushSettings(settings) {
    socket.emit('update_settings', settings)
  }

  function startGame() {
    socket.emit('start_game')
  }

  function markReady() {
    socket.emit('player_ready')
    setReadyHint('Ждём остальных игроков…')
  }

  function forceStartDiscussion() {
    socket.emit('force_start_discussion')
  }

  function togglePause() {
    socket.emit('toggle_pause')
  }

  function endDiscussion() {
    socket.emit('end_discussion')
  }

  function castVote(targetId) {
    socket.emit('cast_vote', { targetId })
  }

  function forceFinishVoting() {
    socket.emit('force_finish_voting')
  }

  function revealSpy() {
    socket.emit('reveal_spy')
  }

  function revealTopic() {
    socket.emit('reveal_topic')
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
    menuSubtitle: inviteCode ? INVITE_MENU_SUBTITLE : DEFAULT_MENU_SUBTITLE,
    inviteCode,
    playerName, setPlayerName,
    selectedAvatar, setSelectedAvatar,
    joinCode, setJoinCode,
    menuError, createRoom, joinRoom, switchToCreateMode,

    currentRoom, isHost, myPlayerId,
    startGame, leaveRoom, copyInviteLink, copyLinkLabel, pushSettings,

    roleData, readyHint, markReady, forceStartDiscussion,
    discussHints: DISCUSS_HINTS,

    discussionData, togglePause, endDiscussion,

    votingPlayers, castVote, forceFinishVoting,

    tally, revealStage, spiesData, topicData, revealSpy, revealTopic, playAgain,
    skippedData,

    skipVote, myVoted: skipVote.voterIds.includes(myPlayerId),
    voteSkip, selectNextGame,
  }
}
