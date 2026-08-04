/* landing.jsx — Heirloom landing page. Exports Landing to window. */
(function () {
  const { useState, useEffect, useRef } = React;
  const Icon = window.Icon;

  function useReveal() {
    const ref = useRef(null);
    const [seen, setSeen] = useState(false);
    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const obs = new IntersectionObserver(
        ([e]) => { if (e.isIntersecting) { setSeen(true); obs.disconnect(); } },
        { threshold: 0.12 }
      );
      obs.observe(el);
      // Fallback: if the observer hasn't fired (programmatic scroll, capture,
      // unsupported), reveal anyway so content is never stuck hidden.
      const fallback = setTimeout(() => setSeen(true), 1300);
      // Reveal immediately if already within the viewport at mount.
      const r = el.getBoundingClientRect();
      if (r.top < (window.innerHeight || 800)) setSeen(true);
      return () => { obs.disconnect(); clearTimeout(fallback); };
    }, []);
    return [ref, seen];
  }

  // ---- Nav ---------------------------------------------------------------
  function Nav({ onStart }) {
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
      const onScroll = () => setScrolled(window.scrollY > 24);
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }, []);
    const link = { fontSize: 15, fontWeight: 500, color: 'var(--hl-muted)', background: 'none', border: 'none', padding: 0, transition: 'color .2s', whiteSpace: 'nowrap' };
    return (
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 30,
        transition: 'all .35s ease',
        background: scrolled ? 'color-mix(in srgb, var(--hl-surface) 92%, transparent)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--hl-accent-line)' : '1px solid transparent',
      }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', height: 64, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0 }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)' }}>
              <Icon name="bookOpen" size={16} />
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 21, letterSpacing: '.02em', color: 'var(--hl-text)' }}>Heirloom</span>
          </button>
          <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            {['How It Works', 'Pricing', 'About'].map((l) => (
              <button key={l} style={link} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--hl-accent)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--hl-muted)')}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="nav-login" style={link} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--hl-text)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--hl-muted)')}>Log in</button>
            <button onClick={onStart} style={{ background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontWeight: 600, fontSize: 15, padding: '9px 18px', borderRadius: 10, border: 'none', transition: 'background .2s', whiteSpace: 'nowrap' }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hl-accent-hover)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--hl-accent)')}>Start Your Story</button>
          </div>
        </div>
      </nav>
    );
  }

  // ---- CTA buttons -------------------------------------------------------
  function PrimaryCta({ children, onClick }) {
    return (
      <button onClick={onClick} style={{
        background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontWeight: 600, fontSize: 16,
        padding: '16px 30px', borderRadius: 13, border: 'none',
        boxShadow: '0 14px 34px -12px color-mix(in srgb, var(--hl-accent) 55%, transparent)',
        transition: 'transform .2s, box-shadow .2s, background .2s',
      }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.background = 'var(--hl-accent-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'var(--hl-accent)'; }}>
        {children}
      </button>
    );
  }
  function GhostCta({ children, onClick }) {
    return (
      <button onClick={onClick} style={{
        background: 'transparent', color: 'var(--hl-accent)', fontWeight: 600, fontSize: 16,
        padding: '16px 30px', borderRadius: 13, border: '1px solid var(--hl-accent-line)', transition: 'all .2s',
      }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hl-accent-soft)'; e.currentTarget.style.color = 'var(--hl-text)'; e.currentTarget.style.borderColor = 'var(--hl-accent)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--hl-accent)'; e.currentTarget.style.borderColor = 'var(--hl-accent-line)'; }}>
        {children}
      </button>
    );
  }

  // ---- Hero --------------------------------------------------------------
  function Hero({ onStart, layout }) {
    // Entrance via CSS animation (forwards) — guaranteed to settle at opacity 1,
    // regardless of mount timing.
    // Hero content is visible immediately; section scroll-reveals carry the motion.
    const rise = () => ({});
    const glow = (
      <React.Fragment>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 38%, var(--hl-glow-1) 0%, var(--hl-glow-2) 35%, var(--hl-bg-2) 66%, var(--hl-bg) 100%)' }} />
        <div className="bg-pattern-dots" style={{ position: 'absolute', inset: 0, opacity: 0.045 }} />
      </React.Fragment>
    );

    if (layout === 'editorial') {
      return (
        <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
          {glow}
          <div style={{ position: 'relative', zIndex: 2, maxWidth: 1180, width: '100%', margin: '0 auto', padding: '120px 24px 80px' }}>
            <div style={{ maxWidth: 760 }}>
              <div style={rise('.1s')}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.34em', textTransform: 'uppercase', color: 'var(--hl-accent)' }}>A memoir, guided</span>
              </div>
              <h1 style={{ ...rise('.18s'), fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(64px, 12vw, 168px)', lineHeight: 0.92, letterSpacing: '-.02em', margin: '20px 0 0', color: 'var(--hl-text)' }}>Heirloom</h1>
              <p style={{ ...rise('.28s'), fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400, fontSize: 'clamp(17px,4.8vw,40px)', color: 'var(--hl-accent)', margin: '14px 0 0', whiteSpace: 'nowrap' }}>Every life deserves to be a book.</p>
              <p style={{ ...rise('.36s'), fontSize: 18, lineHeight: 1.6, color: 'var(--hl-muted)', maxWidth: 480, margin: '26px 0 40px' }}>AI-guided biography platform — from first memory to printed book.</p>
              <div style={{ ...rise('.44s'), display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <PrimaryCta onClick={onStart}>Start Your Story</PrimaryCta>
                <GhostCta onClick={() => document.getElementById('learn-more')?.scrollIntoView({ behavior: 'smooth' })}>Learn More</GhostCta>
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (layout === 'cover') {
      return (
        <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
          {glow}
          <div className="hero-cover-grid" style={{ position: 'relative', zIndex: 2, maxWidth: 1180, width: '100%', margin: '0 auto', padding: '120px 24px 80px', display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: 56, alignItems: 'center' }}>
            <div>
              <h1 style={{ ...rise('.12s'), fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(56px,8vw,108px)', lineHeight: 0.95, letterSpacing: '-.02em', margin: 0, color: 'var(--hl-text)' }}>Heirloom</h1>
              <p style={{ ...rise('.22s'), fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'clamp(16px,4.2vw,30px)', color: 'var(--hl-accent)', margin: '12px 0 0', whiteSpace: 'nowrap' }}>Every life deserves to be a book.</p>
              <p style={{ ...rise('.3s'), fontSize: 18, lineHeight: 1.6, color: 'var(--hl-muted)', maxWidth: 440, margin: '24px 0 38px' }}>AI-guided biography platform — from first memory to printed book.</p>
              <div style={{ ...rise('.4s'), display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <PrimaryCta onClick={onStart}>Start Your Story</PrimaryCta>
                <GhostCta onClick={() => document.getElementById('learn-more')?.scrollIntoView({ behavior: 'smooth' })}>Learn More</GhostCta>
              </div>
            </div>
            <div style={{ ...rise('.34s'), display: 'flex', justifyContent: 'center' }}>
              <BookCover />
            </div>
          </div>
        </section>
      );
    }

    if (layout === 'formats') {
      return (
        <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
          {glow}
          <div className="hero-cover-grid" style={{ position: 'relative', zIndex: 2, maxWidth: 1180, width: '100%', margin: '0 auto', padding: '120px 24px 80px', display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: 56, alignItems: 'center' }}>
            <div>
              <div style={rise('.08s')}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.34em', textTransform: 'uppercase', color: 'var(--hl-accent)' }}>One life, many forms</span>
              </div>
              <h1 style={{ ...rise('.12s'), fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(56px,8vw,108px)', lineHeight: 0.95, letterSpacing: '-.02em', margin: '18px 0 0', color: 'var(--hl-text)' }}>Heirloom</h1>
              <p style={{ ...rise('.22s'), fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'clamp(16px,4.2vw,30px)', color: 'var(--hl-accent)', margin: '12px 0 0' }}>Every life deserves to be told.</p>
              <p style={{ ...rise('.3s'), fontSize: 18, lineHeight: 1.6, color: 'var(--hl-muted)', maxWidth: 460, margin: '24px 0 30px' }}>Capture your story once. Publish it as a printed book, an illustrated comic, a living webpage, or an audiobook in your own voice.</p>
              <div style={{ ...rise('.36s'), display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 34 }}>
                {['Book', 'Comic', 'Webpage', 'Audiobook'].map((f) => (
                  <span key={f} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--hl-muted)', border: '1px solid var(--hl-border-strong)', borderRadius: 999, padding: '6px 13px' }}>{f}</span>
                ))}
              </div>
              <div style={{ ...rise('.42s'), display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <PrimaryCta onClick={onStart}>Start Your Story</PrimaryCta>
                <GhostCta onClick={() => document.getElementById('learn-more')?.scrollIntoView({ behavior: 'smooth' })}>Learn More</GhostCta>
              </div>
            </div>
            <div style={{ ...rise('.32s'), display: 'flex', justifyContent: 'center' }}>
              <FormatFan />
            </div>
          </div>
        </section>
      );
    }

    // centered (default, faithful)
    return (
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', textAlign: 'center' }}>
        {glow}
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 880, padding: '0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            <h1 style={{ ...rise('.1s'), fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(56px,9vw,118px)', lineHeight: 0.95, letterSpacing: '-.02em', margin: 0, color: 'var(--hl-text)' }}>Heirloom</h1>
            <p style={{ ...rise('.2s'), fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400, fontSize: 'clamp(16px,4.6vw,32px)', lineHeight: 1.25, color: 'var(--hl-accent)', maxWidth: 720, margin: 0, whiteSpace: 'nowrap' }}>Every life deserves to be a book.</p>
            <p style={{ ...rise('.3s'), fontSize: 18, lineHeight: 1.65, color: 'var(--hl-muted)', maxWidth: 500, margin: 0 }}>AI-guided biography platform — from first memory to printed book.</p>
          </div>
          <div style={{ ...rise('.4s'), display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <PrimaryCta onClick={onStart}>Start Your Story</PrimaryCta>
            <GhostCta onClick={() => document.getElementById('learn-more')?.scrollIntoView({ behavior: 'smooth' })}>Learn More</GhostCta>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 40, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 2 }}>
          <div style={{ animation: 'hl-bob 2.4s ease-in-out infinite' }}>
            <div style={{ width: 24, height: 38, borderRadius: 20, border: '2px solid var(--hl-accent-line)', display: 'flex', justifyContent: 'center', paddingTop: 7 }}>
              <div style={{ width: 3, height: 8, borderRadius: 3, background: 'var(--hl-accent)' }} />
            </div>
          </div>
        </div>
      </section>
    );
  }

  // A spine-and-pages book cover built from divs (no illustrative SVG).
  function BookCover() {
    return (
      <div style={{ position: 'relative', width: 280, height: 380, perspective: 1400 }}>
        <div style={{ position: 'absolute', inset: 0, transform: 'rotateY(-16deg)', transformStyle: 'preserve-3d' }}>
          {/* page stack edge */}
          <div style={{ position: 'absolute', top: 6, bottom: 6, right: -10, width: 16, background: 'repeating-linear-gradient(to bottom, #efe6d2, #efe6d2 2px, #d8ccb2 2px, #d8ccb2 3px)', borderRadius: '2px 4px 4px 2px', transform: 'rotateY(20deg)', boxShadow: 'inset -3px 0 6px rgba(0,0,0,.25)' }} />
          {/* cover */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: '4px 10px 10px 4px', background: 'linear-gradient(135deg, var(--hl-surface-2), var(--hl-surface))', border: '1px solid var(--hl-accent-line)', boxShadow: '0 40px 80px -30px rgba(0,0,0,.7), inset 0 0 0 1px rgba(255,255,255,.02)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
            <div style={{ position: 'absolute', inset: 14, border: '1px solid var(--hl-accent-line)', borderRadius: 6, pointerEvents: 'none' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.35em', color: 'var(--hl-accent)', textTransform: 'uppercase', marginBottom: 18 }}>A Life In</span>
            <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400, fontSize: 44, lineHeight: 1, color: 'var(--hl-text)', textAlign: 'center' }}>Heirloom</span>
            <div style={{ width: 40, height: 1, background: 'var(--hl-accent-line)', margin: '20px 0' }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--hl-muted)' }}>Volume One</span>
            <span style={{ position: 'absolute', bottom: 26, color: 'var(--hl-accent)' }}><Icon name="bookMark" size={20} /></span>
          </div>
        </div>
      </div>
    );
  }

  // A stack of "editions" — the same life published in many media.
  function FormatFan() {
    const editions = [
      { icon: 'bookOpen', name: 'The Book', tag: 'Printed & bound', top: 4, angle: -2.4 },
      { icon: 'panels', name: 'The Comic', tag: 'Illustrated panels', top: 92, angle: 1.6 },
      { icon: 'monitor', name: 'The Webpage', tag: 'A living digital edition', top: 180, angle: -1.6 },
      { icon: 'headphones', name: 'Audiobook', tag: 'Narrated in their own voice', top: 268, angle: 2.4 },
    ];
    return (
      <div style={{ position: 'relative', width: 340, height: 366 }}>
        {editions.map((e, i) => (
          <div key={e.name} style={{
            position: 'absolute', left: '50%', top: e.top, width: 300, height: 82,
            transform: `translateX(-50%) rotate(${e.angle}deg)`, zIndex: i + 1,
            display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px',
            borderRadius: 14, background: 'linear-gradient(135deg, var(--hl-surface-2), var(--hl-surface))',
            border: '1px solid var(--hl-accent-line)', boxShadow: '0 26px 50px -26px rgba(0,0,0,.7), inset 0 0 0 1px rgba(255,255,255,.02)',
          }}>
            <div style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 13, background: 'var(--hl-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)' }}>
              <Icon name={e.icon} size={22} />
            </div>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400, fontSize: 24, lineHeight: 1, color: 'var(--hl-text)' }}>{e.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--hl-muted)', whiteSpace: 'nowrap' }}>{e.tag}</span>
            </div>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--hl-accent)', opacity: 0.5 }}>{'0' + (i + 1)}</span>
          </div>
        ))}
      </div>
    );
  }

  // ---- What Is Heirloom --------------------------------------------------
  function WhatIs() {
    const [ref, seen] = useReveal();
    const steps = [
      { icon: 'mic', label: 'Capture', body: 'Guided voice and text conversations that draw stories out — chapter by chapter, memory by memory.' },
      { icon: 'sparkles', label: 'Shape', body: 'AI acts as your editor. It drafts, organizes, and refines — you approve every word.' },
      { icon: 'bookOpen', label: 'Publish', body: 'A formatted, print-ready manuscript delivered as a physical book and a mobile keepsake.' },
    ];
    return (
      <section ref={ref} id="what-is-heirloom" style={{ padding: 'clamp(80px,12vw,150px) 24px', background: 'var(--hl-bg)' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <div className={'reveal' + (seen ? ' in' : '')} style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.3em', textTransform: 'uppercase', color: 'var(--hl-accent)', display: 'block', marginBottom: 26 }}>What Is Heirloom</span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(30px,4.6vw,60px)', lineHeight: 1.12, letterSpacing: '-.01em', maxWidth: 820, margin: '0 auto', color: 'var(--hl-text)' }}>An AI-guided platform that helps people capture, shape, and publish their life story — as a real, printed book.</h2>
          </div>
          <div className="whatis-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
            {steps.map((s, i) => (
              <div key={s.label} className={'reveal' + (seen ? ' in' : '')} style={{ animationDelay: (0.15 + i * 0.13) + 's' }}>
                <div style={{ height: 1, background: 'var(--hl-accent-line)', marginBottom: 26 }} />
                <div style={{ background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 16, padding: 30, height: '100%', position: 'relative', overflow: 'hidden' }}>
                  <span style={{ position: 'absolute', top: 18, right: 22, fontFamily: 'var(--font-display)', fontSize: 60, lineHeight: 1, color: 'var(--hl-accent)', opacity: 0.12 }}>{i + 1}</span>
                  <div style={{ width: 54, height: 54, borderRadius: 14, background: 'var(--hl-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)', marginBottom: 24 }}>
                    <Icon name={s.icon} size={24} />
                  </div>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.26em', textTransform: 'uppercase', color: 'var(--hl-accent)', margin: '0 0 14px' }}>{s.label}</p>
                  <p style={{ fontSize: 17, lineHeight: 1.62, color: 'var(--hl-muted)', margin: 0 }}>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ---- How It Works ------------------------------------------------------
  function HowItWorks() {
    const [ref, seen] = useReveal();
    const steps = [
      { n: '01', t: 'Invite', d: 'Set up your project. Invite contributors — family, friends, colleagues.' },
      { n: '02', t: 'Capture', d: 'AI-guided voice or text interviews. Pull from photos, letters, documents.' },
      { n: '03', t: 'Draft', d: 'AI composes blocks — scenes, chapters, moments. You approve or refine.' },
      { n: '04', t: 'Compile', d: 'Approved blocks assemble into a manuscript. You review the full arc.' },
      { n: '05', t: 'Publish', d: 'Print-on-demand book delivered. Mobile web version included.' },
    ];
    return (
      <section ref={ref} id="how-it-works" style={{ padding: 'clamp(80px,12vw,150px) 24px', background: 'var(--hl-surface)', borderTop: '1px solid var(--hl-border)', borderBottom: '1px solid var(--hl-border)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div className={'reveal' + (seen ? ' in' : '')} style={{ textAlign: 'center', marginBottom: 72 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.3em', textTransform: 'uppercase', color: 'var(--hl-accent)', display: 'block', marginBottom: 22 }}>How It Works</span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(34px,5vw,66px)', lineHeight: 1.05, color: 'var(--hl-text)', margin: 0 }}>Five steps. One book.</h2>
          </div>
          <div className="how-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16 }}>
            {steps.map((s, i) => (
              <div key={s.n} className={'reveal' + (seen ? ' in' : '')} style={{ animationDelay: (0.12 + i * 0.1) + 's' }}>
                <div style={{ height: 4, borderRadius: 4, background: 'var(--hl-accent)', opacity: 0.5, marginBottom: 22 }} />
                <div style={{ background: 'var(--hl-bg)', border: '1px solid var(--hl-border)', borderRadius: 18, padding: '26px 22px', height: '100%' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 46, lineHeight: 1, letterSpacing: '-.02em', color: 'var(--hl-accent)', opacity: 0.4, display: 'block', marginBottom: 16 }}>{s.n}</span>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 26, margin: '0 0 12px', color: 'var(--hl-text)' }}>{s.t}</h3>
                  <p style={{ fontSize: 15.5, lineHeight: 1.58, color: 'var(--hl-muted)', margin: 0 }}>{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ---- Quote / closing CTA ----------------------------------------------
  function Closing({ onStart }) {
    const [ref, seen] = useReveal();
    return (
      <section ref={ref} style={{ position: 'relative', padding: 'clamp(90px,14vw,170px) 24px', textAlign: 'center', overflow: 'hidden', background: 'var(--hl-bg)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, var(--hl-glow-1) 0%, var(--hl-glow-2) 38%, var(--hl-bg) 100%)', opacity: 0.7 }} />
        <div className={'reveal' + (seen ? ' in' : '')} style={{ position: 'relative', zIndex: 2, maxWidth: 760, margin: '0 auto' }}>
          <span style={{ color: 'var(--hl-accent)', display: 'inline-flex' }}><Icon name="quote" size={34} /></span>
          <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 300, fontSize: 'clamp(28px,4.4vw,52px)', lineHeight: 1.2, color: 'var(--hl-text)', margin: '24px 0 40px' }}>The stories we never wrote down are the ones we lose. Let's write yours down.</p>
          <PrimaryCta onClick={onStart}>Start Your Story</PrimaryCta>
        </div>
      </section>
    );
  }

  function Footer() {
    return (
      <footer style={{ borderTop: '1px solid var(--hl-border)', padding: '40px 24px', background: 'var(--hl-bg-2)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--hl-accent)' }}><Icon name="bookOpen" size={16} /></span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--hl-text)' }}>Heirloom</span>
          </div>
          <p style={{ fontSize: 14, color: 'var(--hl-faint)', margin: 0 }}>Every life deserves to be a book.</p>
        </div>
      </footer>
    );
  }

  function Landing({ onStart, heroLayout }) {
    return (
      <div>
        <Nav onStart={onStart} />
        <Hero onStart={onStart} layout={heroLayout} />
        <div id="learn-more"><WhatIs /></div>
        <HowItWorks />
        <Closing onStart={onStart} />
        <Footer />
      </div>
    );
  }

  window.Landing = Landing;
})();
