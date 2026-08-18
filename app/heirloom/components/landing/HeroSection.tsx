'use client';

/*
  HeroSection → photo-constellation hero (replaces the former "format fan"
  icon hero). Ported from the design handover's reference prototype:
  "Design Handovers/ Aug 2026 Atomic Updates/13_Heirloom_lander_nav_updateV4/
  Heirloom Lander - Summer 2026 - Story Canvas.html" (Hero + MemoryConstellation,
  ~lines 365-557).

  Every reference <image-slot> placeholder becomes a plain placeholder div —
  real photos are wired in as a separate, later step. All var(--hl-*) colors
  are repointed to this codebase's real --color-* tokens (nothing renamed).

  ⚠️ production chat activation — unchanged: "Start Your Story" dispatches
  { type: 'OPEN_CHAT' } via useChatStore, same as every other CTA on this page.

  data-screen-label="Hero" is the marker PageThread.tsx depends on to find
  this section's boundaries.
*/

import { useEffect, useRef, useState } from 'react';
import { Heart, MapPin, Mic } from 'lucide-react';
import { useChatStore } from '@/components/shells/membership/chatStore';
import { mcPath } from './constellationPath';

// ─── Placeholder for every reference <image-slot> ───────────────────────────

function PhotoPlaceholder({ label }: { label: string }) {
  return (
    <div
      aria-hidden="true"
      className="w-full h-full flex items-center justify-center bg-surface border border-border font-mono uppercase tracking-[0.14em] text-text-muted text-center px-2"
      style={{ fontSize: 9 }}
    >
      {label}
    </div>
  );
}

// ─── Small decorative pieces ─────────────────────────────────────────────────

function PlayTri({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ marginLeft: 1 }} aria-hidden="true">
      <path d="M6 3l14 9-14 9z" />
    </svg>
  );
}

function Wave({ n = 40, color, seed = 1, dim = false }: { n?: number; color: string; seed?: number; dim?: boolean }) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    const h = 7 + Math.abs(Math.sin(i * seed * 0.7) + Math.sin(i * 0.33) * 0.8) * 13;
    bars.push(<span key={i} style={{ height: h, background: color, opacity: dim ? 0.5 : 0.8 }} />);
  }
  return <div className="hl-mc-wave">{bars}</div>;
}

// ─── Memory constellation (hero visual) ──────────────────────────────────────

const MC_W = 1080;
const MC_H = 840;

type McPhoto = { id: string; x: number; y: number; w: number; h: number; rot: number; ph: string };

const MC_PHOTOS: McPhoto[] = [
  { id: 'mc-hiker', x: 50, y: 34, w: 236, h: 132, rot: -3, ph: 'Hero-8' },
  { id: 'mc-swing', x: 338, y: 8, w: 150, h: 150, rot: 1, ph: 'Hero-9' },
  { id: 'mc-couple', x: 576, y: 8, w: 248, h: 150, rot: 2.5, ph: 'Hero-1' },
  { id: 'mc-dog', x: 8, y: 232, w: 184, h: 132, rot: -2, ph: 'Hero-7' },
  { id: 'mc-beach', x: 280, y: 250, w: 424, h: 254, rot: 0, ph: 'Hero-0' },
  { id: 'mc-apt', x: 822, y: 356, w: 162, h: 146, rot: 3, ph: 'Hero-2' },
  { id: 'mc-grad', x: 4, y: 486, w: 198, h: 198, rot: -2, ph: 'Hero-6' },
  { id: 'mc-birthday', x: 726, y: 526, w: 188, h: 158, rot: 3, ph: 'Hero-4' },
  { id: 'mc-mtn', x: 926, y: 586, w: 132, h: 144, rot: -3, ph: 'Hero-3' },
  { id: 'mc-van', x: 166, y: 690, w: 158, h: 112, rot: -4, ph: 'Hero-5' },
];

type McBox = { x: number; y: number; w: number; h: number };

