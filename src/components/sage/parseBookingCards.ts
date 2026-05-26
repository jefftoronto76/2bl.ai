import { createMarkerRegistry, BOOKING_MARKER } from '@/services/chat/ui/v1/registry'

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

// Single registry instance with the BOOKING marker registered. The registry
// (services/chat/ui/v1) is the canonical parser; this wrapper preserves the
// existing { prose, cards } API so Chat, Hero, SageReply, and the admin
// transcript renderer are unchanged.
const registry = createMarkerRegistry()
registry.register(BOOKING_MARKER)

export function parseBookingCards(content: string): { prose: string; cards: BookingCardData[] } {
  const { prose, markers } = registry.parse(content)
  const cards: BookingCardData[] = markers
    .filter(m => m.type === 'BOOKING')
    .map(m => ({
      label: m.fields[0] ?? '',
      description: m.fields[1] ?? '',
      ctaLabel: m.fields[2] ?? '',
      url: m.fields[3] ?? '',
    }))
  return { prose, cards }
}
