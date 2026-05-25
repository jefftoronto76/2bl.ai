import { getAuthContext } from '@/services/auth/get-auth-context'
import { listActiveBlocks } from '@/services/prompt/blocks'

export async function GET() {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[blocks] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await listActiveBlocks(authCtx.tenant_id)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  return Response.json(result.data)
}
