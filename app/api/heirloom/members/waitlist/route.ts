// POST /api/heirloom/members/waitlist
// Public (unauthenticated). A visitor who arrives at the Heirloom gate without
// a valid invite token can self-register for the waitlist. Creates a members
// row with status = 'waitlist' for the Heirloom tenant. Email is required so
// the admin can send an invite link later.

import { getAdminClient } from '@/services/auth/supabase-admin'
import { HEIRLOOM_TENANT_ID } from '@/services/members'

export async function POST(req: Request) {
  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'A valid email is required' }, { status: 400 })
  }

  const supabase = getAdminClient()

  // Idempotent: if this email already has any member row for Heirloom, don't
  // create a duplicate. Return 200 (the visitor is already on the list or a member).
  const { data: existing } = await supabase
    .from('members')
    .select('id, status')
    .eq('tenant_id', HEIRLOOM_TENANT_ID)
    .ilike('email', email)
    .maybeSingle()

  if (existing) {
    return Response.json({ ok: true, already_exists: true })
  }

  const { error } = await supabase.from('members').insert({
    tenant_id: HEIRLOOM_TENANT_ID,
    email,
    status: 'waitlist',
    role: 'member',
    updated_at: new Date().toISOString(),
  })

  if (error) {
    console.error('[api/heirloom/members/waitlist] insert failed:', error.message)
    return Response.json({ error: 'Could not register for the waitlist' }, { status: 500 })
  }

  return Response.json({ ok: true }, { status: 201 })
}
