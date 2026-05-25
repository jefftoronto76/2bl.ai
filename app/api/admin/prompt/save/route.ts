import { getAuthContext } from '@/services/auth/get-auth-context'
import { saveMasterPrompt } from '@/services/prompt/save'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[prompt/save] auth failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { prompt, checkResult } = await req.json()

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Prompt cannot be empty' }, { status: 400 })
  }

  const result = await saveMasterPrompt(authCtx.tenant_id, prompt, checkResult)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ version: result.version })
}
