// Игровая доска Нард — сознательно НЕ переписана на React-рендеринг.
// Drag-and-drop здесь построен на низкоуровневых Pointer Events с ручным
// hit-testing (см. комментарий у findDropTarget) — это уже один раз было
// отлажено под реальные браузеры/устройства, и повторная реализация того же
// через React-рендер рискует вернуть старые баги с перетаскиванием. Вместо
// этого доска — «остров» vanilla-кода, который React монтирует/размонтирует
// как обычный imperative-виджет (как ниже монтировали бы canvas или карту).
// Логика 1:1 повторяет public/nardy/client.js — при синхронизации правил см.
// комментарий там же про rules-client.js.

const COLOR_LABEL = { white: 'белых', black: 'чёрных' }

let audioCtx = null
function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    audioCtx = Ctx ? new Ctx() : null
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}
function tone(ctx, freq, startTime, duration, peakGain, type) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type || 'sine'
  osc.frequency.value = freq
  osc.connect(gain)
  gain.connect(ctx.destination)
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.02)
}
function playPickupSound() {
  const ctx = getAudioCtx()
  if (!ctx) return
  tone(ctx, 640, ctx.currentTime, 0.05, 0.14, 'triangle')
}
function playPlaceSound(bearOff) {
  const ctx = getAudioCtx()
  if (!ctx) return
  const now = ctx.currentTime
  if (bearOff) {
    tone(ctx, 520, now, 0.09, 0.2, 'triangle')
    tone(ctx, 780, now + 0.05, 0.16, 0.18, 'triangle')
  } else {
    tone(ctx, 150, now, 0.09, 0.3, 'sine')
    tone(ctx, 360, now, 0.05, 0.14, 'triangle')
  }
}
function playInvalidSound() {
  const ctx = getAudioCtx()
  if (!ctx) return
  const now = ctx.currentTime
  tone(ctx, 220, now, 0.09, 0.16, 'sawtooth')
  tone(ctx, 150, now + 0.06, 0.13, 0.14, 'sawtooth')
}
function playDiceSound() {
  const ctx = getAudioCtx()
  if (!ctx) return
  const now = ctx.currentTime
  for (let i = 0; i < 5; i++) {
    tone(ctx, 260 + Math.random() * 520, now + i * 0.04, 0.03, 0.12, 'square')
  }
}
function playDiceLandSound() {
  const ctx = getAudioCtx()
  if (!ctx) return
  const now = ctx.currentTime
  tone(ctx, 180, now, 0.08, 0.28, 'sine')
  tone(ctx, 90, now + 0.03, 0.14, 0.24, 'sine')
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const TOP_ROW = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const BOTTOM_ROW = [23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12]
const MAX_VISIBLE_CHECKERS = 15
const STACK_OVERLAP = 0.4
const FALLBACK_CHECKER_SIZE = 26

function pointHomeClass(point) {
  if (point >= 18 && point <= 23) return 'home-white'
  if (point >= 6 && point <= 11) return 'home-black'
  return ''
}

// container: DOM-элемент с уже отрендеренным React'ом скелетом #screen-board
//   (те же id, что и в public/nardy/index.html).
// opts: { socket, myPlayerId, getRoomPlayers, initialState, onGameFinished }
//   getRoomPlayers() -> актуальный players[] комнаты (для бейджей/счёта).
//   onGameFinished(data) — вызывается на game_finished/game_skipped, чтобы
//   React переключил экран на итоги/скип (сам island эти экраны не рисует).
export function mountNardyBoard(container, opts) {
  const { socket, myPlayerId } = opts
  let myColor = opts.myColor

  const el = {
    whitePlayerName: container.querySelector('#whitePlayerName'),
    whitePlayerScore: container.querySelector('#whitePlayerScore'),
    whitePlayerBadge: container.querySelector('#whitePlayerBadge'),
    blackPlayerName: container.querySelector('#blackPlayerName'),
    blackPlayerScore: container.querySelector('#blackPlayerScore'),
    blackPlayerBadge: container.querySelector('#blackPlayerBadge'),
    cubeValueDisplay: container.querySelector('#cubeValueDisplay'),
    turnDot: container.querySelector('#turnDot'),
    turnBannerText: container.querySelector('#turnBannerText'),
    boardFrame: container.querySelector('#boardFrame'),
    diceRow: container.querySelector('#diceRow'),
    diceFaces: container.querySelector('#diceFaces'),
    diceChips: container.querySelector('#diceChips'),
    diceThrowOverlay: container.querySelector('#diceThrowOverlay'),
    throwDie1: container.querySelector('#throwDie1'),
    throwDie2: container.querySelector('#throwDie2'),
    rollDiceBtn: container.querySelector('#rollDiceBtn'),
    offerDoubleBtn: container.querySelector('#offerDoubleBtn'),
    waitTurnHint: container.querySelector('#waitTurnHint'),
    doubleOfferBox: container.querySelector('#doubleOfferBox'),
    doubleOfferText: container.querySelector('#doubleOfferText'),
    acceptDoubleBtn: container.querySelector('#acceptDoubleBtn'),
    declineDoubleBtn: container.querySelector('#declineDoubleBtn'),
  }

  let board = null
  let turnColor = null
  let dice = null
  let movesLeft = []
  let hasRolled = false
  let cube = { value: 1, ownerColor: null }
  let doubleOffer = null
  let headMovesUsed = 0
  let headMovesMax = 1
  let selfAnimInFlight = false
  let pendingSelfState = null
  let diceAnimInFlight = false

  function canInteract() {
    return !!(board && myColor && turnColor === myColor && hasRolled && !doubleOffer)
  }

  function computeDestinations(fromPoint) {
    const map = new Map()
    if (!canInteract()) return map
    if (board[myColor][fromPoint] <= 0) return map
    const uniqueDice = Array.from(new Set(movesLeft))
    const headState = { used: headMovesUsed, max: headMovesMax }
    uniqueDice.forEach(die => {
      const move = window.NardyRules.describeMove(board, myColor, fromPoint, die, headState)
      if (!move.legal) return
      if (move.bearOff) {
        if (!map.has('off')) map.set('off', die)
      } else {
        const key = 'p' + move.to
        if (!map.has(key)) map.set(key, die)
      }
    })
    return map
  }

  function renderBoard() {
    el.boardFrame.innerHTML = ''
    if (!board) return
    el.boardFrame.appendChild(buildOffTray('white'))
    el.boardFrame.appendChild(buildBoardGrid())
    el.boardFrame.appendChild(buildOffTray('black'))
  }

  function buildBoardGrid() {
    const boardEl = document.createElement('div')
    boardEl.className = 'board'

    const bar = document.createElement('div')
    bar.className = 'bar'
    boardEl.appendChild(bar)

    const buildRow = (pointsInRow, rowName) => {
      pointsInRow.forEach((point, colIdx) => {
        const cell = document.createElement('div')
        const homeClass = pointHomeClass(point)
        cell.className = 'point tri-' + (colIdx % 2 === 0 ? 'a' : 'b') +
          (homeClass ? ' ' + homeClass : '') +
          (point === 0 || point === 12 ? ' start-point' : '')
        cell.dataset.point = String(point)
        cell.dataset.row = rowName

        const tri = document.createElement('div')
        tri.className = 'point-tri'
        cell.appendChild(tri)

        const stack = document.createElement('div')
        stack.className = 'point-stack'
        renderStackInto(stack, point, rowName)
        cell.appendChild(stack)

        const label = document.createElement('span')
        label.className = 'point-label'
        label.textContent = String(point + 1)
        cell.appendChild(label)

        boardEl.appendChild(cell)
      })
    }

    buildRow(TOP_ROW, 'top')
    buildRow(BOTTOM_ROW, 'bottom')
    return boardEl
  }

  function buildOffTray(color) {
    const tray = document.createElement('div')
    tray.className = 'off-tray'
    tray.dataset.color = color

    const label = document.createElement('div')
    label.className = 'off-tray-label'
    label.textContent = 'Выход'
    tray.appendChild(label)

    const stack = document.createElement('div')
    stack.className = 'off-tray-stack'
    const count = (board.borneOff && board.borneOff[color]) || 0
    const visible = Math.min(count, MAX_VISIBLE_CHECKERS)
    for (let i = 0; i < visible; i++) {
      const c = document.createElement('div')
      c.className = 'checker checker-' + color
      if (i === visible - 1 && count > 1) c.textContent = String(count)
      c.style.top = 'calc(var(--checker-size) * ' + (i * STACK_OVERLAP) + ')'
      stack.appendChild(c)
    }
    tray.appendChild(stack)

    const countEl = document.createElement('div')
    countEl.className = 'off-tray-count'
    countEl.textContent = String(count)
    tray.appendChild(countEl)

    return tray
  }

  function renderStackInto(stackEl, point, rowName) {
    const counts = { white: board.white[point], black: board.black[point] }
    const colorsPresent = Object.keys(counts).filter(c => counts[c] > 0)
    if (colorsPresent.length === 0) return
    const bothPresent = colorsPresent.length === 2
    const destinations = computeDestinations(point)

    colorsPresent.forEach(color => {
      const count = counts[color]
      const visible = Math.min(count, MAX_VISIBLE_CHECKERS)
      const interactive = color === myColor && destinations.size > 0
      const leftPct = bothPresent ? (color === 'white' ? 30 : 70) : 50

      for (let i = 0; i < visible; i++) {
        const c = document.createElement('div')
        c.className = 'checker checker-' + color
        c.style.left = leftPct + '%'
        if (i === visible - 1 && count > 1) c.textContent = String(count)
        const offsetPx = 'calc(var(--checker-size) * ' + (i * STACK_OVERLAP) + ')'
        if (rowName === 'top') c.style.top = offsetPx
        else c.style.bottom = offsetPx

        if (i === visible - 1 && interactive) {
          c.classList.add('draggable')
          attachDragHandlers(c, point, destinations)
        }
        stackEl.appendChild(c)
      }
    })
  }

  function attachDragHandlers(checkerEl, fromPoint, destinations) {
    checkerEl.addEventListener('pointerdown', (e) => startDrag(e, checkerEl, fromPoint, destinations))
  }

  function highlightDestinations(destinations, on) {
    destinations.forEach((die, key) => {
      if (key === 'off') {
        const tray = el.boardFrame.querySelector('.off-tray[data-color="' + myColor + '"]')
        if (tray) tray.classList.toggle('valid-target', on)
      } else {
        const point = key.slice(1)
        const cell = el.boardFrame.querySelector('.point[data-point="' + point + '"]')
        if (cell) cell.classList.toggle('selectable', on)
      }
    })
  }

  function findDropTarget(x, y) {
    const points = el.boardFrame.querySelectorAll('.point[data-point]')
    for (let i = 0; i < points.length; i++) {
      const r = points[i].getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return { type: 'point', point: parseInt(points[i].dataset.point, 10) }
      }
    }
    const trays = el.boardFrame.querySelectorAll('.off-tray[data-color]')
    for (let i = 0; i < trays.length; i++) {
      const r = trays[i].getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return { type: 'tray', color: trays[i].dataset.color }
      }
    }
    return null
  }

  function startDrag(e, checkerEl, fromPoint, destinations) {
    if (e.button != null && e.button !== 0) return
    if (!destinations || destinations.size === 0) return
    e.preventDefault()

    const rect = checkerEl.getBoundingClientRect()
    const originLeft = rect.left
    const originTop = rect.top

    checkerEl.style.position = 'fixed'
    checkerEl.style.left = rect.left + 'px'
    checkerEl.style.top = rect.top + 'px'
    checkerEl.style.width = rect.width + 'px'
    checkerEl.style.height = rect.height + 'px'
    checkerEl.style.margin = '0'
    checkerEl.classList.add('dragging')
    playPickupSound()

    highlightDestinations(destinations, true)

    const yOffset = e.pointerType === 'touch' ? 46 : 0

    function onMove(ev) {
      checkerEl.style.left = ev.clientX + 'px'
      checkerEl.style.top = (ev.clientY - yOffset) + 'px'
    }

    function onUp(ev) {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      highlightDestinations(destinations, false)

      const dropX = ev.clientX
      const dropY = ev.clientY - yOffset
      const target = findDropTarget(dropX, dropY)

      let matchedDie = null
      let targetRect = null
      let isBearOff = false

      if (target && target.type === 'point' && destinations.has('p' + target.point)) {
        matchedDie = destinations.get('p' + target.point)
        targetRect = getAnchorRect(target.point, null)
      } else if (target && target.type === 'tray' && target.color === myColor && destinations.has('off')) {
        matchedDie = destinations.get('off')
        targetRect = getAnchorRect(null, myColor)
        isBearOff = true
      }

      if (matchedDie != null) {
        const currentRect = checkerEl.getBoundingClientRect()
        checkerEl.remove()
        selfAnimInFlight = true
        playPlaceSound(isBearOff)
        flyGhost(myColor, currentRect, targetRect, finishSelfAnim)
        socket.emit('move_checker', { from: fromPoint, die: matchedDie })
      } else {
        playInvalidSound()
        checkerEl.classList.remove('dragging')
        checkerEl.classList.add('snap-back')
        requestAnimationFrame(() => {
          checkerEl.style.left = originLeft + 'px'
          checkerEl.style.top = originTop + 'px'
        })
        setTimeout(renderAll, prefersReducedMotion() ? 0 : 240)
      }
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  function getAnchorRect(point, trayColor) {
    if (trayColor) {
      const tray = el.boardFrame.querySelector('.off-tray[data-color="' + trayColor + '"]')
      if (!tray) return null
      const r = tray.getBoundingClientRect()
      const size = FALLBACK_CHECKER_SIZE
      return { left: r.left + r.width / 2 - size / 2, top: r.top + 12, width: size, height: size }
    }
    const cell = el.boardFrame.querySelector('.point[data-point="' + point + '"]')
    if (!cell) return null
    const r = cell.getBoundingClientRect()
    const existing = cell.querySelector('.checker')
    const size = existing ? existing.getBoundingClientRect().width : FALLBACK_CHECKER_SIZE
    return { left: r.left + r.width / 2 - size / 2, top: r.top + r.height / 2 - size / 2, width: size, height: size }
  }

  function flyGhost(color, fromRect, toRect, onDone) {
    if (!fromRect || !toRect || prefersReducedMotion()) { onDone(); return }
    const ghost = document.createElement('div')
    ghost.className = 'checker ghost checker-' + color
    const w = fromRect.width || FALLBACK_CHECKER_SIZE
    const h = fromRect.height || FALLBACK_CHECKER_SIZE
    document.body.appendChild(ghost)
    Object.assign(ghost.style, {
      position: 'fixed',
      left: fromRect.left + 'px',
      top: fromRect.top + 'px',
      width: w + 'px',
      height: h + 'px',
      margin: '0',
      transition: 'left .22s cubic-bezier(.25,.6,.3,1.05), top .22s cubic-bezier(.25,.6,.3,1.05)',
    })
    requestAnimationFrame(() => {
      ghost.style.left = (toRect.left + (toRect.width - w) / 2) + 'px'
      ghost.style.top = (toRect.top + (toRect.height - h) / 2) + 'px'
    })
    setTimeout(() => {
      ghost.remove()
      onDone()
    }, 230)
  }

  function finishSelfAnim() {
    selfAnimInFlight = false
    if (pendingSelfState) {
      applyBoardState(pendingSelfState)
      pendingSelfState = null
    }
    renderAll()
  }

  function applyBoardState(data) {
    board = data.board
    movesLeft = data.movesLeft || []
    if (data.headMovesUsed != null) headMovesUsed = data.headMovesUsed
    if (data.headMovesMax != null) headMovesMax = data.headMovesMax
  }

  function animateOpponentMove(data) {
    const fromRect = getAnchorRect(data.from, null)
    const toRect = data.bearOff ? getAnchorRect(null, data.color) : getAnchorRect(data.to, null)
    flyGhost(data.color, fromRect, toRect, () => {
      playPlaceSound(!!data.bearOff)
      applyBoardState(data)
      renderAll()
    })
  }

  function renderDice() {
    el.diceFaces.innerHTML = (dice || []).map(d => `<span class="die-face">${d}</span>`).join('')
    el.diceChips.innerHTML = ''
    if (movesLeft.length) {
      const label = document.createElement('span')
      label.className = 'dice-chips-label'
      label.textContent = 'Осталось ходов:'
      el.diceChips.appendChild(label)
      movesLeft.forEach(value => {
        const chip = document.createElement('span')
        chip.className = 'die-chip'
        chip.textContent = String(value)
        el.diceChips.appendChild(chip)
      })
    }

    const headPoint = myColor && window.NardyRules ? window.NardyRules.START[myColor] : null
    if (canInteract() && headPoint != null && board[myColor][headPoint] > 0 && headMovesUsed >= headMovesMax) {
      const hint = document.createElement('span')
      hint.className = 'dice-chips-label'
      hint.textContent = 'Голова закрыта до конца хода'
      el.diceChips.appendChild(hint)
    }
  }

  function updatePlayerBadges() {
    const players = opts.getRoomPlayers() || []
    const white = players.find(p => p.color === 'white')
    const black = players.find(p => p.color === 'black')
    el.whitePlayerName.textContent = white ? white.name : '—'
    el.whitePlayerScore.textContent = white ? white.score : 0
    el.blackPlayerName.textContent = black ? black.name : '—'
    el.blackPlayerScore.textContent = black ? black.score : 0
    el.whitePlayerBadge.classList.toggle('active-turn', turnColor === 'white')
    el.blackPlayerBadge.classList.toggle('active-turn', turnColor === 'black')
  }

  function renderTurnAndControls() {
    el.turnBannerText.textContent = turnColor ? `Ход ${COLOR_LABEL[turnColor] || ''}` : ''
    el.turnDot.classList.toggle('dot-black', turnColor === 'black')
    updatePlayerBadges()

    const myTurn = turnColor === myColor
    el.rollDiceBtn.disabled = false
    el.rollDiceBtn.classList.toggle('hidden', !myTurn || hasRolled || !!doubleOffer)
    el.waitTurnHint.classList.toggle('hidden', myTurn)

    const canOfferDouble = myTurn && !hasRolled && !doubleOffer && (!cube.ownerColor || cube.ownerColor === myColor)
    el.offerDoubleBtn.classList.toggle('hidden', !canOfferDouble)

    el.cubeValueDisplay.textContent = String(cube.value)

    if (doubleOffer) {
      const iAmProposer = doubleOffer.fromColor === myColor
      el.doubleOfferBox.classList.toggle('hidden', false)
      el.acceptDoubleBtn.classList.toggle('hidden', iAmProposer)
      el.declineDoubleBtn.classList.toggle('hidden', iAmProposer)
      el.doubleOfferText.textContent = iAmProposer
        ? `Вы предложили удвоить куб до ×${cube.value * 2}. Ждём решения соперника…`
        : `Соперник предлагает удвоить куб до ×${cube.value * 2}.`
    } else {
      el.doubleOfferBox.classList.add('hidden')
    }
  }

  function renderAll() {
    renderBoard()
    renderDice()
    renderTurnAndControls()
  }

  const throwDieEls = [el.throwDie1, el.throwDie2]

  function playDiceRollAnimation(rolled, onDone) {
    diceAnimInFlight = true
    el.diceRow.classList.add('hidden')
    el.diceThrowOverlay.classList.remove('hidden')

    throwDieEls.forEach((dieEl, i) => {
      dieEl.className = 'throw-die dropping'
      dieEl.textContent = String(rolled[i] != null ? rolled[i] : 1)
      dieEl.style.animationDelay = (i * 60) + 'ms'
    })

    let flickerHandle = null

    window.setTimeout(() => {
      throwDieEls.forEach(dieEl => { dieEl.className = 'throw-die tumbling' })
      playDiceSound()
      flickerHandle = window.setInterval(() => {
        throwDieEls.forEach(dieEl => { dieEl.textContent = String(1 + Math.floor(Math.random() * 6)) })
      }, 90)
    }, 460)

    window.setTimeout(() => {
      clearInterval(flickerHandle)
      throwDieEls.forEach((dieEl, i) => {
        dieEl.textContent = String(rolled[i] != null ? rolled[i] : 1)
        dieEl.className = 'throw-die settled'
      })
      playDiceLandSound()
    }, 960)

    window.setTimeout(() => {
      el.diceThrowOverlay.classList.add('fading')
    }, 1300)

    window.setTimeout(() => {
      el.diceThrowOverlay.classList.add('hidden')
      el.diceThrowOverlay.classList.remove('fading')
      el.diceRow.classList.remove('hidden')
      diceAnimInFlight = false
      onDone()
    }, 1550)
  }

  function onRollDiceClick() {
    if (diceAnimInFlight) return
    el.rollDiceBtn.disabled = true
    socket.emit('roll_dice')
  }
  function onOfferDoubleClick() {
    socket.emit('offer_double')
  }
  function onAcceptDoubleClick() {
    socket.emit('respond_double', { accept: true })
  }
  function onDeclineDoubleClick() {
    socket.emit('respond_double', { accept: false })
  }

  el.rollDiceBtn.addEventListener('click', onRollDiceClick)
  el.offerDoubleBtn.addEventListener('click', onOfferDoubleClick)
  el.acceptDoubleBtn.addEventListener('click', onAcceptDoubleClick)
  el.declineDoubleBtn.addEventListener('click', onDeclineDoubleClick)

  function applyGameState(state) {
    board = state.board
    turnColor = state.turnColor
    dice = state.dice
    movesLeft = state.movesLeft || []
    hasRolled = !!state.hasRolled
    cube = state.cube || { value: 1, ownerColor: null }
    doubleOffer = state.doubleOffer || null
    headMovesUsed = state.headMovesUsed || 0
    headMovesMax = state.headMovesMax || 1
  }

  function onDiceRolled({ dice: rolled, movesLeft: ml, headMovesUsed: hmu, headMovesMax: hmm }) {
    playDiceRollAnimation(rolled, () => {
      dice = rolled
      movesLeft = ml
      hasRolled = true
      headMovesUsed = hmu || 0
      headMovesMax = hmm || 1
      renderAll()
    })
  }

  function onCheckerMoved(data) {
    const isMine = data.color === myColor
    if (isMine && selfAnimInFlight) {
      pendingSelfState = data
      return
    }
    if (!isMine) {
      animateOpponentMove(data)
      return
    }
    applyBoardState(data)
    renderAll()
  }

  function onTurnChanged({ turnColor: tc }) {
    turnColor = tc
    dice = null
    movesLeft = []
    hasRolled = false
    renderAll()
  }

  function onDoubleOffered({ fromColor }) {
    doubleOffer = { fromColor }
    renderTurnAndControls()
  }

  function onDoubleAccepted({ cube: c }) {
    cube = c
    doubleOffer = null
    renderAll()
  }

  function onRoomUpdate() {
    updatePlayerBadges()
  }

  socket.on('dice_rolled', onDiceRolled)
  socket.on('checker_moved', onCheckerMoved)
  socket.on('turn_changed', onTurnChanged)
  socket.on('double_offered', onDoubleOffered)
  socket.on('double_accepted', onDoubleAccepted)
  socket.on('room_update', onRoomUpdate)

  // Первичная отрисовка — состояние приходит либо из round_started, либо из rejoin.
  applyGameState(opts.initialState)
  renderAll()

  return {
    destroy() {
      socket.off('dice_rolled', onDiceRolled)
      socket.off('checker_moved', onCheckerMoved)
      socket.off('turn_changed', onTurnChanged)
      socket.off('double_offered', onDoubleOffered)
      socket.off('double_accepted', onDoubleAccepted)
      socket.off('room_update', onRoomUpdate)
      el.rollDiceBtn.removeEventListener('click', onRollDiceClick)
      el.offerDoubleBtn.removeEventListener('click', onOfferDoubleClick)
      el.acceptDoubleBtn.removeEventListener('click', onAcceptDoubleClick)
      el.declineDoubleBtn.removeEventListener('click', onDeclineDoubleClick)
    },
  }
}
