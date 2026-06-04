import { getAuthContext } from '@/services/auth/get-auth-context'
import { deleteInvite } from '@/services/invites'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function DELETE(_req: Request, context: RouteContext) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[invites] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  if (!id) {
    return Response.json({ error: 'Missing id' }, { status: 400 })
  }

  const result = await deleteInvite(id, authCtx.tenant_id)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  console.log('[invites] DELETE', { id, tenant_id: authCtx.tenant_id })
  return Response.json({ success: true })
}
