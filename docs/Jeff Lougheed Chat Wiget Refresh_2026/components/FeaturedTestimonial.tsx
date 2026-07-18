'use client'

/**
 * FeaturedTestimonial — rotating "In their words" social-proof card
 * ─────────────────────────────────────────────────────────────────
 * Net-new component (was prototype-only). Renders at the bottom of the
 * How-it-works block, below the deliverables tray. Auto-advances every
 * 6s, pauses on hover, and exposes dot controls.
 *
 * Headshots: each entry's `image` points at the production asset path
 * (same `/sage/jefflougheed/...` convention as the career logos). When
 * `image` is omitted the avatar falls back to the person's initials.
 *
 * ▸ CONFIRM the filenames below match what's in /public/sage/jefflougheed.
 */

import { useEffect, useState } from 'react'

type Featured = {
  quote: string
  who: string
  title: string
  company: string
  /** Public path to the headshot. Omit to fall back to initials. */
  image?: string
}

const HEADSHOT_DIR = '/sage/jefflougheed/people'

const FEATURED: Featured[] = [
  {
    quote:
      'Jeff brought sales leadership and structure to our revenue as we grew. His coaching approach gave the team a productive path to growth.',
    who: 'Saif Ajani',
    title: 'CEO',
    company: 'Keyhole',
    image: `${HEADSHOT_DIR}/saif-ajani.jpg`,
  },
  {
    quote:
      'He has proven repeatedly that he can perform in the most trying situations.',
    who: 'Rick Bacchus',
    title: 'President',
    company: 'Trapeze',
    image: `${HEADSHOT_DIR}/rick-bacchus.jpg`,
  },
  {
    quote:
      'Your question-based coaching had a huge impact on helping me think more creatively in the face of problems that seem unapproachable.',
    who: 'Iara Rios',
    title: 'Manager, Content Marketing',
    company: 'Keyhole',
    image: `${HEADSHOT_DIR}/iara-rios.jpg`,
  },
  {
    quote:
      "Small pieces of advice can go a long way, and Jeff has dropped a few that have been useful, and he doesn't even know it.",
    who: 'Ryan MacEwing',
    title: 'Senior Sales Executive',
    company: 'RouteThis',
    image: `${HEADSHOT_DIR}/ryan-macewing.jpg`,
  },
]

const ROTATE_MS = 6000

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

export function FeaturedTestimonial() {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => setI((n) => (n + 1) % FEATURED.length), ROTATE_MS)
    return () => clearInterval(id)
  }, [paused])

  const f = FEATURED[i]

  return (
    <div
      className="mt-14 border-t border-[color:var(--color-border)] pt-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* "In their words" eyebrow */}
      <div className="mb-6 flex items-center gap-4">
        <span className="font-mono text-[11px] tracking-[0.22em] uppercase text-[color:var(--color-text-dim)]">
          In their words
        </span>
        <span aria-hidden className="h-px max-w-[160px] flex-1 bg-[color:var(--color-border)]" />
      </div>

      <figure
        key={i}
        className="m-0 max-w-[820px] rounded-[18px] border border-[color:var(--color-border)] bg-surface p-9 md:px-10 shadow-[0_4px_24px_rgba(24,32,41,0.04)] [animation:jlFeaturedIn_0.5s_cubic-bezier(0.2,0.7,0.2,1)_both]"
      >
        <blockquote className="m-0 font-display italic text-[clamp(20px,2.1vw,26px)] leading-[1.45] text-[color:var(--color-text-primary)] text-pretty">
          &ldquo;{f.quote}&rdquo;
        </blockquote>

        <figcaption className="mt-5 flex items-center gap-3.5">
          <span
            aria-hidden
            className="flex h-[52px] w-[52px] flex-none items-center justify-center overflow-hidden rounded-full bg-[#E8E1CF] font-body text-base font-semibold text-[rgb(24_32_41)] shadow-[inset_0_0_0_1px_rgb(24_32_41/0.06)]"
          >
            {f.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.image} alt="" className="h-full w-full object-cover" />
            ) : (
              initialsOf(f.who)
            )}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="font-body text-[15px] font-bold text-[color:var(--color-text-primary)]">
              {f.who}
            </span>
            <span className="font-mono text-[11px] tracking-[0.04em] uppercase text-[color:var(--color-text-dim)]">
              {f.title} &middot; {f.company}
            </span>
          </span>
        </figcaption>
      </figure>

      {/* Dot controls */}
      <div className="mt-5 flex gap-2" role="tablist" aria-label="Featured testimonials">
        {FEATURED.map((_, n) => {
          const on = n === i
          return (
            <button
              key={n}
              type="button"
              role="tab"
              aria-selected={on}
              aria-label={`Show testimonial ${n + 1}`}
              onClick={() => setI(n)}
              className={[
                'h-[7px] w-[7px] cursor-pointer rounded-full border-0 p-0 transition-[background-color,transform] duration-200',
                on
                  ? 'scale-[1.15] bg-accent'
                  : 'bg-[color:var(--color-border-hover)] hover:bg-accent/60',
              ].join(' ')}
            />
          )
        })}
      </div>

      <style>{`
        @keyframes jlFeaturedIn {
          from { opacity: 0; transform: translateY(6px) }
          to   { opacity: 1; transform: none }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="[animation:jlFeaturedIn"] { animation: none !important }
        }
      `}</style>
    </div>
  )
}

export default FeaturedTestimonial
