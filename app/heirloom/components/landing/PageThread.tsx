'use client';

/*
  PageThread → page-wide scroll-triggered dotted "thread" that runs through
  every section below the hero, lighting up as the visitor scrolls. Ported
  from the design handover's reference prototype (PageThread(), ~lines
  931-998 of "Heirloom Lander - Summer 2026 - Story Canvas.html").

  Self-contained: queries document.querySelectorAll('[data-screen-label]')
  independently, so it needs no props/refs from LandingPage — it's mounted
  once as an absolutely-positioned overlay sibling above all the sections.

  Every reference <image-slot> bead placeholder becomes a plain placeholder
  div — real photos are wired in as a separate, later step.
*/

import { useCallback, useEffect, useRef, useState } from 'react';
import { mcPath } from './constellationPath';

type Bead =
  | { key: string; photo: true; id: string; cap: string; x: number; y: number; w: number; h: number }
  | { key: string; photo: false; x: number; y: number };

const TH_CAPS = ['Family', 'Pets', 'Friendships', 'A day', 'A song', 'A trip'];

export function PageThread() {
  const layerRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<{ W: number; H: number; d: string; beads: Bead[] }>({ W: 0, H: 0, d: '', beads: [] });
  const [front, setFront] = useState(0);

  const build = useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const W = document.documentElement.clientWidth;
    const H = document.body.scrollHeight;
    const edge = Math.max(20, Math.min(72, (W - 1180) / 2 - 22));
    const xL = edge, xR = W - edge;
    const secs = [...document.querySelectorAll('[data-screen-label]')];
    const pts: [number, number][] = [];
    const bottoms: { y: number }[] = [];
    secs.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      const top = r.top + window.scrollY, bot = r.bottom + window.scrollY;
      const side = i % 2 === 0 ? xL : xR;
      const inset = Math.min(80, r.height * 0.16);
      pts.push([side, top + inset]);
      pts.push([side, bot - inset]);
      bottoms.push({ y: bot - inset });
    });
    const beads: Bead[] = [];
    let photoN = 0;
    for (let t = 0; t < bottoms.length - 1; t++) {
      const yMid = (bottoms[t].y + pts[(t + 1) * 2][1]) / 2;
      const isPhoto = t % 2 === 0 && t < bottoms.length - 2 && W > 720;
      if (isPhoto) {
        beads.push({ key: 't' + t, photo: true, id: 'th-bead-' + t, cap: TH_CAPS[photoN % TH_CAPS.length], x: W / 2, y: yMid, w: 108, h: 82 });
        photoN++;
      } else {
        beads.push({ key: 't' + t, photo: false, x: W / 2, y: yMid });
      }
    }
    setGeo({ W, H, d: mcPath(pts), beads });
  }, []);

  useEffect(() => {
    build();
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setFront(window.scrollY + window.innerHeight * 0.6));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', build);
    const ro = new ResizeObserver(build);
    ro.observe(document.body);
    onScroll();
    const t1 = setTimeout(build, 400);
    const t2 = setTimeout(build, 1400);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', build);
      ro.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [build]);

  const { W, H, d, beads } = geo;

  return (
    <div className="hl-thread-layer" ref={layerRef} aria-hidden="true">
      <svg className="hl-thread-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <clipPath id="hl-thread-clip">
            <rect x="0" y="0" width={W} height={Math.max(0, front)} />
          </clipPath>
        </defs>
        <path className="hl-thread-track" d={d} />
        <path className="hl-thread-live" d={d} clipPath="url(#hl-thread-clip)" />
      </svg>
      {beads.map((b) =>
        b.photo ? (
          <div key={b.key} className={'hl-thread-bead' + (front >= b.y ? ' lit' : '')} style={{ left: b.x, top: b.y }}>
            <div className="hl-thread-bead-photo bg-surface border border-border" style={{ width: b.w, height: b.h }} />
            <div className="hl-thread-bead-cap text-accent">{b.cap}</div>
          </div>
        ) : (
          <div key={b.key} className={'hl-thread-dot' + (front >= b.y ? ' lit' : '')} style={{ left: b.x, top: b.y }} />
        )
      )}

      <style>{`
        .hl-thread-layer { position: absolute; top: 0; left: 0; width: 100%; z-index: 3; pointer-events: none; }
        .hl-thread-svg { position: absolute; top: 0; left: 0; overflow: visible; }
        .hl-thread-track { fill: none; stroke: rgb(var(--color-accent)); opacity: 0.16; stroke-width: 2; stroke-dasharray: 2 9; stroke-linecap: round; }
        .hl-thread-live { fill: none; stroke: rgb(var(--color-accent)); stroke-width: 2.5; stroke-dasharray: 2 9; stroke-linecap: round; filter: drop-shadow(0 1px 3px rgb(var(--color-accent) / 0.3)); }
        .hl-thread-bead { position: absolute; transform: translate(-50%, -50%) scale(0.7); opacity: 0; transition: opacity .7s ease, transform .7s cubic-bezier(.22,1,.36,1); will-change: transform, opacity; }
        .hl-thread-bead.lit { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        .hl-thread-bead-photo { border-radius: 13px; overflow: hidden; box-shadow: 0 16px 30px -14px rgb(var(--color-text-primary) / 0.3), 0 2px 5px -2px rgb(var(--color-text-primary) / 0.16); }
        .hl-thread-bead-cap { margin-top: 9px; text-align: center; font-family: var(--font-mono); font-size: 10px; letter-spacing: .18em; text-transform: uppercase; }
        .hl-thread-dot { position: absolute; transform: translate(-50%,-50%) scale(0.4); opacity: 0; width: 13px; height: 13px; border-radius: 999px; background: rgb(var(--color-background)); border: 2.5px solid rgb(var(--color-accent)); box-shadow: 0 0 0 5px rgb(var(--color-accent) / 0.12); transition: opacity .5s ease, transform .5s cubic-bezier(.22,1,.36,1); }
        .hl-thread-dot.lit { opacity: 1; transform: translate(-50%,-50%) scale(1); }
        @media (prefers-reduced-motion: reduce) {
          .hl-thread-bead, .hl-thread-dot { transition: none !important; opacity: 1 !important; transform: translate(-50%,-50%) !important; }
        }
      `}</style>
    </div>
  );
}
