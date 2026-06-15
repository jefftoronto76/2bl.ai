/* main.jsx — Heirloom prototype root: theming, landing↔chat transition,
   tweaks, and a true-viewport mobile preview (phone bezel + embed iframe). */
const { useState, useEffect, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "device": "desktop",
  "colorMood": "espresso",
  "accent": "#C9A96E",
  "displayFont": "Cormorant Garamond",
  "heroLayout": "formats",
  "emptyPrompt": "A story worth keeping",
  "sidebarStyle": "labeled",
  "paperGrain": true
}/*EDITMODE-END*/;

// ---- theme maps ----------------------------------------------------------
const MOODS = {
  espresso: {
    '--hl-bg': '#1C0F06', '--hl-bg-2': '#170B04', '--hl-surface': '#2A1A0E', '--hl-surface-2': '#33210F',
    '--hl-text': '#F5EFE6', '--hl-muted': 'rgba(245,239,230,0.55)', '--hl-faint': 'rgba(245,239,230,0.30)',
    '--hl-border': 'rgba(245,239,230,0.12)', '--hl-border-strong': 'rgba(245,239,230,0.20)',
    '--hl-glow-1': '#5C3317', '--hl-glow-2': '#3D2010', '--hl-on-accent': '#1C0F06', '--hl-danger': '#E58D80',
  },
  sepia: {
    '--hl-bg': '#ECE3D2', '--hl-bg-2': '#E3D8C2', '--hl-surface': '#F6EFE0', '--hl-surface-2': '#EFE6D2',
    '--hl-text': '#2E2417', '--hl-muted': 'rgba(46,36,23,0.62)', '--hl-faint': 'rgba(46,36,23,0.36)',
    '--hl-border': 'rgba(46,36,23,0.14)', '--hl-border-strong': 'rgba(46,36,23,0.24)',
    '--hl-glow-1': '#E9D3A8', '--hl-glow-2': '#E0CCA0', '--hl-on-accent': '#2A1C0B', '--hl-danger': '#B0432F',
  },
  midnight: {
    '--hl-bg': '#0F1115', '--hl-bg-2': '#0B0D10', '--hl-surface': '#181B21', '--hl-surface-2': '#1F242C',
    '--hl-text': '#ECEEF2', '--hl-muted': 'rgba(236,238,242,0.55)', '--hl-faint': 'rgba(236,238,242,0.30)',
    '--hl-border': 'rgba(236,238,242,0.12)', '--hl-border-strong': 'rgba(236,238,242,0.20)',
    '--hl-glow-1': '#2C3340', '--hl-glow-2': '#1A1F27', '--hl-on-accent': '#0F1115', '--hl-danger': '#E8847A',
  },
};

const ACCENTS = {
  '#C9A96E': '#B8935A',                          // gold
  'oklch(0.75 0.09 62)': 'oklch(0.69 0.09 62)',  // amber
  'oklch(0.74 0.075 28)': 'oklch(0.68 0.075 28)',// rosé
  'oklch(0.76 0.05 140)': 'oklch(0.70 0.05 140)',// sage
};

const EMPTY_PROMPTS = {
  'A story worth keeping': 'What\u2019s a story worth keeping?',
  'Where should we begin': 'Where should we begin?',
  'A moment never forgotten': 'Tell me about a moment you\u2019ve never forgotten.',
};

function buildTheme(t) {
  const mood = MOODS[t.colorMood] || MOODS.espresso;
  const accentHover = ACCENTS[t.accent] || '#B8935A';
  return {
    ...mood,
    '--hl-accent': t.accent,
    '--hl-accent-hover': accentHover,
    '--hl-accent-soft': `color-mix(in srgb, ${t.accent} 16%, transparent)`,
    '--hl-accent-line': `color-mix(in srgb, ${t.accent} 32%, transparent)`,
    '--font-display': `'${t.displayFont}', Georgia, serif`,
    '--grain-opacity': t.colorMood === 'sepia' ? 0.06 : 0.05,
  };
}

// ---- The actual product (landing + sliding chat) -------------------------
function Experience({ t }) {
  const [chatOpen, setChatOpen] = useState(true);
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = chatOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [chatOpen]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setChatOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const emptyPrompt = EMPTY_PROMPTS[t.emptyPrompt] || EMPTY_PROMPTS['A story worth keeping'];

  return (
    <div className={t.paperGrain ? 'paper-grain' : ''} style={buildTheme(t)}>
      <Landing onStart={() => setChatOpen(true)} heroLayout={t.heroLayout} />

      <div onClick={() => setChatOpen(false)} style={{
        position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
        opacity: chatOpen ? 1 : 0, pointerEvents: chatOpen ? 'auto' : 'none', transition: 'opacity .45s ease',
      }} />

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
        width: fullScreen ? '100vw' : 'clamp(680px, 50vw, 1120px)',
        transform: chatOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform .55s cubic-bezier(.22,1,.36,1), width .5s cubic-bezier(.22,1,.36,1)',
        boxShadow: chatOpen ? '-30px 0 80px -30px rgba(0,0,0,0.7)' : 'none',
      }}>
        <div aria-hidden="true" style={{
          position: 'absolute', left: -9, top: 10, bottom: 10, width: 9,
          background: 'repeating-linear-gradient(to bottom, color-mix(in srgb, var(--hl-text) 22%, transparent), color-mix(in srgb, var(--hl-text) 22%, transparent) 1px, transparent 1px, transparent 3px)',
          borderRadius: '3px 0 0 3px', opacity: (chatOpen && !fullScreen) ? 0.5 : 0, transition: 'opacity .5s ease .15s',
        }} />
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 1, background: 'var(--hl-accent-line)', opacity: fullScreen ? 0 : 1, transition: 'opacity .4s ease' }} />
        <ChatPanel onClose={() => setChatOpen(false)} emptyPrompt={emptyPrompt} sidebarStyle={t.sidebarStyle} fullScreen={fullScreen} onToggleFull={() => setFullScreen((v) => !v)} />
      </div>
    </div>
  );
}

