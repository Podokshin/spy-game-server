import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { playRoundStartSound, playResultSound, unlockAudio } from '../lib/sound'

export const AVATARS = ['bandit', 'viking', 'astronaut', 'scout', 'merc', 'miner', 'alien', 'hero', 'assassin', 'warrior', 'nomad', 'sleepy']
const SESSION_KEY = 'crocodile_online_session_v1'

const socket = io('/crocodile')

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

const DEFAULT_MENU_SUBTITLE = 'Один рисует слово на общем холсте, остальные угадывают текстом наперегонки. Создайте комнату или присоединитесь по коду.'
const INVITE_MENU_SUBTITLE = 'Вас пригласили сыграть! Впишите имя, выберите аватар и присоединяйтесь.'

export function useCrocodileGame() {
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

  const [choosingData, setChoosingData] = useState(null)
  const [drawingRoundData, setDrawingRoundData] = useState(null)
  const [artistWord, setArtistWord] = useState(null)
  const [revealData, setRevealData] = useState(null)
  const [endData, setEndData] = useState(null)
  const [skippedData, setSkippedData] = useState(null)
  const [skipVote, setSkipVote] = useState({ votes: 0, needed: 0, voterIds: [] })

  const hasConnectedBefore = useRef(false)
  const liveRef = useRef({})
  liveRef.current = { currentRoom, myPlayerId, isHost, playerName, selectedAvatar }

  function applyRoomUpdate(room) {
    const resolvedPlayerId = room.playerId || liveRef.current.myPlayerId
    setCurrentRoom(room)
    if (room.playerId) setMyPlayerId(room.playerId)
    const meNow = room.players.find(p => p.id === resolvedPlayerId)
    setIsHost(!!(meNow && meNow.isHost))
    if (room.phase === 'lobby') setScreen('lobby')
    else if (room.phase === 'end') setEndData(prev => (prev ? { ...prev, players: room.players } : prev))
    return resolvedPlayerId
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
        if (!res || !res.ok) {
          clearSession()
          setMenuError(res && res.error ? res.error : 'Сессия истекла, зайдите заново')
          return
        }
        const myId = applyRoomUpdate(res)

        if (res.phase === 'choosing' && res.round) {
          setDrawingRoundData(null)
          setArtistWord(null)
          setChoosingData(prev => ({
            round: prev?.round,
            totalRounds: prev?.totalRounds,
            artistId: res.round.artistId,
            artistName: (res.players.find(p => p.id === res.round.artistId) || {}).name,
            isArtist: res.round.isArtist,
            choices: res.round.isArtist ? (res.round.choices || []) : [],
          }))
          setScreen('choosing')
        } else if (res.phase === 'drawing' && res.round) {
          const wasAlreadyCorrect = res.round.correctGuessers.some(g => g.playerId === myId)
          setChoosingData(null)
          setArtistWord(res.round.isArtist ? (res.round.word || null) : null)
          setDrawingRoundData({
            artistId: res.round.artistId,
            artistName: (res.players.find(p => p.id === res.round.artistId) || {}).name,
            isArtist: res.round.isArtist,
            wordLength: res.round.wordLength,
            endsAt: res.round.endsAt,
            totalMs: res.round.totalMs,
            initialStrokes: res.round.strokes || [],
            initialCorrectGuessers: res.round.correctGuessers || [],
            initiallyGuessed: wasAlreadyCorrect,
          })
          setScreen('drawing')
        } else if (res.phase === 'reveal' && res.reveal) {
          setDrawingRoundData(null)
          setRevealData({ word: res.reveal.word, timeUp: null, correctGuessers: res.reveal.correctGuessers, players: res.players })
          setScreen('reveal')
        } else if (res.phase === 'end' && res.ended) {
          renderEndScreen({ players: res.ended.players, partyStandings: res.ended.partyStandings })
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

    function onRoundChoosing(data) {
      setDrawingRoundData(null)
      setArtistWord(null)
      setRevealData(null)
      const isArtist = data.artistId === liveRef.current.myPlayerId
      setChoosingData({ round: data.round, totalRounds: data.totalRounds, artistId: data.artistId, artistName: data.artistName, isArtist, choices: [] })
      setScreen('choosing')
    }

    function onYourWordChoices(data) {
      setChoosingData(prev => (prev ? { ...prev, choices: data.choices } : prev))
    }

    function onRoundStarted(data) {
      playRoundStartSound()
      const isArtist = data.artistId === liveRef.current.myPlayerId
      setArtistWord(null)
      setChoosingData(null)
      setDrawingRoundData({
        artistId: data.artistId,
        artistName: data.artistName,
        isArtist,
        wordLength: data.wordLength,
        endsAt: data.endsAt,
        totalMs: data.totalMs,
        initialStrokes: [],
        initialCorrectGuessers: [],
        initiallyGuessed: false,
      })
      setScreen('drawing')
    }

    function onYourWord(data) {
      setArtistWord(data.word)
    }

    function onRoundEnded(data) {
      playResultSound()
      setDrawingRoundData(null)
      setRevealData({ word: data.word, timeUp: data.timeUp, correctGuessers: data.correctGuessers, players: data.players })
      setCurrentRoom(r => (r ? { ...r, players: data.players } : r))
      setScreen('reveal')
    }

    function onGameFinished(data) {
      renderEndScreen({ players: data.players, partyStandings: data.partyStandings })
      if (window.fireConfetti) window.fireConfetti()
    }

    function onNextGameSelected({ gameKey }) {
      const { currentRoom, playerName, selectedAvatar, isHost } = liveRef.current
      if (window.PartyHub && currentRoom) window.PartyHub.goToGame(gameKey, currentRoom.code, playerName, selectedAvatar, isHost)
    }

    function onSkipVoteUpdate({ votes, needed, voterIds }) {
      setSkipVote({ votes, needed, voterIds: voterIds || [] })
    }

    function onGameSkipped({ players, partyStandings }) {
      renderSkippedScreen(players, partyStandings)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('room_update', onRoomUpdate)
    socket.on('round_choosing', onRoundChoosing)
    socket.on('your_word_choices', onYourWordChoices)
    socket.on('round_started', onRoundStarted)
    socket.on('your_word', onYourWord)
    socket.on('round_ended', onRoundEnded)
    socket.on('game_finished', onGameFinished)
    socket.on('next_game_selected', onNextGameSelected)
    socket.on('game_skipped', onGameSkipped)
    socket.on('skip_vote_update', onSkipVoteUpdate)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room_update', onRoomUpdate)
      socket.off('round_choosing', onRoundChoosing)
      socket.off('your_word_choices', onYourWordChoices)
      socket.off('round_started', onRoundStarted)
      socket.off('your_word', onYourWord)
      socket.off('round_ended', onRoundEnded)
      socket.off('game_finished', onGameFinished)
      socket.off('next_game_selected', onNextGameSelected)
      socket.off('game_skipped', onGameSkipped)
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
        saveSession(res.code, res.playerId)
      })
    } else {
      let attemptsLeft = 10
      const tryJoin = () => {
        socket.emit('join_room', { code: partyParams.code, name: partyParams.name, avatar: partyParams.avatar }, (res) => {
          if (res.ok) {
            applyRoomUpdate(res)
            saveSession(res.code, res.playerId)
            return
          }
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
      saveSession(res.code, res.playerId)
    })
  }

  function joinRoom() {
    unlockAudio()
    setMenuError('')
    socket.emit('join_room', { code: joinCode, name: playerName, avatar: selectedAvatar }, (res) => {
      if (!res.ok) return setMenuError(res.error || 'Не удалось присоединиться')
      applyRoomUpdate(res)
      saveSession(res.code, res.playerId)
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
    setChoosingData(null)
    setDrawingRoundData(null)
    setArtistWord(null)
    setRevealData(null)
    setEndData(null)
    setSkippedData(null)
    clearSession()
    setInviteCode(null)
    setScreen('menu')
  }

  function startGame() {
    socket.emit('start_game')
  }

  function updateSettings(patch) {
    if (!isHost || !currentRoom) return
    socket.emit('update_settings', {
      totalRounds: currentRoom.settings.totalRounds,
      roundSeconds: currentRoom.settings.roundSeconds,
      ...patch,
    })
  }

  function chooseWord(word) {
    socket.emit('choose_word', { word })
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
    socket,
    screen,
    menuSubtitle: inviteCode ? INVITE_MENU_SUBTITLE : DEFAULT_MENU_SUBTITLE,
    inviteCode,
    playerName, setPlayerName,
    selectedAvatar, setSelectedAvatar,
    joinCode, setJoinCode,
    menuError, createRoom, joinRoom, switchToCreateMode,

    currentRoom, isHost, myPlayerId,
    startGame, updateSettings, leaveRoom, copyInviteLink, copyLinkLabel,

    choosingData, chooseWord,
    drawingRoundData, artistWord,
    revealData, nextRound,
    endData, playAgain,
    skippedData,

    skipVote, myVoted: skipVote.voterIds.includes(myPlayerId),
    voteSkip, selectNextGame,
  }
}
