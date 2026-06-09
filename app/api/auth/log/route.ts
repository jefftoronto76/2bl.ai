import { type NextRequest, NextResponse } from 'next/server'
import { logAuthEvent } from '@/services/audit/audit'
import type { AuthEventInput } from '@/services/audit/types'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      event_type?: string
      outcome?: 'success' | 'failure'
      failure_reason?: string | null
      metadata?: Record<string, unknown>
    }

    if (!body.event_type) {
      return NextResponse.json({ error: 'event_type required' }, { status: 400 })
    }

    await logAuthEvent({
      event_type: body.event_type as AuthEventInput['event_type'],
      outcome: body.outcome ?? 'success',
      failure_reason: body.failure_reason ?? null,
      ip_address: req.headers.get('x-forwarded-for') ?? null,
      user_agent: req.headers.get('user-agent') ?? null,
      correlation_id: req.headers.get('x-correlation-id') ?? null,
      metadata: body.metadata ?? {},
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
