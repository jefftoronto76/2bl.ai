import { ClerkProvider } from '@clerk/nextjs'
import { headers } from 'next/headers'
import Script from 'next/script'
import './globals.css'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Brand is resolved in middleware (host/path) and passed via the x-sbl header.
  // jefflougheed.ca (and admin) keep the inkwell palette; the SBL storefront opts out
  // so the `html[data-palette="inkwell"]` rules don't bleed into /secondbrainlabs.
  const isSbl = (await headers()).get('x-sbl') === '1'
  // TEMPORARY — Eruda mobile console for on-device iOS diagnostics. Activates
  // only in development or when the URL carries ?debug=true, so it never loads
  // for real production visitors. Remove once the iOS chat keyboard issue is
  // resolved.
  const devConsole = process.env.NODE_ENV !== 'production'

  return (
    <ClerkProvider afterSignOutUrl="/">
      <html lang="en" data-palette={isSbl ? undefined : 'inkwell'}>
        <body>
          {children}
          <Script id="eruda-debug" strategy="afterInteractive">
            {`if(${devConsole}||new URLSearchParams(location.search).get('debug')==='true'){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/eruda';s.onload=function(){window.eruda&&window.eruda.init();};document.body.appendChild(s);}`}
          </Script>
        </body>
      </html>
    </ClerkProvider>
  )
}
