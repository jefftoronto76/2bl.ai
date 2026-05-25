import type { Metadata } from 'next';
import { Cormorant_Garamond, DM_Sans } from 'next/font/google';
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
};

export default function HeirloomLayout({ children }: { children: React.ReactNode }) {
  // data-brand="heirloom" scopes the Heirloom design tokens (globals.css) to this
  // route only, so they never collide with jefflougheed's global palette or SBL.
  // The next/font classNames define --font-heirloom-serif/-sans, which globals.css
  // maps onto --font-display / --font-serif / --font-body for this subtree.
  return (
    <div data-brand="heirloom" className={`${serif.variable} ${sans.variable}`}>
      {children}
    </div>
  );
}
