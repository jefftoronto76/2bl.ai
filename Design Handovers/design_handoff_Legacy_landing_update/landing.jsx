/* landing.jsx — Legacy landing page. Exports Landing to window. */
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
    const [menuOpen, setMenuOpen] = useState(false);
    useEffect(() => {
      const onScroll = () => setScrolled(window.scrollY > 24);
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }, []);
    // Close the mobile menu if the viewport grows back to desktop.
    useEffect(() => {
      const mq = window.matchMedia('(min-width: 769px)');
      const onChange = (e) => { if (e.matches) setMenuOpen(false); };
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }, []);
    const link = { fontSize: 15, fontWeight: 500, color: 'var(--hl-muted)', background: 'none', border: 'none', padding: 0, transition: 'color .2s', whiteSpace: 'nowrap' };
    const NAV_LINKS = [
      { label: 'The Best Part', target: 'the-best-part' },
      { label: 'Pricing', target: null },
      { label: 'About', target: 'what-is-heirloom' },
    ];
    const goTo = (target) => {
      setMenuOpen(false);
      if (target) document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' });
    };
    return (
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 30,
        transition: 'all .35s ease',
        background: (scrolled || menuOpen) ? 'color-mix(in srgb, var(--hl-surface) 92%, transparent)' : 'transparent',
        backdropFilter: (scrolled || menuOpen) ? 'blur(12px)' : 'none',
        borderBottom: (scrolled || menuOpen) ? '1px solid var(--hl-accent-line)' : '1px solid transparent',
      }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', height: 64, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button onClick={() => { setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0 }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)' }}>
              <Icon name="feather" size={16} />
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 21, letterSpacing: '.02em', color: 'var(--hl-text)' }}>Legacy</span>
          </button>
          <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            {NAV_LINKS.map((l) => (
              <button key={l.label} onClick={() => goTo(l.target)} style={link} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--hl-accent)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--hl-muted)')}>{l.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="nav-login" style={link} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--hl-text)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--hl-muted)')}>Sign up</button>
            <button onClick={onStart} style={{ background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', fontWeight: 600, fontSize: 15, padding: '9px 18px', borderRadius: 10, border: 'none', transition: 'background .2s', whiteSpace: 'nowrap' }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hl-accent-hover)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--hl-accent)')}>Start Your Story</button>
            {/* Mobile hamburger — only shown ≤768px via CSS. */}
            <button className="nav-burger" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)} style={{ display: 'none', width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'transparent', border: '1px solid var(--hl-accent-line)', color: 'var(--hl-text)' }}>
              <Icon name={menuOpen ? 'x' : 'menu'} size={20} />
            </button>
          </div>
        </div>
        {/* Mobile dropdown menu */}
        <div className="nav-mobile-menu" style={{
          display: 'none', overflow: 'hidden',
          maxHeight: menuOpen ? 320 : 0,
          opacity: menuOpen ? 1 : 0,
          transition: 'max-height .35s cubic-bezier(.22,1,.36,1), opacity .25s ease',
          borderTop: menuOpen ? '1px solid var(--hl-accent-line)' : '1px solid transparent',
        }}>
          <div style={{ padding: '12px 24px 22px', display: 'flex', flexDirection: 'column' }}>
            {NAV_LINKS.map((l) => (
              <button key={l.label} onClick={() => goTo(l.target)} style={{ textAlign: 'left', fontSize: 18, fontWeight: 500, fontFamily: 'var(--font-display)', color: 'var(--hl-text)', background: 'none', border: 'none', padding: '15px 0', borderBottom: '1px solid var(--hl-border)' }}>{l.label}</button>
            ))}
            <button onClick={() => goTo(null)} style={{ textAlign: 'left', fontSize: 18, fontWeight: 500, fontFamily: 'var(--font-display)', color: 'var(--hl-muted)', background: 'none', border: 'none', padding: '15px 0' }}>Sign up</button>
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
              <h1 style={{ ...rise('.18s'), fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(64px, 12vw, 168px)', lineHeight: 0.92, letterSpacing: '-.02em', margin: '20px 0 0', color: 'var(--hl-text)' }}>Legacy</h1>
              <p className="hero-tagline" style={{ ...rise('.28s'), fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400, fontSize: 'clamp(17px,4.8vw,40px)', color: 'var(--hl-accent)', margin: '14px 0 0', whiteSpace: 'nowrap' }}>Every life deserves to be a book.</p>
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
              <h1 style={{ ...rise('.12s'), fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(56px,8vw,108px)', lineHeight: 0.95, letterSpacing: '-.02em', margin: 0, color: 'var(--hl-text)' }}>Legacy</h1>
              <p className="hero-tagline" style={{ ...rise('.22s'), fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'clamp(16px,4.2vw,30px)', color: 'var(--hl-accent)', margin: '12px 0 0', whiteSpace: 'nowrap' }}>Every life deserves to be a book.</p>
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
          <div className="hero-cover-grid" style={{ position: 'relative', zIndex: 2, maxWidth: 1180, width: '100%', margin: '0 auto', padding: '120px 24px 80px', display: 'grid', gridTemplateColumns: '1.18fr .82fr', gap: 48, alignItems: 'center' }}>
            <div>
              <div style={rise('.08s')}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.34em', textTransform: 'uppercase', color: 'var(--hl-accent)' }}>Private. Secure. Collaborative.</span>
              </div>
              <h1 style={{ ...rise('.12s'), fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(56px,8vw,108px)', lineHeight: 0.95, letterSpacing: '-.02em', margin: '18px 0 0', color: 'var(--hl-text)' }}>Legacy</h1>
              <p style={{ ...rise('.22s'), fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'clamp(16px,4.2vw,30px)', color: 'var(--hl-accent)', margin: '12px 0 0' }}>Capture life as it happens.</p>
              <p style={{ ...rise('.3s'), fontSize: 18, lineHeight: 1.78, color: 'var(--hl-muted)', maxWidth: 680, margin: '28px 0 34px' }}><span className="hero-tagline" style={{ whiteSpace: 'nowrap' }}>The moments pass quickly. The stories behind them fade even faster.</span><br />Capture memories while they’re fresh, and turn them into something you’ll always have.</p>
              <div style={{ ...rise('.42s'), display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 34 }}>
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
            <h1 style={{ ...rise('.1s'), fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(56px,9vw,118px)', lineHeight: 0.95, letterSpacing: '-.02em', margin: 0, color: 'var(--hl-text)' }}>Legacy</h1>
            <p className="hero-tagline" style={{ ...rise('.2s'), fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400, fontSize: 'clamp(16px,4.6vw,32px)', lineHeight: 1.25, color: 'var(--hl-accent)', maxWidth: 720, margin: 0, whiteSpace: 'nowrap' }}>Every life deserves to be a book.</p>
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
            <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400, fontSize: 44, lineHeight: 1, color: 'var(--hl-text)', textAlign: 'center' }}>Legacy</span>
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
      { icon: 'monitor', name: 'The Webpage', tag: 'A living digital edition', top: 74, angle: 1.6 },
      { icon: 'headphones', name: 'The Audiobook', tag: 'Narrated in their own voice', top: 144, angle: -1.6 },
      { icon: 'panels', name: 'The Comic', tag: 'Illustrated panels', top: 214, angle: 2.4 },
      { icon: 'clock', name: 'The Time Capsule', tag: 'Sealed today, opened later', top: 284, angle: -2 },
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

  // ---- What Is Legacy --------------------------------------------------
  function WhatIs() {
    const [ref, seen] = useReveal();
    const steps = [
      { icon: 'mic', label: 'Capture', body: 'Start with a memory, a photo, or a voice note. Invite others to deepen the story.' },
      { icon: 'sparkles', label: 'Shape', body: 'Legacy’s storytelling engine helps you uncover what matters most and tell it well.' },
      { icon: 'bookOpen', label: 'Publish', body: 'Give those stories a form that can be shared, revisited, and passed along.' },
    ];
    return (
      <section ref={ref} id="what-is-heirloom" style={{ padding: 'clamp(80px,12vw,150px) 24px', background: 'var(--hl-bg)' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <div className={'reveal' + (seen ? ' in' : '')} style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.3em', textTransform: 'uppercase', color: 'var(--hl-accent)', display: 'block', marginBottom: 26 }}>Create Your Legacy</span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(30px,4.6vw,60px)', lineHeight: 1.12, letterSpacing: '-.01em', maxWidth: 820, margin: '0 auto', color: 'var(--hl-text)' }}>Through simple conversations, Legacy helps you give your memories a future.</h2>
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

  // ---- What Makes It Different -------------------------------------------
  function WhyDifferent() {
    const [ref, seen] = useReveal();
    const [liked, setLiked] = useState(false);
    const [likes, setLikes] = useState(247);
    useEffect(() => {
      try { if (localStorage.getItem('hl.liveEditorVote') === '1') { setLiked(true); setLikes(248); } } catch (e) {}
    }, []);
    const toggleLike = () => {
      setLiked((v) => {
        const nv = !v;
        setLikes((n) => n + (nv ? 1 : -1));
        try { if (nv) localStorage.setItem('hl.liveEditorVote', '1'); else localStorage.removeItem('hl.liveEditorVote'); } catch (e) {}
        return nv;
      });
    };
    const cards = [
      { icon: 'message', t: 'Questions that draw it out', d: 'Legacy interviews you like a patient biographer — following the thread, asking the one more question that surfaces the detail only you would remember.' },
      { icon: 'users', t: 'Many voices, one story', d: 'Invite the people who were there. Legacy braids everyone’s account of the same moment into something fuller and truer than any single memory.' },
      { icon: 'image', t: 'Memories keep their media', d: 'Photos, letters, and voice notes stay attached to the story they belong to — captioned and in place, never lost in a scroll of chat.' },
      { icon: 'clock', t: 'It remembers, even if you don’t', d: 'Share the dates that matter and Legacy nudges you when they come around — capturing the story while it’s still close.' },
    ];
    return (
      <section ref={ref} style={{ padding: 'clamp(80px,12vw,150px) 24px', background: 'var(--hl-surface)', borderTop: '1px solid var(--hl-border)', borderBottom: '1px solid var(--hl-border)' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <div className={'reveal' + (seen ? ' in' : '')} style={{ textAlign: 'center', marginBottom: 56 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.3em', textTransform: 'uppercase', color: 'var(--hl-accent)', display: 'block', marginBottom: 26 }}>Changing the way memories are saved and shared.</span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(30px,4.6vw,60px)', lineHeight: 1.12, letterSpacing: '-.01em', maxWidth: 760, margin: '0 auto', color: 'var(--hl-text)' }}>The Best Parts</h2>
          </div>

          {/* Lead differentiator — storytelling craft */}
          <div className={'reveal' + (seen ? ' in' : '')} style={{ animationDelay: '.12s', display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap', background: 'var(--hl-bg)', border: '1px solid var(--hl-accent-line)', borderRadius: 20, padding: 'clamp(28px,4vw,44px)', marginBottom: 18 }}>
            <div style={{ flexShrink: 0, width: 68, height: 68, borderRadius: 17, background: 'var(--hl-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)' }}>
              <Icon name="feather" size={30} />
            </div>
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.26em', textTransform: 'uppercase', color: 'var(--hl-accent)', margin: '0 0 12px' }}>Storytelling, built in</p>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 'clamp(26px,3.2vw,36px)', lineHeight: 1.12, color: 'var(--hl-text)', margin: '0 0 14px' }}>You don’t have to be a writer.</h3>
              <p style={{ fontSize: 17, lineHeight: 1.64, color: 'var(--hl-muted)', margin: 0, maxWidth: 620 }}>Most memories come out as fragments. Legacy shapes them into stories — using the structures great storytellers lean on, the arc that carries a reader from an ordinary moment to the one that changed everything. You bring the memory; Legacy helps it become a story worth rereading.</p>
            </div>
          </div>

          {/* Supporting differentiators */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(min(420px,100%), 1fr))', gap: 18 }}>
            {cards.map((c, i) => (
              <div key={c.t} className={'reveal' + (seen ? ' in' : '')} style={{ animationDelay: (0.2 + i * 0.1) + 's', background: 'var(--hl-bg)', border: '1px solid var(--hl-border)', borderRadius: 18, padding: 30 }}>
                <div style={{ width: 50, height: 50, borderRadius: 13, background: 'var(--hl-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)', marginBottom: 22 }}>
                  <Icon name={c.icon} size={23} />
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 25, lineHeight: 1.16, color: 'var(--hl-text)', margin: '0 0 11px' }}>{c.t}</h3>
                <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--hl-muted)', margin: 0 }}>{c.d}</p>
              </div>
            ))}

            {/* Trust / security — now a standard two-column card */}
            <a href="#" className={'reveal' + (seen ? ' in' : '')} style={{ textDecoration: 'none', animationDelay: (0.2 + cards.length * 0.1) + 's', display: 'block', background: 'var(--hl-bg)', border: '1px solid var(--hl-border)', borderRadius: 18, padding: 30 }}>
              <div style={{ width: 50, height: 50, borderRadius: 13, background: 'var(--hl-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)', marginBottom: 22 }}>
                <Icon name="shield" size={23} />
              </div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 25, lineHeight: 1.16, color: 'var(--hl-text)', margin: '0 0 11px' }}>Secure &amp; responsible</h3>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--hl-muted)', margin: 0 }}>Legacy is built to support the most rigorous security standards and privacy for your data. <span style={{ color: 'var(--hl-accent)', fontWeight: 500 }}>Learn more&nbsp;→</span></p>
            </a>

            {/* Coming-soon teaser with a lightweight “want this sooner” vote */}
            <div className={'reveal' + (seen ? ' in' : '')} style={{ animationDelay: (0.3 + cards.length * 0.1) + 's', background: 'var(--hl-bg)', border: '1px dashed var(--hl-accent-line)', borderRadius: 18, padding: 30 }}>
              <div style={{ width: 50, height: 50, borderRadius: 13, background: 'var(--hl-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)', marginBottom: 22 }}>
                <Icon name="edit" size={23} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11, flexWrap: 'wrap' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 25, lineHeight: 1.16, color: 'var(--hl-text)', margin: 0 }}>A live editor</h3>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--hl-accent)', border: '1px solid var(--hl-accent-line)', borderRadius: 999, padding: '4px 10px' }}>Coming soon</span>
              </div>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--hl-muted)', margin: '0 0 22px' }}>For the hands-on writers — shape the prose yourself, line by line, editing side by side with Legacy in real time.</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={toggleLike} aria-pressed={liked} aria-label={liked ? 'Remove your vote' : 'I want this sooner'} title="Want this sooner? Give it a like."
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 16px', borderRadius: 999, border: '1px solid ' + (liked ? 'var(--hl-accent)' : 'var(--hl-border-strong)'), background: liked ? 'var(--hl-accent-soft)' : 'transparent', color: liked ? 'var(--hl-accent)' : 'var(--hl-muted)', transition: 'all .2s' }}
                  onMouseEnter={(e) => { if (!liked) { e.currentTarget.style.color = 'var(--hl-text)'; e.currentTarget.style.borderColor = 'var(--hl-accent-line)'; } }}
                  onMouseLeave={(e) => { if (!liked) { e.currentTarget.style.color = 'var(--hl-muted)'; e.currentTarget.style.borderColor = 'var(--hl-border-strong)'; } }}>
                  <span style={{ display: 'flex', transform: liked ? 'scale(1.12)' : 'none', transition: 'transform .2s' }}><Icon name="heart" size={17} /></span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>{likes}</span>
                </button>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--hl-faint)' }}>{liked ? 'Thanks!' : 'Want it sooner?'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ---- The Best Part (the book leads; other formats are optional) --------
  function TheBestPart() {
    const [ref, seen] = useReveal();
    const book = { icon: 'bookOpen', t: 'The Book', d: 'Printed, bound, and delivered to your door — the whole story as a hardcover keepsake, made to live on a shelf and be handed down for generations.' };
    const others = [
      { icon: 'panels', n: '01', t: 'The Comic', d: 'Illustrated panels that bring the moments to life.' },
      { icon: 'monitor', n: '02', t: 'The Webpage', d: 'A living digital edition with shareable links.' },
      { icon: 'headphones', n: '03', t: 'The Audiobook', d: 'Narrated and ready for the platforms people already use.' },
      { icon: 'clock', n: '04', t: 'The Time Capsule', d: 'Sealed today, unlocked on a date you choose.' },
    ];
    return (
      <section ref={ref} id="the-best-part" style={{ padding: 'clamp(80px,12vw,150px) 24px', background: 'var(--hl-bg)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div className={'reveal' + (seen ? ' in' : '')} style={{ textAlign: 'center', marginBottom: 22 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.3em', textTransform: 'uppercase', color: 'var(--hl-accent)', display: 'block', marginBottom: 22 }}>The Legacy</span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(34px,5vw,66px)', lineHeight: 1.05, color: 'var(--hl-text)', margin: 0 }}>It becomes a book.</h2>
          </div>
          <p className={'reveal' + (seen ? ' in' : '')} style={{ animationDelay: '.08s', textAlign: 'center', maxWidth: 600, margin: '0 auto 56px', fontSize: 18, lineHeight: 1.6, color: 'var(--hl-muted)' }}>A real one, in your hands. And when you want to, the same story can live on in other forms too.</p>

          {/* THE BOOK — the centerpiece */}
          <div className={'book-feature reveal' + (seen ? ' in' : '')} style={{ animationDelay: '.12s', display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: 'clamp(32px,5vw,64px)', alignItems: 'center', background: 'var(--hl-surface)', border: '1px solid var(--hl-accent-line)', borderRadius: 24, padding: 'clamp(30px,4.5vw,60px)', marginBottom: 'clamp(48px,7vw,80px)', boxShadow: '0 40px 90px -50px var(--hl-shadow)' }}>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.26em', textTransform: 'uppercase', color: 'var(--hl-accent)' }}>The centerpiece</span>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(40px,6vw,68px)', lineHeight: 1, color: 'var(--hl-text)', margin: '16px 0 18px' }}>{book.t}</h3>
              <p style={{ fontSize: 'clamp(17px,2vw,20px)', lineHeight: 1.62, color: 'var(--hl-muted)', margin: '0 0 28px', maxWidth: 480 }}>{book.d}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                {['Hardcover/paperback', 'On-demand'].map((tag) => (
                  <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.06em', color: 'var(--hl-text)', background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', borderRadius: 999, padding: '8px 14px' }}>
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--hl-accent)' }} />{tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="book-feature-visual" style={{ display: 'flex', justifyContent: 'center' }}>
              <BookCover />
            </div>
          </div>

          {/* Other formats — optional, secondary */}
          <div className={'reveal' + (seen ? ' in' : '')} style={{ animationDelay: '.2s', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 26 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.24em', textTransform: 'uppercase', color: 'var(--hl-faint)', whiteSpace: 'nowrap' }}>Other ways to share it</span>
            <span style={{ flex: 1, height: 1, background: 'var(--hl-border)' }} />
          </div>
          <div className="how-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
            {others.map((s, i) => (
              <div key={s.t} className={'reveal' + (seen ? ' in' : '')} style={{ animationDelay: (0.24 + i * 0.08) + 's', background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 16, padding: '24px 22px', height: '100%' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--hl-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)', marginBottom: 18 }}>
                  <Icon name={s.icon} size={21} />
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 22, margin: '0 0 8px', color: 'var(--hl-text)' }}>{s.t}</h3>
                <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--hl-muted)', margin: 0 }}>{s.d}</p>
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
          <span style={{ color: 'var(--hl-accent)', display: 'inline-flex' }}><Icon name="feather" size={34} /></span>
          <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 300, fontSize: 'clamp(28px,4.4vw,52px)', lineHeight: 1.2, color: 'var(--hl-text)', margin: '24px 0 40px' }}>All memories fade. They don't have to be forgotten.</p>
          <PrimaryCta onClick={onStart}>Start Your Story</PrimaryCta>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.06em', color: 'var(--hl-muted)', margin: '18px 0 0' }}>Write your first story in under two minutes.</p>
        </div>
      </section>
    );
  }

  function Footer() {
    return (
      <footer className="hl-foot" data-screen-label="Footer">
        <div className="hl-foot-wrap">
          <div className="hl-foot-top">
            <div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--hl-accent)', margin: '0 0 8px' }}>Brought to you by</p>
              <p className="hl-foot-mark">Second Brain <em>Labs</em></p>
              <p className="hl-foot-blurb">Second Brain Labs is a small workshop built around the belief that language is changing the relationship between people and technology.</p>
            </div>
            <div>
              <h5>Learn</h5>
              <div className="hl-foot-links">
                <a href="#how-i-work">About</a>
                <a href="#">Blog</a>
                <a href="#">LinkedIn ↗</a>
              </div>
            </div>
            <div>
              <h5>Contact</h5>
              <div className="hl-foot-links">
                <a href="mailto:hello@2bl.ai">hello@2bl.ai</a>
                <a href="#">Toronto · Remote</a>
              </div>
            </div>
          </div>
          <div className="hl-foot-bottom">
            <span>© 2026 Second Brain Labs, Inc.</span>
            <span className="hl-foot-markline">Trying the impossible, one product at a time.</span>
          </div>
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
        <WhyDifferent />
        <TheBestPart />
        <Closing onStart={onStart} />
        <Footer />
      </div>
    );
  }

  window.Landing = Landing;
})();
