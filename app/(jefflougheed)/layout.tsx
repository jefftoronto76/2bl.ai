import type { Metadata } from 'next'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'JL',
  description:
    'Performance-driven, heart-led coaching and embedded execution support. Better close rates, deeper relationships, revenue growth made easier.',
  metadataBase: new URL('https://jefflougheed.ca'),
  icons: {
    icon: [
      { url: '/jefflougheed/favicons/favicon.ico', sizes: 'any' },
      { url: '/jefflougheed/favicons/favicon.svg', type: 'image/svg+xml' },
      { url: '/jefflougheed/favicons/favicon-96x96.png', type: 'image/png', sizes: '96x96' },
    ],
    apple: { url: '/jefflougheed/favicons/apple-touch-icon.png' },
  },
  manifest: '/jefflougheed/favicons/site.webmanifest',
}

export default function JeffLougheedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Google Fonts — scoped to jefflougheed.ca (hoisted into <head> by React 19) */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,700;1,400;1,500&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      {/* Calendly widget styles */}
      <link
        href="https://assets.calendly.com/assets/external/widget.css"
        rel="stylesheet"
      />
      {children}
      <Script
        src="https://assets.calendly.com/assets/external/widget.js"
        strategy="lazyOnload"
      />
    </>
  )
}
