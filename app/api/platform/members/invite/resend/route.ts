// POST /api/platform/members/invite/resend
// Platform admin only. Regenerates the invite token for an existing 'invited'
// members row (identified by member_id). Returns the new token so the client
// can rebuild the invite URL.

import { getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { randomBytes } from 'crypto'

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isPlatformAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  let body: { member_id?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { member_id } = body
  if (!member_id) {
    return Response.json({ error: 'member_id is required' }, { status: 400 })
  }

  const supabase = getAdminClient()
  const newToken = randomBytes(24).toString('base64url')

  // Allow 'waitlist' as well — sending an invite to a waitlist member promotes them to 'invited'.
  const { data, error } = await supabase
    .from('members')
    .update({ token: newToken, status: 'invited', used_at: null, updated_at: new Date().toISOString() })
    .eq('id', member_id)
    .in('status', ['invited', 'waitlist'])
    .select('id, token')
    .maybeSingle()

  if (error) {
    console.error('[platform/members/invite/resend] update failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return Response.json({ error: 'Member not found (must be invited or waitlist)' }, { status: 404 })
  }

  return Response.json({ token: (data as { id: string; token: string }).token })
}
