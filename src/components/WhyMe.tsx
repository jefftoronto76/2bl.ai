'use client'

import { useReveal } from '@/hooks/useReveal'
import { CareerTimeline } from './CareerTimeline'
import { CareerHighlights } from './CareerHighlights'
import { QuoteCarouselSection } from './QuoteCarouselSection'

const STATS = [
  { value: '27', label: 'Years operating' },
  { value: '$25M', label: 'Personal quota scaled' },
  { value: '9×', label: 'ARR growth, Meal Garden' },
  { value: 'ICF', label: 'Coaching methodology' },
]

export function WhyMe() {
  const ref = useReveal()
  const carouselRef = useReveal()
  const closingRef = useReveal()

  const sectionPad = '64px clamp(24px, 5vw, 48px)'
  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: '13.2px',
    letterSpacing: '0.22em', textTransform: 'uppercase',
    color: 'rgba(26,25,23,0.34)', marginBottom: '40px',
    display: 'flex', alignItems: 'center', gap: '16px',
  }
  const bodyStyle: React.CSSProperties = {
    fontSize: 'clamp(16px, 1.8vw, 17px)', lineHeight: 1.8,
    color: 'var(--color-text-muted)', fontWeight: 400, marginBottom: '20px',
  }
  const quoteStyle: React.CSSProperties = {
    borderLeft: '2px solid rgb(var(--color-accent))',
    paddingLeft: '24px', marginTop: '32px',
  }

  return (
    <>
      <section id="why" data-nav-trigger="how-i-operate" style={{ padding: sectionPad, borderBottom: '1px solid rgba(26,25,23,0.08)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <p style={labelStyle}>
            <span style={{
              position: 'relative',
              display: 'inline-block',
              padding: '0 4px',
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Cpath d='M2,14 C20,8 80,6 98,12 C99,16 95,20 80,21 C50,23 15,22 2,18 Z' fill='%232d6a4f' fill-opacity='0.2'/%3E%3C/svg%3E\")",
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
            }}>How I Operate</span>
            <span style={{ flex: 1, height: '1px', background: 'rgba(26,25,23,0.1)', maxWidth: '120px', display: 'block' }} />
          </p>

          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(30px, 4vw, 52px)',
            fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.02em',
            color: 'var(--color-text-primary)', marginBottom: '28px',
          }}>
            Fewer fires. Clearer priorities. <em style={{ fontStyle: 'italic' }}>Progress you can see.</em>
          </h2>
          <div style={{ marginBottom: '40px' }}>
            <p style={{ ...bodyStyle, marginBottom: 0 }}>My goal is to help you navigate the messiness of growth by staying focused on what matters: helping your customers, supporting your team, and choosing progress over perfection.</p>
          </div>

          <div className="nr-split">
            <div ref={ref} className="reveal nr-content-block">
              <p style={{
                fontFamily: 'DM Sans, sans-serif', fontSize: '11px',
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'rgba(26,25,23,0.55)', marginBottom: '20px',
                display: 'flex', alignItems: 'center', gap: '12px',
              }}>
                Principles in Practice
                <span style={{ flex: 1, height: '1px', background: 'rgba(26,25,23,0.1)', display: 'block' }} />
              </p>
              <div style={{ marginBottom: '24px' }}>
                <p style={{ ...bodyStyle, fontWeight: 700, marginBottom: '16px' }}>Operator who coaches.</p>
                <p style={{ ...bodyStyle, marginBottom: 0 }}>Formal coach training that shows up in the work — and in dedicated 1-on-1 coaching when that's what's needed.</p>
              </div>
              <div style={{ marginBottom: '24px' }}>
                <p style={{ ...bodyStyle, fontWeight: 700, marginBottom: '16px' }}>Owner's perspective.</p>
                <p style={{ ...bodyStyle, marginBottom: 0 }}>When most of your career is spent reporting to the people who built the business, you see things the way they do.</p>
              </div>
              <div style={{ marginBottom: '24px' }}>
                <p style={{ ...bodyStyle, fontWeight: 700, marginBottom: '16px' }}>Systems over symptoms.</p>
                <p style={{ ...bodyStyle, marginBottom: 0 }}>Cut through the noise. Find the few things actually shaping performance and fix those.</p>
              </div>
              <div style={{ marginBottom: '24px' }}>
                <p style={{ ...bodyStyle, fontWeight: 700, marginBottom: '16px' }}>Progress over process.</p>
                <p style={{ ...bodyStyle, marginBottom: 0 }}>A process should help you see what to fix. If it isn't, it's a distraction.</p>
              </div>
              <div>
                <p style={{ ...bodyStyle, fontWeight: 700, marginBottom: '16px' }}>Field over office.</p>
                <p style={{ ...bodyStyle, marginBottom: 0 }}>I go where the work is. Plane, boardroom, conference, with the team — wherever progress needs to happen.</p>
              </div>
            </div>

            <div ref={carouselRef} className="reveal">
              <CareerHighlights />
            </div>
          </div>

          <div ref={closingRef} className="reveal" style={{ marginTop: '48px' }}>
            <p style={{ ...bodyStyle, marginBottom: 0 }}>Underneath all of it: relationships always win. Know your customer, understand their pains, help them win. That's the cornerstone of a durable business.</p>
          </div>
        </div>
      </section>

      <style>{`
        .nr-split {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 64px;
          align-items: center;
        }
        @media (max-width: 768px) {
          .nr-split {
            grid-template-columns: 1fr;
            gap: 48px;
            align-items: start;
          }
        }
      `}</style>
      <QuoteCarouselSection />
      {/* <CareerTimeline /> */}
    </>
  )
}
