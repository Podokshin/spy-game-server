import { useEffect, useState } from 'react'
import { X, SignIn } from '@phosphor-icons/react'

// Модалка "Подключиться по коду" — код комнаты уникален только внутри своей
// игры (у каждой игры своя карта комнат на сервере), поэтому по одному коду
// без выбора игры сервер сам ищет, в какой из 9 игр он активен, через
// /api/find-room (см. server.js, gameRegistry).
export default function JoinRoomModal({ open, onClose }) {
  const [code, setCode] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | error
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setCode('')
    setStatus('idle')
    setError('')
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function submit() {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return
    setStatus('loading')
    setError('')
    try {
      const res = await fetch('/api/find-room?code=' + encodeURIComponent(trimmed))
      const data = await res.json()
      if (data.slug) {
        window.location.href = `/${data.slug}/?room=${trimmed}`
      } else {
        setStatus('error')
        setError('Комната с таким кодом не найдена. Проверьте код или попросите ссылку у организатора.')
      }
    } catch {
      setStatus('error')
      setError('Не получилось проверить код. Попробуйте ещё раз.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border-2 border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 font-heading text-[1.05rem] font-bold text-foreground">Подключиться к комнате</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-full border-2 border-border text-muted-foreground hover:text-foreground"
            aria-label="Закрыть"
          >
            <X size={14} weight="bold" />
          </button>
        </div>

        <p className="m-0 mb-4 text-[0.85rem] leading-[1.5] text-muted-foreground">
          Введите код комнаты, который вам скинули — мы сами найдём нужную игру.
        </p>

        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="KOД12"
          className="mb-3 w-full rounded-lg border-2 border-border bg-background px-4 py-3 text-center font-heading text-[1.4rem] font-extrabold tracking-[0.35em] text-foreground uppercase outline-none placeholder:text-muted-foreground/40 focus:border-[var(--color-spy)]"
        />

        {status === 'error' && (
          <p className="m-0 mb-3 text-[0.8rem] leading-[1.4] text-red-400">{error}</p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!code.trim() || status === 'loading'}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 font-heading text-[0.92rem] font-bold text-[#06060a] no-underline disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--color-spy), var(--color-wavelength))' }}
        >
          <SignIn size={18} weight="bold" /> {status === 'loading' ? 'Ищем комнату…' : 'Войти'}
        </button>
      </div>
    </div>
  )
}
