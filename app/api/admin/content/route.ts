import { getAuthContext } from '@/services/auth'
import { createContent } from '@/services/content'

export async function POST(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[content/create] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    name: string
    type: string
    raw: string
  }

  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, type, raw } = body

  if (!name || !type || !raw) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const result = await createContent(authCtx, { name, type, raw })
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  return Response.json(result.data)
}
