import { motion, useReducedMotion } from 'motion/react'
import { ArrowUpRight } from '@phosphor-icons/react'

const EASE_OUT = [0.23, 1, 0.32, 1]

export function GameCard({ slug, accent, icon, title, desc, meta, index }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.a
      href={`/${slug}/`}
      className="group relative flex h-full flex-col gap-2 rounded-lg border-2 p-4 no-underline"
      style={{ '--accent': accent, background: 'var(--card)', borderColor: 'var(--border)' }}
      initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay: index * 0.045 }}
      whileHover={{
        y: -4,
        borderColor: accent,
        boxShadow: `0 16px 40px -18px ${accent}`,
        transition: { duration: 0.2, ease: EASE_OUT },
      }}
      whileTap={{ y: -1, scale: 0.97, transition: { duration: 0.1, ease: EASE_OUT } }}
    >
      <div className="flex items-center gap-2.5">
        <img
          src={icon}
          alt=""
          className="size-9 shrink-0 rounded-md object-cover"
          style={{ boxShadow: `0 6px 16px -8px ${accent}` }}
        />
        <h2 className="m-0 min-w-0 flex-1 font-heading text-[0.98rem] font-bold text-foreground">{title}</h2>
      </div>

      <p className="m-0 line-clamp-2 flex-1 text-[0.8rem] leading-[1.4] text-muted-foreground">{desc}</p>

      <div className="flex items-center justify-between gap-3 pt-0.5">
        <span className="min-w-0 truncate text-[0.62rem] font-bold tracking-wide text-muted-foreground/80 uppercase">
          {meta}
        </span>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[0.74rem] font-bold transition-transform duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:-translate-y-[2px]"
          style={{ background: accent, color: '#06060a' }}
        >
          Играть <ArrowUpRight size={13} weight="bold" />
        </span>
      </div>
    </motion.a>
  )
}
