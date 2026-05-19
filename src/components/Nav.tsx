'use client'

import { useState, useEffect } from 'react'
import { useSageStore } from '../lib/store'

const LINKS = [
  { label: 'Book', href: '#work' },
  { label: 'Labs', href: '#' },
  { label: 'Share', href: '#' },
]

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [chatBorderDrawn, setChatBorderDrawn] = useState(false)
  const expand = useSageStore((s) => s.expand)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const el = document.querySelector('[data-nav-trigger="how-i-operate"]')
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setChatBorderDrawn(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: '60px',
        background: scrolled || open ? 'rgb(var(--color-bg) / 0.96)' : 'transparent',
        backdropFilter: scrolled || open ? 'blur(12px)' : 'none',
        borderBottom: scrolled || open ? '1px solid var(--color-border)' : 'none',
        transition: 'all 0.3s ease',
      }}>
        <a href="#hero" className="nr-brand" style={{
          fontFamily: 'var(--font-display)', fontWeight: 400,
          letterSpacing: '0.02em', color: 'var(--color-text-primary)', textDecoration: 'none',
        }}>
          Performance-Driven, Heart-Led
        </a>

        {/* Desktop links */}
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }} className="nr-desktop-links">
          {LINKS.map(({ label, href }) => {
            const isChatLink = label === 'Chat'
            return (
              <a
                key={label}
                href={href}
                onClick={isChatLink ? (e) => { e.preventDefault(); expand() } : undefined}
                className={isChatLink ? `nav-chat-btn ${chatBorderDrawn ? 'nav-chat-btn--drawn' : ''}` : undefined}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: '13.2px',
                  letterSpacing: '0.18em', textTransform: 'uppercase',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  ...(isChatLink ? {} : { color: 'var(--color-text-muted)' }),
                }}
              >
                {label}
              </a>
            )
          })}
        </div>

        {/* Mobile hamburger */}
        <button onClick={() => setOpen(!open)} className="nr-mobile-menu-btn" style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '8px',
          display: 'none', flexDirection: 'column', gap: '5px',
        }}>
          <span style={{ display: 'block', width: '22px', height: '1px', background: 'var(--color-text-primary)', transition: 'all 0.2s', transform: open ? 'rotate(45deg) translate(4px, 4px)' : 'none' }} />
          <span style={{ display: 'block', width: '22px', height: '1px', background: 'var(--color-text-primary)', transition: 'all 0.2s', opacity: open ? 0 : 1 }} />
          <span style={{ display: 'block', width: '22px', height: '1px', background: 'var(--color-text-primary)', transition: 'all 0.2s', transform: open ? 'rotate(-45deg) translate(4px, -4px)' : 'none' }} />
        </button>
      </nav>

      {/* Mobile dropdown */}
      {open && (
        <div style={{
          position: 'fixed', top: '60px', left: 0, right: 0, zIndex: 49,
          background: 'rgb(var(--color-bg) / 0.98)', backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', flexDirection: 'column',
          padding: '16px 24px 24px',
          gap: '0',
        }}>
          {LINKS.map(({ label, href }) => {
            const isChatLink = label === 'Chat'
            return (
              <a
                key={label}
                href={href}
                onClick={isChatLink
                  ? (e) => { e.preventDefault(); setOpen(false); expand() }
                  : () => setOpen(false)
                }
                className={isChatLink ? 'nav-chat-pill' : undefined}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: '14.4px',
                  letterSpacing: '0.18em', textTransform: 'uppercase',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  ...(isChatLink
                    ? {
                      padding: '14px 24px',
                      marginTop: '12px',
                      alignSelf: 'flex-start',
                    }
                    : {
                      color: 'var(--color-text-primary)',
                      padding: '16px 0',
                      borderBottom: '1px solid var(--color-border)',
                    }),
                }}
              >
                {label}
              </a>
            )
          })}
        </div>
      )}

      <style>{`
        .nr-brand { font-size: 17px; }
        @media (max-width: 768px) {
          .nr-desktop-links { display: none !important; }
          .nr-mobile-menu-btn { display: flex !important; }
          .nr-brand { font-size: 14px; }
        }
      `}</style>
    </>
  )
}
