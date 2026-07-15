import { AuthProvider } from '@/services/auth/ui'
import type { Viewport } from 'next'
import { headers } from 'next/headers'
import './globals.css'

export const viewport: Viewport = {
  interactiveWidget: 'resizes-content',
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Brand is resolved in middleware (host/path) and passed via the x-sbl / x-heirloom
  // / x-admin / x-legacy headers. jefflougheed.ca keeps the inkwell palette; all other
  // storefronts and the (light) admin UI opt out so the `html[data-brand="jefflougheed"]`
  // rules don't bleed in.
  const headerList = await headers()
  const isSbl = headerList.get('x-sbl') === '1'
  const isHeirloom = headerList.get('x-heirloom') === '1'
  const isAdmin = headerList.get('x-admin') === '1'
  const isLegacy = headerList.get('x-legacy') === '1'

  return (
    <html lang="en" data-brand={isSbl || isHeirloom || isAdmin || isLegacy ? undefined : 'jefflougheed'}>
      <body>
        {/* Auth provider mount point — must stay inside <body>, not wrapping
            <html> (provider requirement). AuthProvider is the boundary's
            re-export of the active provider's SSR-aware provider component. */}
        <AuthProvider afterSignOutUrl="/">
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
