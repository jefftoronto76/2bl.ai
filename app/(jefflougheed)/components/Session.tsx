'use client'

import { useReveal } from '@/hooks/useReveal'
import { useEffect } from 'react'

export function Session() {
  const ref = useReveal()

  useEffect(() => {
    const existingScript = document.querySelector('script[src="https://assets.calendly.com/assets/external/widget.js"]')
    if (!existingScript) {
      const script = document.createElement('script')
      script.src = 'https://assets.calendly.com/assets/external/widget.js'
      script.async = true
      document.body.appendChild(script)
    }
  }, [])

  const handleDiscoveryClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    if (window.Calendly) {
      window.Calendly.initPopupWidget({
        url: 'https://calendly.com/naturalresource/discovery-call?hide_event_type_details=1&hide_gdpr_banner=1&background_color=f9f8f5&primary_color=2d6a4f'
      })
    }
  }

  return (
    <section id="session" style={{ padding: '64px clamp(24px, 5vw, 48px)', borderBottom: '1px solid rgba(26,25,23,0.08)', overflow: 'hidden' }}>
      <div ref={ref} className="reveal" style={{ maxWidth: '900px', margin: '0 auto', width: '100%', overflow: 'hidden' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13.2px', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(26,25,23,0.34)', marginBottom: '40px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          How to <span style={{
            position: 'relative',
            display: 'inline-block',
            padding: '0 4px',
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Cpath d='M2,14 C20,8 80,6 98,12 C99,16 95,20 80,21 C50,23 15,22 2,18 Z' fill='%232d6a4f' fill-opacity='0.2'/%3E%3C/svg%3E\")",
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
          }}>Start</span>
          <span style={{ flex: 1, height: '1px', background: 'rgba(26,25,23,0.1)', maxWidth: '120px', display: 'block' }} />
        </p>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(30px, 4vw, 52px)', fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.02em', color: 'var(--color-text-primary)', marginBottom: '48px' }}>
          Whichever lane fits,<br /><em style={{ fontStyle: 'italic' }}>both start here.</em>
        </h2>

        <p className="session-subhead-mobile" style={{ fontSize: '18px', color: 'rgba(26,25,23,0.6)', fontFamily: 'DM Sans, sans-serif', fontWeight: 400, lineHeight: 1.7, marginBottom: '24px', display: 'none' }}>
          Coaching or special projects. C$250, paid upfront. Real outcomes. Book below.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '55% 45%',
          gap: '48px',
          alignItems: 'start',
          marginBottom: '32px'
        }}
        className="session-grid">
          <div style={{
            border: '1px solid rgba(26,25,23,0.08)',
            padding: 0,
            position: 'relative',
            borderRadius: '8px',
            overflow: 'hidden',
            maxWidth: '100%',
            width: '100%'
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: '#2d6a4f' }} />
            <div
              className="calendly-inline-widget"
              data-url="https://calendly.com/naturalresource/working-session?hide_event_type_details=1&hide_gdpr_banner=1&background_color=f9f8f5&primary_color=2d6a4f"
              style={{ minWidth: '320px', height: '600px' }}
            />
          </div>

          <div style={{ paddingTop: '8px' }}>
            <p className="session-subhead-desktop" style={{ fontSize: '18px', color: 'rgba(26,25,23,0.6)', fontFamily: 'DM Sans, sans-serif', fontWeight: 400, lineHeight: 1.7, marginBottom: '24px' }}>
              Coaching or special projects. C$250, paid upfront. Real outcomes.
            </p>

            <div style={{ fontSize: 'clamp(48px, 6vw, 64px)', fontFamily: 'var(--font-display)', color: '#2d6a4f', fontWeight: 400, letterSpacing: '-0.02em', marginBottom: '24px' }}>
              C$250
            </div>

            <p style={{ fontSize: '16px', color: 'rgba(26,25,23,0.6)', fontFamily: 'DM Sans, sans-serif', fontWeight: 400, lineHeight: 1.7, marginBottom: '32px' }}>
              60 minutes. ICF-aligned. Root-cause focused.
            </p>

            <div style={{ height: '1px', background: 'rgba(26,25,23,0.1)', marginBottom: '32px' }} />

            <p style={{ fontSize: '16px', color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
              Not ready to commit?{' '}
              <a
                href="#"
                onClick={handleDiscoveryClick}
                style={{
                  color: '#2d6a4f',
                  textDecoration: 'none',
                  borderBottom: '1px solid #2d6a4f',
                  transition: 'opacity 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                Start with a free 15-minute call →
              </a>
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .session-subhead-desktop {
            display: none !important;
          }
          .session-subhead-mobile {
            display: block !important;
          }
        }
      `}</style>
    </section>
  )
}
