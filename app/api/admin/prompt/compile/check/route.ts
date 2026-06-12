import { NextResponse } from 'next/server'
import { getAuthContext } from '@/services/auth'
import { reviewBlockBody } from '@/services/prompt/safety'

export async function POST(req: Request) {
  try {
    await getAuthContext()
  } catch (err) {
    console.error('[prompt/compile/check] auth failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { body?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const blockBody = body.body?.trim()
  if (!blockBody) {
    return NextResponse.json({ error: 'Missing body field' }, { status: 400 })
  }

  const result = await reviewBlockBody(blockBody)
  return NextResponse.json(result)
}
