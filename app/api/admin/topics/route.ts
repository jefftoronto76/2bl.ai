import { getAuthContext } from '@/services/auth/get-auth-context'
import { listTopics, createTopic } from '@/services/content'

export async function GET() {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[topics] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await listTopics(authCtx)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  return Response.json(result.data)
}

export async function POST(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[topics] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { name: string; type: string }

  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, type } = body

  if (!name || !type) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const result = await createTopic(authCtx, { name, type })
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  return Response.json(result.data)
}
