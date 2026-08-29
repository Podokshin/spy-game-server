// Экран рисования — сознательно НЕ переписан на React-рендеринг холста.
// Синхронизация штрихов в реальном времени построена на низкоуровневых
// Pointer Events с нормализованными 0..1 координатами и ручным управлением
// canvas-трансформацией (см. комментарий у resizeCanvas) — это уже отлажено
// под реальные браузеры/устройства (борьба с "уезжающим" масштабом при
// resize). Вместо повторной реализации через React-рендер — «остров»
// vanilla-кода, который React монтирует/размонтирует как обычный
// imperative-виджет. Логика 1:1 повторяет public/crocodile/client.js.

const COLORS = ['#1a1a1a', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#8d6e63', '#ec4899', '#14b8a6', '#757575', '#1e3a5f']
const THIN = 3, MEDIUM = 8, THICK = 16, ERASER_WIDTH = 28, ERASER_COLOR = '#f7f6fb'

let audioCtx = null
function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    audioCtx = Ctx ? new Ctx() : null
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}
function tone(freq, startTime, duration, peakGain, type) {
  const ctxA = getAudioCtx()
  if (!ctxA) return
  const osc = ctxA.createOscillator()
  const gain = ctxA.createGain()
  osc.type = type || 'sine'
  osc.frequency.value = freq
  osc.connect(gain)
  gain.connect(ctxA.destination)
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.02)
}
function playCorrectSound() {
  const ctxA = getAudioCtx()
  if (!ctxA) return
  const now = ctxA.currentTime
  tone(520, now, 0.09, 0.22, 'triangle')
  tone(780, now + 0.07, 0.16, 0.2, 'triangle')
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

export function mountDrawingIsland(container, opts) {
  const { socket, myPlayerId, isArtist, artistId, artistName, wordLength, endsAt, totalMs, initialStrokes, initialCorrectGuessers, initiallyGuessed, totalGuessers, initialArtistWord } = opts

  const q = (id) => container.querySelector('#' + id)
  const el = {
    drawArtistBadge: q('drawArtistBadge'),
    drawTimer: q('drawTimer'),
    drawProgress: q('drawProgress'),
    wordHintRow: q('wordHintRow'),
    canvas: q('drawCanvas'),
    toolRow: q('toolRow'),
    colorSwatches: q('colorSwatches'),
    brushThinBtn: q('brushThinBtn'),
    brushMediumBtn: q('brushMediumBtn'),
    brushThickBtn: q('brushThickBtn'),
    eraserBtn: q('eraserBtn'),
    undoBtn: q('undoBtn'),
    clearCanvasBtn: q('clearCanvasBtn'),
    guessChat: q('guessChat'),
    guessForm: q('guessForm'),
    guessInput: q('guessInput'),
    alreadyGuessedHint: q('alreadyGuessedHint'),
  }

  let ctx = null
  let localStrokes = (initialStrokes || []).map(s => ({ color: s.color, width: s.width, points: s.points.slice() }))
  let myDrawing = false
  let myLastPoint = null
  let remoteLastPoint = null
  let currentColor = COLORS[0]
  let currentWidth = THIN
  let haveGuessedCorrectly = !!initiallyGuessed
  let correctCountThisRound = (initialCorrectGuessers || []).length
  let tickHandle = null

  el.drawArtistBadge.textContent = isArtist
    ? (initialArtistWord ? `✏️ Вы рисуете: ${initialArtistWord}` : '✏️ Вы рисуете')
    : `✏️ ${artistName || 'Игрок'} рисует`
  el.toolRow.classList.toggle('hidden', !isArtist)
  el.guessForm.classList.toggle('hidden', isArtist || haveGuessedCorrectly)
  el.alreadyGuessedHint.classList.toggle('hidden', !haveGuessedCorrectly)

  if (!isArtist && wordLength) {
    el.wordHintRow.textContent = new Array(wordLength).fill('_').join(' ')
    el.wordHintRow.classList.remove('hidden')
  } else {
    el.wordHintRow.classList.add('hidden')
  }

  function updateProgress(count, total) {
    el.drawProgress.textContent = `${count}/${total} угадали`
  }
  updateProgress(correctCountThisRound, totalGuessers)

  function resizeCanvas() {
    const rect = el.canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const dpr = window.devicePixelRatio || 1
    el.canvas.width = rect.width * dpr
    el.canvas.height = rect.height * dpr
    ctx = el.canvas.getContext('2d')
    // setTransform, а не scale — scale накапливается поверх текущей
    // трансформации при каждом повторном вызове (например, на resize),
    // из-за чего масштаб постепенно "уезжал" и точки рисования всё сильнее
    // расходились с курсором к правому нижнему углу. setTransform всегда
    // задаёт трансформацию заново, а не домножает её.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    redrawAll()
  }

  function redrawAll() {
    if (!ctx) return
    const rect = el.canvas.getBoundingClientRect()
    ctx.clearRect(0, 0, rect.width, rect.height)
    localStrokes.forEach(stroke => {
      for (let i = 1; i < stroke.points.length; i++) {
        drawSegment(stroke.points[i - 1][0], stroke.points[i - 1][1], stroke.points[i][0], stroke.points[i][1], stroke.color, stroke.width)
      }
      if (stroke.points.length === 1) {
        drawDot(stroke.points[0][0], stroke.points[0][1], stroke.color, stroke.width)
      }
    })
  }

  function drawSegment(x1, y1, x2, y2, color, width) {
    if (!ctx) return
    const rect = el.canvas.getBoundingClientRect()
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(x1 * rect.width, y1 * rect.height)
    ctx.lineTo(x2 * rect.width, y2 * rect.height)
    ctx.stroke()
  }

  function drawDot(x, y, color, width) {
    if (!ctx) return
    const rect = el.canvas.getBoundingClientRect()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x * rect.width, y * rect.height, width / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  function toNormalized(clientX, clientY) {
    const rect = el.canvas.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    }
  }

  function onPointerDown(e) {
    if (!isArtist) return
    myDrawing = true
    try { el.canvas.setPointerCapture(e.pointerId) } catch { /* редкий edge case, не критично — рисование продолжает работать и без захвата */ }
    const p = toNormalized(e.clientX, e.clientY)
    myLastPoint = p
    localStrokes.push({ color: currentColor, width: currentWidth, points: [[p.x, p.y]] })
    drawDot(p.x, p.y, currentColor, currentWidth)
    socket.emit('draw_start', { x: p.x, y: p.y, color: currentColor, width: currentWidth })
  }

  function onPointerMove(e) {
    if (!isArtist || !myDrawing) return
    const p = toNormalized(e.clientX, e.clientY)
    const stroke = localStrokes[localStrokes.length - 1]
    stroke.points.push([p.x, p.y])
    drawSegment(myLastPoint.x, myLastPoint.y, p.x, p.y, currentColor, currentWidth)
    myLastPoint = p
    socket.emit('draw_point', { x: p.x, y: p.y })
  }

  function endMyStroke() {
    if (!myDrawing) return
    myDrawing = false
    myLastPoint = null
    socket.emit('draw_end')
  }
  function onPointerLeave() { if (myDrawing) endMyStroke() }

  el.canvas.addEventListener('pointerdown', onPointerDown)
  el.canvas.addEventListener('pointermove', onPointerMove)
  el.canvas.addEventListener('pointerup', endMyStroke)
  el.canvas.addEventListener('pointercancel', endMyStroke)
  el.canvas.addEventListener('pointerleave', onPointerLeave)

  function onDrawStart(data) {
    remoteLastPoint = { x: data.x, y: data.y }
    localStrokes.push({ color: data.color, width: data.width, points: [[data.x, data.y]] })
    drawDot(data.x, data.y, data.color, data.width)
  }
  function onDrawPoint(data) {
    const stroke = localStrokes[localStrokes.length - 1]
    if (!stroke || !remoteLastPoint) return
    stroke.points.push([data.x, data.y])
    drawSegment(remoteLastPoint.x, remoteLastPoint.y, data.x, data.y, stroke.color, stroke.width)
    remoteLastPoint = { x: data.x, y: data.y }
  }
  function onDrawEnd() { remoteLastPoint = null }
  function onClearCanvas() {
    localStrokes = []
    if (ctx) { const rect = el.canvas.getBoundingClientRect(); ctx.clearRect(0, 0, rect.width, rect.height) }
  }
  function onUndoStroke() {
    localStrokes.pop()
    redrawAll()
  }
  function onYourWord(data) {
    if (isArtist) el.drawArtistBadge.textContent = `✏️ Вы рисуете: ${data.word}`
  }

  const brushButtons = [
    [THIN, el.brushThinBtn],
    [MEDIUM, el.brushMediumBtn],
    [THICK, el.brushThickBtn],
  ]

  function refreshToolButtons() {
    const isEraser = currentColor === ERASER_COLOR
    brushButtons.forEach(([width, btn]) => btn.classList.toggle('active', !isEraser && currentWidth === width))
    el.eraserBtn.classList.toggle('active', isEraser)
    el.colorSwatches.querySelectorAll('.color-swatch').forEach(b => b.classList.toggle('active', !isEraser && b.dataset.color === currentColor))
  }

  el.colorSwatches.innerHTML = COLORS.map((c, i) => `<button type="button" class="color-swatch${i === 0 ? ' active' : ''}" style="background:${c}" data-color="${c}" aria-label="Цвет ${c}"></button>`).join('')
  function onColorSwatchClick(e) {
    const btn = e.target.closest('.color-swatch')
    if (!btn) return
    currentColor = btn.dataset.color
    refreshToolButtons()
  }
  el.colorSwatches.addEventListener('click', onColorSwatchClick)

  function setBrush(width) {
    currentWidth = width
    if (currentColor === ERASER_COLOR) currentColor = COLORS[0]
    refreshToolButtons()
  }
  const brushHandlers = brushButtons.map(([width, btn]) => {
    const handler = () => setBrush(width)
    btn.addEventListener('click', handler)
    return [btn, handler]
  })

  function onEraserClick() {
    currentColor = ERASER_COLOR
    currentWidth = ERASER_WIDTH
    refreshToolButtons()
  }
  el.eraserBtn.addEventListener('click', onEraserClick)

  function onUndoClick() {
    if (localStrokes.length === 0) return
    localStrokes.pop()
    redrawAll()
    socket.emit('undo_stroke')
  }
  el.undoBtn.addEventListener('click', onUndoClick)

  function onClearClick() {
    localStrokes = []
    if (ctx) { const rect = el.canvas.getBoundingClientRect(); ctx.clearRect(0, 0, rect.width, rect.height) }
    socket.emit('clear_canvas')
  }
  el.clearCanvasBtn.addEventListener('click', onClearClick)

  function appendChatLine(html, cls) {
    const line = document.createElement('div')
    line.className = 'guess-chat-line' + (cls ? ' ' + cls : '')
    line.innerHTML = html
    el.guessChat.appendChild(line)
    el.guessChat.scrollTop = el.guessChat.scrollHeight
  }

  function onCorrectGuess(data) {
    correctCountThisRound = data.rank
    updateProgress(correctCountThisRound, totalGuessers)
    appendChatLine(`✅ <b>${escapeHtml(data.name)}</b> угадал(а)! (+${data.points})`, 'correct')
    if (data.playerId === myPlayerId) {
      haveGuessedCorrectly = true
      el.guessForm.classList.add('hidden')
      el.alreadyGuessedHint.classList.remove('hidden')
      playCorrectSound()
    }
  }
  function onGuessMessage(data) {
    appendChatLine(`<b>${escapeHtml(data.name)}:</b> ${escapeHtml(data.text)}`)
  }

  function onGuessSubmit(e) {
    e.preventDefault()
    const text = el.guessInput.value.trim()
    if (!text || haveGuessedCorrectly) return
    socket.emit('submit_guess', { text })
    el.guessInput.value = ''
  }
  el.guessForm.addEventListener('submit', onGuessSubmit)

  function startTimerTick() {
    updateTimerDisplay()
    tickHandle = setInterval(updateTimerDisplay, 250)
  }
  function updateTimerDisplay() {
    if (!endsAt) return
    const remaining = Math.max(0, endsAt - Date.now())
    const totalSeconds = Math.ceil(remaining / 1000)
    const m = Math.floor(totalSeconds / 60)
    const s = (totalSeconds % 60).toString().padStart(2, '0')
    el.drawTimer.textContent = `${m}:${s}`
  }

  socket.on('draw_start', onDrawStart)
  socket.on('draw_point', onDrawPoint)
  socket.on('draw_end', onDrawEnd)
  socket.on('clear_canvas', onClearCanvas)
  socket.on('undo_stroke', onUndoStroke)
  socket.on('your_word', onYourWord)
  socket.on('correct_guess', onCorrectGuess)
  socket.on('guess_message', onGuessMessage)

  function onWindowResize() { resizeCanvas() }
  window.addEventListener('resize', onWindowResize)

  resizeCanvas()
  startTimerTick()

  return {
    destroy() {
      window.removeEventListener('resize', onWindowResize)
      if (tickHandle) clearInterval(tickHandle)
      el.canvas.removeEventListener('pointerdown', onPointerDown)
      el.canvas.removeEventListener('pointermove', onPointerMove)
      el.canvas.removeEventListener('pointerup', endMyStroke)
      el.canvas.removeEventListener('pointercancel', endMyStroke)
      el.canvas.removeEventListener('pointerleave', onPointerLeave)
      el.colorSwatches.removeEventListener('click', onColorSwatchClick)
      brushHandlers.forEach(([btn, handler]) => btn.removeEventListener('click', handler))
      el.eraserBtn.removeEventListener('click', onEraserClick)
      el.undoBtn.removeEventListener('click', onUndoClick)
      el.clearCanvasBtn.removeEventListener('click', onClearClick)
      el.guessForm.removeEventListener('submit', onGuessSubmit)
      socket.off('draw_start', onDrawStart)
      socket.off('draw_point', onDrawPoint)
      socket.off('draw_end', onDrawEnd)
      socket.off('clear_canvas', onClearCanvas)
      socket.off('undo_stroke', onUndoStroke)
      socket.off('your_word', onYourWord)
      socket.off('correct_guess', onCorrectGuess)
      socket.off('guess_message', onGuessMessage)
    },
  }
}
