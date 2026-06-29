'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronUp, GraduationCap } from 'lucide-react'

type FilterId = 'all' | 'roles' | 'education'

type RoleCard = {
  kind: 'role'
  id: string
  logo: string
  year: string
  tagline: string
  metric: string
  metricLabel?: string
  title?: string
  outcome: string
  story: string
  context: string
  impact: { bold: string; text: string }[]
  quote?: string
  quoteAuthor?: string
}

type EducationCard = {
  kind: 'education'
  id: string
  logo: string | string[]
  year: string
  program: string
  focus: string
  coursework?: string
}

type Card = RoleCard | EducationCard

const CARDS: Card[] = [
  {
    kind: 'role',
    id: 'trapeze',
    logo: '/sage/jefflougheed/logos/Trapeze.svg',
    year: '1998–2013',
    tagline: 'Struggling Provider → Trusted Partner',
    metric: '$350K → $25M',
    metricLabel: 'Annual Bookings',
    title: 'Director of Sales & Relationship Management',
    outcome:
      'Led the sales transformation that helped establish Trapeze as industry leader.',
    story:
      'Started part-time as a data analyst working with the executive team, including Constellation Software CEO Mark Leonard, to help build an early CRM and reporting foundation.',
    context:
      'Mission-critical vertical software business serving public transportation agencies across North America, with long sales cycles and complex stakeholder environments.',
    impact: [
      {
        bold: 'Scaled multiple revenue segments.',
        text: 'Led growth across small sector, SMB, enterprise, and partner channels.',
      },
      {
        bold: 'Led commercial integration through acquisition and leadership transitions.',
        text: 'Protecting the pipeline, revenue continuity, and customer relationships.',
      },
      {
        bold: 'Built repeatable commercial systems.',
        text: 'Implemented sales playbooks, onboarding programs, forecasting discipline, and win/loss processes.',
      },
      {
        bold: 'Operator and performer.',
        text: 'Consistently delivered as top individual contributor, top territory leader, top team leader, largest deals, and strongest quarters across roles.',
      },
      {
        bold: 'Built trusted enterprise relationships.',
        text: 'Executive-level customer relationships that positioned Trapeze as long-term strategic partner for more than 70 of the top 200 key accounts.',
      },
    ],
    quote: 'He has proven repeatedly that he can perform in the most trying situations.',
    quoteAuthor: 'Rick Bacchus, President, Trapeze Group North America',
  },
  {
    kind: 'education',
    id: 'york',
    logo: '/sage/jefflougheed/logos/York_University_Logo.svg',
    year: '2011',
    program: "I've always been a strong seller. This taught me to lead sellers.",
    focus:
      'Executive training in sales strategy, leadership, and executive presence. Learned to build revenue systems that make teams better and performance repeatable.',
  },
  {
    kind: 'education',
    id: 'royalroads',
    logo: '/sage/jefflougheed/logos/royalroads_Logo.svg',
    year: '2014–2015',
    program:
      "Most performance problems aren't skill problems. Cognitive coaching taught me to see the difference.",
    focus:
      'ICF-certified executive coaching training focused on developing leaders who think clearly, take ownership, and help teams perform without constant direction.',
  },
  {
    kind: 'role',
    id: 'infor',
    logo: '/sage/jefflougheed/logos/Infor.svg',
    year: '2015–2017',
    tagline: 'Legacy Vendor → Viable Cloud Partner',
    metric: '$1.7M',
    metricLabel: 'CloudSuite HCM Deal',
    title: 'Account Executive, HCM',
    outcome:
      'Built a $2.5M enterprise pipeline and closed a $1.7M CloudSuite HCM deal.',
    story:
      "Joined during Infor's push to expand cloud adoption and modernize its legacy ERP customer base.",
    context:
      'Tier-1 enterprise software environment selling complex HCM transformation deals with long sales cycles, formal procurement, and executive stakeholders.',
    impact: [
      {
        bold: 'Closed the largest CloudSuite HCM deal in company history.',
        text: 'Transformed a narrow payroll evaluation into a full platform transformation across HCM, Payroll, WFM, Talent Science, and Learning.',
      },
      {
        bold: 'Built $2.5M+ qualified pipeline in 18 months.',
        text: 'Established relationships with key enterprise accounts across Canada and competed in multiple RFP processes.',
      },
      {
        bold: 'Expanded cloud adoption into new customer segments.',
        text: 'Drove CloudSuite adoption in the 1,000–5,000 employee segment while competing successfully in large enterprise opportunities.',
      },
    ],
    quote: 'Dog with a bone. Awesome.',
    quoteAuthor:
      'John Parsons, Infor — on closing the largest CloudSuite HCM deal in company history',
  },
  {
    kind: 'education',
    id: 'jhu',
    logo: '/sage/jefflougheed/logos/JohnHopkins_Logo.svg',
    year: '2017',
    program:
      "Understanding ML and AI isn't optional anymore. This is where I built that foundation.",
    focus:
      'Executive training in data science and analytics. Built a practical understanding of machine learning and how to guide product and operational decisions with data.',
  },
  {
    kind: 'role',
    id: 'keyhole',
    logo: '/sage/jefflougheed/logos/Keyhole.svg',
    year: '2017–2018',
    tagline: 'Self Service → Multi-Motion Revenue',
    metric: '3×',
    metricLabel: 'Deal Size',
    title: 'VP, Revenue',
    outcome: 'Transitioned the revenue model from PLG to inbound and enterprise.',
    story:
      'Recruited by the CEO to rebuild revenue, grow deal size, and expand growth channels; owned hiring and growth spend.',
    context:
      'Product-led SaaS company with strong self-serve adoption but limited enterprise motion and no structured demand generation.',
    impact: [
      {
        bold: 'Built a multi-motion revenue engine.',
        text: 'Added inbound, enterprise, and structured demand generation to complement PLG growth.',
      },
      {
        bold: 'Tripled average deal size.',
        text: 'Introduced qualification discipline, annual contracts, and enterprise sales structure.',
      },
      {
        bold: 'Expanded revenue ownership beyond sales.',
        text: 'Added customer success, demand generation, and pipeline development capabilities.',
      },
      {
        bold: 'Connected customer insights directly to product and GTM decisions.',
        text: 'Partnered with the CEO to close the loop between customer feedback, product direction, and execution.',
      },
    ],
    quote:
      'Your question-based coaching had a huge impact on helping me think more creatively in the face of problems that seem unapproachable.',
    quoteAuthor: 'Iara Rios, Keyhole',
  },
  {
    kind: 'role',
    id: 'mealgarden',
    logo: '/sage/jefflougheed/logos/MealGarden.svg',
    year: '2019–2025',
    tagline: 'Stalled Product → Real Business',
    metric: '9×',
    metricLabel: 'ARR Growth',
    title: 'Head of Revenue, Product & Operations',
    outcome:
      'Full P&L ownership across product, revenue, and operations. Turned a promising product into a real business.',
    story:
      'Recruited by the Founder to operationalize the business, establish P&L discipline, and build the leadership and commercial foundation for scale.',
    context:
      'High-potential product with strong market fit but limited commercial structure and no integrated product-to-revenue operating model.',
    impact: [
      {
        bold: 'Introduced operating infrastructure from the ground up.',
        text: 'Financial discipline, budget ownership, and performance cadence across revenue, product, and operations.',
      },
      {
        bold: 'Built enterprise and institutional partnerships.',
        text: 'Signed HEB, Nutrigenomix, and Metabolic Balance as white-label and teams channel partners.',
      },
      {
        bold: 'Created demand generation from scratch.',
        text: 'Hired and structured a team that grew web traffic by triple digits.',
      },
      {
        bold: 'Sustained strong conversion performance.',
        text: 'Maintained >18% trial-to-conversion through improved qualification, onboarding, and customer success.',
      },
    ],
    quote: 'Jeff has been instrumental in moving Meal Garden forward.',
    quoteAuthor: 'Vlad Chernenko, Founder, Meal Garden',
  },
  {
    kind: 'education',
    id: 'product-ai',
    logo: [
      '/sage/jefflougheed/logos/DesignLab_Logo.svg',
      '/sage/jefflougheed/logos/IDF_Logo.svg',
      '/sage/jefflougheed/logos/deeplearningai.svg',
    ],
    year: '2023–2025',
    program: 'Product, UX & Applied AI',
    focus:
      'Invested to build the judgment to lead at the intersection of commercial outcomes and product execution.',
    coursework:
      'UX Foundations · Design Thinking · Technical Product Management · AI for Everyone · Building SaaS Products with AI · Structured Decision Making',
  },
]

