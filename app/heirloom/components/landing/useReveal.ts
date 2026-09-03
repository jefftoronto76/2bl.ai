'use client';

/*
  useReveal — scroll-reveal hook, ported essentially verbatim from the design
  reference: "Design Handovers/ Aug 2026 Atomic Updates/13_Heirloom_lander_nav_updateV4/
  Heirloom Lander - Summer 2026 - Story Canvas.html" (~lines 231-244).

  Reveals once: an IntersectionObserver flips `seen` the first time the element
  enters the viewport (threshold 0.12), then disconnects. Two safety nets so a
  section never stays hidden:
    - a 1300ms fallback timer marks it seen regardless, and
    - an immediate check on mount marks elements already inside the viewport
      (so above-the-fold content doesn't wait on the observer).

  Attach the returned ref to a section wrapper and key its reveal styling off
  `seen`. Unused until the Wave 2 section ports import it.
*/

import { useEffect, useRef, useState, type RefObject } from 'react';

export function useReveal<T extends HTMLElement = HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    const fb = setTimeout(() => setSeen(true), 1300);
    const r = el.getBoundingClientRect();
    if (r.top < (window.innerHeight || 800)) setSeen(true);
    return () => {
      obs.disconnect();
      clearTimeout(fb);
    };
  }, []);

  return [ref, seen];
}
