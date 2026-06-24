'use client';

import { createTheme, colorsTuple } from '@mantine/core';

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

export const adminTheme = createTheme({
  // ── Colors ──────────────────────────────────────────────────────────────────
  primaryColor: 'green',
  colors: {
    // Base: #2d6a4f (CLAUDE.md "Accent green"). Index 6 = base; 0–5 = tints; 7–9 = shades.
    green: colorsTuple(
      '#f0faf4',
      '#ddf1e5',
      '#b7dec6',
      '#8ec9a5',
      '#6ab688',
      '#4fa574',
      '#2d6a4f',
      '#245741',
      '#1b4433',
      '#133126',
    ),
  },

  // CLAUDE.md: Background #f9f8f5, Text primary #1a1917
  other: {
    bodyBackground: '#f9f8f5',
    textPrimary: '#1a1917',
    textMuted: 'rgba(26,25,23,0.55)',
  },

  // ── Typography ──────────────────────────────────────────────────────────────
  // CLAUDE.md: Font body = DM Sans, Font display = Playfair Display, Font mono = DM Mono
  // These map to the Google Fonts loaded in app/layout.tsx.
  fontFamily: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
  fontFamilyMonospace: '"DM Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  headings: {
    fontFamily: '"Playfair Display", serif',
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
  // CLAUDE.md: Spacing unit = 4px multiples
  // Mapped from tokens.spacing scale (spacingPrimitives)
  spacing: {
    xs: '0.25rem',    // 4px  — spacingPrimitives[2]
    sm: '0.5rem',     // 8px  — spacingPrimitives[3]
    md: '1rem',       // 16px — spacingPrimitives[5]
    lg: '1.5rem',     // 24px — spacingPrimitives[6]
    xl: '2rem',       // 32px — spacingPrimitives[7]
  },

  // ── Radius ──────────────────────────────────────────────────────────────────
  // Mapped from tokens.radius (radiusPrimitives)
  radius: {
    xs: '2px',        // radiusPrimitives[1] — tokens.radius.sm
    sm: '4px',        // radiusPrimitives[2] — tokens.radius.md
    md: '8px',        // radiusPrimitives[3] — tokens.radius.lg
    lg: '12px',       // radiusPrimitives[4] — tokens.radius.xl
    xl: '16px',
  },
  defaultRadius: 'sm',

  // ── Shadows ─────────────────────────────────────────────────────────────────
  // Minimal shadows — the admin aesthetic is flat and border-driven.
  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.06)',
    md: '0 4px 6px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.06)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.06)',
  },
});
