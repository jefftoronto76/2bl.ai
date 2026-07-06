import type { Metadata } from 'next';
import { Caveat, Cormorant_Garamond, DM_Mono, DM_Sans } from 'next/font/google';
import './globals.css';
import { getTenantBranding } from '@/services/branding/get-tenant-branding';
import { isValidHex, hexToRgbTriplet } from '@/services/branding/hex-utils';
import { ALL_FONTS } from '@/services/branding/font-registry';
import { deriveSurface } from '@/services/branding/paper-stack';

const HEIRLOOM_TENANT_ID = '20767f1d-1148-4e43-ab73-f6da88f0ac56';

const serif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-heirloom-serif',
  display: 'swap',
});

const sans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-heirloom-sans',
  display: 'swap',
});

const mono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-heirloom-mono',
  display: 'swap',
});

const hand = Caveat({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-heirloom-hand',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Heirloom — Every life deserves to be a book.',
  description:
    'An AI-guided biography platform that helps people capture, shape, and publish their life story.',
  icons: {
    icon: [
      { url: '/heirloom/favicons/favicon.ico', sizes: 'any' },
      { url: '/heirloom/favicons/favicon.svg', type: 'image/svg+xml' },
      { url: '/heirloom/favicons/favicon-96x96.png', type: 'image/png', sizes: '96x96' },
    ],
    apple: { url: '/heirloom/favicons/apple-touch-icon.png' },
  },
  manifest: '/heirloom/favicons/site.webmanifest',
  openGraph: {
    title: 'Heirloom — Every life deserves to be a book.',
    description:
      'An AI-guided biography platform that helps people capture, shape, and publish their life story.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Heirloom — Every life deserves to be a book.',
    description:
      'An AI-guided biography platform that helps people capture, shape, and publish their life story.',
  },
};

export default async function HeirloomLayout({ children }: { children: React.ReactNode }) {
  const branding = await getTenantBranding(HEIRLOOM_TENANT_ID);
  const useDbBranding = branding?.use_db_branding === true;

  // Build :root color + font overrides only when the tenant has opted in to DB branding.
  const colorLines: string[] = [];
  const fontLines: string[] = [];
  const fontEntriesToLoad: (typeof ALL_FONTS)[number][] = [];

  if (useDbBranding) {
    if (isValidHex(branding?.background)) {
      const rgb = hexToRgbTriplet(branding!.background!);
      if (rgb) colorLines.push(`  --color-background: ${rgb};`);
      const effectMode = branding?.paper_effect ?? 'flat';
      const surface = (effectMode === 'lift' || effectMode === 'warm')
        ? deriveSurface(branding!.background!, true)
        : branding!.background!;
      const surfaceRgb = hexToRgbTriplet(surface);
      if (surfaceRgb) colorLines.push(`  --color-surface: ${surfaceRgb};`);
    }
    if (isValidHex(branding?.accent)) {
      const rgb = hexToRgbTriplet(branding!.accent!);
      if (rgb) colorLines.push(`  --color-accent: ${rgb};`);
    }
    if (isValidHex(branding?.heading)) {
      const rgb = hexToRgbTriplet(branding!.heading!);
      if (rgb) colorLines.push(`  --color-text-primary: ${rgb};`);
    }
    if (isValidHex(branding?.lede)) {
      const rgb = hexToRgbTriplet(branding!.lede!);
      if (rgb) colorLines.push(`  --color-text-muted: ${rgb};`);
    }

    // Font overrides on [data-brand="heirloom"] — validate against registry to prevent CSS injection
    const allowedFontValues = new Set(ALL_FONTS.map(f => f.value));

    const fontPrimary   = branding?.font_primary;
    const fontSecondary = branding?.font_secondary;
    const fontMono      = branding?.font_mono;

    if (fontPrimary   && allowedFontValues.has(fontPrimary))   fontLines.push(`  --font-display: ${fontPrimary};`);
    if (fontSecondary && allowedFontValues.has(fontSecondary)) fontLines.push(`  --font-body: ${fontSecondary};`);
    if (fontMono      && allowedFontValues.has(fontMono))      fontLines.push(`  --font-mono: ${fontMono};`);

    fontEntriesToLoad.push(
      ...[fontPrimary, fontSecondary, fontMono]
        .filter(Boolean)
        .map(v => ALL_FONTS.find(f => f.value === v))
        .filter((e): e is NonNullable<typeof e> => !!e?.googleFamily)
    );
  }

  const cssBlocks: string[] = [];
  if (colorLines.length > 0) cssBlocks.push(`:root {\n${colorLines.join('\n')}\n}`);
  if (fontLines.length > 0)  cssBlocks.push(`[data-brand="heirloom"] {\n${fontLines.join('\n')}\n}`);
  const cssString = cssBlocks.join('\n');
  console.log('[branding:heirloom]', JSON.stringify({ branding, cssString }));

  return (
    <>
      {fontEntriesToLoad.map(entry => (
        <link
          key={entry.googleFamily}
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${entry.googleFamily}&display=swap`}
        />
      ))}
      {cssString && <style dangerouslySetInnerHTML={{ __html: cssString }} />}
      {/* data-brand="heirloom" scopes the Heirloom design tokens (globals.css) to this
          route only, so they never collide with jefflougheed's global palette or SBL.
          The next/font classNames define --font-heirloom-serif/-sans, which globals.css
          maps onto --font-display / --font-serif / --font-body for this subtree. */}
      <div data-brand="heirloom" className={`${serif.variable} ${sans.variable} ${mono.variable} ${hand.variable}`}>
        {children}
      </div>
    </>
  );
}
