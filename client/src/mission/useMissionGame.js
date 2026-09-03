import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { playTimeUpSound, playRoundStartSound, playResultSound, unlockAudio } from '../lib/sound'

export const AVATARS = ['bandit', 'viking', 'astronaut', 'scout', 'merc', 'miner', 'alien', 'hero', 'assassin', 'warrior', 'nomad', 'sleepy']
const SESSION_KEY = 'mission_online_session_v1'

const socket = io('/mission')

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

const DEFAULT_MENU_SUBTITLE = 'У каждого своя секретная задача на раунд — выполните её незаметно, а потом угадайте чужие.'
const INVITE_MENU_SUBTITLE = 'Вас пригласили сыграть! Впишите имя, выберите аватар и присоединяйтесь.'

export function useMissionGame() {
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

  const [missionData, setMissionData] = useState(null)
  const [readyHint, setReadyHint] = useState(null)

  const [discussionData, setDiscussionData] = useState(null)

  const [guessingData, setGuessingData] = useState(null)
  const [guessTarget, setGuessTarget] = useState(null)
  const [guessSubmitted, setGuessSubmitted] = useState(false)
  const [guessWaitText, setGuessWaitText] = useState('')
  const [guessResult, setGuessResult] = useState(null)

  const [endData, setEndData] = useState(null)
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
    history.replaceState(null, '', '?room=' + room.code)
    saveSession(room.code, resolvedPlayerId)
    if (room.phase === 'lobby') setScreen('lobby')
  }

  function renderMissionCard(data) {
    setMissionData(data)
    setReadyHint(null)
    setScreen('mission')
  }

  function renderDiscussionScreen(data) {
    setDiscussionData({
      endsAt: data.endsAt,
      totalMs: data.totalMs,
      enabled: data.timerEnabled,
      remainingMs: data.remainingMs != null ? data.remainingMs : data.totalMs,
      paused: !!data.paused,
    })
    setScreen('discussion')
  }

  function renderGuessingScreen(data) {
    setGuessTarget(null)
    setGuessSubmitted(false)
    setGuessWaitText('')
    setGuessResult(null)
    setGuessingData(data)
    setScreen('guessing')
  }

  function showGuessResult(data) {
    setGuessResult(data)
  }

  function onYourMission(data) {
    playRoundStartSound()
    renderMissionCard(data)
  }

  function onGuessResult(data) {
    playResultSound()
    showGuessResult(data)
  }

  function renderEndScreen(players, partyStandings) {
    setEndData({ players, partyStandings })
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
        applyRoomUpdate(res)

        if (res.phase === 'missions') {
          if (res.yourMission) renderMissionCard(res.yourMission)
        } else if (res.phase === 'discussion') {
          if (res.discussion) renderDiscussionScreen(res.discussion)
        } else if (res.phase === 'guessing') {
          if (res.guessing) {
            renderGuessingScreen(res.guessing)
            if (res.guessing.awaitingNext && res.lastResult) showGuessResult(res.lastResult)
          }
        } else if (res.phase === 'end') {
          renderEndScreen(res.players, res.partyStandings)
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

    function onGuessingStarted(data) {
      if (data.timeUp) playTimeUpSound()
      renderGuessingScreen(data)
    }

    function onGuessVoteUpdate({ votedCount, total }) {
      setGuessWaitText(prev => (prev ? `Ответили: ${votedCount} из ${total}` : prev))
    }

    function onTimerPaused({ remainingMs }) {
      setDiscussionData(prev => (prev ? { ...prev, paused: true, remainingMs } : prev))
    }

    function onTimerResumed({ endsAt }) {
      setDiscussionData(prev => (prev ? { ...prev, paused: false, endsAt } : prev))
    }

    function onGameFinished({ players, partyStandings }) {
      renderEndScreen(players, partyStandings)
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
    socket.on('your_mission', onYourMission)
    socket.on('ready_update', onReadyUpdate)
    socket.on('discussion_started', renderDiscussionScreen)
    socket.on('timer_paused', onTimerPaused)
    socket.on('timer_resumed', onTimerResumed)
    socket.on('guessing_started', onGuessingStarted)
    socket.on('guess_vote_update', onGuessVoteUpdate)
    socket.on('guess_result', onGuessResult)
    socket.on('game_finished', onGameFinished)
    socket.on('next_game_selected', onNextGameSelected)
    socket.on('game_skipped', ({ players, partyStandings }) => renderSkippedScreen(players, partyStandings))
    socket.on('skip_vote_update', onSkipVoteUpdate)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room_update', onRoomUpdate)
      socket.off('your_mission', onYourMission)
      socket.off('ready_update', onReadyUpdate)
      socket.off('discussion_started', renderDiscussionScreen)
      socket.off('timer_paused', onTimerPaused)
      socket.off('timer_resumed', onTimerResumed)
      socket.off('guessing_started', onGuessingStarted)
      socket.off('guess_vote_update', onGuessVoteUpdate)
      socket.off('guess_result', onGuessResult)
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
    setMissionData(null)
    setDiscussionData(null)
    setGuessingData(null)
    clearSession()
    setInviteCode(null)
    setScreen('menu')
  }

  function pushSettings(timerEnabled, timerMinutes) {
    socket.emit('update_settings', { timerEnabled, timerMinutes })
  }

  function startGame() {
    unlockAudio()
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

  function castGuess() {
    if (!guessTarget) return
    socket.emit('cast_guess', { guessedPlayerId: guessTarget })
    setGuessSubmitted(true)
    setGuessWaitText('Ответ принят. Ждём остальных…')
  }

  function forceFinishGuess() {
    socket.emit('force_finish_guess')
  }

  function nextGuess() {
    socket.emit('next_guess')
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

    missionData, readyHint, markReady, forceStartDiscussion,

    discussionData, togglePause, endDiscussion,

    guessingData, guessTarget, setGuessTarget, guessSubmitted, guessWaitText, guessResult,
    castGuess, forceFinishGuess, nextGuess,

    endData, playAgain,
    skippedData,

    skipVote, myVoted: skipVote.voterIds.includes(myPlayerId),
    voteSkip, selectNextGame,
  }
}
