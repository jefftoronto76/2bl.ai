import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { syncMember, HEIRLOOM_TENANT_ID } from '@/services/auth/sync-member'
import { getTenantFromRequest } from '@/services/auth/get-tenant-from-request'
import { getAdminClient } from '@/services/auth/supabase-admin'

/**
 * POST /api/members/sync
 *
 * Fires once post-authentication. Upserts a members row for the signed-in
 * Clerk user, syncing their email, phone, and optional display name.
 * Name is written to both users.name (via direct upsert below) and
 * members.name (via syncMember). Protected by Clerk auth — returns 401
 * when no session exists. Tenant is resolved from the Host header
 * (falls back to Heirloom default).
 */
export async function POST(req: Request) {
  const clerk = await currentUser()
  if (!clerk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = (await getTenantFromRequest(req)) ?? HEIRLOOM_TENANT_ID

  const email = clerk.emailAddresses[0]?.emailAddress ?? null
  const phone = clerk.phoneNumbers[0]?.phoneNumber ?? null

  // Parse optional name from request body — written to users.name, not members.
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const suppliedName = typeof body.name === 'string' ? body.name.trim() || null : null

  if (suppliedName) {
    const supabase = getAdminClient()
    const userRow: { clerk_id: string; email?: string; name: string } = {
      clerk_id: clerk.id,
      name: suppliedName,
    }
    if (email) userRow.email = email
    const { error: userError } = await supabase
      .from('users')
      .upsert(userRow, { onConflict: 'clerk_id' })
      .select('id')
    if (userError) {
      console.error('[api/members/sync] users upsert failed:', userError.message)
    }
  }

  const result = await syncMember({
    clerkUserId: clerk.id,
    tenantId,
    name: suppliedName,
    email,
    phone,
  })

  if (!result.ok) {
    console.error('[api/members/sync] syncMember failed:', result.error)
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ member: result.data })
}
