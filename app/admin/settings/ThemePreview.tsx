'use client';

import { useState } from 'react';

/* ── color helpers ── */
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
  return rgb2hx(
    A[0] + (B[0] - A[0]) * amt,
    A[1] + (B[1] - A[1]) * amt,
    A[2] + (B[2] - A[2]) * amt,
  );
}

const PAPER_WARM = '#c8a87e';

interface PaperStackResult {
  surface: string;
  sunken: string;
  line: string;
}

function paperStack(bg: string, effect: boolean, ink?: string): PaperStackResult {
  if (!effect) return { surface: bg, sunken: bg, line: mixHex(bg, ink || '#1a1917', 0.10) };
  return {
    surface: mixHex(bg, PAPER_WARM, 0.10),
    sunken:  mixHex(bg, PAPER_WARM, 0.20),
    line:    mixHex(bg, PAPER_WARM, 0.42),
  };
}

export interface ThemeTokens {
  background:     string;
  paper_effect:   boolean;
  accent:         string;
  accent_buttons: boolean;
  lede:           string;
  heading:        string;
  body:           string;
  font_primary:   string;
  font_secondary: string;
}

export function ThemePreview({ t }: { t: ThemeTokens }) {
  const headFont = `"${t.font_primary}", serif`;
  const bodyFont = `"${t.font_secondary}", sans-serif`;
  const btnBg    = t.accent_buttons ? t.accent : '#1a1917';
  const ps       = paperStack(t.background, t.paper_effect, t.heading);
  const [showSurfaceNote, setShowSurfaceNote] = useState(false);

  return (
    <div className="theme-preview-wrap">
      <span
        style={{
          fontFamily:    'var(--mantine-font-family-monospace)',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          fontSize:      10,
          color:         'var(--mantine-color-gray-6)',
        }}
      >
        Live preview
      </span>
      <div className="theme-preview" style={{ background: t.background, fontFamily: bodyFont }}>
        <h1
          style={{
            fontFamily: headFont,
            color:      t.heading,
            fontSize:   30,
            lineHeight: 1.12,
            margin:     0,
            fontWeight: 500,
          }}
        >
          Build a second brain that talks.
        </h1>
        <p style={{ color: t.lede, fontSize: 16, margin: '14px 0 0', lineHeight: 1.5 }}>
          Sage answers your visitors in your voice, around the clock — and books the ones who are ready.
        </p>
        <p style={{ color: t.body, fontSize: 14, margin: '14px 0 0', lineHeight: 1.6 }}>
          Every conversation is grounded in the notes, prompts, and parameters you control here. No hallucinated facts, no off-brand tone — just your knowledge, working while you sleep.{' '}
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            style={{ color: t.accent, textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            See how it works
          </a>
          .
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <span
            style={{
              display:       'inline-flex',
              alignItems:    'center',
              height:        40,
              padding:       '0 18px',
              borderRadius:  6,
              background:    btnBg,
              color:         '#fff',
              fontSize:      14,
              fontWeight:    600,
              fontFamily:    bodyFont,
            }}
          >
            Start a chat
          </span>
          <span
            style={{
              display:       'inline-flex',
              alignItems:    'center',
              height:        40,
              padding:       '0 18px',
              borderRadius:  6,
              background:    'transparent',
              color:         t.accent,
              border:        `1px solid ${t.accent}`,
              fontSize:      14,
              fontWeight:    600,
              fontFamily:    bodyFont,
            }}
          >
            Learn more
          </span>
        </div>

        {/* Surface sample */}
        <div
          style={{
            marginTop:  22,
            paddingTop: 12,
            borderTop:  `1px dashed ${mixHex(t.background, t.heading, 0.18)}`,
          }}
        >
          <div
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              gap:            8,
            }}
          >
            <span
              style={{
                fontFamily:    'var(--mantine-font-family-monospace)',
                fontSize:      10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color:         mixHex(t.background, t.heading, 0.5),
              }}
            >
              Surface sample
            </span>
            <button
              type="button"
              onClick={() => setShowSurfaceNote((v) => !v)}
              aria-expanded={showSurfaceNote}
              style={{
                appearance:      'none',
                border:          0,
                background:      'transparent',
                padding:         0,
                font:            'inherit',
                fontSize:        11.5,
                color:           t.accent,
                cursor:          'pointer',
                textDecoration:  'underline',
                textUnderlineOffset: 2,
              }}
            >
              {showSurfaceNote ? 'Hide' : 'What’s this?'}
            </button>
          </div>
          {showSurfaceNote && (
            <p
              style={{
                fontSize:   12,
                lineHeight: 1.55,
                margin:     '8px 0 0',
                color:      mixHex(t.background, t.heading, 0.62),
                fontFamily: bodyFont,
              }}
            >
              A demo surface — not real content. It shows how cards, chips, and borders take their tone from your <strong>Background</strong>. Toggle <strong>Paper effect</strong> above to watch them gain or lose depth.
            </p>
          )}
          <div
            style={{
              marginTop:  12,
              background: ps.surface,
              border:     `1px solid ${ps.line}`,
              borderRadius: 12,
              padding:    16,
              transition: 'background 160ms ease, border-color 160ms ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width:        30,
                  height:       30,
                  borderRadius: '50%',
                  background:   ps.sunken,
                  display:      'grid',
                  placeItems:   'center',
                  color:        t.body,
                  fontSize:     11.5,
                  fontWeight:   700,
                  fontFamily:   bodyFont,
                  flex:         '0 0 auto',
                }}
              >
                SC
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: t.heading, fontSize: 13.5, fontWeight: 600 }}>Sarah Chen</div>
                <div style={{ color: t.lede, fontSize: 12 }}>Summit Realty</div>
              </div>
            </div>
            <p style={{ color: t.body, fontSize: 13.5, margin: '11px 0 0', lineHeight: 1.55 }}>
              &ldquo;Sage books the right people while I sleep — and sounds like me doing it.&rdquo;
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <span
                style={{
                  background:   ps.sunken,
                  border:       `1px solid ${ps.line}`,
                  borderRadius: 999,
                  padding:      '3px 10px',
                  fontSize:     11.5,
                  color:        t.body,
                  fontFamily:   bodyFont,
                }}
              >
                Active
              </span>
              <span
                style={{
                  background:   ps.sunken,
                  border:       `1px solid ${ps.line}`,
                  borderRadius: 999,
                  padding:      '3px 10px',
                  fontSize:     11.5,
                  color:        t.body,
                  fontFamily:   bodyFont,
                }}
              >
                Pro plan
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
