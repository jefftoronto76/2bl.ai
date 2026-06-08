import { getAdminClient } from '@/services/auth/supabase-admin'
import type { AuditEventInput, AuthEventInput } from './types'

/**
 * Appends one row to audit_events. Fire-and-forget — errors are logged but
 * never thrown, so audit writes never block or fail the originating request.
 */
export async function logEvent(input: AuditEventInput): Promise<void> {
  try {
    const supabase = getAdminClient()
    const { error } = await supabase.from('audit_events').insert({
      action: input.action,
      tenant_id: input.tenant_id ?? null,
      product_id: input.product_id ?? null,
      actor_id: input.actor_id ?? null,
      actor_type: input.actor_type ?? 'user',
      actor_email: input.actor_email ?? null,
      clerk_user_id: input.clerk_user_id ?? null,
      target_type: input.target_type ?? null,
      target_id: input.target_id ?? null,
      outcome: input.outcome ?? 'success',
      ip_address: input.ip_address ?? null,
      user_agent: input.user_agent ?? null,
      correlation_id: input.correlation_id ?? null,
      changes: input.changes ?? null,
      metadata: input.metadata ?? {},
    })
    if (error) {
      console.error('[audit] logEvent failed:', error.message, { action: input.action })
    }
  } catch (err) {
    console.error('[audit] logEvent threw:', err, { action: input.action })
  }
}

/**
 * Appends one row to auth_events. Same fire-and-forget contract as logEvent.
 */
export async function logAuthEvent(input: AuthEventInput): Promise<void> {
  try {
    const supabase = getAdminClient()
    const { error } = await supabase.from('auth_events').insert({
      event_type: input.event_type,
      tenant_id: input.tenant_id ?? null,
      clerk_user_id: input.clerk_user_id ?? null,
      actor_id: input.actor_id ?? null,
      email: input.email ?? null,
      outcome: input.outcome ?? 'success',
      failure_reason: input.failure_reason ?? null,
      ip_address: input.ip_address ?? null,
      user_agent: input.user_agent ?? null,
      correlation_id: input.correlation_id ?? null,
      svix_event_id: input.svix_event_id ?? null,
      metadata: input.metadata ?? {},
    })
    if (error) {
      console.error('[audit] logAuthEvent failed:', error.message, { event_type: input.event_type })
    }
  } catch (err) {
    console.error('[audit] logAuthEvent threw:', err, { event_type: input.event_type })
  }
}
