// buildAdminTheme — Second Brain Labs admin Mantine theme.
//
// This mirrors the tokens already shipped in your codebase. If you ALREADY have
// components/admin/theme/mantine-theme.ts, keep yours and delete this file — every
// screen in this package reads theme values through CSS vars (var(--mantine-*)),
// so it binds to whichever theme your <MantineProvider> uses.

import { createTheme, colorsTuple } from '@mantine/core'

export const buildAdminTheme = () =>
  createTheme({
    primaryColor: 'brand',
    colors: {
      brand: colorsTuple('#C8542E'),
      ink: colorsTuple('#1F1A14'),
      background: colorsTuple('#FAF6EE'),
    },
    fontFamily: 'Manrope, sans-serif',
    fontFamilyMonospace: 'DM Mono, monospace',
    headings: { fontFamily: 'Newsreader, serif' },
    fontSizes: { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem' },
    spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem' },
    radius: { xs: '2px', sm: '4px', md: '8px', lg: '12px', xl: '16px' },
    defaultRadius: 'sm',
    shadows: {
      xs: '0 1px 2px rgba(0,0,0,0.04)',
      sm: '0 1px 3px rgba(0,0,0,0.06)',
      md: '0 4px 6px rgba(0,0,0,0.06)',
      lg: '0 10px 15px rgba(0,0,0,0.06)',
      xl: '0 20px 25px rgba(0,0,0,0.06)',
    },
    components: {
      Button: { defaultProps: { color: 'brand' } },
    },
  })

// colorsTuple makes every brand shade identical, so brand-0 is a SOLID fill, not a
// tint. Use accentMix() for any faint accent wash (e.g. a soft brand background).
export const accentMix = (pct: number, base = '#fff') =>
  `color-mix(in srgb, var(--mantine-color-brand-6) ${pct}%, ${base})`

export const theme = buildAdminTheme()
