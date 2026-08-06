import { NextResponse } from 'next/server'
import { getTenantFromRequest, getCurrentUserId, syncUser } from '@/services/auth'
import { createSession, listSessions } from '@/services/crm/sessions'
import { resolveMemberId } from '@/services/crm'
import { backfillMediaChatId, logMediaEvent, isMediaAuditEnabled } from '@/services/media'
import { logEvent, AuditAction } from '@/services/audit'

/**
 * GET /api/sessions — the signed-in user's sessions for this tenant, newest
 * first. Anonymous requests (no Clerk session) or unresolvable tenants return
 * an empty list rather than an error, so client rendering stays resilient and
 * anonymous visitors transparently get no DB recovery.
 */
export async function GET(req: Request) {
  const tenantId = await getTenantFromRequest(req)
  const userId = tenantId ? await getCurrentUserId() : null
  if (!tenantId || !userId) {
    return NextResponse.json({ sessions: [] })
  }

  const result = await listSessions(tenantId, userId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ sessions: result.data })
}

export async function POST(req: Request) {
  console.log('[sessions/route] POST called')

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[sessions/route] tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json(
      { error: 'Unable to resolve tenant for this domain' },
      { status: 400 },
    )
  }

  // Link the session to the signed-in user when there is one. syncUser upserts
  // the Clerk user into `users` (on clerk_id) and returns their id — no
  // tenant_users membership, since Heirloom visitors are end-customers, not
  // admins. Anonymous visitors get null and an unlinked session (unchanged).
  const userId = await syncUser()
  console.log('[sessions/route] POST resolved', { tenant_id: tenantId, user_id: userId ?? 'anonymous' })

  const result = await createSession(tenantId, userId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  void logEvent({
    action: AuditAction.SESSION_CREATE,
    tenant_id: tenantId,
    actor_id: userId,
    actor_type: userId ? 'user' : 'anonymous',
    target_type: 'session',
    target_id: result.data.id,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: {},
  })

  // Optional, additive: a caller (currently only Heirloom's useChatTurn.send())
  // can pass mediaItemIds for attachments uploaded before this session
  // existed — the first message of a brand-new conversation always uploads
  // before this route ever runs, so those media_items rows were created with
  // chat_id: null (see services/media/index.ts's backfillMediaChatId doc
  // comment for the full mechanics). Absent for every other caller
  // (jefflougheed never sends a body at all), so req.json() throwing on an
  // empty body is the normal case, not an error.
  let mediaItemIds: string[] = []
  try {
    const body = await req.json()
    if (Array.isArray(body?.mediaItemIds)) {
      mediaItemIds = body.mediaItemIds.filter((id: unknown): id is string => typeof id === 'string')
    }
  } catch {
    // No body / not JSON — expected for every caller not passing media ids.
  }

  if (mediaItemIds.length > 0) {
    // Everything in this block is best-effort relative to the response: the
    // session has already been created above, so nothing here — a failed
    // member lookup, a failed backfill update, or even a failed audit-log
    // write — may ever throw past this point and turn a successful session
    // creation into a 500. logBackfillEvent swallows its own errors for
    // exactly that last case; the outer try/catch is the backstop for
    // everything else.
    try {
      const correlationId = req.headers.get('x-correlation-id') ?? crypto.randomUUID()

      const logBackfillEvent = async (
        mediaItemId: string,
        action: (typeof AuditAction)['MEDIA_CHAT_ID_BACKFILLED' | 'MEDIA_CHAT_ID_BACKFILL_FAILED'],
        outcome: 'success' | 'failure',
        metadata: Record<string, unknown>,
        memberId: string,
      ) => {
        if (!isMediaAuditEnabled()) return
        try {
          await logMediaEvent({
            tenant_id: tenantId,
            member_id: memberId,
            media_item_id: mediaItemId,
            action,
            outcome,
            correlation_id: correlationId,
            metadata,
          })
        } catch (err) {
          console.error(
            '[sessions/route] media chat_id backfill audit log failed:',
            err instanceof Error ? err.message : err,
          )
        }
      }

      const memberId = await resolveMemberId(tenantId, null)
      if (!memberId) {
        console.log(
          '[sessions/route] media chat_id backfill skipped — no resolvable member for tenant:',
          tenantId,
        )
      } else {
        try {
          const { updatedIds } = await backfillMediaChatId({
            tenantId,
            memberId,
            chatId: result.data.id,
            mediaItemIds,
          })
          const missingIds = mediaItemIds.filter((id) => !updatedIds.includes(id))

          await Promise.all(
            updatedIds.map((id) =>
              logBackfillEvent(
                id,
                AuditAction.MEDIA_CHAT_ID_BACKFILLED,
                'success',
                { chat_id: result.data.id },
                memberId,
              ),
            ),
          )

          if (missingIds.length > 0) {
            console.error(
              '[sessions/route] media chat_id backfill: some ids did not match (already set, wrong owner, or not found):',
              { sessionId: result.data.id, missingIds },
            )
            await Promise.all(
              missingIds.map((id) =>
                logBackfillEvent(
                  id,
                  AuditAction.MEDIA_CHAT_ID_BACKFILL_FAILED,
                  'failure',
                  {
                    chat_id: result.data.id,
                    reason: 'no matching null-chat_id row for this id/tenant/member',
                  },
                  memberId,
                ),
              ),
            )
          }
        } catch (err) {
          // The backfill update itself failing (not just a partial
          // non-match) — durable logging is the whole point here (see the
          // task this was written for: a silent fire-and-forget would just
          // reintroduce the same class of orphaned row this exists to fix),
          // so every requested id gets its own failure event rather than one
          // aggregate line.
          const message = err instanceof Error ? err.message : String(err)
          console.error('[sessions/route] media chat_id backfill threw:', message)
          await Promise.all(
            mediaItemIds.map((id) =>
              logBackfillEvent(
                id,
                AuditAction.MEDIA_CHAT_ID_BACKFILL_FAILED,
                'failure',
                { chat_id: result.data.id, error: message },
                memberId,
              ),
            ),
          )
        }
      }
    } catch (err) {
      // Backstop for anything above that wasn't already caught (e.g.
      // resolveMemberId itself throwing, despite its own doc comment saying
      // it shouldn't) — this path exists purely so a media backfill can
      // never take the session-creation response down with it.
      console.error(
        '[sessions/route] media chat_id backfill block threw unexpectedly:',
        err instanceof Error ? err.message : err,
      )
    }
  }

  return NextResponse.json({ id: result.data.id })
}
