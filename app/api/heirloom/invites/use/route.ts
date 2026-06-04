import { markInviteUsed } from '@/services/invites'

// Public route — no admin auth. Called client-side after sign-up completes
// to mark the invite token used. Best-effort: a failed mark-used does not
// block the signed-up user. Returns 404 when the token is missing, already
// used, or not found so the client can silently ignore it.
export async function POST(req: Request) {
  let body: { token?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.token !== 'string' || body.token.trim().length === 0) {
    return Response.json({ error: 'Missing token' }, { status: 400 })
  }

  const result = await markInviteUsed(body.token.trim())
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  console.log('[invites] marked used:', result.data.id)
  return Response.json({ success: true })
}
