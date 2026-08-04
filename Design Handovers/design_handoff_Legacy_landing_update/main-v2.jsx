/* main.jsx — Legacy prototype root: theming, landing↔chat transition,
   tweaks, and a true-viewport mobile preview (phone bezel + embed iframe). */
const { useState, useEffect, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "device": "desktop",
  "base": "plain",
  "accent": "#C8542E",
  "accentBorders": true,
  "displayFont": "Cormorant Garamond",
  "heroLayout": "formats",
  "paperGrain": false,
  "emptyPrompt": "Tell your story",
  "navMode": "dock",
  "coachRule": "first-use",
  "composerAdd": "plus",
  "voiceMode": "immersive"
}/*EDITMODE-END*/;

// Curated accents for the "bland base + one colour" test — each reads on both bases.
const ACCENT_OPTIONS = [
  '#C8542E',              // terracotta (Second Brain Labs)
  '#C9A96E',              // gold
  '#2E854D',              // forest (brand)
  'oklch(0.54 0.12 262)', // ink blue
  'oklch(0.74 0.075 28)', // rosé
];

// ---- theme maps ----------------------------------------------------------
// Neutral "bland" bases (chroma 0) — the accent is the only color in the page.
const MOODS = {
  ink: {
    '--hl-bg': '#141414', '--hl-bg-2': '#0D0D0D', '--hl-surface': '#1D1D1D', '--hl-surface-2': '#262626',
    '--hl-text': '#F1F1F0', '--hl-muted': 'rgba(241,241,240,0.56)', '--hl-faint': 'rgba(241,241,240,0.32)',
    '--hl-border': 'rgba(241,241,240,0.12)', '--hl-border-strong': 'rgba(241,241,240,0.20)',
    '--hl-glow-1': '#242424', '--hl-glow-2': '#171717', '--hl-on-accent': '#141414', '--hl-danger': '#E8847A',
  },
  paper: {
    '--hl-bg': '#FAF6EE', '--hl-bg-2': '#F2ECDF', '--hl-surface': '#FFFCF6', '--hl-surface-2': '#F2ECDF',
    '--hl-text': '#1F1A14', '--hl-muted': '#6B6256', '--hl-faint': '#9A917F',
    '--hl-border': '#E2D6BC', '--hl-border-strong': '#D2C3A2',
    '--hl-glow-1': '#F2E7CF', '--hl-glow-2': '#ECE0C6', '--hl-on-accent': '#FAF6EE', '--hl-danger': '#A93F1D',
  },
  // Flat egg-shell — same paper colour, but glows collapse to the base so the
  // warm radial "paper" wash disappears (grain off too).
  plain: {
    '--hl-bg': '#FAF6EE', '--hl-bg-2': '#F4EFE5', '--hl-surface': '#FFFFFF', '--hl-surface-2': '#F4EFE5',
    '--hl-text': '#1F1A14', '--hl-muted': '#6B6256', '--hl-faint': '#9A917F',
    '--hl-border': '#E6DCC8', '--hl-border-strong': '#D6C9AC',
    '--hl-glow-1': '#FAF6EE', '--hl-glow-2': '#FAF6EE', '--hl-on-accent': '#FAF6EE', '--hl-danger': '#A93F1D',
  },
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

/* Each accent carries its hover shade + the text color that sits ON it.
   The "strong" set is tuned for the light Sepia background + mobile reading:
   deep, saturated hues at a consistent L≈0.55 / C≈0.13 so they hold contrast
   against cream and pair with a light (cream) on-accent label. */
const CREAM_ON = '#FBF6EC';
const DARK_ON = '#1C0F06';
const ACCENTS = {
  // — Second Brain Labs (terracotta) —
  '#C8542E':              { hover: '#A93F1D',              on: CREAM_ON }, // SBL terracotta
  // — Legacy brand (forest green — from app/heirloom/globals.css) —
  '#2E854D':              { hover: '#15733C',              on: CREAM_ON }, // brand forest
  // — Strong (readable on the light background) —
  'oklch(0.56 0.14 40)':  { hover: 'oklch(0.50 0.14 40)',  on: CREAM_ON }, // terracotta
  'oklch(0.51 0.15 18)':  { hover: 'oklch(0.45 0.15 18)',  on: CREAM_ON }, // wine
  'oklch(0.55 0.12 152)': { hover: 'oklch(0.49 0.12 152)', on: CREAM_ON }, // forest
  'oklch(0.55 0.10 215)': { hover: 'oklch(0.49 0.10 215)', on: CREAM_ON }, // deep teal
  'oklch(0.54 0.12 262)': { hover: 'oklch(0.48 0.12 262)', on: CREAM_ON }, // ink blue
  // — Soft (original, best on the dark moods) —
  '#C9A96E':              { hover: '#B8935A',              on: DARK_ON },  // gold
  'oklch(0.74 0.075 28)': { hover: 'oklch(0.68 0.075 28)', on: DARK_ON },  // rosé
  'oklch(0.76 0.05 140)': { hover: 'oklch(0.70 0.05 140)', on: DARK_ON },  // sage
};

const EMPTY_PROMPTS = {
  'Tell your story': 'Tell your story.',
  'Where should we begin': 'Where should we begin?',
  'A moment never forgotten': 'Tell me about a moment you\u2019ve never forgotten.',
};

// Relative luminance of a #hex — used to pick legible text ON an arbitrary accent.
function hexLuminance(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const r = lin(parseInt(h.slice(0, 2), 16)), g = lin(parseInt(h.slice(2, 4), 16)), b = lin(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Hover shade + on-accent text for ANY accent: use the curated metadata when the
// color is a known preset, otherwise derive it (darken for hover; luminance for text).
function accentMetaFor(accent) {
  if (ACCENTS[accent]) return ACCENTS[accent];
  const isHex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accent);
  const on = isHex ? (hexLuminance(accent) > 0.62 ? '#161514' : '#FBF6EC') : '#FBF6EC';
  return { hover: `color-mix(in srgb, ${accent} 86%, #000)`, on };
}

// Free-form accent picker: native swatch + editable hex/oklch field.
function AccentPicker({ value, onChange }) {
  const isHex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
  const swatch = isHex ? value : '#C9A96E';
  return (
    <TweakRow label="Custom" value={isHex ? value.toUpperCase() : 'preset'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <input type="color" value={swatch} onChange={(e) => onChange(e.target.value)}
               aria-label="Pick accent colour"
               style={{ width: 38, height: 30, padding: 0, border: '1px solid rgba(127,127,127,0.35)', borderRadius: 8, background: 'none', cursor: 'pointer', flexShrink: 0 }} />
        <input type="text" className="twk-field" value={value} spellCheck="false"
               onChange={(e) => onChange(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
      </div>
    </TweakRow>
  );
}

function buildTheme(t) {
  const base = t.base || t.colorMood; // back-compat
  const mood = MOODS[base] || MOODS.ink;
  const accentMeta = accentMetaFor(t.accent);
  // When "accent borders" is on, structural hairlines pick up the accent too,
  // so the only colour anywhere on the page is the accent.
  const borders = t.accentBorders ? {
    '--hl-border': `color-mix(in srgb, ${t.accent} 28%, transparent)`,
    '--hl-border-strong': `color-mix(in srgb, ${t.accent} 48%, transparent)`,
  } : {};
  return {
    ...mood,
    ...borders,
    '--hl-accent': t.accent,
    '--hl-accent-hover': accentMeta.hover,
    '--hl-on-accent': accentMeta.on,
    '--hl-accent-soft': `color-mix(in srgb, ${t.accent} 16%, transparent)`,
    '--hl-accent-line': `color-mix(in srgb, ${t.accent} 32%, transparent)`,
    '--font-display': `'${t.displayFont}', Georgia, serif`,
    '--grain-opacity': base === 'plain' ? 0 : (base === 'paper' ? 0.06 : 0.05),
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

  const emptyPrompt = EMPTY_PROMPTS[t.emptyPrompt] || EMPTY_PROMPTS['Tell your story'];

  return (
    <div className={t.paperGrain ? 'paper-grain' : ''} style={buildTheme(t)}>
      <Landing onStart={() => setChatOpen(true)} heroLayout={t.heroLayout} />

      <div onClick={() => setChatOpen(false)} style={{
        position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
        opacity: chatOpen ? 1 : 0, pointerEvents: chatOpen ? 'auto' : 'none', transition: 'opacity .45s ease',
      }} />

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
        width: fullScreen ? '100vw' : 'min(100vw, clamp(680px, 50vw, 1120px))',
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
        <ChatPanel onClose={() => setChatOpen(false)} emptyPrompt={emptyPrompt} navMode={t.navMode} coachRule={t.coachRule} composerAdd={t.composerAdd} voiceMode={t.voiceMode} fullScreen={fullScreen} onToggleFull={() => setFullScreen((v) => !v)} />
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
  const bezelBg = mood === 'ink' ? '#202225' : '#241a12';
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0807', padding: 24 }}>
      <div style={{ position: 'relative', width: w + 24, height: h + 24, borderRadius: 56, background: bezelBg, padding: 12, boxShadow: '0 50px 120px -30px rgba(0,0,0,0.8), inset 0 0 0 2px rgba(255,255,255,0.04)' }}>
        <div style={{ position: 'relative', width: w, height: h, borderRadius: 44, overflow: 'hidden', background: '#000', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.5)' }}>
          <iframe key={src} src={src} title="Legacy mobile preview" style={{ width: w, height: h, border: 'none', display: 'block' }} />
          <div style={{ position: 'absolute', top: 9, left: '50%', transform: 'translateX(-50%)', width: Math.round(w * 0.32), height: 26, background: '#000', borderRadius: 20, zIndex: 5, pointerEvents: 'none' }} />
        </div>
      </div>
    </div>
  );
}

function embedSrc(t) {
  const p = new URLSearchParams();
  p.set('embed', '1');
  ['base', 'accent', 'displayFont', 'heroLayout', 'emptyPrompt', 'navMode', 'coachRule', 'composerAdd', 'voiceMode'].forEach((k) => p.set(k, t[k]));
  p.set('accentBorders', t.accentBorders ? '1' : '0');
  p.set('paperGrain', t.paperGrain ? '1' : '0');
  return location.pathname + '?' + p.toString();
}

// ---- App (top level, with tweaks) ----------------------------------------
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  return (
    <React.Fragment>
      {t.device === 'mobile'
        ? <PhoneStage src={embedSrc(t)} mood={t.base} />
        : <Experience t={t} />}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Preview" />
        <TweakRadio label="Device" value={t.device} options={['desktop', 'mobile']} onChange={(v) => setTweak('device', v)} />

        <TweakSection label="Palette" />
        <TweakRadio label="Base" value={t.base} options={['ink', 'paper', 'plain']} onChange={(v) => setTweak('base', v)} />
        <TweakColor label="Accent" value={t.accent} options={ACCENT_OPTIONS} onChange={(v) => setTweak('accent', v)} />
        <AccentPicker value={t.accent} onChange={(v) => setTweak('accent', v)} />
        <TweakToggle label="Accent borders" value={t.accentBorders} onChange={(v) => setTweak('accentBorders', v)} />

        <TweakSection label="Type & texture" />
        <TweakSelect label="Display font" value={t.displayFont} options={['Cormorant Garamond', 'EB Garamond', 'Playfair Display']} onChange={(v) => setTweak('displayFont', v)} />
        <TweakToggle label="Paper grain" value={t.paperGrain} onChange={(v) => setTweak('paperGrain', v)} />

        <TweakSection label="Hero" />
        <TweakSelect label="Layout" value={t.heroLayout} options={['formats', 'cover', 'editorial', 'centered']} onChange={(v) => setTweak('heroLayout', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

// ---- Embed (inside the phone iframe): bare experience, tweaks from URL ----
function EmbedApp() {
  const q = new URLSearchParams(location.search);
  const t = {
    base: q.get('base') || 'plain',
    accent: q.get('accent') || '#C8542E',
    accentBorders: q.get('accentBorders') !== '0',
    displayFont: q.get('displayFont') || 'Cormorant Garamond',
    heroLayout: q.get('heroLayout') || 'formats',
    device: 'desktop',
    emptyPrompt: q.get('emptyPrompt') || 'Tell your story',
    navMode: q.get('navMode') || 'dock',
    coachRule: q.get('coachRule') || 'first-use',
    composerAdd: q.get('composerAdd') || 'plus',
    voiceMode: q.get('voiceMode') || 'immersive',
    paperGrain: q.get('paperGrain') === '1',
  };
  return <Experience t={t} />;
}

const isEmbed = new URLSearchParams(location.search).get('embed') === '1';
ReactDOM.createRoot(document.getElementById('root')).render(isEmbed ? <EmbedApp /> : <App />);
