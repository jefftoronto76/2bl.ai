import { createTheme, colorsTuple } from '@mantine/core';
import { isValidHex } from '@/services/branding/hex-utils';
import { ALL_FONTS } from '@/services/branding/font-registry';

/**
 * Mantine theme bridge for the Natural Resource admin interface.
 *
 * Sources:
 *   - CLAUDE.md design token table (authoritative values)
 *   - /components/admin/theme/tokens.ts (spacing, radius primitives)
 *
 * This file maps existing design tokens into Mantine's theme API so both
 * systems can coexist during migration. tokens.ts is NOT deleted — it
 * remains the source of truth for existing hand-rolled components until
 * Phase 2 replaces them with Mantine equivalents.
 */


interface BrandingForTheme {
  background?:     string | null;
  accent?:         string | null;
  accent_hover?:   string | null;
  heading?:        string | null;
  lede?:           string | null;
  body?:           string | null;
  font_primary?:   string | null;
  font_secondary?: string | null;
  font_mono?:      string | null;
  accent_buttons?: boolean | null;
}

// ── Per-tenant design token fallbacks ─────────────────────────────────────────
// Used when branding is null or a field is missing so each tenant's admin
// interface renders with its storefront palette rather than generic inkwell
// defaults. The jefflougheed tenant is also the system default when no
// tenant-specific fallback is matched.
const TENANT_FALLBACKS: Record<string, BrandingForTheme> = {
  // jefflougheed.ca
  'e07334a0-2afd-4544-898b-edb124d2dd33': {
    background: '#181820', accent: '#a8c8a8', accent_hover: '#7da87d', heading: '#eae7dc',
    lede: 'rgba(234,231,220,0.70)', body: '#eae7dc',
    font_primary: 'Playfair Display, Georgia, serif',
    font_secondary: 'DM Sans, sans-serif',
    font_mono: 'DM Mono, Courier New, monospace',
    accent_buttons: true,
  },
  // 2bl.ai — Second Brain Labs
  '6720ee2f-d7e3-4788-b8c7-f63cf70eb2bb': {
    background: '#FAF6EE', accent: '#C8542E', accent_hover: '#a03d1e', heading: '#1F1A14',
    lede: '#6B6256', body: '#1F1A14',
    font_primary: 'Newsreader, serif',
    font_secondary: 'Manrope, sans-serif',
    font_mono: 'DM Mono, Courier New, monospace',
    accent_buttons: true,
  },
  // heirloom.2bl.ai — Heirloom
  '20767f1d-1148-4e43-ab73-f6da88f0ac56': {
    background: '#ECE3D2', accent: '#2E854D', accent_hover: '#1e6035', heading: '#2E2417',
    lede: 'rgba(46,36,23,0.62)', body: '#2E2417',
    font_primary: 'Cormorant Garamond, Georgia, serif',
    font_secondary: 'DM Sans, sans-serif',
    font_mono: 'DM Mono, Courier New, monospace',
    accent_buttons: true,
  },
};

/** Builds a dynamic Mantine theme from tenant_branding values. Falls back to per-tenant defaults. */
export function buildAdminTheme(branding?: BrandingForTheme | null, tenantId?: string) {
  const fallback: BrandingForTheme = TENANT_FALLBACKS[tenantId ?? ''] ?? TENANT_FALLBACKS['e07334a0-2afd-4544-898b-edb124d2dd33'];

  console.log('[admin-theme] tenant:', tenantId);
  console.log('[admin-theme] branding from DB:', JSON.stringify(branding));
  console.log('[admin-theme] using fallback:', !branding);

  const accent      = isValidHex(branding?.accent)       ? branding!.accent!       : fallback.accent!;
  const accentHover = isValidHex(branding?.accent_hover) ? branding!.accent_hover! : (fallback.accent_hover ?? accent);
  const bg          = isValidHex(branding?.background)   ? branding!.background!   : fallback.background!;
  const textPrimary = isValidHex(branding?.heading)     ? branding!.heading!     : fallback.heading!;
  const textMuted   = branding?.lede ?? fallback.lede!;
  const bodyText    = isValidHex(branding?.body)        ? branding!.body!        : fallback.body!;
  const ink         = isValidHex(branding?.heading)     ? branding!.heading!     : fallback.heading!;

  const allowedFontValues = new Set(ALL_FONTS.map(f => f.value));
  const resolveFont = (v: string | null | undefined, fb: string) =>
    (v && allowedFontValues.has(v)) ? v : fb;

  const headingFont   = resolveFont(branding?.font_primary,   fallback.font_primary!);
  const bodyFont      = resolveFont(branding?.font_secondary, fallback.font_secondary!);
  const monoFont      = resolveFont(branding?.font_mono,      fallback.font_mono!);
  const accentButtons = branding?.accent_buttons ?? fallback.accent_buttons ?? true;

  console.log('[admin-theme] resolved accent:', accent);
  console.log('[admin-theme] resolved background:', bg);
  console.log('[admin-theme] resolved fonts:', { headingFont, bodyFont, monoFont });

  const theme = createTheme({
    // ── Colors ──────────────────────────────────────────────────────────────────
    primaryColor: 'brand',
    colors: {
      brand:      colorsTuple(accent),
      ink:        colorsTuple(ink),
      background: colorsTuple(bg),
    },

    // Kept for backward compat — being phased out in favour of theme.colors.*
    other: {
      bodyBackground: bg,
      textPrimary,
      textMuted,
      bodyText,
    },

    // ── Typography ──────────────────────────────────────────────────────────────
    fontFamily:          bodyFont,
    fontFamilyMonospace: monoFont,
    headings: {
      fontFamily: headingFont,
    },

    // Font sizes from tokens.typography.size (xs through xl)
    fontSizes: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      md: '1rem',       // 16px (CLAUDE.md min font size)
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
    },

    // ── Spacing ─────────────────────────────────────────────────────────────────
    spacing: {
      xs: '0.25rem',    // 4px
      sm: '0.5rem',     // 8px
      md: '1rem',       // 16px
      lg: '1.5rem',     // 24px
      xl: '2rem',       // 32px
    },

    // ── Radius ──────────────────────────────────────────────────────────────────
    radius: {
      xs: '2px',
      sm: '4px',
      md: '8px',
      lg: '12px',
      xl: '16px',
    },
    defaultRadius: 'sm',

    // ── Shadows ─────────────────────────────────────────────────────────────────
    shadows: {
      xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
      sm: '0 1px 3px rgba(0, 0, 0, 0.06)',
      md: '0 4px 6px rgba(0, 0, 0, 0.06)',
      lg: '0 10px 15px rgba(0, 0, 0, 0.06)',
      xl: '0 20px 25px rgba(0, 0, 0, 0.06)',
    },

    // ── Component defaults ───────────────────────────────────────────────────────
    components: {
      Button: {
        defaultProps: {
          color: accentButtons ? 'brand' : 'ink',
        },
      },
    },
  });

  return { theme, textMuted, accentHover };
}

// Static export kept for any existing imports that haven't switched to buildAdminTheme.
export const adminTheme = buildAdminTheme().theme;

export const accentMix = (pct: number, base = 'transparent'): string =>
  `color-mix(in srgb, var(--mantine-color-brand-6) ${pct}%, ${base})`
