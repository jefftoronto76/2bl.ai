import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { syncMember, HEIRLOOM_TENANT_ID } from '@/services/auth/sync-member'
import { getTenantFromRequest } from '@/services/auth/get-tenant-from-request'

/**
 * POST /api/members/sync
 *
 * Fires once post-authentication. Upserts a members row for the signed-in
 * Clerk user, syncing their email and phone into the members table.
 * Protected by Clerk auth — returns 401 when no session exists.
 * Tenant is resolved from the Host header (falls back to Heirloom default).
 */
export async function POST(req: Request) {
  const clerk = await currentUser()
  if (!clerk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = (await getTenantFromRequest(req)) ?? HEIRLOOM_TENANT_ID

  const email = clerk.emailAddresses[0]?.emailAddress ?? null
  const phone = clerk.phoneNumbers[0]?.phoneNumber ?? null

  const result = await syncMember({
    clerkUserId: clerk.id,
    tenantId,
    email,
    phone,
  })

  if (!result.ok) {
    console.error('[api/members/sync] syncMember failed:', result.error)
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ member: result.data })
}
