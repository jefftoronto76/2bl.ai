import type { Metadata } from 'next'
import { Cormorant_Garamond, DM_Mono, DM_Sans } from 'next/font/google'
import './globals.css'

const serif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-legacy-serif',
  display: 'swap',
})

const sans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-legacy-sans',
  display: 'swap',
})

const mono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-legacy-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Legacy — Capture life as it happens.',
  description:
    'An AI-guided memory platform that helps you capture, shape, and preserve the stories that matter most.',
  openGraph: {
    title: 'Legacy — Capture life as it happens.',
    description:
      'An AI-guided memory platform that helps you capture, shape, and preserve the stories that matter most.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Legacy — Capture life as it happens.',
    description:
      'An AI-guided memory platform that helps you capture, shape, and preserve the stories that matter most.',
  },
}

export default function LegacyLayout({ children }: { children: React.ReactNode }) {
  return (
    /* data-brand="legacy" scopes the Legacy design tokens (globals.css) to this
       route only. The next/font classNames define --font-legacy-serif/-sans/-mono,
       which globals.css maps onto --font-display / --font-serif / --font-body / --font-mono
       for this subtree. */
    <div
      data-brand="legacy"
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
    >
      {children}
    </div>
  )
}
