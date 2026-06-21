// services/branding/paper-stack.ts
//
// The storefront's warm "paper" look is a RELATIONSHIP between surfaces, not a
// texture or filter. To keep that look tokenizable from a single `background`
// control, we DERIVE the raised/sunken surfaces and hairline from the base color
// instead of storing five hand-tuned creams the user could desync.
//
// `paperEffect` gates it:
//   • on  → warm tonal steps + warm hairline (the paper depth)
//   • off → surfaces collapse to the background (flat), with a faint neutral hairline
//
// ─── Per-tenant function fork ───────────────────────────────────────────────
//
// There are two derivation strategies depending on the tenant's brand direction:
//
//   derivePaperStack — AMBER-STACK (SBL only)
//     Steps surfaces toward a warm amber (#c8a87e) at 10% / 20% / 42%. SBL's
//     CSS var model has three surface levels (--color-paper-2, --color-paper-3,
//     --color-line) that map directly to this output. The amber direction is
//     load-bearing to SBL's identity — it is not a neutral choice.
//
//   deriveSurface — WHITE-LIFT (Heirloom + Jefflougheed)
//     Steps the single raised surface 40% toward white. These tenants have only
//     one surface level (--color-surface), and their brand palettes go lighter
//     (more luminance) on elevated elements, not warmer. Applying the amber
//     direction would fight both brands. The 40% constant approximates the
//     hand-tuned relationships already in each globals.css.
//
// Do not collapse these back to a single function. The fork is intentional.
//
// ─────────────────────────────────────────────────────────────────────────────

export interface PaperStack {
  /** Page canvas — the base the tenant picked. */
  paper: string;
  /** Raised surface (cards, panels). Maps to --color-paper-2 on SBL. */
  surface: string;
  /** Sunken surface (insets, chips, avatars). Maps to --color-paper-3 on SBL. */
  sunken: string;
  /** Hairline border. Maps to --color-line on SBL. */
  line: string;
}

const PAPER_WARM    = '#c8a87e';
const FLAT_LINE_INK = '#1a1917';

function hexToRgb(hex: string): [number, number, number] {
  let h = (hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h || '000000', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mix(a: string, b: string, amt: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * amt, ag + (bg - ag) * amt, ab + (bb - ab) * amt);
}

/**
 * Derive a three-level amber paper stack from a single background hex.
 * Use this for SBL — its CSS vars (--color-paper-2, --color-paper-3,
 * --color-line) and brand identity are built around the warm-amber direction.
 *
 * @param background  tenant-chosen base (token `background`)
 * @param paperEffect token `paper_effect` — false flattens the stack
 * @param ink         heading/ink color for the flat hairline tint
 */
export function derivePaperStack(
  background: string,
  paperEffect: boolean,
  ink = FLAT_LINE_INK,
): PaperStack {
  if (!paperEffect) {
    return {
      paper:   background,
      surface: background,
      sunken:  background,
      line:    mix(background, ink, 0.1),
    };
  }
  return {
    paper:   background,
    surface: mix(background, PAPER_WARM, 0.1),
    sunken:  mix(background, PAPER_WARM, 0.2),
    line:    mix(background, PAPER_WARM, 0.42),
  };
}

/**
 * CSS custom properties to inject on the SBL storefront root.
 * Maps directly onto the --color-paper / -2 / -3 / --color-line vars
 * defined in app/secondbrainlabs/globals.css.
 */
export function paperStackVars(stack: PaperStack): Record<string, string> {
  return {
    '--color-paper':   stack.paper,
    '--color-paper-2': stack.surface,
    '--color-paper-3': stack.sunken,
    '--color-line':    stack.line,
  };
}

/**
 * Derive a single elevated surface from a background hex via white-lift.
 * Use this for Heirloom and Jefflougheed — both have one surface level
 * (--color-surface) and their brands go lighter on elevated elements.
 *
 * @param background  tenant-chosen base (token `background`)
 * @param paperEffect token `paper_effect` — false collapses surface to background
 */
export function deriveSurface(background: string, paperEffect: boolean): string {
  if (!paperEffect) return background;
  return mix(background, '#ffffff', 0.4);
}

export type PaperEffectMode = 'warm' | 'lift' | 'flat';

/**
 * Unified entry point for the new `paper_effect` enum.
 * Bridges the three named modes to the existing derivation strategies
 * without modifying `derivePaperStack` or `deriveSurface`.
 *
 * 'warm' → amber-stack (same as derivePaperStack with effect on)
 * 'lift' → white-lift stack (single elevated surface, the other levels stay at bg)
 * 'flat' → no tonal steps (same as derivePaperStack with effect off)
 */
export function resolvePaperStack(
  background: string,
  mode: PaperEffectMode,
  ink = '#1a1917',
): PaperStack {
  switch (mode) {
    case 'warm':
      return derivePaperStack(background, true, ink);
    case 'lift':
      return {
        paper:   background,
        surface: deriveSurface(background, true),
        sunken:  background,
        line:    mix(background, ink, 0.1),
      };
    case 'flat':
      return derivePaperStack(background, false, ink);
  }
}
