// Общие короткие звуки для всех 9 игр — синтезируются на лету через Web
// Audio (осцилляторы), без аудиофайлов. Раньше playTimeUpSound был
// продублирован по каждой игре с таймером; теперь это общее место, и сюда
// же добавлены звук старта раунда и звук результата (голосование/раскрытие).
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

// Браузеры не дают запускать звук до жеста пользователя — вызывается из
// createRoom/joinRoom (клик по кнопке), чтобы AudioContext был готов/разбужен
// к моменту первого реального звука.
export function unlockAudio() {
  getAudioCtx()
}

export function playTimeUpSound() {
  const ctx = getAudioCtx()
  if (!ctx) return
  const now = ctx.currentTime
  beep(660, now, 0.16, 0.28)
  beep(660, now + 0.22, 0.16, 0.28)
  beep(880, now + 0.44, 0.35, 0.3)
}

export function playRoundStartSound() {
  const ctx = getAudioCtx()
  if (!ctx) return
  const now = ctx.currentTime
  beep(440, now, 0.1, 0.22)
  beep(660, now + 0.09, 0.18, 0.26)
}

export function playResultSound() {
  const ctx = getAudioCtx()
  if (!ctx) return
  const now = ctx.currentTime
  beep(520, now, 0.12, 0.24)
  beep(390, now + 0.11, 0.12, 0.22)
  beep(520, now + 0.24, 0.24, 0.28)
}
