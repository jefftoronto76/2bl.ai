import type { Metadata } from 'next';
import { Cormorant_Garamond, DM_Mono, DM_Sans } from 'next/font/google';
import './globals.css';
import { getTenantBranding } from '@/services/branding/get-tenant-branding';
import { isValidHex, hexToRgbTriplet } from '@/services/branding/hex-utils';
import { ALL_FONTS } from '@/services/branding/font-registry';

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

  // Build :root color overrides (rgb triplets for vars used with alpha in globals.css)
  const colorLines: string[] = [];
  if (isValidHex(branding?.color_background)) {
    const rgb = hexToRgbTriplet(branding!.color_background!);
    if (rgb) colorLines.push(`  --hl-bg: ${rgb};`);
  }
  if (isValidHex(branding?.color_accent)) {
    const rgb = hexToRgbTriplet(branding!.color_accent!);
    if (rgb) colorLines.push(`  --color-accent: ${rgb};`);
  }
  if (isValidHex(branding?.color_text_primary)) {
    const rgb = hexToRgbTriplet(branding!.color_text_primary!);
    if (rgb) colorLines.push(`  --hl-text-primary: ${rgb};`);
  }
  if (isValidHex(branding?.color_text_muted)) {
    colorLines.push(`  --hl-text-muted: ${branding!.color_text_muted!};`);
  }

  // Font overrides on [data-brand="heirloom"] — validate against registry to prevent CSS injection
  const fontLines: string[] = [];
  const allowedFontValues = new Set(ALL_FONTS.map(f => f.value));

  const fontDisplay = branding?.font_display;
  const fontBody    = branding?.font_body;
  const fontMono    = branding?.font_mono;

  if (fontDisplay && allowedFontValues.has(fontDisplay)) fontLines.push(`  --font-display: ${fontDisplay};`);
  if (fontBody    && allowedFontValues.has(fontBody))    fontLines.push(`  --font-body: ${fontBody};`);
  if (fontMono    && allowedFontValues.has(fontMono))    fontLines.push(`  --font-mono: ${fontMono};`);

  // Inject Google Fonts <link> tags for any custom font that has a googleFamily
  const fontEntriesToLoad = [fontDisplay, fontBody, fontMono]
    .filter(Boolean)
    .map(v => ALL_FONTS.find(f => f.value === v))
    .filter((e): e is NonNullable<typeof e> => !!e?.googleFamily);

  const cssBlocks: string[] = [];
  if (colorLines.length > 0) cssBlocks.push(`:root {\n${colorLines.join('\n')}\n}`);
  if (fontLines.length > 0)  cssBlocks.push(`[data-brand="heirloom"] {\n${fontLines.join('\n')}\n}`);
  const cssString = cssBlocks.join('\n');

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
      <div data-brand="heirloom" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
        {children}
      </div>
    </>
  );
}
