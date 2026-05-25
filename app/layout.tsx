import { ClerkProvider } from '@clerk/nextjs'
import type { Viewport } from 'next'
import { headers } from 'next/headers'
import './globals.css'

export const viewport: Viewport = {
  interactiveWidget: 'resizes-content',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Brand is resolved in middleware (host/path) and passed via the x-sbl / x-heirloom
  // headers. jefflougheed.ca (and admin) keep the inkwell palette; the SBL and Heirloom
  // storefronts opt out so the `html[data-palette="inkwell"]` rules don't bleed in.
  const headerList = await headers()
  const isSbl = headerList.get('x-sbl') === '1'
  const isHeirloom = headerList.get('x-heirloom') === '1'

  return (
    <ClerkProvider afterSignOutUrl="/">
      <html lang="en" data-palette={isSbl || isHeirloom ? undefined : 'inkwell'}>
        <body>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
