import { useEffect, useState } from 'react'
import VideoPanel from './VideoPanel'
import PlayerListPanel from './PlayerListPanel'

// Правая панель игры: либо фоновое видео (когда включено кликом по бейджу
// внизу и ролики вообще есть), либо, по умолчанию, живой список игроков
// комнаты. Десктоп-онли — на узких экранах скрывается через CSS.
export default function SidePanel({ players, videoEnabled, maxDisplay }) {
  const [videoFiles, setVideoFiles] = useState([])

  useEffect(() => {
    fetch('/api/videos')
      .then((res) => (res.ok ? res.json() : []))
      .then((files) => setVideoFiles(files || []))
      .catch(() => { /* видео нет — просто останется список игроков */ })
  }, [])

  const showVideo = videoEnabled && videoFiles.length > 0

  return (
    <aside className="gc-side-panel">
      {showVideo ? <VideoPanel files={videoFiles} /> : <PlayerListPanel players={players} maxDisplay={maxDisplay} />}
    </aside>
  )
}
