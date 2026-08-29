import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

export const AVATARS = ['bandit', 'viking', 'astronaut', 'scout', 'merc', 'miner', 'alien', 'hero', 'assassin', 'warrior', 'nomad', 'sleepy']
const SESSION_KEY = 'categories_online_session_v1'

const socket = io('/categories')

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

const DEFAULT_MENU_SUBTITLE = 'Всем даётся буква и 5 категорий — успей придумать слово, пока не кончилось время. Уникальные ответы приносят больше очков!'
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

export function useCategoriesGame() {
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

  const [writingData, setWritingData] = useState(null)
  const [answers, setAnswers] = useState([])
  const [submitted, setSubmitted] = useState(false)
  const [submitProgress, setSubmitProgress] = useState(null) // {submittedCount, total}

  const [resultsData, setResultsData] = useState(null)
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

  function renderWriting(data) {
    setWritingData(data)
    const already = !!data.submitted
    setSubmitted(already)
    setAnswers(already && Array.isArray(data.yourAnswers) ? data.yourAnswers : data.categories.map(() => ''))
    setSubmitProgress(already ? { submittedCount: data.submittedCount ?? 0, total: data.total ?? liveRef.current.currentRoom?.players.length ?? 0 } : null)
    setScreen('writing')
  }

  function renderResults(data) {
    if (data.timeUp) playTimeUpSound()
    setResultsData(data)
    setScreen('results')
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

        if (res.phase === 'writing' && res.writing) renderWriting(res.writing)
        else if (res.phase === 'results' && res.results) renderResults(res.results)
        else if (res.phase === 'end' && res.ended) renderEndScreen(res.ended.players, res.ended.partyStandings)
        else if (res.phase === 'skipped' && res.skipped) renderSkippedScreen(res.skipped.players, res.skipped.partyStandings)

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

    function onSubmitProgress({ submittedCount, total }) {
      setSubmitProgress(prev => (prev !== null ? { submittedCount, total } : prev))
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
    socket.on('round_started', renderWriting)
    socket.on('submit_progress', onSubmitProgress)
    socket.on('round_result', renderResults)
    socket.on('game_finished', onGameFinished)
    socket.on('next_game_selected', onNextGameSelected)
    socket.on('game_skipped', ({ players, partyStandings }) => renderSkippedScreen(players, partyStandings))
    socket.on('skip_vote_update', onSkipVoteUpdate)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room_update', onRoomUpdate)
      socket.off('round_started', renderWriting)
      socket.off('submit_progress', onSubmitProgress)
      socket.off('round_result', renderResults)
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
    setWritingData(null)
    setResultsData(null)
    clearSession()
    setInviteCode(null)
    setScreen('menu')
  }

  function pushSettings(totalRounds, roundSeconds) {
    socket.emit('update_settings', { totalRounds, roundSeconds })
  }

  function startGame() {
    getAudioCtx()
    socket.emit('start_game')
  }

  function submitAnswers() {
    socket.emit('submit_answers', { answers })
    setSubmitted(true)
    setSubmitProgress({ submittedCount: 0, total: currentRoom?.players.length || 0 })
  }

  function forceFinalizeRound() {
    socket.emit('force_finalize_round')
  }

  function nextRound() {
    socket.emit('next_round')
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

    writingData, answers, setAnswers, submitted, submitProgress, submitAnswers, forceFinalizeRound,
    getAudioCtx,

    resultsData, nextRound,
    endData, playAgain,
    skippedData,

    skipVote, myVoted: skipVote.voterIds.includes(myPlayerId),
    voteSkip, selectNextGame,
  }
}