const ROLE_COUNT = CARDS.filter((c) => c.kind === 'role').length
const EDU_COUNT = CARDS.filter((c) => c.kind === 'education').length

export function SectionCareer() {
  const [filter, setFilter] = useState<FilterId>('all')
  const [modalRoleId, setModalRoleId] = useState<string | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const visible = CARDS.filter((c) => {
    if (filter === 'roles') return c.kind === 'role'
    if (filter === 'education') return c.kind === 'education'
    return true
  })

  const openModal = (id: string) => {
    setModalRoleId(id)
    requestAnimationFrame(() => setModalVisible(true))
  }

  const closeModal = () => {
    setModalVisible(false)
    setTimeout(() => setModalRoleId(null), 200)
  }

  useEffect(() => {
    if (modalRoleId !== null) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [modalRoleId])

  const setFilterAndReset = (id: FilterId) => {
    setFilter(id)
    setShowAll(false)
    setModalVisible(false)
    setModalRoleId(null)
  }

  const modalCard =
    modalRoleId !== null
      ? (CARDS.find((c) => c.kind === 'role' && c.id === modalRoleId) as
          | RoleCard
          | undefined)
      : null

  const filters: { id: FilterId; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: ROLE_COUNT + EDU_COUNT },
    { id: 'roles', label: 'Roles', count: ROLE_COUNT },
    { id: 'education', label: 'Education', count: EDU_COUNT },
  ]

  // Mobile shows 2 full cards + peek of card 3; md/lg show 1 row + peek of next.
  // Cards 3 (mobile) / row 2 (md/lg) are clipped to a peek; the rest collapse to
  // grid-auto-rows: 0. Show-all expansion removes the row template entirely.
  const MOBILE_LIMIT = 2
  const DESKTOP_LIMIT = 3
  const showMobileButton = !showAll && visible.length > MOBILE_LIMIT
  const showDesktopButton = !showAll && visible.length > DESKTOP_LIMIT

  return (
    <section id="career" className="bg-[color:var(--color-surface)] py-16 px-6 md:px-12">
      <div className="max-w-[1100px] mx-auto">
        {/* Headline */}
        <h2 className="font-display text-[clamp(30px,4vw,52px)] font-normal leading-[1.08] tracking-[-0.02em] text-[color:var(--color-text-primary)] mb-4 text-balance max-w-[22ch]">
          Career Highlights
        </h2>

        {/* Lede */}
        <p className="font-display text-[clamp(18px,1.8vw,22px)] leading-[1.55] text-[color:var(--color-text-muted)] max-w-[56ch] mb-10 md:mb-14 text-pretty">
          Strong outcomes across diverse businesses.
        </p>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-7 md:mb-10 pb-5 border-b border-[color:var(--color-border)]">
          <div
            className="flex gap-2 overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0 md:overflow-visible md:flex-wrap"
            role="tablist"
            aria-label="Filter career cards"
          >
            {filters.map((f) => {
              const active = filter === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilterAndReset(f.id)}
                  className={[
                    'flex-shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-full border font-body text-[13px] font-medium transition-colors whitespace-nowrap',
                    active
                      ? 'bg-accent border-accent text-bg'
                      : 'bg-transparent border-[color:var(--color-border)] text-[color:var(--color-text-muted)] hover:border-[color:var(--color-border-hover)] hover:text-[color:var(--color-text-primary)]',
                  ].join(' ')}
                >
                  {f.label}
                  <span
                    className={[
                      'font-mono text-[10px] tracking-[0.06em] font-semibold',
                      active ? 'text-bg/70' : 'text-[color:var(--color-text-dim)]',
                    ].join(' ')}
                  >
                    {f.count.toString().padStart(2, '0')}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="hidden md:block font-mono text-[11px] tracking-[0.16em] uppercase text-[color:var(--color-text-dim)]">
            Showing {visible.length.toString().padStart(2, '0')} of{' '}
            {(ROLE_COUNT + EDU_COUNT).toString().padStart(2, '0')}
          </div>
        </div>

        {/* Grid — collapsed state clips to first row + peek via grid-template-rows */}
        <div className="relative">
          <div
            className={[
              'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6',
              !showAll && 'max-h-[60vh] overflow-y-auto',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {visible.map((card) => (
              <div key={card.id}>
                {card.kind === 'role' ? (
                  <RoleCardView card={card} onOpen={() => openModal(card.id)} />
                ) : (
                  <EducationCardView card={card} />
                )}
              </div>
            ))}
          </div>

          {!showAll && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[color:var(--color-surface)] via-[color:var(--color-surface)]/90 to-transparent"
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
      </div>

      {modalCard &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            onClick={closeModal}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              opacity: modalVisible ? 1 : 0,
              transition: 'opacity 0.2s ease',
              padding: '20px',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'rgb(245 244 240)',
                borderRadius: '16px',
                maxWidth: '640px',
                width: '100%',
                maxHeight: '80vh',
                overflow: 'auto',
                boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
                padding: 'clamp(24px, 4vw, 40px)',
                position: 'relative',
              }}
            >
              {/* Modal header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '24px',
                }}
              >
                <img
                  src={modalCard.logo}
                  alt="Company logo"
                  style={{ height: '40px', width: 'auto' }}
                />
                <button
                  onClick={closeModal}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: 'rgb(24 32 41 / 0.70)',
                  }}
                  aria-label="Close modal"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal content */}
              <div
                style={{
                  borderTop: '1px solid rgb(24 32 41 / 0.10)',
                  paddingTop: '24px',
                }}
              >
                {modalCard.id === 'trapeze' ? (
                  <>
                    {/* Trapeze custom expanded content */}

                    {/* Quote block */}
                    <div
                      style={{
                        borderLeft: '2px solid #2d6a4f',
                        paddingLeft: '16px',
                        marginBottom: '24px',
                      }}
                    >
                      <p
                        style={{
                          fontFamily: 'DM Sans, sans-serif',
                          fontSize: '16px',
                          lineHeight: 1.7,
                          color: 'rgb(24 32 41)',
                          fontStyle: 'italic',
                          margin: 0,
                        }}
                      >
                        &ldquo;He has proven repeatedly that he can perform in the most trying situations.&rdquo;
                      </p>
                      <p
                        style={{
                          fontFamily: 'DM Sans, sans-serif',
                          fontSize: '14px',
                          color: 'rgb(24 32 41 / 0.70)',
                          margin: '8px 0 0 0',
                        }}
                      >
                        — Rick Bacchus, President, Trapeze Group North America
                      </p>
                    </div>

                    {/* Progression summary */}
                    <p
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: '14px',
                        lineHeight: 1.7,
                        color: 'rgb(24 32 41)',
                        marginBottom: '24px',
                      }}
                    >
                      Progressed from Special Projects to Director of Sales & Relationship Management, ultimately responsible for more than 50% of annual bookings in North America.
                    </p>

                    {/* Where It Started */}
                    <div
                      style={{
                        fontFamily: 'DM Mono, monospace',
                        fontSize: '16px',
                        fontWeight: 500,
                        color: 'rgb(24 32 41 / 0.70)',
                        marginBottom: '12px',
                      }}
                    >
                      Where It Started
                    </div>
                    <p
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: '14px',
                        lineHeight: 1.7,
                        color: 'rgb(24 32 41)',
                        marginBottom: '16px',
                      }}
                    >
                      Started part-time in Special Projects, supporting the executive team, reporting to the VP of Business Development (co-founder).
                    </p>
                    <p
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: '14px',
                        lineHeight: 1.7,
                        color: 'rgb(24 32 41)',
                        marginBottom: '16px',
                      }}
                    >
                      Built early CRM and pipeline discipline, supported executive decisions, and saw firsthand how Constellation operators run software businesses.
                    </p>
                    <p
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: '14px',
                        lineHeight: 1.7,
                        color: 'rgb(24 32 41)',
                        marginBottom: '0',
                      }}
                    >
                      This is where I learned that great companies are built on discipline, focus, and consistent execution over time.
                    </p>

                    {/* The Business */}
                    <div
                      style={{
                        fontFamily: 'DM Mono, monospace',
                        fontSize: '16px',
                        fontWeight: 500,
                        color: 'rgb(24 32 41 / 0.70)',
                        marginTop: '24px',
                        marginBottom: '12px',
                      }}
                    >
                      The Business
                    </div>
                    <p
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: '14px',
                        lineHeight: 1.7,
                        color: 'rgb(24 32 41)',
                        marginBottom: '16px',
                      }}
                    >
                      Mission-critical system-of-record technology supporting public transportation agencies across North America, spanning onboard systems, wireless infrastructure, hardware, and software.
                    </p>
                    <p
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: '14px',
                        lineHeight: 1.7,
                        color: 'rgb(24 32 41)',
                        marginBottom: '0',
                      }}
                    >
                      Long sales cycles, complex stakeholders, and high switching costs, where costs, trust, execution, and consistency determine who wins.
                    </p>

                    {/* Impact */}
                    <div
                      style={{
                        fontFamily: 'DM Mono, monospace',
                        fontSize: '16px',
                        fontWeight: 500,
                        color: 'rgb(24 32 41 / 0.70)',
                        marginTop: '24px',
                        marginBottom: '12px',
                      }}
                    >
                      Impact
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {[
                        { bold: 'Scaled multiple revenue segments.', text: 'Led growth across small sector, SMB, enterprise, and partner channels.' },
                        { bold: 'Led commercial integration through acquisition and leadership transitions.', text: 'Protecting the pipeline, revenue continuity, and customer relationships.' },
                        { bold: 'Built repeatable commercial systems.', text: 'Implemented sales playbooks, onboarding programs, forecasting discipline, and win/loss processes.' },
                        { bold: 'Operator and performer.', text: 'Consistently delivered as top individual contributor, top territory leader, top team leader, largest deals, and strongest quarters across roles.' },
                        { bold: 'Built trusted enterprise relationships.', text: 'Developed executive-level customer relationships that positioned Trapeze as a long-term strategic partner for more than 70 of the top 200 key accounts.' },
                      ].map((item, idx, arr) => (
                        <li
                          key={idx}
                          style={{
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: '14px',
                            lineHeight: 1.7,
                            paddingLeft: '20px',
                            position: 'relative',
                            marginBottom: idx < arr.length - 1 ? '16px' : '0',
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              left: 0,
                              color: '#2d6a4f',
                              fontWeight: 600,
                            }}
                          >
                            ·
                          </span>
                          <span style={{ fontWeight: 700, color: 'rgb(24 32 41)' }}>
                            {item.bold}
                          </span>
                          <br />
                          <span style={{ color: 'rgb(24 32 41 / 0.70)' }}>{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : modalCard.id === 'infor' ? (
                  <>
                    {/* Infor custom expanded content */}

                    {/* Quote block */}
                    <div
                      style={{
                        borderLeft: '2px solid #2d6a4f',
                        paddingLeft: '16px',
                        marginBottom: '24px',
                      }}
                    >
                      <p
                        style={{
                          fontFamily: 'DM Sans, sans-serif',
                          fontSize: '16px',
                          lineHeight: 1.7,
                          color: 'rgb(24 32 41)',
                          fontStyle: 'italic',
                          margin: 0,
                        }}
                      >
                        &ldquo;Despite early doubts, Jeff stayed with the opportunity, expanded the scope, and ultimately won a $1.75M CloudSuite deal in a highly competitive process. Real conviction and persistence.&rdquo;
                      </p>
                      <p
                        style={{
                          fontFamily: 'DM Sans, sans-serif',
                          fontSize: '14px',
                          color: 'rgb(24 32 41 / 0.70)',
                          margin: '8px 0 0 0',
                        }}
                      >
                        — John Parsons, RVP Sales, Infor
                      </p>
                    </div>

                    {/* Why Infor */}
                    <div
                      style={{
                        fontFamily: 'DM Mono, monospace',
                        fontSize: '16px',
                        fontWeight: 500,
                        color: 'rgb(24 32 41 / 0.70)',
                        marginBottom: '12px',
                      }}
                    >
                      Why Infor
                    </div>
                    <p
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: '14px',
                        lineHeight: 1.7,
                        color: 'rgb(24 32 41)',
                        marginBottom: '0',
                      }}
                    >
                      Joined during Infor&apos;s transition from legacy ERP provider to cloud platform. Expanded CloudSuite adoption into both enterprise and mid-market organizations while building credibility in a highly structured Tier-1 sales environment.
                    </p>

                    {/* The Business */}
                    <div
                      style={{
                        fontFamily: 'DM Mono, monospace',
                        fontSize: '16px',
                        fontWeight: 500,
                        color: 'rgb(24 32 41 / 0.70)',
                        marginTop: '24px',
                        marginBottom: '12px',
                      }}
                    >
                      The Business
                    </div>
                    <p
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: '14px',
                        lineHeight: 1.7,
                        color: 'rgb(24 32 41)',
                        marginBottom: '0',
                      }}
                    >
                      Global vertical software provider transitioning to a cloud-first strategy. Led CloudSuite HCM growth in Canada. Introduced Talent Science as a strategic differentiator in complex enterprise sales.
                    </p>

                    {/* Impact */}
                    <div
                      style={{
                        fontFamily: 'DM Mono, monospace',
                        fontSize: '16px',
                        fontWeight: 500,
                        color: 'rgb(24 32 41 / 0.70)',
                        marginTop: '24px',
                        marginBottom: '12px',
                      }}
                    >
                      Impact
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {[
                        { bold: 'Built a $2.5M+ qualified pipeline in under 18 months.', text: 'Established and developed relationships with key enterprise accounts across Canada, engaging in multiple competitive RFP processes.' },
                        { bold: 'Expanded cloud adoption into new customer segments.', text: 'Drove CloudSuite adoption in the 1,000–5,000 employee segment while also competing successfully in large enterprise opportunities.' },
                        { bold: 'Closed the largest CloudSuite HCM deal in company history.', text: 'Transformed a narrow payroll evaluation into a full platform transformation — ~10,000 employees across HCM, Payroll, WFM, Talent Science, and Learning. Beat Dayforce in a head-to-head evaluation through persistence, preparation, and differentiated positioning.' },
                      ].map((item, idx, arr) => (
                        <li
                          key={idx}
                          style={{
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: '14px',
                            lineHeight: 1.7,
                            paddingLeft: '20px',
                            position: 'relative',
                            marginBottom: idx < arr.length - 1 ? '16px' : '0',
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              left: 0,
                              color: '#2d6a4f',
                              fontWeight: 600,
                            }}
                          >
                            ·
                          </span>
                          <span style={{ fontWeight: 700, color: 'rgb(24 32 41)' }}>
                            {item.bold}
                          </span>
                          <br />
                          <span style={{ color: 'rgb(24 32 41 / 0.70)' }}>{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : modalCard.id === 'keyhole' ? (
                  <>
                    {/* Keyhole custom expanded content */}

                    {/* Quote block */}
                    <div
                      style={{
                        borderLeft: '2px solid #2d6a4f',
                        paddingLeft: '16px',
                        marginBottom: '24px',
                      }}
                    >
                      <p
                        style={{
                          fontFamily: 'DM Sans, sans-serif',
                          fontSize: '16px',
                          lineHeight: 1.7,
                          color: 'rgb(24 32 41)',
                          fontStyle: 'italic',
                          margin: 0,
                        }}
                      >
                        &ldquo;Your question-based coaching had a huge impact on helping me think more creatively in the face of problems that seem unapproachable.&rdquo;
                      </p>
                      <p
                        style={{
                          fontFamily: 'DM Sans, sans-serif',
                          fontSize: '14px',
                          color: 'rgb(24 32 41 / 0.70)',
                          margin: '8px 0 0 0',
                        }}
                      >
                        — Iara Rios, Manager, Content Marketing, Keyhole
                      </p>
                    </div>

                    {/* The Mandate */}
                    <div
                      style={{
                        fontFamily: 'DM Mono, monospace',
                        fontSize: '16px',
                        fontWeight: 500,
                        color: 'rgb(24 32 41 / 0.70)',
                        marginBottom: '12px',
                      }}
                    >
                      The Mandate
                    </div>
                    <p
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: '14px',
                        lineHeight: 1.7,
                        color: 'rgb(24 32 41)',
                        marginBottom: '0',
                      }}
                    >
                      Recruited by the CEO to rebuild revenue, increase deal size, and expand growth channels. Owned hiring, revenue structure, and growth investment decisions.
                    </p>

                    {/* The Business */}
                    <div
                      style={{
                        fontFamily: 'DM Mono, monospace',
                        fontSize: '16px',
                        fontWeight: 500,
                        color: 'rgb(24 32 41 / 0.70)',
                        marginTop: '24px',
                        marginBottom: '12px',
                      }}
                    >
                      The Business
                    </div>
                    <p
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: '14px',
                        lineHeight: 1.7,
                        color: 'rgb(24 32 41)',
                        marginBottom: '0',
                      }}
                    >
                      Product-led SaaS company providing social listening and analytics tools. Strong self-serve adoption but limited enterprise motion, fragmented demand generation, and no structured revenue architecture.
                    </p>

                    {/* Impact */}
                    <div
                      style={{
                        fontFamily: 'DM Mono, monospace',
                        fontSize: '16px',
                        fontWeight: 500,
                        color: 'rgb(24 32 41 / 0.70)',
                        marginTop: '24px',
                        marginBottom: '12px',
                      }}
                    >
                      Impact
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {[
                        { bold: 'Built a multi-motion revenue engine.', text: 'Added inbound, enterprise, and structured demand generation to complement PLG growth.' },
                        { bold: 'Tripled average deal size.', text: 'Introduced qualification discipline, annual contracts, and enterprise sales structure.' },
                        { bold: 'Expanded revenue ownership beyond sales.', text: 'Added customer success, demand generation, and pipeline development capabilities.' },
                        { bold: 'Built commercial operating structure.', text: 'Introduced hiring plans, performance management, forecasting, and growth investment discipline.' },
                        { bold: 'Connected customer insights directly to product and GTM decisions.', text: 'Partnered with the CEO to close the loop between customer feedback, product direction, and go-to-market execution.' },
                      ].map((item, idx, arr) => (
                        <li
                          key={idx}
                          style={{
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: '14px',
                            lineHeight: 1.7,
                            paddingLeft: '20px',
                            position: 'relative',
                            marginBottom: idx < arr.length - 1 ? '16px' : '0',
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              left: 0,
                              color: '#2d6a4f',
                              fontWeight: 600,
                            }}
                          >
                            ·
                          </span>
                          <span style={{ fontWeight: 700, color: 'rgb(24 32 41)' }}>
                            {item.bold}
                          </span>
                          <br />
                          <span style={{ color: 'rgb(24 32 41 / 0.70)' }}>{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : modalCard.id === 'mealgarden' ? (
                  <>
                    {/* Meal Garden custom expanded content */}

                    {/* Quote block */}
                    <div
                      style={{
                        borderLeft: '2px solid #2d6a4f',
                        paddingLeft: '16px',
                        marginBottom: '24px',
                      }}
                    >
                      <p
                        style={{
                          fontFamily: 'DM Sans, sans-serif',
                          fontSize: '16px',
                          lineHeight: 1.7,
                          color: 'rgb(24 32 41)',
                          fontStyle: 'italic',
                          margin: 0,
                        }}
                      >
                        &ldquo;Jeff gave me the confidence to get out there and make it happen — whether that meant making a phone call, trying an out-of-the-box idea, or asking for help.&rdquo;
                      </p>
                      <p
                        style={{
                          fontFamily: 'DM Sans, sans-serif',
                          fontSize: '14px',
                          color: 'rgb(24 32 41 / 0.70)',
                          margin: '8px 0 0 0',
                        }}
                      >
                        — Kiki, Demand Generation Lead, Meal Garden
                      </p>
                    </div>

                    {/* The Mandate */}
                    <div
                      style={{
                        fontFamily: 'DM Mono, monospace',
                        fontSize: '16px',
                        fontWeight: 500,
                        color: 'rgb(24 32 41 / 0.70)',
                        marginBottom: '12px',
                      }}
                    >
                      The Mandate
                    </div>
                    <p
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: '14px',
                        lineHeight: 1.7,
                        color: 'rgb(24 32 41)',
                        marginBottom: '0',
                      }}
                    >
                      Recruited by the Founder to operationalize the business, introduce P&L discipline, and build the leadership and commercial foundation required to turn early traction into a sustainable company.
                    </p>

                    {/* The Business */}
                    <div
                      style={{
                        fontFamily: 'DM Mono, monospace',
                        fontSize: '16px',
                        fontWeight: 500,
                        color: 'rgb(24 32 41 / 0.70)',
                        marginTop: '24px',
                        marginBottom: '12px',
                      }}
                    >
                      The Business
                    </div>
                    <p
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: '14px',
                        lineHeight: 1.7,
                        color: 'rgb(24 32 41)',
                        marginBottom: '0',
                      }}
                    >
                      Consumer and B2B SaaS platform helping individuals, dietitians, and food businesses manage nutrition and meal planning. Early product-market fit but a small, high-churn user base, no operating infrastructure, commercial discipline, or path to sustainable unit economics.
                    </p>

                    {/* Impact */}
                    <div
                      style={{
                        fontFamily: 'DM Mono, monospace',
                        fontSize: '16px',
                        fontWeight: 500,
                        color: 'rgb(24 32 41 / 0.70)',
                        marginTop: '24px',
                        marginBottom: '12px',
                      }}
                    >
                      Impact
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {[
                        { bold: 'Introduced operating infrastructure from the ground up.', text: 'Introduced financial discipline, budget ownership, and performance cadence across revenue, product, and operations.' },
                        { bold: 'Built enterprise and institutional partnerships.', text: 'Signed HEB (one of the largest grocery chains in the US), Nutrigenomix, and Metabolic Balance as white-label and teams channel partners.' },
                        { bold: 'Created demand generation from scratch.', text: 'Hired and structured a team to drive awareness and trials, growing web traffic by triple digits.' },
                        { bold: 'Expanded into new revenue channels.', text: 'Added teams, education, and platform partner motions — increasing deal size and shifting the base toward annual agreements.' },
                        { bold: 'Spearheaded core product enhancements.', text: 'Drove delivery of payments, mobile, meal plan auto-generation, and enhanced food data — closing critical gaps for enterprise and practitioner use cases.' },
                        { bold: 'Sustained strong conversion performance.', text: 'Maintained >18% trial-to-conversion through improved qualification, onboarding, and customer success.' },
                      ].map((item, idx, arr) => (
                        <li
                          key={idx}
                          style={{
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: '14px',
                            lineHeight: 1.7,
                            paddingLeft: '20px',
                            position: 'relative',
                            marginBottom: idx < arr.length - 1 ? '16px' : '0',
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              left: 0,
                              color: '#2d6a4f',
                              fontWeight: 600,
                            }}
                          >
                            ·
                          </span>
                          <span style={{ fontWeight: 700, color: 'rgb(24 32 41)' }}>
                            {item.bold}
                          </span>
                          <br />
                          <span style={{ color: 'rgb(24 32 41 / 0.70)' }}>{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  )
}

/* ─────────────────────────────────────────────────────────── */
/*  Role card                                                  */
/* ─────────────────────────────────────────────────────────── */

function RoleCardView({
  card,
  onOpen,
}: {
  card: RoleCard
  onOpen: () => void
}) {
  const longMetric = card.metric.length > 8
  return (
    <article className="bone-card relative flex flex-col h-full bg-[rgb(245_244_240)] border border-[color:var(--color-border)] rounded-2xl p-6 md:p-7 transition-shadow hover:shadow-[0_12px_32px_rgba(26,25,23,0.08)]">
      <span className="absolute top-5 right-5 font-mono text-[10.5px] tracking-[0.16em] text-[color:var(--color-text-dim)]">
        {card.year}
      </span>

      <div className="mb-5 h-9 flex items-center">
        <img src={card.logo} alt="" className="h-7 md:h-8 w-auto" />
      </div>

      <p className="font-mono text-[13px] font-semibold text-accent leading-snug mb-4">
        {card.tagline}
      </p>

      <div
        className={[
          'font-display font-normal text-[color:var(--color-text-primary)] leading-[1.1] mb-1',
          longMetric ? 'text-3xl' : 'text-[44px]',
        ].join(' ')}
      >
        {card.metric}
      </div>
      {card.metricLabel && (
        <div className="font-body text-xs text-[color:var(--color-text-dim)] mb-4">
          {card.metricLabel}
        </div>
      )}

      {card.title && (
        <p className="font-body text-[12.5px] text-[color:var(--color-text-dim)] mb-3">
          {card.title}
        </p>
      )}

      <p className="font-body text-sm leading-relaxed text-[color:var(--color-text-muted)] text-pretty mb-4">
        {card.outcome}
      </p>

      <button
        onClick={onOpen}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'rgb(var(--color-accent))',
          fontFamily: 'var(--font-sans)',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 0',
          marginTop: 'auto',
          transition: 'opacity 0.2s ease',
          alignSelf: 'flex-start',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.7'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1'
        }}
      >
        See more
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6L8 10L12 6" />
        </svg>
      </button>
    </article>
  )
}

/* ─────────────────────────────────────────────────────────── */
/*  Education card                                             */
/* ─────────────────────────────────────────────────────────── */

function EducationCardView({ card }: { card: EducationCard }) {
  return (
    <article className="bone-card relative flex flex-col h-full bg-[rgb(245_244_240)] border border-[color:var(--color-border)] rounded-2xl p-6 md:p-7 pb-10">
      <GraduationCap
        size={14}
        strokeWidth={1.6}
        aria-hidden
        className="absolute top-5 left-6 text-[color:var(--color-text-dim)]"
      />

      <span className="absolute top-5 right-5 font-mono text-[10.5px] tracking-[0.16em] text-[color:var(--color-text-dim)]">
        {card.year}
      </span>

      <div className="mb-5 h-9 flex items-center">
        {Array.isArray(card.logo) ? (
          <div className="flex items-center gap-3.5 flex-wrap">
            {card.logo.map((src, i) => (
              <img key={i} src={src} alt="" className="h-6 w-auto max-w-[80px]" />
            ))}
          </div>
        ) : (
          <img src={card.logo} alt="" className="h-8 w-auto" />
        )}
      </div>

      <p className="font-mono text-[13px] text-accent leading-snug mb-4">
        {card.program}
      </p>

      <p className="font-body text-sm leading-relaxed text-[color:var(--color-text-muted)] text-pretty mb-auto">
        {card.focus}
      </p>

      {card.coursework && (
        <div className="mt-4 pt-4 border-t border-dashed border-[color:var(--color-border)] font-mono text-[10.5px] leading-relaxed text-[color:var(--color-text-dim)]">
          {card.coursework}
        </div>
      )}

      <span className="absolute bottom-4 left-6 font-mono text-[10px] tracking-[0.16em] uppercase text-accent">
        Education
      </span>
    </article>
  )
}
