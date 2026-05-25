// services/chat/server/booking.ts
//
// Server-side booking-card injection. Fetches a tenant's sage_parameters and
// renders the "Booking cards" section appended to the system prompt — one
// [BOOKING: label | description | cta_label | url] line per parameter.
// Server-only (service-role client). The bracket syntax is the contract with
// the client-side parser (services/chat/ui/v1/parseBookingCards.ts).

import { getAdminClient } from '@/services/auth/supabase-admin'

interface SageParameterRow {
  key: string
  label: string | null
  description: string | null
  cta_label: string | null
  url: string | null
}

/**
 * Render the booking-card section from parameter rows. Pure — no I/O. Returns
 * '' when there are no rows (the section is omitted from the prompt entirely).
 */
export function buildBookingSection(rows: SageParameterRow[]): string {
  if (rows.length === 0) return ''

  const lines = rows.map(
    row =>
      `[BOOKING: ${row.label ?? ''} | ${row.description ?? ''} | ${row.cta_label ?? ''} | ${row.url ?? ''}]`,
  )

  return [
    'Booking cards — when offering a session or call, output a booking card on its own line at the end of your message using this exact syntax. Never output it inline within a sentence. Never output it mid-message.',
    '',
    'Available booking options:',
    ...lines,
  ].join('\n')
}

/**
 * Fetch a tenant's sage_parameters and render the booking-card section.
 * Returns '' on error or when the tenant has no parameters — the section is
 * simply omitted, never a hard failure.
 */
export async function getBookingCardSection(tenantId: string): Promise<string> {
  try {
    const { data, error } = await getAdminClient()
      .from('sage_parameters')
      .select('key, label, description, cta_label, url')
      .eq('tenant_id', tenantId)

    if (error) {
      console.error('[chat/booking] sage_parameters query failed:', error.message)
      console.log('[chat/booking] booking card section appended:', false, 'tenant_id:', tenantId)
      return ''
    }

    const rows: SageParameterRow[] = data ?? []
    console.log('[chat/booking] sage_parameters fetched:', {
      tenant_id: tenantId,
      count: rows.length,
    })

    const section = buildBookingSection(rows)
    console.log(
      '[chat/booking] booking card section appended:',
      section.length > 0,
      'tenant_id:',
      tenantId,
    )
    return section
  } catch (err) {
    console.error(
      '[chat/booking] sage_parameters query threw:',
      err instanceof Error ? err.message : err,
    )
    console.log('[chat/booking] booking card section appended:', false, 'tenant_id:', tenantId)
    return ''
  }
}
