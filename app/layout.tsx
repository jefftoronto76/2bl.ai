import { ClerkProvider } from '@clerk/nextjs'
import type { Viewport } from 'next'
import { headers } from 'next/headers'
import './globals.css'

export const viewport: Viewport = {
  interactiveWidget: 'resizes-content',
}

// jefflougheed.ca is a Clerk satellite domain of the primary domain (2bl.ai).
// Both are served by the same Vercel deployment, but browser cookies are
// domain-scoped — a session established on 2bl.ai is not readable on
// jefflougheed.ca without a token handshake. Clerk performs that handshake
// automatically when ClerkProvider is given isSatellite + domain props.
// clerkMiddleware already handles the __clerk_handshake query param that
// completes the handshake and sets the session cookie for jefflougheed.ca.
const SATELLITE_HOSTS = new Set(['jefflougheed.ca', 'www.jefflougheed.ca'])

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Brand is resolved in middleware (host/path) and passed via the x-sbl / x-heirloom
  // / x-admin headers. jefflougheed.ca keeps the inkwell palette; the SBL and Heirloom
  // storefronts and the (light) admin UI opt out so the `html[data-palette="inkwell"]`
  // rules don't bleed in.
  const headerList = await headers()
  const isSbl = headerList.get('x-sbl') === '1'
  const isHeirloom = headerList.get('x-heirloom') === '1'
  const isAdmin = headerList.get('x-admin') === '1'

  const host = (headerList.get('x-forwarded-host') ?? headerList.get('host') ?? '')
    .toLowerCase()
    .split(':')[0]
  const isSatellite = SATELLITE_HOSTS.has(host)

  return (
    <ClerkProvider
      afterSignOutUrl="/"
      {...(isSatellite ? {
        domain: '2bl.ai',
        isSatellite: true,
        signInUrl: '/sign-in',
      } : {})}
    >
      <html lang="en" data-palette={isSbl || isHeirloom || isAdmin ? undefined : 'inkwell'}>
        <body>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
