import { getAuthContext } from '@/services/auth/get-auth-context'
import { duplicateBlock } from '@/services/prompt/blocks'

/**
 * POST /api/admin/blocks/duplicate
 *
 * Duplicates an existing block. Body: { source_id: string }. The data-access
 * (lookup, content + block insert, back-link) lives in
 * services/prompt/blocks.ts → duplicateBlock; this route owns auth, request
 * validation, and response mapping only.
 */
export async function POST(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[blocks/duplicate] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { source_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const sourceId = body.source_id
  if (typeof sourceId !== 'string' || sourceId.trim() === '') {
    return Response.json({ error: 'source_id is required' }, { status: 400 })
  }

  const result = await duplicateBlock(authCtx, sourceId)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  return Response.json(result.data)
}
