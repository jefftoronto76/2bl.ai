import { getAuthContext } from '@/services/auth/get-auth-context'
import { createBlock } from '@/services/prompt/blocks'

export async function POST(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[blocks/save] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    type?: string | null
    topic_id?: string | null
    title?: string | null
    body: string
    source_id?: string | null
    is_default?: boolean
    messages?: { role: string; content: string }[]
  }

  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { body: blockBody } = body

  // Body is the only required field. Title / Type / Topic are optional —
  // omitted ones are stored null on the block (the user can fill them in
  // later via edit).
  if (!blockBody) {
    return Response.json({ error: 'Body is required' }, { status: 400 })
  }

  const result = await createBlock(authCtx, body)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  return Response.json(result.data)
}
