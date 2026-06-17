/* mobile-screens.jsx — Heirloom mobile screens + nav chrome.
   Exports: MobileLanding, AppHeader, BottomTabBar, Drawer, ChatScreen,
   MemoriesScreen, StoriesScreen, ProfileScreen, RowActionsSheet, ContextMenu. */
(function () {
  const { useState, useEffect, useRef } = React;
  const Icon = window.Icon;
  const { CONTENT, initials } = window.HL;
  const { AppIcon, BottomSheet, PullToRefresh } = window;

  const press = (h, setH) => ({
    onMouseDown: () => setH(true), onMouseUp: () => setH(false), onMouseLeave: () => setH(false),
    onTouchStart: () => setH(true), onTouchEnd: () => setH(false),
  });

  // ── App header (in-app top bar) ──────────────────────────────────────────
  function AppHeader({ title, subtitle, onBack, onMenu, right, transparent }) {
    return (
      <div style={{ position: 'relative', zIndex: 20, paddingTop: 'var(--safe-top)', flexShrink: 0,
        background: transparent ? 'transparent' : 'color-mix(in srgb, var(--hl-bg) 86%, transparent)',
        backdropFilter: transparent ? 'none' : 'blur(14px)', borderBottom: transparent ? '1px solid transparent' : '1px solid var(--hl-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', minHeight: 50 }}>
          {onBack && <IconBtn name="arrowLeft" onClick={onBack} label="Back" />}
          {onMenu && <IconBtn name="menu" onClick={onMenu} label="Menu" />}
          <div style={{ flex: 1, minWidth: 0, textAlign: onBack ? 'center' : 'left', paddingRight: onBack ? 36 : 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, lineHeight: 1.1, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
            {subtitle && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--hl-muted)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          {right}
        </div>
      </div>
    );
  }

  function IconBtn({ name, onClick, label, accent, badge }) {
    const [h, setH] = useState(false);
    return (
      <button aria-label={label} onClick={onClick} {...press(h, setH)} style={{ position: 'relative', flexShrink: 0, width: 38, height: 38, borderRadius: 11, border: 'none',
        background: h ? 'color-mix(in srgb, var(--hl-text) 8%, transparent)' : 'transparent', color: accent ? 'var(--hl-accent)' : 'var(--hl-text)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background .15s' }}>
        <Icon name={name} size={20} />
        {badge && <span style={{ position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: '50%', background: 'var(--hl-accent)', border: '1.5px solid var(--hl-bg)' }} />}
      </button>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  //  LANDING (mobile, scrollable)
  // ════════════════════════════════════════════════════════════════════════
  function MobileLanding({ onStart, onInstall }) {
    const c = CONTENT;
    const [showInstall, setShowInstall] = useState(false);
    const reveal = useRevealAll();
    return (
      <div className="hl-scroll" ref={reveal} style={{ height: '100%' }}>
        {/* slim mobile nav */}
        <div style={{ position: 'sticky', top: 0, zIndex: 20, paddingTop: 'var(--safe-top)', background: 'color-mix(in srgb, var(--hl-bg) 80%, transparent)', backdropFilter: 'blur(12px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <AppIcon size={28} radius={8} />
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20, color: 'var(--hl-text)' }}>Heirloom</span>
            </span>
            <button onClick={onStart} style={{ background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', border: 'none', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13.5, padding: '8px 15px', borderRadius: 10 }}>Start</button>
          </div>
        </div>

        {/* hero */}
        <section style={{ position: 'relative', padding: '34px 22px 40px', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 18%, var(--hl-glow-1) 0%, var(--hl-glow-2) 36%, var(--hl-bg) 72%)', opacity: .8 }} />
          <div style={{ position: 'relative' }}>
            <span className="reveal" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: 'var(--hl-accent)' }}>{c.eyebrow}</span>
            <h1 className="reveal" style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(58px,17vw,84px)', lineHeight: .94, letterSpacing: '-.02em', margin: '12px 0 0', color: 'var(--hl-text)' }}>Heirloom</h1>
            <p className="reveal" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 25, color: 'var(--hl-accent)', margin: '10px 0 0' }}>{c.tagline}</p>
            <p className="reveal" style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--hl-muted)', margin: '18px 0 0', maxWidth: 340 }}>{c.sub}</p>
            <div className="reveal" style={{ display: 'flex', flexWrap: 'wrap', gap: 7, margin: '20px 0 26px' }}>
              {c.formats.map((f) => <span key={f} style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--hl-muted)', border: '1px solid var(--hl-border-strong)', borderRadius: 99, padding: '6px 12px' }}>{f}</span>)}
            </div>
            <div className="reveal" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <BigBtn onClick={onStart}>Start Your Story</BigBtn>
              <FormatFanMini />
            </div>
          </div>
        </section>

        {/* what is */}
        <section style={{ padding: '14px 22px 36px' }}>
          <SectionEyebrow>What Is Heirloom</SectionEyebrow>
          <h2 className="reveal" style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 30, lineHeight: 1.15, color: 'var(--hl-text)', margin: '0 0 22px' }}>An AI-guided platform to capture, shape, and publish a life story.</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {c.whatis.map((s, i) => (
              <div key={s.label} className="reveal" style={{ background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 16, padding: 18, display: 'flex', gap: 14 }}>
                <div style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 13, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={s.icon} size={22} /></div>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--hl-accent)', marginBottom: 6 }}>{s.label}</div>
                  <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--hl-muted)', margin: 0 }}>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* how it works */}
        <section style={{ padding: '14px 22px 36px', background: 'var(--hl-surface)', borderTop: '1px solid var(--hl-border)', borderBottom: '1px solid var(--hl-border)' }}>
          <SectionEyebrow>How It Works</SectionEyebrow>
          <h2 className="reveal" style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 32, color: 'var(--hl-text)', margin: '0 0 22px' }}>Five steps. One book.</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {c.how.map((s) => (
              <div key={s.n} className="reveal" style={{ display: 'flex', gap: 15, alignItems: 'baseline', background: 'var(--hl-bg)', border: '1px solid var(--hl-border)', borderRadius: 14, padding: '15px 16px' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, lineHeight: 1, color: 'var(--hl-accent)', opacity: .5, flexShrink: 0, width: 38 }}>{s.n}</span>
                <div><h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20, margin: '0 0 4px', color: 'var(--hl-text)' }}>{s.t}</h3><p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--hl-muted)', margin: 0 }}>{s.d}</p></div>
              </div>
            ))}
          </div>
        </section>

        {/* install callout */}
        <section style={{ padding: '30px 22px' }}>
          <div className="reveal" style={{ position: 'relative', overflow: 'hidden', borderRadius: 20, border: '1px solid var(--hl-accent-line)', background: 'linear-gradient(160deg, var(--hl-surface-2), var(--hl-surface))', padding: '24px 20px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><AppIcon size={56} /></div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 25, color: 'var(--hl-text)', margin: '0 0 8px' }}>Keep it in your pocket</h3>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--hl-muted)', margin: '0 auto 18px', maxWidth: 280 }}>Install Heirloom as an app — full screen, offline-ready, always with you.</p>
            <BigBtn onClick={onInstall}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon name="plusCircle" size={18} /> Add to Home Screen</span></BigBtn>
          </div>
        </section>

        {/* closing */}
        <section style={{ position: 'relative', padding: '40px 22px calc(var(--safe-bottom) + 40px)', textAlign: 'center', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, var(--hl-glow-1) 0%, var(--hl-bg) 60%)', opacity: .7 }} />
          <div className="reveal" style={{ position: 'relative' }}>
            <span style={{ color: 'var(--hl-accent)', display: 'inline-flex' }}><Icon name="quote" size={28} /></span>
            <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 300, fontSize: 27, lineHeight: 1.25, color: 'var(--hl-text)', margin: '16px 0 26px' }}>{c.closing}</p>
            <BigBtn onClick={onStart}>Start Your Story</BigBtn>
          </div>
        </section>
      </div>
    );
  }

  function FormatFanMini() {
    const items = [{ i: 'bookOpen', t: 'Book' }, { i: 'panels', t: 'Comic' }, { i: 'monitor', t: 'Webpage' }, { i: 'headphones', t: 'Audiobook' }];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {items.map((e) => (
          <div key={e.t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 13, background: 'var(--hl-surface)', border: '1px solid var(--hl-border)' }}>
            <span style={{ color: 'var(--hl-accent)', display: 'flex' }}><Icon name={e.i} size={17} /></span>
            <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 17, color: 'var(--hl-text)' }}>{e.t}</span>
          </div>
        ))}
      </div>
    );
  }
  const SectionEyebrow = ({ children }) => (
    <div className="reveal" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: 'var(--hl-accent)', marginBottom: 14 }}>{children}</div>
  );
  function BigBtn({ children, onClick }) {
    const [h, setH] = useState(false);
    return (
      <button onClick={onClick} {...press(h, setH)} style={{ width: '100%', background: 'var(--hl-accent)', color: 'var(--hl-on-accent)', border: 'none', borderRadius: 14, padding: '16px 22px',
        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 16, cursor: 'pointer', boxShadow: '0 12px 30px -12px color-mix(in srgb, var(--hl-accent) 60%, transparent)',
        transition: 'transform .14s', transform: h ? 'scale(.98)' : 'none' }}>{children}</button>
    );
  }

  // Reveal-on-scroll for .reveal children inside a container, with a guaranteed
  // fallback so content is never stuck hidden.
  function useRevealAll() {
    const ref = useRef(null);
    useEffect(() => {
      const root = ref.current; if (!root) return;
      const els = Array.from(root.querySelectorAll('.reveal'));
      els.forEach((el, i) => { el.style.transitionDelay = ((i % 5) * 0.04) + 's'; });
      let io;
      try {
        io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { root, threshold: 0.08 });
        els.forEach((el) => io.observe(el));
      } catch (_) { /* ignore */ }
      // Fallback: reveal everything shortly after mount regardless of IO.
      const fb = setTimeout(() => els.forEach((el) => el.classList.add('in')), 350);
      return () => { if (io) io.disconnect(); clearTimeout(fb); };
    }, []);
    return ref;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  CHAT
  // ════════════════════════════════════════════════════════════════════════
  function ChatScreen({ title = 'A story worth keeping', onBack, onKebab, onToast, bottomPad }) {
    const c = CONTENT;
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [typing, setTyping] = useState(false);
    const turn = useRef(0);
    const scrollRef = useRef(null);
    const taRef = useRef(null);

    useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, typing]);

    const send = (t) => {
      const body = (t || '').trim(); if (!body) return;
      setMessages((m) => [...m, { id: 'u' + Date.now(), role: 'user', content: body }]);
      setText(''); if (taRef.current) taRef.current.style.height = 'auto';
      setTyping(true);
      const idx = Math.min(turn.current, c.guideTurns.length - 1);
      const isSave = idx === c.guideTurns.length - 1;
      turn.current += 1;
      setTimeout(() => {
        setTyping(false);
        setMessages((m) => { const n = [...m]; if (isSave) n.push({ id: 's' + Date.now(), role: 'saved', content: 'Saved to Chapter One' }); n.push({ id: 'a' + Date.now(), role: 'assistant', content: c.guideTurns[idx] }); return n; });
      }, 1100 + Math.random() * 500);
    };

    const started = messages.length > 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--hl-bg)' }}>
        <AppHeader title={title} subtitle="Your guide" onBack={onBack}
          right={<IconBtn name="moreVertical" onClick={(e) => onKebab && onKebab(e.currentTarget.getBoundingClientRect())} label="Options" />} />

        <div ref={scrollRef} className="hl-scroll" style={{ flex: 1, minHeight: 0, padding: '16px 16px 8px' }}>
          {!started ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 14px' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', color: 'var(--hl-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><Icon name="feather" size={22} /></div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 30, lineHeight: 1.15, color: 'var(--hl-text)', margin: '0 0 18px' }}>{c.emptyPrompt}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, width: '100%', maxWidth: 320 }}>
                {c.starters.map((s) => (
                  <button key={s} onClick={() => send(s)} style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--hl-text)', background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 13, padding: '13px 16px', textAlign: 'left', cursor: 'pointer' }}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560, margin: '0 auto' }}>
              {messages.map((m) => m.role === 'saved' ? <SavedMark key={m.id} label={m.content} /> : <Bubble key={m.id} role={m.role} content={m.content} />)}
              {typing && <TypingBubble />}
            </div>
          )}
        </div>

        <Composer text={text} setText={setText} onSend={() => send(text)} taRef={taRef} onAttach={() => onToast && onToast('Attach a photo or letter')} bottomPad={bottomPad} />
      </div>
    );
  }

  function Bubble({ role, content }) {
    const me = role === 'user';
    return (
      <div style={{ display: 'flex', justifyContent: me ? 'flex-end' : 'flex-start', animation: 'hl-bubble-in .3s ease both' }}>
        {!me && <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', color: 'var(--hl-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 9, marginTop: 2 }}><Icon name="feather" size={14} /></div>}
        <div style={{ maxWidth: '80%', padding: me ? '11px 15px' : '12px 16px', borderRadius: me ? '18px 18px 5px 18px' : '5px 18px 18px 18px',
          background: me ? 'var(--hl-accent)' : 'var(--hl-surface)', color: me ? 'var(--hl-on-accent)' : 'var(--hl-text)',
          border: me ? 'none' : '1px solid var(--hl-border)', fontFamily: me ? 'var(--font-body)' : 'var(--font-display)',
          fontSize: me ? 15 : 18, lineHeight: me ? 1.45 : 1.4 }}>{content}</div>
      </div>
    );
  }
  function SavedMark({ label }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--hl-accent)' }}><Icon name="bookMark" size={12} /> {label}</span>
      </div>
    );
  }
  function TypingBubble() {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', color: 'var(--hl-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="feather" size={14} /></div>
        <div style={{ display: 'flex', gap: 5, padding: '13px 16px', background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: '5px 18px 18px 18px' }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--hl-muted)', animation: `hl-typing 1.2s ${i * 0.16}s infinite` }} />)}
        </div>
      </div>
    );
  }
  function Composer({ text, setText, onSend, taRef, onAttach, bottomPad }) {
    const grow = (e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; setText(e.target.value); };
    return (
      <div style={{ flexShrink: 0, padding: `8px 12px calc(${bottomPad || 'var(--safe-bottom)'} + 8px)`, background: 'color-mix(in srgb, var(--hl-bg) 90%, transparent)', backdropFilter: 'blur(12px)', borderTop: '1px solid var(--hl-border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, background: 'var(--hl-surface)', border: '1px solid var(--hl-border-strong)', borderRadius: 22, padding: 6 }}>
          <CircleBtn name="paperclip" onClick={onAttach} label="Attach" />
          <textarea ref={taRef} value={text} onChange={grow} rows={1} placeholder="Share a memory…" aria-label="Message"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            style={{ flex: 1, minWidth: 0, resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 15.5, lineHeight: 1.4, padding: '8px 2px', maxHeight: 120 }} />
          {text.trim()
            ? <CircleBtn name="arrowUp" onClick={onSend} label="Send" filled />
            : <CircleBtn name="mic" onClick={() => {}} label="Voice" />}
        </div>
      </div>
    );
  }
  function CircleBtn({ name, onClick, label, filled }) {
    const [h, setH] = useState(false);
    return (
      <button aria-label={label} onClick={onClick} {...press(h, setH)} style={{ flexShrink: 0, width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: filled ? 'var(--hl-accent)' : (h ? 'var(--hl-accent-soft)' : 'transparent'), color: filled ? 'var(--hl-on-accent)' : 'var(--hl-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s, transform .12s', transform: h ? 'scale(.94)' : 'none' }}>
        <Icon name={name} size={19} />
      </button>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  //  MEMORIES (list with row actions: sheet | swipe | longpress)
  // ════════════════════════════════════════════════════════════════════════
  function MemoriesScreen({ items, mode, offline, onOpen, onSheet, onContext, onQuick, refreshing, onRefresh, scrollPad }) {
    return (
      <PullToRefresh onRefresh={onRefresh} refreshing={refreshing}>
        <div style={{ padding: `calc(var(--safe-top) + 8px) 14px ${scrollPad || 'calc(var(--safe-bottom) + 20px)'}` }}>
          <div style={{ padding: '4px 4px 14px' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 38, color: 'var(--hl-text)', margin: 0 }}>Memories</h1>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--hl-muted)', margin: '4px 0 0' }}>{items.length} conversations · pull to sync</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {items.map((it) => <MemoryRow key={it.id} item={it} mode={mode} offline={offline} onOpen={onOpen} onSheet={onSheet} onContext={onContext} onQuick={onQuick} />)}
          </div>
        </div>
      </PullToRefresh>
    );
  }

  function MemoryRow({ item, mode, offline, onOpen, onSheet, onContext, onQuick }) {
    const [dx, setDx] = useState(0);          // swipe offset
    const startX = useRef(null);
    const moved = useRef(false);
    const lpTimer = useRef(null);
    const REVEAL = 132;

    const cancelLP = () => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; } };

    const onDown = (x, rect) => {
      moved.current = false;
      if (mode === 'swipe') startX.current = x;
      if (mode === 'longpress') { lpTimer.current = setTimeout(() => { lpTimer.current = null; onContext && onContext(item, rect); }, 480); }
    };
    const onMove = (x) => {
      if (Math.abs(x - (startX.current ?? x)) > 6) { moved.current = true; cancelLP(); }
      if (mode === 'swipe' && startX.current != null) { const d = x - startX.current; setDx(Math.max(-REVEAL, Math.min(0, d + (dx < 0 ? 0 : 0)))); }
    };
    const onUp = () => {
      cancelLP();
      if (mode === 'swipe' && startX.current != null) { setDx(dx < -REVEAL / 2 ? -REVEAL : 0); startX.current = null; }
    };
    const tap = () => { if (!moved.current) { if (dx < 0) { setDx(0); } else { onOpen && onOpen(item); } } };

    return (
      <div style={{ position: 'relative', borderRadius: 15, overflow: 'hidden' }}>
        {/* swipe action layer */}
        {mode === 'swipe' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'flex-end' }}>
            <QuickAction name="star" label="Star" bg="var(--hl-accent)" fg="var(--hl-on-accent)" onClick={() => { setDx(0); onQuick && onQuick(item, 'star'); }} />
            <QuickAction name="trash" label="Delete" bg="var(--hl-danger)" fg="#fff" onClick={() => { setDx(0); onQuick && onQuick(item, 'delete'); }} />
          </div>
        )}
        <div role="button" tabIndex={0}
          onClick={tap}
          onTouchStart={(e) => onDown(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
          onTouchMove={(e) => onMove(e.touches[0].clientX)}
          onTouchEnd={onUp}
          onMouseDown={(e) => onDown(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseMove={(e) => { if (startX.current != null || lpTimer.current) onMove(e.clientX); }}
          onMouseUp={onUp} onMouseLeave={() => { if (mode !== 'swipe') cancelLP(); }}
          onContextMenu={(e) => { e.preventDefault(); onContext && onContext(item, e.currentTarget.getBoundingClientRect()); }}
          style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 12px 14px 15px', background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 15,
            transform: `translateX(${dx}px)`, transition: startX.current == null ? 'transform .26s cubic-bezier(.22,1,.36,1)' : 'none', cursor: 'pointer', userSelect: 'none' }}>
          <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 11, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="message" size={18} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {item.starred && <span style={{ color: 'var(--hl-accent)', display: 'flex' }}><Icon name="star" size={13} /></span>}
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--hl-faint)' }}>{item.when}</span>
              {offline && !item.cached && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--hl-danger)', opacity: .8 }}>· not saved offline</span>}
              {item.cached && <span title="Available offline" style={{ color: 'var(--hl-muted)', display: 'flex', opacity: .7 }}><Icon name="check" size={12} /></span>}
            </div>
          </div>
          {mode !== 'swipe' && (
            <button aria-label="Options" onClick={(e) => { e.stopPropagation(); onSheet && onSheet(item); }} style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--hl-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="moreVertical" size={18} /></button>
          )}
        </div>
      </div>
    );
  }
  function QuickAction({ name, label, bg, fg, onClick }) {
    return (
      <button aria-label={label} onClick={onClick} style={{ width: 66, border: 'none', background: bg, color: fg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}>
        <Icon name={name} size={19} /><span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase' }}>{label}</span>
      </button>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  //  STORIES
  // ════════════════════════════════════════════════════════════════════════
  function StoriesScreen({ onOpen, onSheet, onCreate, scrollPad }) {
    const c = CONTENT;
    return (
      <div className="hl-scroll" style={{ height: '100%', padding: `calc(var(--safe-top) + 8px) 14px ${scrollPad || 'calc(var(--safe-bottom) + 20px)'}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '4px 4px 14px' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 38, color: 'var(--hl-text)', margin: 0 }}>Stories</h1>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--hl-muted)', margin: '4px 0 0' }}>{c.stories.length} books in progress</p>
          </div>
          <button onClick={onCreate} aria-label="New story" style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid var(--hl-accent-line)', background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="plus" size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {c.stories.map((s) => (
            <div key={s.id} onClick={() => onOpen && onOpen(s)} style={{ background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 17, padding: 17, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flexShrink: 0, width: 44, height: 56, borderRadius: '4px 8px 8px 4px', background: 'linear-gradient(135deg, var(--hl-surface-2), var(--hl-accent-soft))', border: '1px solid var(--hl-accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-accent)' }}><Icon name="bookOpen" size={20} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--hl-text)', lineHeight: 1.1 }}>{s.name}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 15, color: 'var(--hl-muted)', marginTop: 2 }}>{s.tagline}</div>
                </div>
                <button aria-label="Options" onClick={(e) => { e.stopPropagation(); onSheet && onSheet(s); }} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--hl-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="moreVertical" size={17} /></button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--hl-border)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--hl-faint)' }}>{s.chapters} chapters</span>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {s.collaborators.slice(0, 3).map((co, i) => (
                    <span key={i} style={{ width: 26, height: 26, borderRadius: '50%', marginLeft: i ? -8 : 0, background: 'var(--hl-accent-soft)', border: '1.5px solid var(--hl-surface)', color: 'var(--hl-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 500 }}>{initials(co.name)}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  //  PROFILE / SETTINGS  (hosts PWA controls)
  // ════════════════════════════════════════════════════════════════════════
  function ProfileScreen({ installed, notifications, offline, onInstall, onNotifications, onToggleOffline, scrollPad }) {
    return (
      <div className="hl-scroll" style={{ height: '100%', padding: `calc(var(--safe-top) + 8px) 14px ${scrollPad || 'calc(var(--safe-bottom) + 20px)'}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '14px 0 22px' }}>
          <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'var(--hl-accent-soft)', border: '1px solid var(--hl-accent-line)', color: 'var(--hl-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500 }}>JH</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--hl-text)', marginTop: 12 }}>James Hayes</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--hl-muted)', marginTop: 3 }}>Storyteller · since 2024</div>
        </div>
        <SettingsGroup label="App">
          <SettingRow icon="plusCircle" title="Install Heirloom" desc={installed ? 'Added to your home screen' : 'Full-screen, offline-ready'} done={installed} onClick={installed ? null : onInstall} cta={installed ? null : 'Install'} />
          <SettingRow icon="heart" title="Notifications" desc={notifications ? 'On — gentle nudges only' : 'Off'} toggle value={notifications} onClick={onNotifications} />
          <SettingRow icon="check" title="Offline access" desc={offline ? 'Saved memories available offline' : 'Sync over network'} toggle value={offline} onClick={onToggleOffline} />
        </SettingsGroup>
        <SettingsGroup label="Story">
          <SettingRow icon="bookOpen" title="My books" desc="3 stories in progress" chevron />
          <SettingRow icon="userPlus" title="Collaborators" desc="Eleanor, Marcus, Sofia" chevron />
          <SettingRow icon="share" title="Share Heirloom" desc="Invite someone to begin" chevron />
        </SettingsGroup>
      </div>
    );
  }
  const SettingsGroup = ({ label, children }) => (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--hl-faint)', margin: '0 6px 9px' }}>{label}</div>
      <div style={{ background: 'var(--hl-surface)', border: '1px solid var(--hl-border)', borderRadius: 16, overflow: 'hidden' }}>{children}</div>
    </div>
  );
  function SettingRow({ icon, title, desc, chevron, toggle, value, cta, done, onClick }) {
    return (
      <button onClick={onClick || undefined} disabled={!onClick} style={{ display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left', padding: '14px 14px', border: 'none', borderBottom: '1px solid var(--hl-border)', background: 'transparent', cursor: onClick ? 'pointer' : 'default' }}>
        <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={18} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15.5, color: 'var(--hl-text)', fontWeight: 500 }}>{title}</span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--hl-muted)', marginTop: 1 }}>{desc}</span>
        </span>
        {chevron && <span style={{ color: 'var(--hl-faint)', display: 'flex' }}><Icon name="chevronRight" size={17} /></span>}
        {cta && <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--hl-on-accent)', background: 'var(--hl-accent)', padding: '6px 13px', borderRadius: 9 }}>{cta}</span>}
        {done && <span style={{ color: 'var(--hl-accent)', display: 'flex' }}><Icon name="check" size={18} /></span>}
        {toggle && <ToggleSwitch on={value} />}
      </button>
    );
  }
  const ToggleSwitch = ({ on }) => (
    <span style={{ flexShrink: 0, width: 44, height: 26, borderRadius: 99, background: on ? 'var(--hl-accent)' : 'var(--hl-border-strong)', position: 'relative', transition: 'background .2s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
    </span>
  );

  // ── Row-actions bottom sheet ─────────────────────────────────────────────
  function RowActionsSheet({ open, item, onAction, onClose }) {
    if (!item) return null;
    const acts = CONTENT.rowActions.map((a) => a.key === 'star' && item.starred ? { ...a, label: 'Unstar' } : a);
    return (
      <BottomSheet open={open} onClose={onClose} label="Conversation options">
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 6px 14px', borderBottom: '1px solid var(--hl-border)', marginBottom: 6 }}>
          <div style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 11, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="message" size={17} /></div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, color: 'var(--hl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title || item.name}</div>
        </div>
        {acts.map((a) => (
          <button key={a.key} onClick={() => onAction(a.key)} style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', padding: '14px 8px', border: 'none', background: 'transparent', cursor: 'pointer',
            color: a.danger ? 'var(--hl-danger)' : 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 500 }}>
            <span style={{ display: 'flex', color: a.danger ? 'var(--hl-danger)' : 'var(--hl-muted)' }}><Icon name={a.icon} size={20} /></span>{a.label}
          </button>
        ))}
      </BottomSheet>
    );
  }

  // ── Long-press context menu (popover) ────────────────────────────────────
  function ContextMenu({ item, rect, onAction, onClose }) {
    if (!item || !rect) return null;
    const acts = CONTENT.rowActions.map((a) => a.key === 'star' && item.starred ? { ...a, label: 'Unstar' } : a);
    const W = 230, top = Math.min(rect.bottom + 6, rect.top + 40);
    const left = Math.max(10, Math.min(rect.left + 10, rect.right - W));
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 80 }}>
        <div onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} style={{ position: 'absolute', inset: 0 }} />
        <div role="menu" style={{ position: 'absolute', top, left, width: W, background: 'var(--hl-surface)', border: '1px solid var(--hl-border-strong)', borderRadius: 16, padding: 6,
          boxShadow: '0 24px 60px -18px rgba(0,0,0,.5)', animation: 'hl-scale-in .14s cubic-bezier(.22,1,.36,1)', transformOrigin: 'top left' }}>
          {acts.map((a, i) => (
            <React.Fragment key={a.key}>
              {a.danger && <div style={{ height: 1, background: 'var(--hl-border)', margin: '5px 8px' }} />}
              <button onClick={() => onAction(a.key)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '11px 10px', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 9,
                color: a.danger ? 'var(--hl-danger)' : 'var(--hl-text)', fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500 }}>
                <span style={{ display: 'flex', color: a.danger ? 'var(--hl-danger)' : 'var(--hl-muted)' }}><Icon name={a.icon} size={18} /></span>{a.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  // ── Bottom tab bar ───────────────────────────────────────────────────────
  function BottomTabBar({ tab, onTab, onNew }) {
    const tabs = [
      { key: 'chat', icon: 'message', label: 'Chat' },
      { key: 'stories', icon: 'bookOpen', label: 'Stories' },
      { key: 'memories', icon: 'clock', label: 'Memories' },
      { key: 'profile', icon: 'user', label: 'You' },
    ];
    return (
      <div style={{ flexShrink: 0, paddingBottom: 'var(--safe-bottom)', background: 'color-mix(in srgb, var(--hl-bg) 90%, transparent)', backdropFilter: 'blur(16px)', borderTop: '1px solid var(--hl-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '7px 8px 4px' }}>
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => onTab(t.key)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '4px 0', border: 'none', background: 'transparent', cursor: 'pointer', color: active ? 'var(--hl-accent)' : 'var(--hl-muted)' }}>
                <Icon name={t.icon} size={22} strokeWidth={active ? 2.1 : 1.7} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: active ? 600 : 400 }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Slide-in drawer (mirrors the desktop sidebar) ────────────────────────
  function Drawer({ open, onClose, onNav, onNew, active }) {
    const c = CONTENT;
    const nav = [
      { key: 'new', icon: 'edit', label: 'New Chat' },
      { key: 'memories', icon: 'clock', label: 'Memories' },
      { key: 'stories', icon: 'bookOpen', label: 'Stories' },
      { key: 'profile', icon: 'user', label: 'You' },
    ];
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 75, pointerEvents: open ? 'auto' : 'none' }}>
        <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(20,14,8,.45)', opacity: open ? 1 : 0, transition: 'opacity .3s' }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '80%', maxWidth: 290, background: 'var(--hl-bg-2)', borderRight: '1px solid var(--hl-border)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform .34s cubic-bezier(.22,1,.36,1)', display: 'flex', flexDirection: 'column',
          paddingTop: 'var(--safe-top)', boxShadow: open ? '20px 0 60px -20px rgba(0,0,0,.5)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px 14px' }}>
            <AppIcon size={32} radius={9} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22, color: 'var(--hl-text)' }}>Heirloom</span>
          </div>
          <nav className="hl-scroll" style={{ flex: 1, padding: '6px 12px' }}>
            {nav.map((n) => {
              const on = active === n.key;
              return (
                <button key={n.key} onClick={() => onNav(n.key)} style={{ display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left', padding: '13px 13px', borderRadius: 12, border: 'none', marginBottom: 2,
                  background: on ? 'color-mix(in srgb, var(--hl-text) 8%, transparent)' : 'transparent', color: on ? 'var(--hl-text)' : 'var(--hl-muted)', cursor: 'pointer' }}>
                  <Icon name={n.icon} size={20} /><span style={{ fontSize: 15.5, fontWeight: 500 }}>{n.label}</span>
                </button>
              );
            })}
            <div style={{ height: 1, background: 'var(--hl-border)', margin: '12px 6px' }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--hl-faint)', padding: '0 8px 8px' }}>Recent</div>
            {c.memories.slice(0, 4).map((m) => (
              <button key={m.id} onClick={() => onNav('memories')} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 13px', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--hl-muted)', cursor: 'pointer' }}>
                {m.starred && <span style={{ color: 'var(--hl-accent)', display: 'flex' }}><Icon name="star" size={12} /></span>}
                <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-display)', fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    );
  }

  Object.assign(window, { MobileLanding, AppHeader, IconBtn, BottomTabBar, Drawer, ChatScreen, MemoriesScreen, MemoryRow, StoriesScreen, ProfileScreen, RowActionsSheet, ContextMenu });
})();
