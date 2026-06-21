import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { getTenantBranding } from '@/services/branding/get-tenant-branding';
import { isValidHex, hexToRgbTriplet } from '@/services/branding/hex-utils';
import { ALL_FONTS } from '@/services/branding/font-registry';

const JEFF_TENANT_ID = 'e07334a0-2afd-4544-898b-edb124d2dd33';

export const metadata: Metadata = {
  title: 'JL',
  description:
    'Performance-driven, heart-led coaching and embedded execution support. Better close rates, deeper relationships, revenue growth made easier.',
  metadataBase: new URL('https://jefflougheed.ca'),
  icons: {
    icon: [
      { url: '/sage/jefflougheed/favicons/favicon.ico', sizes: 'any' },
      { url: '/sage/jefflougheed/favicons/favicon.svg', type: 'image/svg+xml' },
      { url: '/sage/jefflougheed/favicons/favicon-96x96.png', type: 'image/png', sizes: '96x96' },
    ],
    apple: { url: '/sage/jefflougheed/favicons/apple-touch-icon.png' },
  },
  manifest: '/sage/jefflougheed/favicons/site.webmanifest',
}

export default async function JeffLougheedLayout({ children }: { children: React.ReactNode }) {
  const branding = await getTenantBranding(JEFF_TENANT_ID);

  // Build :root color overrides (rgb triplets for vars used with alpha in globals.css)
  const colorLines: string[] = [];
  if (isValidHex(branding?.color_background)) {
    const rgb = hexToRgbTriplet(branding!.color_background!);
    if (rgb) colorLines.push(`  --color-bg: ${rgb};`);
  }
  if (isValidHex(branding?.color_accent)) {
    const rgb = hexToRgbTriplet(branding!.color_accent!);
    if (rgb) colorLines.push(`  --color-accent: ${rgb};`);
  }
  if (isValidHex(branding?.color_text_primary)) {
    colorLines.push(`  --color-text-primary: ${branding!.color_text_primary!};`);
  }
  if (isValidHex(branding?.color_text_muted)) {
    colorLines.push(`  --color-text-muted: ${branding!.color_text_muted!};`);
  }

  // Font overrides in :root — validate against registry to prevent CSS injection
  const allowedFontValues = new Set(ALL_FONTS.map(f => f.value));

  const fontDisplay = branding?.font_display;
  const fontBody    = branding?.font_body;
  const fontMono    = branding?.font_mono;

  if (fontDisplay && allowedFontValues.has(fontDisplay)) colorLines.push(`  --font-display: ${fontDisplay};`);
  if (fontBody    && allowedFontValues.has(fontBody))    colorLines.push(`  --font-body: ${fontBody};`);
  if (fontMono    && allowedFontValues.has(fontMono))    colorLines.push(`  --font-mono: ${fontMono};`);

  // Inject Google Fonts <link> tags for any custom font that has a googleFamily
  const fontEntriesToLoad = [fontDisplay, fontBody, fontMono]
    .filter(Boolean)
    .map(v => ALL_FONTS.find(f => f.value === v))
    .filter((e): e is NonNullable<typeof e> => !!e?.googleFamily);

  const cssString = colorLines.length > 0 ? `:root {\n${colorLines.join('\n')}\n}` : '';

  return (
    <>
      {/* Google Fonts — default set (Playfair Display, DM Sans, DM Mono) always loaded as fallback */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,700;1,400;1,500&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      {/* Custom Google Fonts when tenant has overridden defaults (browser deduplicates identical URLs) */}
      {fontEntriesToLoad.map(entry => (
        <link
          key={entry.googleFamily}
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${entry.googleFamily}&display=swap`}
        />
      ))}
      {/* Calendly widget styles */}
      <link
        href="https://assets.calendly.com/assets/external/widget.css"
        rel="stylesheet"
      />
      {cssString && <style dangerouslySetInnerHTML={{ __html: cssString }} />}
      {children}
      <Script
        src="https://assets.calendly.com/assets/external/widget.js"
        strategy="lazyOnload"
      />
    </>
  )
}
