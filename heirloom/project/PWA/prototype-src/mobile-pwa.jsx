/* mobile-pwa.jsx — PWA chrome + device frames for the Heirloom mobile prototype.
   Exports: PhoneFrame, StatusBar, Splash, InstallSheet, OfflineBar, PushSheet,
   BottomSheet, Toast, PullToRefresh. */
(function () {
  const { useState, useEffect, useRef } = React;
  const Icon = window.Icon;

  // Safe-area insets per OS (simulated env(safe-area-inset-*) inside the bezel).
  const INSETS = {
    ios:     { top: 54, bottom: 26 },
    android: { top: 40, bottom: 20 },
  };

  // ── Status bar ───────────────────────────────────────────────────────────
  function StatusBar({ os, tone }) {
    const color = tone === 'light' ? '#F5EFE6' : '#241a12';
    const ins = INSETS[os];
    const time = '9:41';
    if (os === 'ios') {
      return (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: ins.top, zIndex: 60, pointerEvents: 'none',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '17px 30px 0' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600, color, letterSpacing: '.02em' }}>{time}</span>
          {/* Dynamic Island */}
          <div style={{ position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)', width: 108, height: 30, background: '#000', borderRadius: 18 }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color }}>
            <SignalBars color={color} />
            <WifiGlyph color={color} />
            <BatteryGlyph color={color} />
          </span>
        </div>
      );
    }
    // android
    return (
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: ins.top, zIndex: 60, pointerEvents: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 0 18px' }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600, color }}>{time}</span>
        {/* punch-hole camera */}
        <div style={{ position: 'absolute', top: 13, left: '50%', transform: 'translateX(-50%)', width: 12, height: 12, background: '#000', borderRadius: '50%' }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, color }}>
          <WifiGlyph color={color} size={13} />
          <SignalBars color={color} size={13} />
          <BatteryGlyph color={color} />
        </span>
      </div>
    );
  }
  const SignalBars = ({ color, size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 18 14" fill={color} aria-hidden="true">
      <rect x="0" y="9" width="3" height="5" rx="1" /><rect x="5" y="6" width="3" height="8" rx="1" />
      <rect x="10" y="3" width="3" height="11" rx="1" /><rect x="15" y="0" width="3" height="14" rx="1" />
    </svg>
  );
  const WifiGlyph = ({ color, size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 16 13" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M1.5 4.2a10 10 0 0 1 13 0M4 7a6.2 6.2 0 0 1 8 0M6.4 9.7a2.6 2.6 0 0 1 3.2 0" /><circle cx="8" cy="11.6" r=".5" fill={color} stroke="none" />
    </svg>
  );
  const BatteryGlyph = ({ color }) => (
    <svg width="25" height="13" viewBox="0 0 25 13" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="21" height="11" rx="3" stroke={color} strokeOpacity="0.4" /><rect x="3" y="3" width="15" height="7" rx="1.5" fill={color} />
      <rect x="23" y="4.5" width="1.6" height="4" rx="1" fill={color} fillOpacity="0.5" />
    </svg>
  );

  // ── Home indicator / gesture pill ────────────────────────────────────────
  function HomeIndicator({ os, tone }) {
    const color = tone === 'light' ? 'rgba(36,26,18,.85)' : 'rgba(245,239,230,.7)';
    const ins = INSETS[os];
    return (
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: ins.bottom, zIndex: 60, pointerEvents: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: os === 'ios' ? 134 : 108, height: os === 'ios' ? 5 : 4, borderRadius: 3, background: color }} />
      </div>
    );
  }

  // ── Phone frame ──────────────────────────────────────────────────────────
  // Renders the device bezel + status bar + home indicator and exposes safe-area
  // CSS vars (--safe-top / --safe-bottom) to children, plus a paper-grain layer.
  function PhoneFrame({ os = 'ios', tone = 'dark', grain = true, children }) {
    const [dim, setDim] = useState({ h: 820, w: 379 });
    useEffect(() => {
      const fit = () => {
        const h = Math.max(580, Math.min(880, window.innerHeight - 40));
        setDim({ h, w: Math.round(h * 0.462) });
      };
      fit();
      window.addEventListener('resize', fit);
      return () => window.removeEventListener('resize', fit);
    }, []);
    const ins = INSETS[os];
    const isIOS = os === 'ios';
    const bezel = isIOS ? 14 : 11;
    const radius = isIOS ? 56 : 40;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ position: 'relative', width: dim.w + bezel * 2, height: dim.h + bezel * 2, borderRadius: radius + bezel,
          background: isIOS ? 'linear-gradient(150deg,#2b2622,#16120f)' : 'linear-gradient(150deg,#23262b,#0e1013)',
          padding: bezel, boxShadow: '0 60px 130px -40px rgba(0,0,0,.85), inset 0 0 0 2px rgba(255,255,255,.05)' }}>
          {/* side buttons */}
          <div style={{ position: 'absolute', left: -2, top: 120, width: 3, height: 58, borderRadius: 3, background: '#0c0a08' }} />
          <div style={{ position: 'absolute', right: -2, top: 150, width: 3, height: 78, borderRadius: 3, background: '#0c0a08' }} />
          <div className={grain ? 'paper-grain' : ''} style={{ position: 'relative', width: dim.w, height: dim.h, borderRadius: radius, overflow: 'hidden',
            background: 'var(--hl-bg)', '--safe-top': ins.top + 'px', '--safe-bottom': ins.bottom + 'px' }}>
            <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>{children}</div>
            <StatusBar os={os} tone={tone} />
            <HomeIndicator os={os} tone={tone} />
          </div>
        </div>
      </div>
    );
  }

  // ── Bottom sheet primitive ───────────────────────────────────────────────
  function BottomSheet({ open, onClose, children, label, peek }) {
    if (!open) return null;
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 70, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(20,14,8,.42)', backdropFilter: 'blur(2px)', animation: 'hl-fade-in .2s ease' }} />
        <div role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()} style={{
          position: 'relative', background: 'var(--hl-surface)', borderTopLeftRadius: 26, borderTopRightRadius: 26,
          borderTop: '1px solid var(--hl-border-strong)', boxShadow: '0 -24px 60px -20px rgba(0,0,0,.4)',
          padding: '10px 16px calc(var(--safe-bottom) + 14px)', animation: 'hl-sheet-up .32s cubic-bezier(.22,1,.36,1)', maxHeight: '82%', overflowY: 'auto' }}>
          <div style={{ width: 38, height: 5, borderRadius: 3, background: 'var(--hl-border-strong)', margin: '0 auto 8px' }} />
          {children}
        </div>
      </div>
    );
  }

  // ── Toast ────────────────────────────────────────────────────────────────
  function Toast({ msg }) {
    if (!msg) return null;
    return (
      <div style={{ position: 'absolute', left: '50%', bottom: 'calc(var(--safe-bottom) + 22px)', zIndex: 85, transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 9, padding: '10px 16px', borderRadius: 99,
        background: 'color-mix(in srgb, var(--hl-text) 92%, transparent)', color: 'var(--hl-bg)',
        fontFamily: 'var(--font-mono)', fontSize: 11.5, letterSpacing: '.06em', textTransform: 'uppercase',
        boxShadow: '0 16px 40px -12px rgba(0,0,0,.5)', animation: 'hl-toast-in .26s cubic-bezier(.22,1,.36,1)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        <span style={{ display: 'flex', color: 'var(--hl-accent)' }}><Icon name="check" size={14} /></span>{msg}
      </div>
    );
  }

  // ── Splash (standalone launch) ───────────────────────────────────────────
  function Splash({ tone }) {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24,
        background: 'radial-gradient(ellipse at 50% 38%, var(--hl-glow-1) 0%, var(--hl-glow-2) 42%, var(--hl-bg) 78%)' }}>
        <div style={{ animation: 'hl-splash-glyph .9s cubic-bezier(.22,1,.36,1) both' }}>
          <AppIcon size={92} />
        </div>
        <div style={{ textAlign: 'center', animation: 'hl-fade-in .8s ease .4s both' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 40, letterSpacing: '.02em', color: 'var(--hl-text)' }}>Heirloom</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.32em', textTransform: 'uppercase', color: 'var(--hl-accent)', marginTop: 8 }}>A memoir, guided</div>
        </div>
        <div style={{ position: 'absolute', bottom: 'calc(var(--safe-bottom) + 26px)', display: 'flex', gap: 6, animation: 'hl-fade-in .6s ease .8s both' }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--hl-accent)', opacity: .5, animation: `hl-typing 1.2s ${i * 0.16}s infinite` }} />)}
        </div>
      </div>
    );
  }

  // The installable app icon — a gold tile with a book glyph (simple shapes only).
  function AppIcon({ size = 60, radius }) {
    const r = radius != null ? radius : size * 0.235;
    return (
      <div style={{ width: size, height: size, borderRadius: r, position: 'relative',
        background: 'linear-gradient(155deg, #D9B978 0%, #B68A3E 55%, #8C6526 100%)',
        boxShadow: '0 10px 26px -8px rgba(120,82,28,.6), inset 0 1px 0 rgba(255,255,255,.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#2A1C0B', display: 'flex' }}><Icon name="feather" size={size * 0.5} strokeWidth={1.6} /></div>
      </div>
    );
  }

  // ── Offline bar ──────────────────────────────────────────────────────────
  function OfflineBar({ show, os }) {
    if (!show) return null;
    const top = INSETS[os].top;
    return (
      <div style={{ position: 'absolute', top, left: 0, right: 0, zIndex: 55, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '7px 14px', background: 'color-mix(in srgb, var(--hl-text) 90%, transparent)', color: 'var(--hl-bg)',
        fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', animation: 'hl-fade-in .3s ease' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--hl-accent)' }} />
        Offline — showing saved memories
      </div>
    );
  }

  // ── Install prompt (A2HS) ────────────────────────────────────────────────
  function InstallSheet({ open, os, onClose, onInstalled }) {
    if (os === 'android') {
      return (
        <BottomSheet open={open} onClose={onClose} label="Install Heirloom">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 4px 18px' }}>
            <AppIcon size={52} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 23, color: 'var(--hl-text)', lineHeight: 1.1 }}>Install Heirloom</div>
              <div style={{ fontSize: 13, color: 'var(--hl-muted)' }}>heirloom.life</div>
            </div>
          </div>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--hl-muted)', margin: '0 4px 18px' }}>
            Add Heirloom to your home screen for a full-screen, offline-ready keepsake of your story.
          </p>
          <div style={{ display: 'flex', gap: 10, padding: '0 4px' }}>
            <SheetBtn ghost onClick={onClose}>Not now</SheetBtn>
            <SheetBtn onClick={onInstalled}>Install</SheetBtn>
          </div>
        </BottomSheet>
      );
    }
    // iOS — emulate the Share-sheet "Add to Home Screen" hint
    return (
      <BottomSheet open={open} onClose={onClose} label="Add to Home Screen">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 4px 16px' }}>
          <AppIcon size={52} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 23, color: 'var(--hl-text)', lineHeight: 1.1 }}>Add to Home Screen</div>
            <div style={{ fontSize: 13, color: 'var(--hl-muted)' }}>Install Heirloom as an app</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--hl-bg)', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--hl-border)', marginBottom: 16 }}>
          {[
            { n: 1, t: 'Tap', i: 'share', d: 'in the toolbar' },
            { n: 2, t: 'Choose', i: 'plusCircle', d: 'Add to Home Screen' },
          ].map((s) => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px' }}>
              <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.n}</span>
              <span style={{ flex: 1, fontSize: 14.5, color: 'var(--hl-text)' }}>{s.t} <strong style={{ fontWeight: 600 }}>{s.d}</strong></span>
              <span style={{ color: 'var(--hl-accent)', display: 'flex' }}><Icon name={s.i} size={19} /></span>
            </div>
          ))}
        </div>
        <div style={{ padding: '0 4px' }}><SheetBtn onClick={onInstalled}>Got it — add it</SheetBtn></div>
      </BottomSheet>
    );
  }

  // ── Push permission ──────────────────────────────────────────────────────
  function PushSheet({ open, onClose, onAllow }) {
    return (
      <BottomSheet open={open} onClose={onClose} label="Enable notifications">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '8px 8px 4px' }}>
          <div style={{ width: 56, height: 56, borderRadius: 17, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Icon name="heart" size={26} />
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 27, color: 'var(--hl-text)', lineHeight: 1.12, marginBottom: 10 }}>Stay close to your story</div>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--hl-muted)', margin: '0 0 20px', maxWidth: 280 }}>
            A gentle nudge when your guide has a new question, or when a loved one adds to a chapter. No noise — just the story.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 4px' }}>
          <SheetBtn onClick={onAllow}>Allow notifications</SheetBtn>
          <SheetBtn ghost onClick={onClose}>Not now</SheetBtn>
        </div>
      </BottomSheet>
    );
  }

  function SheetBtn({ children, onClick, ghost }) {
    const [h, setH] = useState(false);
    return (
      <button onClick={onClick} onMouseDown={() => setH(true)} onMouseUp={() => setH(false)} onMouseLeave={() => setH(false)}
        style={{ flex: 1, padding: '14px 18px', borderRadius: 14, border: ghost ? '1px solid var(--hl-border-strong)' : 'none',
          background: ghost ? 'transparent' : 'var(--hl-accent)', color: ghost ? 'var(--hl-text)' : 'var(--hl-on-accent)',
          fontFamily: 'var(--font-body)', fontSize: 15.5, fontWeight: 600, cursor: 'pointer', transition: 'transform .12s, background .15s',
          transform: h ? 'scale(.97)' : 'none' }}>
        {children}
      </button>
    );
  }

  // ── Pull-to-refresh wrapper ──────────────────────────────────────────────
  // Wraps a scrollable column; when at the top and dragged down past threshold,
  // shows a spinner and calls onRefresh (which should resolve after a beat).
  function PullToRefresh({ onRefresh, refreshing, children, style }) {
    const ref = useRef(null);
    const start = useRef(null);
    const [pull, setPull] = useState(0);
    const THRESH = 64;

    const onStart = (y) => { if (ref.current && ref.current.scrollTop <= 0) start.current = y; };
    const onMove = (y) => {
      if (start.current == null) return;
      const d = y - start.current;
      if (d > 0 && ref.current.scrollTop <= 0) { setPull(Math.min(d * 0.5, 90)); }
      else if (d < 0) { start.current = null; setPull(0); }
    };
    const onEnd = () => {
      if (pull >= THRESH && onRefresh) onRefresh();
      start.current = null; setPull(0);
    };
    const shown = refreshing ? THRESH : pull;
    return (
      <div style={{ position: 'relative', height: '100%', ...style }}>
        <div style={{ position: 'absolute', top: 'var(--safe-top)', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 1, pointerEvents: 'none',
          height: shown, opacity: shown ? 1 : 0, transition: refreshing ? 'none' : 'opacity .2s' }}>
          <div style={{ marginTop: 10, width: 26, height: 26, borderRadius: '50%', border: '2.5px solid var(--hl-border-strong)', borderTopColor: 'var(--hl-accent)',
            transform: `rotate(${pull * 4}deg)`, animation: refreshing ? 'hl-spin .7s linear infinite' : 'none' }} />
        </div>
        <div ref={ref} className="hl-scroll"
          onTouchStart={(e) => onStart(e.touches[0].clientY)}
          onTouchMove={(e) => onMove(e.touches[0].clientY)}
          onTouchEnd={onEnd}
          onMouseDown={(e) => onStart(e.clientY)}
          onMouseMove={(e) => { if (start.current != null) onMove(e.clientY); }}
          onMouseUp={onEnd}
          style={{ height: '100%', transform: `translateY(${shown}px)`, transition: (start.current == null) ? 'transform .26s cubic-bezier(.22,1,.36,1)' : 'none' }}>
          {children}
        </div>
      </div>
    );
  }

  Object.assign(window, { PhoneFrame, StatusBar, HomeIndicator, BottomSheet, Toast, Splash, AppIcon, OfflineBar, InstallSheet, PushSheet, PullToRefresh, SheetBtn, PWA_INSETS: INSETS });
})();
