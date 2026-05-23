'use client'

import { useReveal } from '@/hooks/useReveal'

export function Problem() {
  const ref = useReveal()
  return (
    <>
    <div style={{ padding: '48px' }}>
    <section id="problem" className="problem-section" style={{
      padding: '64px clamp(24px, 5vw, 48px)',
      borderBottom: '1px solid rgba(26,25,23,0.08)',
      backgroundImage: 'url(/jefflougheed/ProblemBackground.webp)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.1)',
        zIndex: 1,
      }} />
      <div ref={ref} className="reveal" style={{ maxWidth: '700px', position: 'relative', zIndex: 2 }}>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: '13.2px',
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.48)', marginBottom: '40px',
          display: 'flex', alignItems: 'center', gap: '16px',
          fontWeight: 600,
        }}>
          The <span style={{
            position: 'relative',
            display: 'inline-block',
            padding: '0 4px',
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Cpath d='M2,14 C20,8 80,6 98,12 C99,16 95,20 80,21 C50,23 15,22 2,18 Z' fill='%232d6a4f' fill-opacity='0.2'/%3E%3C/svg%3E\")",
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
          }}>Work</span>
          <span style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.2)', maxWidth: '120px', display: 'block' }} />
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 4vw, 56px)',
          fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.02em',
          color: '#ffffff', marginBottom: '24px', paddingTop: '24px',
        }}>
          Most problems aren't<br />
          <em style={{ fontStyle: 'italic' }}>what they look like.</em>
        </h2>
        <p style={{ fontSize: 'clamp(16px, 1.8vw, 18px)', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', fontWeight: 400, marginBottom: '8px' }}>When teams chase problems, they look for someone to blame.</p>
        <p style={{ fontSize: 'clamp(16px, 1.8vw, 18px)', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', fontWeight: 400, marginBottom: '8px' }}>When teams chase outcomes, they engage, they adapt, and they learn.</p>
        <p style={{ fontSize: 'clamp(16px, 1.8vw, 18px)', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', fontWeight: 400 }}>The problems get solved either way.</p>
      </div>
    </section>
    </div>
    <style>{`
      @media (max-width: 768px) {
        .problem-section {
          background-position: center top;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding-bottom: 64px;
        }
      }
    `}</style>
    </>
  )
}
