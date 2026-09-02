import { useRef, useState } from 'react'

function pickRandom(pool, avoid) {
  if (pool.length === 0) return null
  if (pool.length === 1) return pool[0]
  const candidates = pool.filter((f) => !avoid.includes(f))
  return (candidates.length ? candidates : pool)[Math.floor(Math.random() * (candidates.length ? candidates.length : pool.length))]
}

// Одно фоновое видео справа — беззвучное, зациклено, клик по нему меняет
// ролик на случайный следующий из того же списка (/api/videos).
export default function VideoPanel({ files }) {
  const [current, setCurrent] = useState(() => pickRandom(files, []))
  const videoRef = useRef(null)

  function shuffle() {
    const next = pickRandom(files, [current])
    setCurrent(next)
    // src меняется через key на <video>, поэтому autoplay сработает сам при перерендере
  }

  if (!current) return null

  return (
    <div className="gc-video-wrap">
      <video key={current} ref={videoRef} muted loop playsInline autoPlay onClick={shuffle} src={'/videos/' + current} />
    </div>
  )
}
