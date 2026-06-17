import { type NextRequest, NextResponse } from 'next/server';
import { logEvent } from '@/services/audit/audit';
import { AuditAction } from '@/services/audit/types';
import { getSession, getTenantFromRequest } from '@/services/auth';

type PWAAction = (typeof AuditAction)[keyof Pick<
  typeof AuditAction,
  | 'PWA_SW_REGISTERED'
  | 'PWA_INSTALL_PROMPTED'
  | 'PWA_INSTALLED'
  | 'PWA_PUSH_PROMPTED'
  | 'PWA_PUSH_GRANTED'
  | 'PWA_PUSH_DENIED'
  | 'PWA_SUBSCRIPTION_CREATED'
>];

const PWA_ACTIONS = new Set<string>([
  AuditAction.PWA_SW_REGISTERED,
  AuditAction.PWA_INSTALL_PROMPTED,
  AuditAction.PWA_INSTALLED,
  AuditAction.PWA_PUSH_PROMPTED,
  AuditAction.PWA_PUSH_GRANTED,
  AuditAction.PWA_PUSH_DENIED,
  AuditAction.PWA_SUBSCRIPTION_CREATED,
]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      action?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.action || !PWA_ACTIONS.has(body.action)) {
      return NextResponse.json({ error: 'valid action required' }, { status: 400 });
    }

    const [tenantId, session] = await Promise.all([
      getTenantFromRequest(req),
      getSession(),
    ]);

    void logEvent({
      action: body.action as PWAAction,
      tenant_id: tenantId,
      product_id: 'heirloom',
      actor_id: null,
      actor_type: session ? 'user' : 'anonymous',
      clerk_user_id: session?.providerUserId ?? null,
      outcome: 'success',
      ip_address: req.headers.get('x-forwarded-for') ?? null,
      user_agent: req.headers.get('user-agent') ?? null,
      correlation_id: req.headers.get('x-correlation-id') ?? null,
      metadata: body.metadata ?? {},
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
