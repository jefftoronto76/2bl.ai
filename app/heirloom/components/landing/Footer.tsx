'use client';

/*
  Footer → Second Brain Labs footer with the "Every life deserves to be a book."
  lead line. Transparent background, 1px accent top border. Presentational only
  (no CTA button in the redesign).
*/

import { Feather } from 'lucide-react';

const learnLinks = [
  { label: 'About', href: '#what-is-heirloom' },
  { label: 'Blog', href: '#' },
  { label: 'LinkedIn ↗', href: '#' },
];

export function Footer() {
  return (
    <footer data-screen-label="Footer" className="border-t border-accent px-6 pt-14 pb-10 bg-transparent">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 pb-10 mb-11 border-b border-border">
          <span className="text-accent shrink-0"><Feather size={26} strokeWidth={1.5} /></span>
          <p className="font-display italic text-text-primary leading-[1.15]" style={{ fontSize: 'clamp(22px, 3vw, 32px)' }}>Every life deserves to be a book.</p>
        </div>

        <div className="hl-footer-grid mb-12">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent mb-2">Brought to you by</p>
            <p className="font-display text-text-primary mb-3" style={{ fontSize: 26, fontWeight: 500, lineHeight: 1.1 }}>
              Second Brain <em className="text-accent italic font-normal">Labs</em>
            </p>
            <p className="font-body text-text-muted max-w-sm" style={{ fontSize: 15, lineHeight: 1.6 }}>
              Second Brain Labs is a small workshop built around the belief that language is changing the relationship between people and technology.
            </p>
          </div>

          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted mb-4">Learn</p>
            <ul className="list-none m-0 p-0 flex flex-col gap-3">
              {learnLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="font-body text-text-primary hover:text-accent transition-colors no-underline" style={{ fontSize: 15 }}>{link.label}</a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted mb-4">Contact</p>
            <ul className="list-none m-0 p-0 flex flex-col gap-3">
              <li><a href="mailto:hello@2bl.ai" className="font-body text-text-primary hover:text-accent transition-colors no-underline" style={{ fontSize: 15 }}>hello@2bl.ai</a></li>
              <li><span className="font-body text-text-muted" style={{ fontSize: 15 }}>Toronto · Remote</span></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="font-body text-text-muted" style={{ fontSize: 14 }}>© {new Date().getFullYear()} Second Brain Labs, Inc.</p>
          <p className="font-display italic text-text-muted" style={{ fontSize: 15 }}>Trying the impossible, one product at a time.</p>
        </div>
      </div>

      <style>{`
        .hl-footer-grid { display: grid; grid-template-columns: 1fr; gap: 2.5rem; }
        @media (min-width: 461px) { .hl-footer-grid { grid-template-columns: 1fr 1fr; } }
        @media (min-width: 761px) { .hl-footer-grid { grid-template-columns: 1.4fr 1fr 1fr; } }
      `}</style>
    </footer>
  );
}
