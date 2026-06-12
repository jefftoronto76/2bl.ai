import { getAuthContext } from '@/services/auth'
import { getContent } from '@/services/content'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[content/get] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const result = await getContent(authCtx, id)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  return Response.json(result.data)
}
