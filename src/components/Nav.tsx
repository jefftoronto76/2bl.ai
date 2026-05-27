'use client'

import { useState, useEffect, type CSSProperties } from 'react'

const LINKS = [
  { label: 'Book', href: '#how-it-works', kind: 'scroll' },
  { label: 'Labs', href: 'https://www.2bl.ai', kind: 'external' },
  { label: 'Share', href: '#', kind: 'share' },
] as const

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToBooking = () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })
  }

  const share = async () => {
    const url = window.location.href
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Jeff Lougheed',
          text: 'Operator. Coach. Builder.',
          url,
        })
      } catch {
        // Share sheet dismissed or share failed — nothing to recover.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable — leave the UI unchanged.
    }
  }

  const renderItems = (mobile: boolean) => {
    const base: CSSProperties = {
      fontFamily: 'var(--font-mono)',
      fontSize: mobile ? '14.4px' : '13.2px',
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      textDecoration: 'none',
      cursor: 'pointer',
      background: 'none',
      border: 'none',
      color: mobile ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
      ...(mobile ? { padding: '16px 0', textAlign: 'left', width: '100%' } : { padding: 0 }),
    }
    const rowBorder: CSSProperties = mobile
      ? { borderBottom: '1px solid var(--color-border)' }
      : {}
    const closeIfMobile = () => {
      if (mobile) setOpen(false)
    }

    return LINKS.map((link) => {
      if (link.kind === 'share') {
        return (
          <div key={link.label} style={{ position: 'relative', ...rowBorder }}>
            <button
              type="button"
              onClick={() => {
                closeIfMobile()
                void share()
              }}
              style={base}
              aria-label="Share this page"
            >
              {link.label}
            </button>
            {copied && (
              <span
                role="status"
                aria-live="polite"
                style={{
                  position: 'absolute',
                  top: mobile ? '50%' : '100%',
                  ...(mobile
                    ? { right: 0, transform: 'translateY(-50%)' }
                    : { left: 0, marginTop: '6px' }),
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'rgb(var(--color-accent))',
                  whiteSpace: 'nowrap',
                }}
              >
                Link copied
              </span>
            )}
          </div>
        )
      }

      if (link.kind === 'external') {
        return (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeIfMobile}
            style={{ ...base, ...rowBorder }}
          >
            {link.label}
          </a>
        )
      }

      // kind === 'scroll' (Book)
      return (
        <a
          key={link.label}
          href={link.href}
          onClick={(e) => {
            e.preventDefault()
            closeIfMobile()
            scrollToBooking()
          }}
          style={{ ...base, ...rowBorder }}
        >
          {link.label}
        </a>
      )
    })
  }

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
          {renderItems(false)}
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
          {renderItems(true)}
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
