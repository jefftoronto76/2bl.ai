'use client';

import { createTheme, type CSSVariablesResolver } from '@mantine/core';
import { generateColors } from '@mantine/colors-generator';
import { isValidHex } from '@/services/branding/hex-utils';
import { ALL_FONTS } from '@/services/branding/font-registry';

/**
 * Mantine theme bridge for the Natural Resource admin interface.
 *
 * Sources:
 *   - System Docs/Design System.md design token table (authoritative values)
 *   - /components/admin/theme/tokens.ts (spacing, radius primitives)
 *
 * buildAdminTheme returns { theme, resolver } — the resolver is passed to
 * <MantineProvider cssVariablesResolver={resolver}> so Mantine emits all
 * admin-specific CSS variables natively. No manual <style> injection needed.
 */


export interface BrandingForTheme {
  background?:     string | null;
  accent?:         string | null;
  accent_hover?:   string | null;
  heading?:        string | null;
  body?:           string | null;
  sidebar_bg?:     string | null;
  sidebar_text?:   string | null;
  // muted = admin dim-text (maps to --admin-text-muted).
  // text_dim and lede are storefront-only — never read them on admin rows.
  muted?:          string | null;
  border?:         string | null;
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
//
// RequiredBranding strips optionality AND nullability so every resolved
// fallback field is typed as a plain string/boolean (as the values actually are).
type RequiredBranding = { [K in keyof BrandingForTheme]-?: NonNullable<BrandingForTheme[K]> };

const TENANT_FALLBACKS: Record<string, RequiredBranding> = {
  // jefflougheed.ca
  'e07334a0-2afd-4544-898b-edb124d2dd33': {
    background: '#181820', accent: '#a8c8a8', accent_hover: '#7da87d', heading: '#eae7dc',
    body: '#eae7dc',
    sidebar_bg: '#181820', sidebar_text: '#CFC9BF', muted: 'rgba(234,231,220,0.70)',
    border: 'rgba(234,231,220,0.15)',
    font_primary: 'Playfair Display, Georgia, serif',
    font_secondary: 'DM Sans, sans-serif',
    font_mono: 'DM Mono, Courier New, monospace',
    accent_buttons: true,
  },
  // 2bl.ai — Second Brain Labs
  '6720ee2f-d7e3-4788-b8c7-f63cf70eb2bb': {
    background: '#FAF6EE', accent: '#C8542E', accent_hover: '#A03D1E', heading: '#1F1A14',
    body: '#1F1A14',
    sidebar_bg: '#17130E', sidebar_text: '#CFC9BF', muted: '#6B6256',
    border: '#E7E0D3',
    font_primary: 'Newsreader, serif',
    font_secondary: 'Manrope, sans-serif',
    font_mono: 'DM Mono, Courier New, monospace',
    accent_buttons: true,
  },
  // heirloom.2bl.ai — Heirloom
  '20767f1d-1148-4e43-ab73-f6da88f0ac56': {
    background: '#ECE3D2', accent: '#2E854D', accent_hover: '#1e6035', heading: '#2E2417',
    body: '#2E2417',
    sidebar_bg: '#1C1308', sidebar_text: '#C2B89A', muted: 'rgba(46,36,23,0.62)',
    border: 'rgba(194,184,154,0.20)',
    font_primary: 'Cormorant Garamond, Georgia, serif',
    font_secondary: 'DM Sans, sans-serif',
    font_mono: 'DM Mono, Courier New, monospace',
    accent_buttons: true,
  },
};

const DEFAULT_FALLBACK = TENANT_FALLBACKS['e07334a0-2afd-4544-898b-edb124d2dd33'];

/** Builds a dynamic Mantine theme + cssVariablesResolver from tenant_branding values.
 *  Falls back to per-tenant defaults when branding is null or a field is missing.
 *  Pass branding=null to get a pure fallback theme (use_db_branding=false path). */
export function buildAdminTheme(branding?: BrandingForTheme | null, tenantId?: string) {
  const fallback: RequiredBranding =
    TENANT_FALLBACKS[tenantId ?? ''] ?? DEFAULT_FALLBACK;

  const b = branding ?? {};

  const accent      = isValidHex(b.accent)       ? b.accent!       : fallback.accent;
  const accentHover = isValidHex(b.accent_hover)  ? b.accent_hover! : fallback.accent_hover;
  const bg          = isValidHex(b.background)    ? b.background!   : fallback.background;
  const headingHex  = isValidHex(b.heading)       ? b.heading!      : fallback.heading;
  const bodyText    = isValidHex(b.body)          ? b.body!         : fallback.body;
  const sidebarBg   = isValidHex(b.sidebar_bg)    ? b.sidebar_bg!   : fallback.sidebar_bg;
  const sidebarText = isValidHex(b.sidebar_text)  ? b.sidebar_text! : fallback.sidebar_text;
  const muted       = b.muted ?? fallback.muted;
  const border      = b.border ?? fallback.border;

  const allowedFontValues = new Set(ALL_FONTS.map(f => f.value));
  const resolveFont = (v: string | null | undefined, fb: string) =>
    (v && allowedFontValues.has(v)) ? v : fb;

  const headingFont   = resolveFont(b.font_primary,   fallback.font_primary);
  const bodyFont      = resolveFont(b.font_secondary, fallback.font_secondary);
  const monoFont      = resolveFont(b.font_mono,      fallback.font_mono);
  const accentButtons = b.accent_buttons ?? fallback.accent_buttons;

  const theme = createTheme({
    // ── Colors ──────────────────────────────────────────────────────────────────
    primaryColor: 'brand',
    colors: {
      brand: generateColors(accent),   // real 10-shade scale — hover/variants work
      ink:   generateColors(headingHex),
    },

    // ── Typography ──────────────────────────────────────────────────────────────
    fontFamily:          bodyFont,
    fontFamilyMonospace: monoFont,
    headings: {
      fontFamily: headingFont,
      textWrap:   'pretty' as const,
    },

    // Font sizes from tokens.typography.size (xs through xl)
    fontSizes: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      md: '1rem',       // 16px (System Docs/Design System.md min font size)
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

  // Mantine emits these as real CSS variables — no manual <style> injection needed.
  const resolver: CSSVariablesResolver = () => ({
    variables: {
      '--admin-sidebar-bg':     sidebarBg,
      '--admin-sidebar-text':   sidebarText,
      '--admin-accent-hover':   accentHover,
      '--admin-text-muted':     muted,
      '--admin-sidebar-border': border,
    },
    light: {
      '--mantine-color-body': bg,
      '--mantine-color-text': bodyText,
    },
    dark: {},
  });

  return { theme, resolver };
}

// Static export kept for any existing imports that haven't switched to buildAdminTheme.
export const adminTheme = buildAdminTheme().theme;

// Use accentMix() for any faint accent wash (e.g. a soft brand background).
export const accentMix = (pct: number, base = 'transparent'): string =>
  `color-mix(in srgb, var(--mantine-color-brand-6) ${pct}%, ${base})`
