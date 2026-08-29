import { MotionConfig } from 'motion/react'
import { GameCard } from './components/GameCard'
import { Badge } from '@/components/ui/badge'
import { GAMES } from './games'

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="mesh" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} />
        ))}
      </div>
      <div className="grain" aria-hidden="true" />

      <div className="relative z-[2] mx-auto w-full max-w-[600px] px-5 pt-10 pb-20">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex size-[60px] items-center justify-center rounded-md border-2 border-border bg-card shadow-[0_0_0_1px_rgba(0,0,0,0.3),0_12px_30px_-10px_rgba(255,95,176,0.35)]">
            <img src="/favicon.svg" alt="" width="34" height="34" />
          </div>
          <h1 className="m-0 mb-3 font-heading text-[2.7rem] font-extrabold tracking-[-1.5px] text-foreground">
            Игр
            <span
              className="mx-[0.02em] inline-block -translate-y-[3px] scale-x-[1.08] rotate-[-6deg] font-bold italic"
              style={{
                background:
                  'linear-gradient(135deg, var(--color-spy) 0%, var(--color-mission) 40%, var(--color-codenames) 70%, var(--color-mafia) 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              о
            </span>
            тека
          </h1>
          <p className="mx-auto max-w-[420px] text-[0.98rem] leading-[1.6] text-muted-foreground">
            Мини-игры для дружеской компании — заходите с телефона по ссылке или коду комнаты и играйте вместе, без установки приложений.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {GAMES.map((game, i) => (
            <GameCard key={game.slug} index={i} {...game} />
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-[0.76rem] text-muted-foreground/70">
          <Badge variant="outline" className="text-muted-foreground/70">12+</Badge>
          <a href="/privacy/" className="text-inherit underline decoration-1 underline-offset-2 transition-colors hover:text-muted-foreground">
            Политика обработки данных
          </a>
          <span className="opacity-50">·</span>
          <a href="/terms/" className="text-inherit underline decoration-1 underline-offset-2 transition-colors hover:text-muted-foreground">
            Правила сайта
          </a>
        </div>
      </div>

      <div className="fixed right-4 bottom-4 z-50 rounded-full border-2 border-border bg-card px-[15px] py-[7px] font-heading text-[0.68rem] font-semibold whitespace-nowrap text-muted-foreground">
        ✨ Навайбкодил <b className="font-bold text-foreground">Papaluha</b> ✨
      </div>
    </MotionConfig>
  )
}
