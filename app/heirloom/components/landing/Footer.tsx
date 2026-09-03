'use client';

/*
  Footer → Second Brain Labs footer. Ported from the design reference's Footer()
  and its .hl-foot* stylesheet:
  "Design Handovers/ Aug 2026 Atomic Updates/13_Heirloom_lander_nav_updateV4/
  Heirloom Lander - Summer 2026 - Story Canvas.html" (~lines 892-931; CSS at
  ~lines 57-68 and the 760px / 460px breakpoints at ~lines 156-163).

  Feather + italic lead line, then a 3-column grid (brand blurb / Learn links /
  Contact links), then a bottom bar with copyright + tagline. Presentational
  only — no CTA button, no chat wiring.

  Deviations from the reference, all deliberate:
    - "About" targets #what-is-heirloom, the id WhatIsHeirloomSection actually
      uses on main and every lander branch (the reference's #what-is doesn't
      exist here; LandingNav already targets what-is-heirloom).
    - Column headings are <h3> (reference: <h5>) so the heading outline doesn't
      skip levels after the page's <h2> sections; link groups are <ul> lists.
      Visual output is identical.
    - Copyright year is computed rather than the reference's hardcoded 2026.
  Kept as-is from the reference: "Blog", "LinkedIn ↗" and "Toronto · Remote"
  are href="#" placeholders with no real destination yet.

  There was no pre-existing .hl-foot block in globals.css (only the old
  .hl-footer-grid this file used to carry), so the scoped styles live here,
  the same way HeroSection.tsx scopes its .hl-mc-* rules.

  Token mapping from the reference (var(--hl-*) → real tokens):
    --hl-text   → rgb(var(--color-text-primary))
    --hl-accent → rgb(var(--color-accent))
    --hl-muted  → var(--color-text-muted)
    --hl-faint  → rgb(var(--color-text-dim))
    --hl-border → var(--color-border)
    --font-display / --font-body / --font-mono → same names, already real tokens
      under [data-brand="heirloom"] (see globals.css).
  <Icon name="feather" /> → lucide-react <Feather />.
*/

import { Feather } from 'lucide-react';

const learnLinks = [
  { label: 'About', href: '#what-is-heirloom' },
  { label: 'Blog', href: '#' },
  { label: 'LinkedIn ↗', href: '#' },
];

const contactLinks = [
  { label: 'hello@2bl.ai', href: 'mailto:hello@2bl.ai' },
  { label: 'Toronto · Remote', href: '#' },
];

export function Footer() {
  return (
    <footer className="hl-foot" data-screen-label="Footer">
      <div className="hl-foot-wrap">
        <div className="hl-foot-lead">
          <span className="hl-foot-feather" aria-hidden="true"><Feather size={26} /></span>
          <p className="hl-foot-tagline">Every life deserves to be a book.</p>
        </div>

        <div className="hl-foot-top">
          <div>
            <p className="hl-foot-by">Brought to you by</p>
            <p className="hl-foot-mark">Second Brain <em>Labs</em></p>
            <p className="hl-foot-blurb">Second Brain Labs is a small workshop built around the belief that language is changing the relationship between people and technology.</p>
          </div>
          <div>
            <h3 className="hl-foot-head">Learn</h3>
            <ul className="hl-foot-links">
              {learnLinks.map((link) => (
                <li key={link.label}><a href={link.href}>{link.label}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="hl-foot-head">Contact</h3>
            <ul className="hl-foot-links">
              {contactLinks.map((link) => (
                <li key={link.label}><a href={link.href}>{link.label}</a></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="hl-foot-bottom">
          <span>© {new Date().getFullYear()} Second Brain Labs, Inc.</span>
          <span className="hl-foot-markline">Trying the impossible, one product at a time.</span>
        </div>
      </div>

      <style>{`
        .hl-foot { position: relative; z-index: 2; background: transparent; color: rgb(var(--color-text-primary)); border-top: 1px solid rgb(var(--color-accent)); padding: 64px 24px 36px; }
        .hl-foot-wrap { max-width: 1180px; margin: 0 auto; }
        .hl-foot-lead { display: flex; align-items: center; gap: 16px; padding-bottom: 40px; margin-bottom: 44px; border-bottom: 1px solid var(--color-border); }
        .hl-foot-feather { color: rgb(var(--color-accent)); display: inline-flex; flex-shrink: 0; }
        .hl-foot-tagline { font-family: var(--font-display); font-style: italic; font-weight: 400; font-size: clamp(22px, 3vw, 32px); line-height: 1.15; color: rgb(var(--color-text-primary)); margin: 0; }
        .hl-foot-top { display: grid; grid-template-columns: 1.6fr 1fr 1fr; gap: 40px; margin-bottom: 56px; }
        .hl-foot-by { font-family: var(--font-mono); font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: rgb(var(--color-accent)); margin: 0 0 8px; }
        .hl-foot-mark { font-family: var(--font-display); font-size: 28px; font-weight: 500; margin: 0 0 14px; color: rgb(var(--color-text-primary)); letter-spacing: -0.005em; }
        .hl-foot-mark em { font-style: italic; color: rgb(var(--color-accent)); font-weight: 400; }
        .hl-foot-blurb { color: var(--color-text-muted); font-size: 14px; max-width: 36ch; line-height: 1.6; margin: 0; }
        .hl-foot-head { font-family: var(--font-body); font-size: 11px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: rgb(var(--color-text-dim)); margin: 0 0 16px; }
        .hl-foot-links { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; font-size: 14px; }
        .hl-foot-links a { color: var(--color-text-muted); text-decoration: none; transition: color .15s ease; }
        .hl-foot-links a:hover { color: rgb(var(--color-text-primary)); }
        .hl-foot-bottom { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding-top: 28px; border-top: 1px solid var(--color-border); font-size: 12.5px; color: rgb(var(--color-text-dim)); }
        .hl-foot-bottom .hl-foot-markline { font-family: var(--font-display); font-style: italic; font-size: 15px; color: var(--color-text-muted); }
        @media (max-width: 760px) {
          .hl-foot-top { grid-template-columns: 1fr 1fr; gap: 32px; }
        }
        @media (max-width: 460px) {
          .hl-foot-top { grid-template-columns: 1fr; gap: 28px; }
          .hl-foot { padding: 48px 22px 32px; }
          .hl-foot-bottom { flex-direction: column; align-items: flex-start; gap: 8px; }
        }
      `}</style>
    </footer>
  );
}
