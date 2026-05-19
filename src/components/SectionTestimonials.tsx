'use client'

import { useState } from 'react'
import { ChevronUp } from 'lucide-react'

type Relationship = 'Executive' | 'Peer' | 'Direct Report' | 'Friend'

type Testimonial = {
  name: string
  title: string | null
  text: string
  relationship: Relationship
  /** Headshot filename in /public/headshots/, without extension. Optional. */
  headshot?: string
}

const TESTIMONIALS: Testimonial[] = [
  // Executives
  { name: 'Saif Ajani', title: 'CEO', text: 'Jeff brought sales leadership and structure to our revenue as we grew. His coaching approach gave the team a productive path to growth.', relationship: 'Executive', headshot: 'Saif_A' },
  { name: 'Vlad Chernenko', title: 'CEO', text: 'Overall, Jeff has been instrumental in moving Meal Garden forward.', relationship: 'Executive', headshot: 'Vlad_C' },
  { name: 'Jim Schnepp', title: 'VP, Sales and Marketing', text: 'Jeff proved himself to be a very capable leader, a great coach, an advocate for the customer, and a real partner.', relationship: 'Executive', headshot: 'Jim_S' },
  { name: 'Rick Bacchus', title: 'President', text: 'He has proven repeatedly that he can perform in the most trying situations.', relationship: 'Executive', headshot: 'Rick_B' },
  { name: 'Colin McKenzie', title: 'General Manager', text: 'Jeff’s ability to read people, adjust his message for his audience, and speak frankly and openly… was critical to his success.', relationship: 'Executive', headshot: 'Colin_M' },
  { name: 'John Parsons', title: 'VP, Sales', text: 'Jeff got the CFO to confirm their desire to expand scope, then spent months expanding efforts and connections inside the account.', relationship: 'Executive', headshot: 'John_P' },

  // Peers (incl. former customers/clients)
  { name: 'Diego Menchaca', title: 'Founder', text: 'His exceptional ability to listen is rare, and a defining trait of what makes him a formidable manager and sales expert.', relationship: 'Peer', headshot: 'Diego_M' },
  { name: 'David Corbin', title: 'Sales Executive', text: 'His ability to find new and creative ways to close large deals has been unmatched.', relationship: 'Peer', headshot: 'David_C' },
  { name: 'Pepper Harward', title: 'CEO', text: 'His brilliance is at times unrivaled. He puts his own personality stamp on everything he does, which makes his contributions memorable.', relationship: 'Peer', headshot: 'Pepper_H' },
  { name: 'Chris Chun', title: 'Sales Leader', text: 'I took your advice and went out guns blazing; #1 on my team and #2 in Canada.', relationship: 'Peer', headshot: 'Chris_C' },
  { name: 'Brittany Dallman', title: 'Business Development Rep', text: 'You were such a great coach and so helpful, one of the people I learned the most from.', relationship: 'Peer', headshot: 'Brittany_D' },
  { name: 'William Tsuei', title: 'Chair, IT Committee', text: 'Jeff is a seasoned executive with in-depth experience. Always willing to go the extra mile.', relationship: 'Peer', headshot: 'Bill_S' },
  { name: 'Rick Moore', title: null, text: 'Jeff brought us new and innovative products to help resolve outstanding process issues.', relationship: 'Peer', headshot: 'Rick_M' },
  { name: 'Rajeev Roy', title: 'Director, Digital and Process Transformation', text: 'Jeff spent time understanding how we did business and partnered with us to find better ways.', relationship: 'Peer', headshot: 'Rajeev_R' },

  // Direct reports
  { name: 'Martin Burwell', title: 'Sales Executive', text: 'Jeff is a fantastic business coach who challenged me to view problems from a client’s perspective.', relationship: 'Direct Report', headshot: 'Marty_B' },
  { name: 'Skyler Thompson', title: 'Partnership Manager', text: 'I grew substantially as a professional while working with Jeff. He was committed to my success.', relationship: 'Direct Report', headshot: 'Skyler_T' },
  { name: 'Karl Shamatutu', title: 'Sales Executive', text: 'Jeff coached me around meeting execution: how to figure out the right questions and to present value accordingly.', relationship: 'Direct Report', headshot: 'Karl_S' },
  { name: 'Dale Mehta', title: 'Sales Executive', text: 'Jeff is one of the most focused and driven individuals I’ve ever had the pleasure of working for.', relationship: 'Direct Report', headshot: 'Dale_M' },
  { name: 'Brendan Samis', title: 'Sales Executive', text: 'Jeff Lougheed has had the single most impact on the development of my career.', relationship: 'Direct Report', headshot: 'Brendan_S' },
  { name: 'Kiki Athanas', title: 'Founder', text: 'Gave me the confidence to get out there and make it happen.', relationship: 'Direct Report', headshot: 'Kiki_A' },
  { name: 'Iara Rios', title: 'Manager, Content Marketing', text: 'Your question-based coaching had a huge impact on helping me think more creatively in the face of problems that seem unapproachable.', relationship: 'Direct Report', headshot: 'Iara_R' },

  // Friends
  { name: 'Justin Juscka', title: 'VP, Product & Portfolio Management', text: 'He shows up. No matter what’s happening in his own world, if you need Jeff, he will be there, no questions asked.', relationship: 'Friend', headshot: 'Justin_J' },
  { name: 'Mike McPherson', title: 'Toronto Police Services', text: 'You have this unique ability to truly listen, not just waiting to respond, but absorbing, reflecting, and offering something thoughtful in return.', relationship: 'Friend' },
  { name: 'Rob Cotey', title: 'Principal', text: 'His superpower has always been his ability to walk into a room and make everyone there feel important.', relationship: 'Friend', headshot: 'Rob_C' },
  { name: 'Steph Ringwald', title: 'Emergency Room Manager', text: 'Your positivity, your contagious laugh, and love of humanity makes the world a better place.', relationship: 'Friend', headshot: 'Steph_R' },
  { name: 'Garth Willson', title: 'Director, Engineering & Continuous Improvement', text: 'True concern for your well-being, challenges the status quo, sees deep and won’t sugar coat it.', relationship: 'Friend', headshot: 'Garth_W' },
  { name: 'Mike Zinzer', title: 'General Manager', text: 'His enthusiasm and zest for life are special...magnetic. People are drawn to him and it’s effortless.', relationship: 'Friend', headshot: 'Mike_Z' },
  { name: 'Helen Theodosiou', title: 'Owner', text: 'The best part is always the laughter, the kind that is physical, that leaves us bent over, breathless, loud, reminding you why life is good.', relationship: 'Friend', headshot: 'Helen_T' },
  { name: 'Richard Ilnycki', title: 'Advisor', text: 'You’re one of the most interesting people I’ve ever met. I love your direct, inquisitive nature and how you’re always looking to move forward.', relationship: 'Friend', headshot: 'Rick_I' },
  { name: 'Ryan MacEwing', title: 'Senior Sales Executive', text: 'Small pieces of advice can go a long way, and Jeff has dropped a few that have been useful, and he doesn’t even know it.', relationship: 'Friend', headshot: 'Ryan_M' },
]