const MC_BOX: Record<string, McBox> = {
  hiker: { x: 50, y: 34, w: 236, h: 132 }, swing: { x: 338, y: 8, w: 150, h: 150 }, couple: { x: 576, y: 8, w: 248, h: 150 },
  dog: { x: 8, y: 232, w: 184, h: 132 }, beach: { x: 280, y: 250, w: 424, h: 254 }, apt: { x: 822, y: 356, w: 162, h: 146 },
  grad: { x: 4, y: 486, w: 198, h: 198 }, birthday: { x: 726, y: 526, w: 188, h: 158 }, mtn: { x: 926, y: 586, w: 132, h: 144 }, van: { x: 166, y: 690, w: 158, h: 112 },
  audio: { x: 235, y: 168, w: 388, h: 72 }, note: { x: 856, y: 96, w: 182, h: 142 }, jun: { x: 734, y: 230, w: 60, h: 60 },
  aptLabel: { x: 812, y: 298, w: 152, h: 58 }, banff: { x: 4, y: 360, w: 224, h: 76 }, maya: { x: 226, y: 526, w: 194, h: 100 },
  video: { x: 476, y: 546, w: 194, h: 118 }, heart: { x: 436, y: 698, w: 108, h: 104 }, voice: { x: 590, y: 718, w: 280, h: 66 },
};

const MC_SEQ = ['hiker', 'swing', 'couple', 'note', 'jun', 'audio', 'dog', 'banff', 'grad', 'van', 'maya', 'beach', 'aptLabel', 'apt', 'mtn', 'birthday', 'video', 'heart', 'voice'];

function mcEdge(b: McBox, tx: number, ty: number, m: number): { x: number; y: number } {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  let dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) dy = 1;
  const t = 1 / Math.max(Math.abs(dx) / (b.w / 2), Math.abs(dy) / (b.h / 2));
  const ex = cx + dx * t, ey = cy + dy * t;
  const ux = ex - cx, uy = ey - cy, ul = Math.hypot(ux, uy) || 1;
  return { x: ex + (ux / ul) * m, y: ey + (uy / ul) * m };
}

function buildConstellation(): { d: string; nodes: [number, number][] } {
  const CX = 531, CY = 396;
  let d = '';
  const nodes: [number, number][] = [];
  for (let i = 0; i < MC_SEQ.length - 1; i++) {
    const A = MC_BOX[MC_SEQ[i]], B = MC_BOX[MC_SEQ[i + 1]];
    const acx = A.x + A.w / 2, acy = A.y + A.h / 2, bcx = B.x + B.w / 2, bcy = B.y + B.h / 2;
    const e1 = mcEdge(A, bcx, bcy, 6), e2 = mcEdge(B, acx, acy, 6);
    const mx = (e1.x + e2.x) / 2, my = (e1.y + e2.y) / 2;
    const gap = Math.hypot(e2.x - e1.x, e2.y - e1.y) || 1;
    // unit perpendicular to the chord, flipped so the arc bows away from the cluster centre
    let px = -(e2.y - e1.y) / gap, py = (e2.x - e1.x) / gap;
    if (px * (mx - CX) + py * (my - CY) < 0) { px = -px; py = -py; }
    const bow = Math.min(72, Math.max(20, gap * 0.36));
    const cx = mx + px * bow, cy = my + py * bow;
    d += ` M ${e1.x.toFixed(1)} ${e1.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)}, ${e2.x.toFixed(1)} ${e2.y.toFixed(1)}`;
    nodes.push([0.25 * e1.x + 0.5 * cx + 0.25 * e2.x, 0.25 * e1.y + 0.5 * cy + 0.25 * e2.y]);
  }
  return { d, nodes };
}

