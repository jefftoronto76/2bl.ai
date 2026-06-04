// services/invites/invites.ts
// Invite CRUD data-access for the Heirloom invite-only gate.
// All Supabase reads/writes against the `invites` table live here.
// Route handlers are thin consumers: auth + JSON parse + response mapping only.

import { randomBytes } from 'crypto'
import { getAdminClient } from '@/services/auth/supabase-admin'

export interface InviteRow {
  id: string
  token: string
  tenant_id: string
  created_by: string
  email: string | null
  used_at: string | null
  expires_at: string | null
  created_at: string
}

export type InviteResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

function generateToken(): string {
  return randomBytes(24).toString('base64url')
}

export async function listInvites(tenantId: string): Promise<InviteResult<InviteRow[]>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('invites')
    .select('id, token, tenant_id, created_by, email, used_at, expires_at, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[invites] listInvites failed:', error.message)
    return { ok: false, status: 500, error: error.message }
  }

  return { ok: true, data: (data ?? []) as InviteRow[] }
}

export async function createInvite(
  tenantId: string,
  createdBy: string,
  email?: string | null,
): Promise<InviteResult<InviteRow>> {
  const supabase = getAdminClient()
  const token = generateToken()

  const payload: Record<string, unknown> = {
    token,
    tenant_id: tenantId,
    created_by: createdBy,
  }
  if (email != null && email.trim().length > 0) {
    payload.email = email.trim().toLowerCase()
  }

  const { data, error } = await supabase
    .from('invites')
    .insert(payload)
    .select('id, token, tenant_id, created_by, email, used_at, expires_at, created_at')
    .single()

  if (error) {
    console.error('[invites] createInvite failed:', error.message)
    return { ok: false, status: 500, error: error.message }
  }

  return { ok: true, data: data as InviteRow }
}

/**
 * Validates a token: must exist, be unused, and not expired.
 * Returns the row on success, null when invalid/expired/used.
 */
export async function validateInvite(token: string): Promise<InviteRow | null> {
  if (!token || token.trim().length === 0) return null

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('invites')
    .select('id, token, tenant_id, created_by, email, used_at, expires_at, created_at')
    .eq('token', token)
    .is('used_at', null)
    .single()

  if (error || !data) return null

  const row = data as InviteRow
  if (row.expires_at && new Date(row.expires_at) <= new Date()) return null

  return row
}

/**
 * Marks an invite token as used. No-ops if already used.
 * Returns the updated row on success.
 */
export async function markInviteUsed(token: string): Promise<InviteResult<InviteRow>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('invites')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)
    .is('used_at', null)
    .select('id, token, tenant_id, created_by, email, used_at, expires_at, created_at')
    .single()

  if (error || !data) {
    console.error('[invites] markInviteUsed failed:', error?.message ?? 'row not found or already used')
    return { ok: false, status: 404, error: 'Invite not found or already used' }
  }

  return { ok: true, data: data as InviteRow }
}

export async function deleteInvite(
  id: string,
  tenantId: string,
): Promise<InviteResult<{ id: string }>> {
  const supabase = getAdminClient()

  const { error } = await supabase
    .from('invites')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('[invites] deleteInvite failed:', error.message)
    return { ok: false, status: 500, error: error.message }
  }

  return { ok: true, data: { id } }
}
