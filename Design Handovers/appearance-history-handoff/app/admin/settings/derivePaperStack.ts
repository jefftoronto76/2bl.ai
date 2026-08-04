// app/admin/settings/derivePaperStack.ts
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
// Feed the result into the storefront theme as CSS custom properties
// (--color-paper / --color-paper-2 / --color-paper-3 / --color-line) so
// app/secondbrainlabs/globals.css consumes derived values rather than constants.

export interface PaperStack {
  /** Page canvas — the base the tenant picked. */
  paper: string;
  /** Raised surface (cards, panels). Was --color-paper-2. */
  surface: string;
  /** Sunken surface (insets, chips, avatars). Was --color-paper-3. */
  sunken: string;
  /** Hairline border. Was --color-line. */
  line: string;
}

/** Warm shadow the paper steps lean toward — what makes the depth read as "paper". */
const PAPER_WARM = '#c8a87e';
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

/** Linear RGB mix of two hex colors. amt 0 = a, 1 = b. */
function mix(a: string, b: string, amt: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * amt, ag + (bg - ag) * amt, ab + (bb - ab) * amt);
}

/**
 * Derive the layered paper surfaces from a single background.
 * @param background  the tenant-chosen base (token `background`)
 * @param paperEffect token `paper_effect` — false flattens the stack
 * @param ink         heading/ink color, used for the flat hairline tint
 */
export function derivePaperStack(background: string, paperEffect: boolean, ink = FLAT_LINE_INK): PaperStack {
  if (!paperEffect) {
    return { paper: background, surface: background, sunken: background, line: mix(background, ink, 0.1) };
  }
  return {
    paper: background,
    surface: mix(background, PAPER_WARM, 0.1),
    sunken: mix(background, PAPER_WARM, 0.2),
    line: mix(background, PAPER_WARM, 0.42),
  };
}

/** CSS custom properties to inject on the storefront root (e.g. in layout/theme). */
export function paperStackVars(stack: PaperStack): Record<string, string> {
  return {
    '--color-paper': stack.paper,
    '--color-paper-2': stack.surface,
    '--color-paper-3': stack.sunken,
    '--color-line': stack.line,
  };
}
