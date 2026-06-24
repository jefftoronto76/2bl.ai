// app/admin/settings/AdminPreview.tsx
//
// Live preview for the **Admin** branding target — the sibling of ThemePreview
// (which previews the storefront). It renders a miniature of the real admin
// console (UnifiedAdminShell): a dark sidebar with the tenant wordmark + "Admin"
// kicker, navigation whose active item + the primary buttons take the `accent`,
// and a content card whose surfaces honor `paper_effect`.
//
// Same prop contract as ThemePreview: a single ThemeTokens object.

'use client';

import type { ThemeTokens } from './ThemePreview';

/* ── color helpers (mirror ThemePreview) ── */
function hx2rgb(h: string): [number, number, number] {
  h = String(h || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h || '000000', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgb2hx(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
function mixHex(a: string, b: string, amt: number): string {
  const A = hx2rgb(a), B = hx2rgb(b);
  return rgb2hx(A[0] + (B[0] - A[0]) * amt, A[1] + (B[1] - A[1]) * amt, A[2] + (B[2] - A[2]) * amt);
}

const PAPER_WARM = '#c8a87e';
function paperStack(bg: string, effect: 'warm' | 'lift' | 'flat', ink?: string) {
  const inkColor = ink || '#1a1917';
  switch (effect) {
    case 'warm':
      return { surface: mixHex(bg, PAPER_WARM, 0.1), sunken: mixHex(bg, PAPER_WARM, 0.2), line: mixHex(bg, PAPER_WARM, 0.42) };
    case 'lift':
      return { surface: mixHex(bg, '#ffffff', 0.4), sunken: bg, line: mixHex(bg, inkColor, 0.1) };
    case 'flat':
    default:
      return { surface: bg, sunken: bg, line: mixHex(bg, inkColor, 0.1) };
  }
}

const MONO = 'var(--mantine-font-family-monospace)';
const NAV_ITEMS = ['Inbound', 'Members', 'Composer', 'Settings'];

export function AdminPreview({ t }: { t: ThemeTokens }) {
  const headFont = `"${t.font_primary}", sans-serif`;
  const bodyFont = `"${t.font_secondary}", sans-serif`;
  const btnBg = t.accent_buttons ? t.accent : '#1a1917';
  const ps = paperStack(t.background, t.paper_effect, t.heading);
  const navText = 'rgba(255,255,255,0.6)';

  return (
    <div className="theme-preview-wrap">
      <span style={{ fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10, color: 'var(--mantine-color-gray-6)' }}>
        Live preview
      </span>
      <div className="theme-preview" style={{ padding: 0, overflow: 'hidden', background: '#f9f8f5', fontFamily: bodyFont }}>
        <div style={{ display: 'flex', minHeight: 344 }}>
          {/* ── Sidebar ── */}
          <div style={{ width: 140, flex: '0 0 140px', background: t.background, padding: '15px 11px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ marginBottom: 13, padding: '0 5px' }}>
              <div style={{ fontFamily: headFont, color: '#fff', fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>Second Brain</div>
              <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.accent, marginTop: 3 }}>Admin</div>
            </div>
            {NAV_ITEMS.map((n, i) => {
              const active = i === 1;
              return (
                <span
                  key={n}
                  style={{
                    display: 'block',
                    padding: '7px 10px',
                    borderRadius: 6,
                    fontSize: 12.5,
                    fontFamily: bodyFont,
                    fontWeight: active ? 500 : 400,
                    color: active ? '#fff' : navText,
                    background: active ? t.accent : 'transparent',
                  }}
                >
                  {n}
                </span>
              );
            })}
          </div>

          {/* ── Main content ── */}
          <div style={{ flex: 1, minWidth: 0, padding: '18px 18px 20px' }}>
            <h1 style={{ fontFamily: headFont, color: t.heading, fontSize: 21, lineHeight: 1.15, margin: 0, fontWeight: 600 }}>Members</h1>
            <p style={{ color: t.lede, fontSize: 12.5, margin: '5px 0 0', lineHeight: 1.5 }}>Manage who can access this workspace.</p>

            <div style={{ marginTop: 14, background: ps.surface, border: `1px solid ${ps.line}`, borderRadius: 12, padding: 14, transition: 'background 160ms ease, border-color 160ms ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 30, height: 30, borderRadius: '50%', background: t.accent, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 11.5, fontWeight: 700, fontFamily: bodyFont, flex: '0 0 auto' }}>JL</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: t.heading, fontSize: 13.5, fontWeight: 600 }}>Jeff Lougheed</div>
                  <div style={{ color: t.lede, fontSize: 12 }}>jeff@naturalresource.co</div>
                </div>
                <span style={{ background: mixHex(t.background, t.accent, 0.12), color: t.accent, border: `1px solid ${mixHex(t.background, t.accent, 0.3)}`, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 600, fontFamily: bodyFont }}>
                  Owner
                </span>
              </div>
              <p style={{ color: t.body, fontSize: 13, margin: '11px 0 0', lineHeight: 1.55 }}>
                Owners can edit branding, prompts, and billing for this workspace.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 16px', borderRadius: 6, background: btnBg, color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: bodyFont }}>
                Invite member
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 16px', borderRadius: 6, background: 'transparent', color: t.body, border: `1px solid ${mixHex(t.background, t.heading, 0.2)}`, fontSize: 13, fontWeight: 600, fontFamily: bodyFont }}>
                Export
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