// ---- Mobile preview: phone bezel wrapping a real narrow-viewport iframe ---
function PhoneStage({ src, mood }) {
  const [h, setH] = useState(820);
  useEffect(() => {
    const fit = () => setH(Math.max(560, Math.min(860, window.innerHeight - 72)));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const w = Math.round(h * 0.462); // ~iPhone aspect
  const bezelBg = mood === 'sepia' ? '#cdbfa6' : mood === 'midnight' ? '#202225' : '#241a12';
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0807', padding: 24 }}>
      <div style={{ position: 'relative', width: w + 24, height: h + 24, borderRadius: 56, background: bezelBg, padding: 12, boxShadow: '0 50px 120px -30px rgba(0,0,0,0.8), inset 0 0 0 2px rgba(255,255,255,0.04)' }}>
        <div style={{ position: 'relative', width: w, height: h, borderRadius: 44, overflow: 'hidden', background: '#000', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.5)' }}>
          <iframe key={src} src={src} title="Heirloom mobile preview" style={{ width: w, height: h, border: 'none', display: 'block' }} />
          <div style={{ position: 'absolute', top: 9, left: '50%', transform: 'translateX(-50%)', width: Math.round(w * 0.32), height: 26, background: '#000', borderRadius: 20, zIndex: 5, pointerEvents: 'none' }} />
        </div>
      </div>
    </div>
  );
}

function embedSrc(t) {
  const p = new URLSearchParams();
  p.set('embed', '1');
  ['colorMood', 'accent', 'displayFont', 'heroLayout', 'emptyPrompt', 'sidebarStyle'].forEach((k) => p.set(k, t[k]));
  p.set('paperGrain', t.paperGrain ? '1' : '0');
  return location.pathname + '?' + p.toString();
}

// ---- App (top level, with tweaks) ----------------------------------------
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  return (
    <React.Fragment>
      {t.device === 'mobile'
        ? <PhoneStage src={embedSrc(t)} mood={t.colorMood} />
        : <Experience t={t} />}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Preview" />
        <TweakRadio label="Device" value={t.device} options={['desktop', 'mobile']} onChange={(v) => setTweak('device', v)} />

        <TweakSection label="Mood" />
        <TweakRadio label="Color" value={t.colorMood} options={['espresso', 'sepia', 'midnight']} onChange={(v) => setTweak('colorMood', v)} />
        <TweakColor label="Accent" value={t.accent} options={Object.keys(ACCENTS)} onChange={(v) => setTweak('accent', v)} />
        <TweakSelect label="Display font" value={t.displayFont} options={['Cormorant Garamond', 'EB Garamond', 'Playfair Display']} onChange={(v) => setTweak('displayFont', v)} />
        <TweakToggle label="Paper grain" value={t.paperGrain} onChange={(v) => setTweak('paperGrain', v)} />

        <TweakSection label="Landing" />
        <TweakRadio label="Hero layout" value={t.heroLayout} options={['centered', 'editorial', 'cover', 'formats']} onChange={(v) => setTweak('heroLayout', v)} />

        <TweakSection label="Chat" />
        <TweakSelect label="Opening prompt" value={t.emptyPrompt} options={Object.keys(EMPTY_PROMPTS)} onChange={(v) => setTweak('emptyPrompt', v)} />
        <TweakRadio label="Sidebar" value={t.sidebarStyle} options={['labeled', 'rail']} onChange={(v) => setTweak('sidebarStyle', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

// ---- Embed (inside the phone iframe): bare experience, tweaks from URL ----
function EmbedApp() {
  const q = new URLSearchParams(location.search);
  const t = {
    colorMood: q.get('colorMood') || 'espresso',
    accent: q.get('accent') || '#C9A96E',
    displayFont: q.get('displayFont') || 'Cormorant Garamond',
    heroLayout: q.get('heroLayout') || 'formats',
    emptyPrompt: q.get('emptyPrompt') || 'A story worth keeping',
    sidebarStyle: q.get('sidebarStyle') || 'labeled',
    paperGrain: q.get('paperGrain') !== '0',
  };
  return <Experience t={t} />;
}

const isEmbed = new URLSearchParams(location.search).get('embed') === '1';
ReactDOM.createRoot(document.getElementById('root')).render(isEmbed ? <EmbedApp /> : <App />);