function MemoryConstellation() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.62);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => setScale(el.clientWidth / MC_W);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { d, nodes } = buildConstellation();

  return (
    <div className="hl-mc-scaler" ref={wrapRef} style={{ position: 'relative', width: '100%', height: MC_H * scale }} aria-hidden="true">
      <div className="hl-mc-canvas" style={{ position: 'absolute', top: 0, left: 0, width: MC_W, height: MC_H, transformOrigin: 'top left', transform: `scale(${scale})` }}>
        <svg className="hl-mc-conn" viewBox={`0 0 ${MC_W} ${MC_H}`} style={{ position: 'absolute', inset: 0, width: MC_W, height: MC_H, overflow: 'visible', pointerEvents: 'none' }}>
          <path d={d} fill="none" stroke="rgb(var(--color-accent))" strokeOpacity="0.4" strokeWidth="1.7" strokeLinecap="round" />
          {nodes.map((n, i) => (
            <circle key={i} cx={n[0].toFixed(1)} cy={n[1].toFixed(1)} r="4.5" fill="rgb(var(--color-background))" stroke="rgb(var(--color-accent))" strokeOpacity="0.55" strokeWidth="1.6" />
          ))}
        </svg>

        {MC_PHOTOS.map((p) => (
          <div key={p.id} className="hl-mc-el hl-mc-photo" style={{ left: p.x, top: p.y, width: p.w, height: p.h, transform: `rotate(${p.rot}deg)` }}>
            <PhotoPlaceholder label={p.ph} />
          </div>
        ))}

        {/* Audio player */}
        <div className="hl-mc-el hl-mc-card" style={{ left: 235, top: 168, width: 388, height: 72, padding: '0 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="hl-mc-play" style={{ width: 34, height: 34, border: '1.5px solid rgb(var(--color-accent))', color: 'rgb(var(--color-accent))' }}><PlayTri size={11} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'rgb(var(--color-text-primary))' }}>Dad&rsquo;s Wedding Speech</span>
              <span className="font-mono" style={{ fontSize: 11, color: 'rgb(var(--color-text-dim))' }}>03:47</span>
            </div>
            <Wave n={56} color="rgb(var(--color-accent))" seed={3} />
          </div>
        </div>

        {/* Handwritten note */}
        <div className="hl-mc-el hl-mc-paper" style={{ left: 856, top: 96, width: 182, height: 142, transform: 'rotate(4deg)', padding: 18, overflow: 'hidden' }}>
          <p className="hl-mc-hand" style={{ margin: 0, fontSize: 19, lineHeight: 1.22 }}>
            Never forget where you came from, and the people who helped you get here. <span style={{ color: 'rgb(var(--color-accent))' }}>&hearts;</span>
          </p>
        </div>

        {/* Date chip */}
        <div className="hl-mc-el hl-mc-card" style={{ left: 734, top: 230, width: 60, height: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <span className="font-mono" style={{ fontSize: 10, letterSpacing: '.14em', color: 'rgb(var(--color-accent))' }}>JUN</span>
          <span className="font-display" style={{ fontSize: 27, lineHeight: 1, color: 'rgb(var(--color-text-primary))' }}>21</span>
        </div>

        {/* First apartment label */}
        <div className="hl-mc-el hl-mc-card" style={{ left: 812, top: 298, width: 152, height: 58, transform: 'rotate(2deg)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 16px', gap: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'rgb(var(--color-text-primary))' }}>First apartment</span>
          <span style={{ fontSize: 12, color: 'rgb(var(--color-text-dim))' }}>Toronto, ON</span>
        </div>

        {/* Location pin */}
        <div className="hl-mc-el hl-mc-card" style={{ left: 4, top: 360, width: 224, height: 76, display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px' }}>
          <span style={{ width: 40, height: 40, borderRadius: 11, background: 'rgb(var(--color-accent) / 0.13)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgb(var(--color-accent))', flexShrink: 0 }}>
            <MapPin size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'rgb(var(--color-text-primary))' }}>Secret Places, BC, Canada 2009</div>
            <div className="font-mono" style={{ fontSize: 11, color: 'rgb(var(--color-text-dim))', marginTop: 3 }}>Aug 12, 2017</div>
          </div>
        </div>

        {/* Message bubble */}
        <div className="hl-mc-el hl-mc-card" style={{ left: 226, top: 526, width: 194, height: 100, padding: 16, position: 'absolute' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'rgb(var(--color-text-primary))' }}>Amsterdam</span>
            <span className="font-mono" style={{ fontSize: 10, color: 'rgb(var(--color-text-dim))' }}>10:32 AM</span>
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.4, color: 'var(--color-text-muted)' }}>That trip was unforgettable.</p>
          <span style={{ position: 'absolute', right: 14, bottom: -14, width: 32, height: 32, borderRadius: 999, background: 'rgb(var(--color-surface))', border: '1px solid var(--color-border)', boxShadow: '0 4px 10px -4px rgb(var(--color-text-primary) / 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgb(var(--color-accent))' }}>
            <Heart size={15} />
          </span>
        </div>

        {/* Video player */}
        <div className="hl-mc-el hl-mc-photo" style={{ left: 476, top: 546, width: 194, height: 118 }}>
          <PhotoPlaceholder label="Video" />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(0,0,0,0.55))', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 40, height: 40, borderRadius: 999, background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PlayTri size={14} color="rgb(var(--color-text-primary))" />
          </div>
          <div style={{ position: 'absolute', left: 10, right: 10, bottom: 9, display: 'flex', alignItems: 'center', gap: 8 }}>
            <PlayTri size={9} color="#fff" />
            <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.35)' }}><div style={{ width: '55%', height: '100%', borderRadius: 2, background: '#fff' }} /></div>
            <span className="font-mono" style={{ fontSize: 9, color: '#fff' }}>0:15</span>
          </div>
        </div>

        {/* Heart doodle */}
        <div className="hl-mc-el hl-mc-paper" style={{ left: 436, top: 698, width: 108, height: 104, transform: 'rotate(-3deg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span style={{ color: 'rgb(var(--color-accent))' }}><Heart size={30} strokeWidth={1.5} /></span>
          <span className="hl-mc-hand" style={{ fontSize: 18 }}>us &amp; them</span>
        </div>

        {/* Voice memo */}
        <div className="hl-mc-el hl-mc-card" style={{ left: 590, top: 718, width: 280, height: 66, borderRadius: 999, display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px' }}>
          <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}><Mic size={17} /></span>
          <div style={{ flex: 1, minWidth: 0 }}><Wave n={42} color="var(--color-text-muted)" seed={5} dim /></div>
          <span className="font-mono" style={{ fontSize: 12, color: 'rgb(var(--color-text-dim))', flexShrink: 0 }}>00:28</span>
        </div>
      </div>

      <style>{`
        .hl-mc-el { position: absolute; }
        .hl-mc-photo { border-radius: 14px; overflow: hidden; box-shadow: 0 18px 34px -14px rgb(var(--color-text-primary) / 0.3), 0 2px 6px -2px rgb(var(--color-text-primary) / 0.18); background: rgb(var(--color-surface-2)); }
        .hl-mc-card { background: rgb(var(--color-surface)); border: 1px solid var(--color-border); border-radius: 16px; box-shadow: 0 14px 30px -16px rgb(var(--color-text-primary) / 0.3), 0 1px 3px rgb(var(--color-text-primary) / 0.06); }
        .hl-mc-paper { background: linear-gradient(180deg, #FBF6EA, #F3EAD6); border: 1px solid var(--color-border); border-radius: 6px; box-shadow: 0 12px 26px -14px rgb(var(--color-text-primary) / 0.3); }
        .hl-mc-hand { font-family: var(--font-hand); color: #5c4a36; }
        .hl-mc-wave { display: flex; align-items: center; gap: 2px; height: 34px; overflow: hidden; }
        .hl-mc-wave span { flex: 0 0 auto; width: 2.5px; border-radius: 2px; }
        .hl-mc-play { flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 999px; }
        .hl-mc-conn path { animation: hl-mc-dash 40s linear infinite; }
        @keyframes hl-mc-dash { to { stroke-dashoffset: -400; } }
        @media (prefers-reduced-motion: reduce) { .hl-mc-conn path { animation: none !important; } }
      `}</style>
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────

export function HeroSection() {
  const { dispatch } = useChatStore();

  return (
    <section data-screen-label="Hero" className="relative min-h-screen flex items-center overflow-hidden bg-background">
      <div className="hl-mc-hero-grid relative z-10 max-w-[1340px] w-full mx-auto px-4 sm:px-6 md:px-12">
        <div style={{ transform: 'translateY(-5vh)' }}>
          <h1 className="font-display font-light tracking-tight text-text-primary" style={{ margin: 0 }}>
            <span style={{ display: 'block', fontSize: 'clamp(38px, 4.6vw, 54px)', lineHeight: 1.1 }}>All memories fade.</span>
            <span className="hl-mc-nowrap" style={{ display: 'block', fontSize: 'clamp(28px, 3.4vw, 42px)', lineHeight: 1.15, marginTop: 8 }}>
              Don&rsquo;t let yours be forgotten.
            </span>
          </h1>
          <div className="flex flex-wrap items-center gap-4" style={{ marginTop: 36 }}>
            {/* ⚠️ production chat activation — unchanged */}
            <button
              type="button"
              onClick={() => dispatch({ type: 'OPEN_CHAT' })}
              className="bg-accent hover:bg-accent-hover text-background font-body text-base font-semibold px-7 rounded-[13px] transition-colors min-h-[52px] flex items-center"
            >
              Start Your Story
            </button>
          </div>
        </div>
        <div className="hl-mc-collage-col flex items-center justify-center">
          <MemoryConstellation />
        </div>
      </div>

      <style>{`
        .hl-mc-hero-grid { display: grid; grid-template-columns: minmax(340px, 430px) 1fr; gap: 40px; align-items: center; padding-top: 120px; padding-bottom: 80px; }
        @media (max-width: 920px) {
          .hl-mc-hero-grid { grid-template-columns: 1fr; gap: 8px; }
          .hl-mc-hero-grid > .hl-mc-collage-col { display: flex; }
        }
        .hl-mc-nowrap { white-space: normal; }
        @media (min-width: 769px) { .hl-mc-nowrap { white-space: nowrap; } }
      `}</style>
    </section>
  );
}
