import type { Metadata } from "next";
import { Newsreader, Manrope } from "next/font/google";
import "./globals.css";
import { getTenantBranding } from '@/services/branding/get-tenant-branding';
import { isValidHex, hexToRgbTriplet } from '@/services/branding/hex-utils';
import { ALL_FONTS } from '@/services/branding/font-registry';
import { derivePaperStack, paperStackVars } from '@/services/branding/paper-stack';

const SBL_TENANT_ID = '6720ee2f-d7e3-4788-b8c7-f63cf70eb2bb';

const serif = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  icons: {
    icon: [
      { url: "/2bl/favicons/favicon.ico", sizes: "any" },
      { url: "/2bl/favicons/favicon.svg", type: "image/svg+xml" },
      { url: "/2bl/favicons/favicon-96x96.png", type: "image/png", sizes: "96x96" },
    ],
    apple: { url: "/2bl/favicons/apple-touch-icon.png" },
  },
  manifest: "/2bl/favicons/site.webmanifest",
};

export default async function SBLLayout({ children }: { children: React.ReactNode }) {
  const branding = await getTenantBranding(SBL_TENANT_ID);

  // Build :root color overrides
  const colorLines: string[] = [];
  if (isValidHex(branding?.background)) {
    const stack = derivePaperStack(branding!.background!, branding?.paper_effect ?? true);
    const vars  = paperStackVars(stack);
    colorLines.push(`  --color-paper:   ${vars['--color-paper']};`);
    colorLines.push(`  --color-paper-2: ${vars['--color-paper-2']};`);
    colorLines.push(`  --color-paper-3: ${vars['--color-paper-3']};`);
    colorLines.push(`  --color-line:    ${vars['--color-line']};`);
    const rgb = hexToRgbTriplet(stack.paper);
    if (rgb) colorLines.push(`  --color-paper-rgb: ${rgb};`);
  }
  if (isValidHex(branding?.accent)) {
    const rgb = hexToRgbTriplet(branding!.accent!);
    if (rgb) colorLines.push(`  --color-accent: ${rgb};`);
  }
  if (isValidHex(branding?.heading)) {
    colorLines.push(`  --color-ink: ${branding!.heading!};`);
  }
  if (isValidHex(branding?.lede)) {
    colorLines.push(`  --color-muted: ${branding!.lede!};`);
  }

  // Font overrides on [data-brand="sbl"] — validate against registry to prevent CSS injection
  const fontLines: string[] = [];
  const allowedFontValues = new Set(ALL_FONTS.map(f => f.value));

  const fontPrimary   = branding?.font_primary;
  const fontSecondary = branding?.font_secondary;
  const fontMono      = branding?.font_mono;

  // SBL uses --font-serif / --font-sans instead of --font-display / --font-body
  if (fontPrimary   && allowedFontValues.has(fontPrimary))   fontLines.push(`  --font-serif: ${fontPrimary};`);
  if (fontSecondary && allowedFontValues.has(fontSecondary)) fontLines.push(`  --font-sans: ${fontSecondary};`);
  if (fontMono      && allowedFontValues.has(fontMono))      fontLines.push(`  --font-mono: ${fontMono};`);

  // Inject Google Fonts <link> tags for any custom font that has a googleFamily
  const fontEntriesToLoad = [fontPrimary, fontSecondary, fontMono]
    .filter(Boolean)
    .map(v => ALL_FONTS.find(f => f.value === v))
    .filter((e): e is NonNullable<typeof e> => !!e?.googleFamily);

  const cssBlocks: string[] = [];
  if (colorLines.length > 0) cssBlocks.push(`:root {\n${colorLines.join('\n')}\n}`);
  if (fontLines.length > 0)  cssBlocks.push(`[data-brand="sbl"] {\n${fontLines.join('\n')}\n}`);
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
      {/* data-brand="sbl" scopes the Second Brain Labs design tokens (globals.css) to this
          route only, so they never collide with jefflougheed's global palette. */}
      <div data-brand="sbl" className={`${serif.variable} ${sans.variable}`}>
        {children}
      </div>
    </>
  );
}
