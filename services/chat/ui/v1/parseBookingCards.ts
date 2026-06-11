import { createDefaultRegistry } from '@/services/chat/ui/v1/registry'
import type { ParsedMarker } from '@/services/chat/ui/v1/types'

export type OpenAs = 'new_tab' | 'popup'

export interface BookingCardData {
  label: string
  description: string
  ctaLabel: string
  url: string
}

export interface SageParameterPublic {
  key: string
  label: string | null
  description: string | null
  cta_label: string | null
  url: string | null
  open_as: OpenAs
  embed_code: string | null
}

// Registry with every display-stripped marker registered (BOOKING, NAME, …).
// The registry (services/chat/ui/v1) is the canonical parser; this wrapper
// preserves the existing { prose, cards } API so Chat, Hero, SageReply, and the
// admin transcript renderer are unchanged. Non-BOOKING markers (e.g. NAME) are
// stripped from prose but never surfaced as cards. The full parsed marker list
// is also returned (additive) for surfaces that need it — e.g. the admin
// transcript's platform_admin debug pills.
const registry = createDefaultRegistry()

export function parseBookingCards(content: string): {
  prose: string
  cards: BookingCardData[]
  markers: ParsedMarker[]
} {
  const { prose, markers } = registry.parse(content)
  const cards: BookingCardData[] = markers
    .filter(m => m.type === 'BOOKING')
    .map(m => ({
      label: m.fields[0] ?? '',
      description: m.fields[1] ?? '',
      ctaLabel: m.fields[2] ?? '',
      url: m.fields[3] ?? '',
    }))
  return { prose, cards, markers }
}
