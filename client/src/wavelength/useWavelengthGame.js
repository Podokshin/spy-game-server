import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

export const AVATARS = ['bandit', 'viking', 'astronaut', 'scout', 'merc', 'miner', 'alien', 'hero', 'assassin', 'warrior', 'nomad', 'sleepy']
const SESSION_KEY = 'wavelength_online_session_v1'
export const GUESS_TIME_MS = 45 * 1000

const socket = io('/wavelength')

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

const DEFAULT_MENU_SUBTITLE = 'Две команды по очереди дают подсказку к секретной точке на шкале — угадайте её точнее соперников.'
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

export function useWavelengthGame() {
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

  const [clueData, setClueData] = useState(null) // {mode:'giver'|'other', ...}
  const [guessData, setGuessData] = useState(null)
  const [guessProgress, setGuessProgress] = useState({ count: 0, total: 0 })
  const [revealData, setRevealData] = useState(null)
  const [endData, setEndData] = useState(null)
  const [skippedData, setSkippedData] = useState(null)
  const [skipVote, setSkipVote] = useState({ votes: 0, needed: 0, voterIds: [] })

  const hasConnectedBefore = useRef(false)
  const roundInfoRef = useRef(null)
  const liveRef = useRef({})
  const me = currentRoom ? currentRoom.players.find(p => p.id === myPlayerId) : null
  const myTeam = me ? me.team : null
  liveRef.current = { currentRoom, myPlayerId, isHost, playerName, selectedAvatar, myTeam }

  function applyRoomUpdate(room) {
    const resolvedPlayerId = room.playerId || liveRef.current.myPlayerId
    setCurrentRoom(room)
    if (room.playerId) setMyPlayerId(room.playerId)
    const meNow = room.players.find(p => p.id === resolvedPlayerId)
    setIsHost(!!(meNow && meNow.isHost))
    if (room.phase === 'lobby') {
      setClueData(null)
      setGuessData(null)
      setScreen('lobby')
    }
  }

  function renderClueGiver(data) {
    const meNow = liveRef.current.currentRoom?.players.find(p => p.id === liveRef.current.myPlayerId)
    roundInfoRef.current = {
      team: liveRef.current.myTeam,
      giverId: liveRef.current.myPlayerId,
      giverName: meNow ? meNow.name : '',
      giverAvatar: meNow ? meNow.avatar : null,
      spectrum: data.spectrum,
      round: data.round,
      totalRounds: data.totalRounds,
    }
    setGuessData(null)
    setClueData({ mode: 'giver', spectrum: data.spectrum, target: data.target, round: data.round, totalRounds: data.totalRounds })
    setScreen('clue')
  }

  function renderClueOther(data) {
    roundInfoRef.current = {
      team: data.team, giverId: data.giverId, giverName: data.giverName, giverAvatar: data.giverAvatar,
      spectrum: data.spectrum, round: data.round, totalRounds: data.totalRounds,
    }
    setGuessData(null)
    setClueData({ mode: 'other', team: data.team, giverId: data.giverId, giverName: data.giverName, giverAvatar: data.giverAvatar, spectrum: data.spectrum, round: data.round, totalRounds: data.totalRounds })
    setScreen('clue')
  }

  function renderGuessScreen(data) {
    const amGuesser = data.isGuesser !== undefined
      ? data.isGuesser
      : (liveRef.current.myTeam === data.team && liveRef.current.myPlayerId !== data.giverId)
    setGuessProgress(data.progress || { count: 0, total: 0 })
    setGuessData({
      team: data.team, giverId: data.giverId, giverName: data.giverName, giverAvatar: data.giverAvatar,
      spectrum: data.spectrum, text: data.text || data.clueText || '—',
      round: data.round, totalRounds: data.totalRounds,
      amGuesser, myGuess: data.myGuess != null ? data.myGuess : null,
      endsAt: data.endsAt || (Date.now() + GUESS_TIME_MS),
    })
    setScreen('guess')
  }

  function showRoundResult(data) {
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

  useEffect(() => {
    function attemptRejoin() {
      const saved = loadSession()
      if (!saved) return
      socket.emit('rejoin', saved, (res) => {
        if (!res || !res.ok) { clearSession(); return }
        applyRoomUpdate(res)

        if (res.phase === 'clue') {
          if (res.yourClueTurn) renderClueGiver(res.yourClueTurn)
          else if (res.roundStarted) renderClueOther(res.roundStarted)
        } else if (res.phase === 'guess') {
          if (res.guessState) {
            roundInfoRef.current = {
              team: res.guessState.team, giverId: res.guessState.giverId, giverName: res.guessState.giverName,
              giverAvatar: res.guessState.giverAvatar, spectrum: res.guessState.spectrum,
              round: res.guessState.round, totalRounds: res.guessState.totalRounds,
            }
            renderGuessScreen(Object.assign({}, res.guessState, { text: res.guessState.clueText, endsAt: res.guessState.endsAt || (Date.now() + GUESS_TIME_MS) }))
          }
        } else if (res.phase === 'reveal') {
          if (res.roundResult) showRoundResult(res.roundResult)
        } else if (res.phase === 'end') {
          if (res.gameFinished) renderEndScreen(res.gameFinished)
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

    function onClueSubmitted(data) {
      const info = roundInfoRef.current
      if (!info) return
      renderGuessScreen({
        team: info.team, giverId: info.giverId, giverName: info.giverName, giverAvatar: info.giverAvatar,
        spectrum: data.spectrum || info.spectrum, text: data.text,
        round: info.round, totalRounds: info.totalRounds,
        isGuesser: liveRef.current.myTeam === info.team && liveRef.current.myPlayerId !== info.giverId,
        myGuess: null, endsAt: data.endsAt,
      })
    }

    function onGuessProgress({ count, total }) {
      setGuessProgress({ count, total })
    }

    function onRoundResult(data) {
      if (data.timeUp) playTimeUpSound()
      showRoundResult(data)
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
    socket.on('your_clue_turn', renderClueGiver)
    socket.on('round_started', renderClueOther)
    socket.on('clue_submitted', onClueSubmitted)
    socket.on('guess_progress', onGuessProgress)
    socket.on('round_result', onRoundResult)
    socket.on('game_finished', onGameFinished)
    socket.on('next_game_selected', onNextGameSelected)
    socket.on('game_skipped', ({ players, partyStandings }) => renderSkippedScreen(players, partyStandings))
    socket.on('skip_vote_update', onSkipVoteUpdate)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room_update', onRoomUpdate)
      socket.off('your_clue_turn', renderClueGiver)
      socket.off('round_started', renderClueOther)
      socket.off('clue_submitted', onClueSubmitted)
      socket.off('guess_progress', onGuessProgress)
      socket.off('round_result', onRoundResult)
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
    setClueData(null)
    setGuessData(null)
    clearSession()
    setInviteCode(null)
    setScreen('menu')
  }

  function setTeam(team) {
    socket.emit('set_team', { team })
  }

  function updateSettings(totalRounds) {
    socket.emit('update_settings', { totalRounds })
  }

  function startGame() {
    socket.emit('start_game')
  }

  function submitClue(text) {
    socket.emit('submit_clue', { text })
  }

  function submitGuess(position) {
    socket.emit('submit_guess', { position })
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

    currentRoom, isHost, myPlayerId, myTeam,
    startGame, leaveRoom, copyInviteLink, copyLinkLabel, setTeam, updateSettings,

    clueData, submitClue,
    guessData, guessProgress, submitGuess, forceFinalizeRound,

    revealData, nextRound,
    endData, playAgain,
    skippedData,

    skipVote, myVoted: skipVote.voterIds.includes(myPlayerId),
    voteSkip, selectNextGame,
  }
}
