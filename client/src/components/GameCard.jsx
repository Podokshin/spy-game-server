import { motion, useReducedMotion } from 'motion/react'
import { ArrowUpRight } from '@phosphor-icons/react'

const EASE_OUT = [0.23, 1, 0.32, 1]

export function GameCard({ slug, accent, icon, title, desc, meta, index }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.a
      href={`/${slug}/`}
      className="group relative flex items-center gap-4 rounded-lg border-2 p-5 no-underline"
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
      <img
        src={icon}
        alt=""
        className="size-[52px] shrink-0 rounded-md object-cover"
        style={{ boxShadow: `0 6px 16px -8px ${accent}` }}
      />

      <div className="min-w-0 flex-1">
        <h2 className="m-0 mb-1 font-heading text-[1.08rem] font-bold text-foreground">{title}</h2>
        <p className="m-0 mb-2 text-[0.83rem] leading-[1.42] text-muted-foreground">{desc}</p>
        <span
          className="text-[0.66rem] font-bold tracking-wide uppercase"
          style={{ color: accent }}
        >
          {meta}
        </span>
      </div>

      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 transition-transform duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:-translate-y-[3px] group-hover:translate-x-[2px]"
        style={{ borderColor: accent, color: accent }}
      >
        <ArrowUpRight size={18} weight="bold" />
      </span>
    </motion.a>
  )
}