const FILTERS = ['All', 'Executive', 'Peer', 'Direct Report', 'Customer'] as const
type Filter = (typeof FILTERS)[number]

// Per-relationship dot colour — calm, on-palette. Matches the design preview.
const RELATIONSHIP_DOT: Record<Relationship | 'Customer', string> = {
  Executive: 'bg-[#2D6A4F]',
  Peer: 'bg-[#526D82]',
  'Direct Report': 'bg-[#A8845A]',
  Friend: 'bg-[#785A8C]',
  Customer: 'bg-[#5B7553]',
}

// Quotes longer than this truncate at the previous word boundary with an
// inline "Read more" toggle. No modal.
const TRUNCATE = 75

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

function Avatar({ name, headshot }: { name: string; headshot?: string }) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(headshot) && !failed

  return (
    <div
      aria-label={name}
      className="flex-none w-12 h-12 rounded-full overflow-hidden bg-[#E8E1CF] text-[color:var(--color-text-primary)] font-body font-semibold text-[14px] tracking-[0.02em] flex items-center justify-center select-none"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/headshots/${headshot}.jpeg`}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden>{getInitials(name)}</span>
      )}
    </div>
  )
}

function CategoryPill({ rel }: { rel: Relationship }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface border border-[color:var(--color-border)] font-mono text-[10px] tracking-[0.1em] uppercase text-[color:var(--color-text-muted)] px-2.5 pt-1 pb-[3px]">
      <span aria-hidden className={'w-1.5 h-1.5 rounded-full ' + RELATIONSHIP_DOT[rel]} />
      {rel}
    </span>
  )
}

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: Filter
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'inline-flex items-center gap-2 rounded-full border font-mono text-[11px] tracking-[0.1em] uppercase px-3 pt-2 pb-[7px] transition-colors ' +
        (active
          ? 'bg-[color:var(--color-text-primary)] text-bg border-[color:var(--color-text-primary)]'
          : 'bg-surface text-[color:var(--color-text-primary)] border-[color:var(--color-border)] hover:bg-bg')
      }
    >
      {label !== 'All' && (
        <span
          aria-hidden
          className={
            'w-[7px] h-[7px] rounded-full ' +
            (active ? 'bg-bg' : RELATIONSHIP_DOT[label as Exclude<Filter, 'All'>])
          }
        />
      )}
      <span>{label}</span>
      <span className="opacity-60 tabular-nums text-[10px]">{count}</span>
    </button>
  )
}

function Quote({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const long = text.length > TRUNCATE

  let head = text
  if (long && !expanded) {
    head = text.slice(0, TRUNCATE)
    const lastSpace = head.lastIndexOf(' ')
    if (lastSpace > 40) head = head.slice(0, lastSpace)
    head = head.replace(/[,.;:!?\-—…]+$/, '')
  }

  return (
    <p className="font-body text-[14.5px] leading-[1.55] text-[color:var(--color-text-primary)] m-0 text-pretty">
      &ldquo;{long && !expanded ? `${head}…` : text}&rdquo;
      {long && (
        <>
          {' '}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline align-baseline bg-transparent border-0 p-0 font-mono text-[10px] tracking-[0.06em] uppercase text-accent border-b border-accent/40 cursor-pointer leading-tight"
          >
            {expanded ? 'Read less' : 'Read more'}
          </button>
        </>
      )}
    </p>
  )
}

function Card({ q }: { q: Testimonial }) {
  return (
    <article className="bg-surface border border-[color:var(--color-border)] rounded-xl p-5 flex flex-col gap-3.5 shadow-[0_2px_14px_rgba(24,32,41,0.04)]">
      <Avatar name={q.name} headshot={q.headshot} />

      <div>
        <CategoryPill rel={q.relationship} />
      </div>

      <Quote text={q.text} />

      <div className="flex-1" />

      <div className="pt-3 border-t border-[color:var(--color-border)]">
        <div className="font-body font-bold text-[14px] tracking-[-0.005em] text-[color:var(--color-text-primary)]">
          {q.name}
        </div>
        {q.title && (
          <div className="font-mono text-[10.5px] tracking-[0.04em] uppercase text-[color:var(--color-text-dim)] mt-0.5">
            {q.title}
          </div>
        )}
      </div>
    </article>
  )
}

export function SectionTestimonials() {
  const [active, setActive] = useState<Filter>('All')
  const [showAll, setShowAll] = useState(false)

  const setFilterAndReset = (f: Filter) => {
    setActive(f)
    setShowAll(false)
  }

  const counts: Record<Filter, number> = {
    All: TESTIMONIALS.length,
    Executive: 0,
    Peer: 0,
    'Direct Report': 0,
    Customer: 0,
  }
  for (const q of TESTIMONIALS) {
    if (q.relationship !== 'Friend') counts[q.relationship]++
  }

  const visible =
    active === 'All'
      ? TESTIMONIALS
      : TESTIMONIALS.filter((q) => (q.relationship as string) === active)

  // Mobile shows 3 full cards + peek of card 4; md+ shows 2 full rows + peek of row 3.
  const MOBILE_LIMIT = 3
  const DESKTOP_LIMIT = 6
  const showMobileButton = !showAll && visible.length > MOBILE_LIMIT
  const showDesktopButton = !showAll && visible.length > DESKTOP_LIMIT

  return (
    <section id="testimonials" className="py-16 px-6 md:px-12">
      <div className="max-w-[1100px] mx-auto">
        {/* Headline */}
        <h2 className="font-display text-[clamp(30px,4vw,52px)] font-normal leading-[1.08] tracking-[-0.02em] text-[color:var(--color-text-primary)] mb-4 text-balance max-w-[22ch]">
          Testimonials
        </h2>

        {/* Lede */}
        <p className="font-display text-[clamp(18px,1.8vw,22px)] leading-[1.55] text-[color:var(--color-text-muted)] max-w-[56ch] mb-10 text-pretty">
          A collection of thoughts from the people who&rsquo;ve helped me, and who I&rsquo;ve helped throughout my career and life.
        </p>

        {/* Filter row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Filter testimonials by relationship"
          >
            {FILTERS.map((f) => (
              <FilterPill
                key={f}
                label={f}
                count={counts[f]}
                active={active === f}
                onClick={() => setFilterAndReset(f)}
              />
            ))}
          </div>
          <div
            className="font-mono text-[11px] tracking-[0.12em] uppercase text-[color:var(--color-text-dim)]"
            aria-live="polite"
          >
            Showing {visible.length} of {TESTIMONIALS.length}
          </div>
        </div>

        {/* Grid — collapsed state clips to first rows + peek via grid-template-rows */}
        {visible.length > 0 ? (
          <>
            <div className="relative">
              <div
                className={[
                  'grid grid-cols-1 md:grid-cols-3 gap-6',
                  !showAll && 'max-h-[60vh] overflow-y-auto',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {visible.map((q, i) => (
                  <Card key={`${active}-${q.name}-${i}`} q={q} />
                ))}
              </div>

              {!showAll && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg via-bg/85 to-transparent"
                />
              )}
            </div>

            {/* Show all / Show less controls */}
            {showMobileButton && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="md:hidden mt-6 w-full flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl bg-accent text-bg font-body text-sm font-semibold border border-accent active:scale-[0.98] transition-transform"
              >
                Show more
              </button>
            )}

            {showDesktopButton && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="hidden md:flex mt-6 mx-auto items-center justify-center gap-2.5 px-6 py-3 rounded-xl bg-accent text-bg font-body text-sm font-semibold border border-accent hover:bg-[color:var(--color-accent-hover)] transition-colors"
              >
                Show more
              </button>
            )}

            {showAll && (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="mt-6 mx-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-[color:var(--color-border)] text-[color:var(--color-text-muted)] font-body text-[13px] font-medium hover:border-[color:var(--color-border-hover)] hover:text-[color:var(--color-text-primary)] transition-colors"
              >
                Show less
                <ChevronUp size={14} strokeWidth={1.8} />
              </button>
            )}
          </>
        ) : (
          <div className="p-9 text-center bg-surface border border-dashed border-[color:var(--color-border)] rounded-xl font-mono text-[11px] tracking-[0.08em] uppercase text-[color:var(--color-text-dim)]">
            No references in this group yet.
          </div>
        )}
      </div>
    </section>
  )
}
