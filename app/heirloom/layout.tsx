import type { Metadata } from 'next';
import { Cormorant_Garamond, DM_Mono, DM_Sans } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

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
  // Next.js injects <link rel="manifest"> automatically from app/manifest.ts.
  // The apple-touch-icon is not injected automatically and must be declared here.
  icons: {
    apple: '/heirloom/icons/heirloom-180-apple-touch.png',
  },
};

export default function HeirloomLayout({ children }: { children: React.ReactNode }) {
  // data-brand="heirloom" scopes the Heirloom design tokens (globals.css) to this
  // route only, so they never collide with jefflougheed's global palette or SBL.
  // The next/font classNames define --font-heirloom-serif/-sans, which globals.css
  // maps onto --font-display / --font-serif / --font-body for this subtree.
  return (
    <div data-brand="heirloom" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      {children}
      <Analytics />
    </div>
  );
}
