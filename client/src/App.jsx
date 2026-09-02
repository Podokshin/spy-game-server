import { Fragment } from 'react'
import { MotionConfig } from 'motion/react'
import { GameCard } from './components/GameCard'
import HubVideoPanel from './components/HubVideoPanel'
import { Badge } from '@/components/ui/badge'
import { GAMES } from './games'
import { useVideoToggle } from './lib/useVideoToggle'
import { DeviceMobile, SmileyWink, GameController as GameControllerIcon, ArrowRight } from '@phosphor-icons/react'

const STEPS = [
  { icon: DeviceMobile, text: 'Откройте ссылку или введите код комнаты' },
  { icon: SmileyWink, text: 'Выберите имя и присоединяйтесь к игре' },
  { icon: GameControllerIcon, text: 'Играйте и веселитесь вместе с друзьями!' },
]

function HowToConnect() {
  return (
    <section id="how" className="mb-8 rounded-lg border-2 border-border bg-card p-5">
      <h2 className="m-0 mb-4 font-heading text-[1rem] font-bold text-foreground">Как подключиться?</h2>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          return (
            <Fragment key={i}>
              <div className="flex flex-1 items-start gap-3 sm:flex-col sm:items-center sm:text-center">
                <div
                  className="flex size-11 shrink-0 items-center justify-center rounded-full border-2"
                  style={{ borderColor: 'var(--color-spy)', background: 'color-mix(in srgb, var(--color-spy) 18%, transparent)', color: 'var(--color-spy)' }}
                >
                  <Icon size={20} weight="bold" />
                </div>
                <p className="m-0 pt-1 text-[0.83rem] leading-[1.4] text-muted-foreground sm:pt-0">
                  <span className="mr-1 font-bold text-foreground">{i + 1}.</span>
                  {s.text}
                </p>
              </div>
              {i < STEPS.length - 1 && (
                <ArrowRight size={18} weight="bold" className="mt-3 hidden shrink-0 text-muted-foreground/50 sm:block" />
              )}
            </Fragment>
          )
        })}
      </div>
    </section>
  )
}

export default function App() {
  const video = useVideoToggle()

  return (
    <MotionConfig reducedMotion="user">
      <div className="mesh" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} />
        ))}
      </div>
      <div className="grain" aria-hidden="true" />

      <div id="app" className="relative z-[2] mx-auto w-full max-w-[1360px] px-5 pt-8 pb-20">
        <header className="mb-8 flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border-2 border-border bg-card shadow-[0_0_0_1px_rgba(0,0,0,0.3),0_12px_30px_-10px_rgba(255,95,176,0.35)]">
            <img src="/favicon.svg" alt="" width="24" height="24" />
          </div>
          <span className="font-heading text-[1.3rem] font-extrabold tracking-[-0.5px] text-foreground">
            Игр
            <span
              className="mx-[0.02em] inline-block -translate-y-[2px] scale-x-[1.08] rotate-[-6deg] font-bold italic"
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
          </span>
        </header>

        <div className="flex items-start gap-6">
          <div className="min-w-0 flex-1">
            <section className="mb-8">
              <h1 className="m-0 mb-3 font-heading text-[2rem] leading-[1.1] font-extrabold tracking-[-1px] text-foreground sm:text-[2.6rem]">
                Мини-игры для<br />
                <span
                  style={{
                    background: 'linear-gradient(135deg, var(--color-spy), var(--color-wavelength))',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                  }}
                >
                  дружеской компании
                </span>
              </h1>
              <p className="m-0 mb-5 max-w-[480px] text-[0.98rem] leading-[1.6] text-muted-foreground">
                Заходите с телефона по ссылке или коду комнаты и играйте вместе, без установки приложений.
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="#games"
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 font-heading text-[0.92rem] font-bold text-[#06060a] no-underline"
                  style={{ background: 'linear-gradient(135deg, var(--color-spy), var(--color-wavelength))' }}
                >
                  <GameControllerIcon size={18} weight="bold" /> Создать комнату
                </a>
                <a
                  href="#how"
                  className="inline-flex items-center gap-2 rounded-full border-2 border-border px-5 py-3 font-heading text-[0.92rem] font-bold text-foreground no-underline"
                >
                  Как это работает?
                </a>
              </div>
            </section>

            <HowToConnect />

            <section id="games">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="m-0 font-heading text-[1.05rem] font-bold text-foreground">🎲 Все мини-игры</h2>
                <Badge variant="outline" className="text-muted-foreground">{GAMES.length} игр</Badge>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {GAMES.map((game, i) => (
                  <GameCard key={game.slug} index={i} {...game} />
                ))}
              </div>
            </section>

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

          <aside className="sticky top-6 hidden w-[300px] shrink-0 xl:block">
            <HubVideoPanel enabled={video.enabled} />
          </aside>
        </div>
      </div>

      <div
        className={'credit fixed right-4 bottom-4 z-50 cursor-pointer rounded-full border-2 border-border bg-card px-[15px] py-[7px] font-heading text-[0.68rem] font-semibold whitespace-nowrap text-muted-foreground' + (video.enabled ? ' active' : '')}
        data-shorts-toggle=""
        title="Нажмите, чтобы включить/выключить фоновое видео справа"
        onClick={video.toggle}
      >
        ✨ Навайбкодил <b className="font-bold text-foreground">Papaluha</b> ✨
        <span className="shorts-indicator" />
      </div>
    </MotionConfig>
  )
}
