import { getAuthContext } from '@/services/auth';
import { getAppearanceHistory } from '@/app/admin/settings/getAppearanceHistory';

export async function GET() {
  let authCtx: { owner_id: string; tenant_id: string };
  try {
    authCtx = await getAuthContext();
  } catch (err) {
    console.error('[appearance/history] auth failed:', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const history = await getAppearanceHistory(authCtx.tenant_id);
  return Response.json({ history });
}
