/** Returns true when `s` is a valid 6-digit hex color string (e.g. "#2E854D"). */
export function isValidHex(s: unknown): s is string {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
}

/** Converts "#RRGGBB" to an "R G B" space-separated triplet for CSS custom properties. */
export function hexToRgbTriplet(hex: string): string | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  return m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : null;
}
