'use client'

/**
 * ShareIcons — line-style glyphs for the Share modal rows
 * ────────────────────────────────────────────────────────
 * Matches the site's Lucide aesthetic (1.6 stroke, round caps). Drop these
 * into the existing ShareModal and render one before each row label.
 *
 * Integration (in ShareModal):
 *   import { SHARE_ICON } from './ShareIcons'
 *   ...
 *   <a className="share-row" ...>
 *     {SHARE_ICON[row.key]}
 *     <span>{row.label}</span>
 *   </a>
 *
 * The row container is already `display:flex; gap:12px; align-items:center`,
 * so the icon sits left of the label with no extra CSS. Icons inherit
 * `currentColor`; tint via the row's text color if you want them muted.
 */

import type { ReactNode } from 'react'

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width={19}
      height={19}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="flex-none"
    >
      {children}
    </svg>
  )
}

export const LinkedInIcon = () => (
  <Glyph>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x={2} y={9} width={4} height={12} />
    <circle cx={4} cy={4} r={2} />
  </Glyph>
)

export const XIcon = () => (
  <Glyph>
    <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
    <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
  </Glyph>
)

export const WhatsAppIcon = () => (
  <Glyph>
    <path d="M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9" />
    <path d="M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a.5 .5 0 0 0 0 1" />
  </Glyph>
)

export const EmailIcon = () => (
  <Glyph>
    <rect x={2} y={4} width={20} height={16} rx={2} />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </Glyph>
)

export const LinkIcon = () => (
  <Glyph>
    <path d="M10 13a5 5 0 0 0 7.54 .54l3 -3a5 5 0 0 0 -7.07 -7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0 -7.54 -.54l-3 3a5 5 0 0 0 7.07 7.07l1.71 -1.71" />
  </Glyph>
)

/** Keyed by share channel — match these keys to your ShareModal rows. */
export const SHARE_ICON = {
  linkedin: <LinkedInIcon />,
  twitter: <XIcon />,
  whatsapp: <WhatsAppIcon />,
  email: <EmailIcon />,
  copy: <LinkIcon />,
} as const
