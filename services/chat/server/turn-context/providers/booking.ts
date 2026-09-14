// Tier 1 — booking-card instruction + [BOOKING:] lines from sage_parameters.
// Wraps getBookingCardSection unchanged. Applies whenever a tenant resolved,
// mirroring streamChat's `tenantId ? getBookingCardSection(tenantId) : ''`;
// a tenant with no sage_parameters rows (Heirloom today) yields '' → skipped/empty.

import { getBookingCardSection } from '../../booking'
import type { ContextProvider } from '../types'

export const bookingProvider: ContextProvider = {
  id: 'booking',
  order: 10,
  priority: 10,
  freshness: 'turn',
  trust: 'system',
  pii: 'none',
  appliesTo: input => input.tenantId !== null,
  resolve: input => getBookingCardSection(input.tenantId as string),
}
