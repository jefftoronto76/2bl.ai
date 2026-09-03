import { NextResponse } from 'next/server'
import { getCurrentUser, syncMember, HEIRLOOM_TENANT_ID, getTenantFromRequest, updateClerkUserFirstName } from '@/services/auth'
import { identityValue } from '@/services/shared/identity'

/**
 * POST /api/members/sync
 *
 * Fires once post-authentication. Upserts the users and members rows for the
 * signed-in Clerk user, syncing email, phone, and display name. Protected by
 * Clerk auth — returns 401 when no session exists. Tenant is resolved from the
 * Host header (falls back to Heirloom default).
 *
 * Both rows are written by `syncMember`, which owns the identity-write rule for
 * every column. This route previously also upserted `users` itself, guarded by
 * `if (suppliedName)` while passing an unguarded `name` through to `syncMember`
 * — that asymmetry is what produced D1's signature (members.name nulled while
 * users.name survived). One writer, one rule.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = (await getTenantFromRequest(req)) ?? HEIRLOOM_TENANT_ID

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const suppliedName = typeof body.name === 'string' ? body.name : null

  // Deliberately NOT falling back to Clerk's own name when the visitor
  // supplied none. This route is called far more often than the webhook —
  // in particular by MagicLinkCard's "already signed in" mount effect,
  // which re-fires on every mount with an empty name for an EXISTING
  // member. A name entered during sign-in is written to Supabase only,
  // never back to Clerk (client.ts's signUp.update only runs on the
  // sign-up branch) — so falling back to Clerk's name here would silently
  // overwrite a newer, correct Supabase name with Clerk's stale one on the
  // next mount. That is exactly the D3 overwrite class, made reachable
  // through this route instead of the (unsubscribed) webhook. Flagged in
  // PR #448 review. identityValue still means an empty/whitespace name
  // leaves the column untouched — the D1 fix — just with no Clerk fallback
  // behind it.
  const name = identityValue(suppliedName)

  const result = await syncMember({
    clerkUserId: user.providerUserId,
    tenantId,
    name,
    email: user.email ?? null,
    phone: user.phone ?? null,
  })

  if (!result.ok) {
    console.error('[api/members/sync] syncMember failed:', result.error)
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // Opt-in only — this route is called far more often than just the
  // name-completion interstitial (MagicLinkCard, SaveChatCTA's
  // claimAllSessions, the returning-visitor mount effect), and none of
  // those should start writing to Clerk. Only a caller that explicitly
  // sets syncToClerk does. Non-fatal: Supabase is the source of truth and
  // has already been written above; a failed Clerk write is logged, not
  // surfaced, same treatment deleteClerkUser's own caller gives its
  // failures (services/members/members.ts's hardDeleteMember).
  if (name && body.syncToClerk === true) {
    try {
      await updateClerkUserFirstName(user.providerUserId, name)
    } catch (err) {
      console.error('[api/members/sync] updateClerkUserFirstName failed (non-fatal):', err)
    }
  }

  return NextResponse.json({ member: result.data })
}
