import { useEffect, useState } from 'react'
import { FilmSlate } from '@phosphor-icons/react'
import VideoPanel from './VideoPanel'

// Правая панель хаба — то же фоновое видео, что и в играх (переключается тем
// же кликом по бейджу внизу), только без списка игроков — на хабе нет
// комнаты. Пока видео выключено, просто показываем пустое состояние.
//
// <aside> в App.jsx растянут по высоте под левую колонку (там 9 карточек
// игр — страница длинная), а сама панель здесь — sticky с центровкой по
// вертикали (top:50vh + translateY(-50%)), так что текст и блок с видео
// остаются по центру экрана, пока пользователь скроллит хаб, а не уезжают
// наверх/вниз вместе со страницей.
export default function HubVideoPanel({ enabled }) {
  const [files, setFiles] = useState([])

  useEffect(() => {
    fetch('/api/videos')
      .then((res) => (res.ok ? res.json() : []))
      .then((f) => setFiles(f || []))
      .catch(() => { /* видео нет — просто оставим пустое состояние */ })
  }, [])

  const showVideo = enabled && files.length > 0

  return (
    <div className="sticky top-[50vh] -translate-y-1/2">
      <div className="mb-3 text-[0.72rem] font-bold tracking-wide text-muted-foreground uppercase">
        🎬 Фоновое видео
      </div>
      {showVideo ? (
        <VideoPanel files={files} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-border bg-card px-4 py-8 text-center">
          <FilmSlate size={32} weight="duotone" className="text-muted-foreground" />
          <p className="m-0 text-sm font-bold text-foreground">Пока выключено</p>
          <p className="m-0 text-xs leading-[1.5] text-muted-foreground">
            Нажмите на бейдж «Papaluha» внизу страницы, чтобы включить фоновые ролики.
          </p>
        </div>
      )}
    </div>
  )
}
