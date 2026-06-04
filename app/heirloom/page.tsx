import { auth } from '@clerk/nextjs/server';
import { getAdminClient } from '@/services/auth/supabase-admin';
import { HEIRLOOM_TENANT_ID } from '@/services/auth/sync-member';
import HeirloomApp from './HeirloomApp';

export const dynamic = 'force-dynamic';

export default async function HeirloomPage() {
  const { userId: clerkId } = await auth();
  const supabase = getAdminClient();

  // Read the invite gate toggle from tenants.settings JSONB.
  // Default to true (gate on) when the key is absent — preserves safe behavior
  // until the admin explicitly disables it.
  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', HEIRLOOM_TENANT_ID)
    .maybeSingle();

  const tenantSettings = tenantRow?.settings as Record<string, unknown> | null;
  const gateEnabled = (tenantSettings?.invite_gate_enabled as boolean | undefined) ?? true;

  // Check if the signed-in user is an active member.
  let isAuthorized = false;
  if (clerkId) {
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('clerk_user_id', clerkId)
      .eq('tenant_id', HEIRLOOM_TENANT_ID)
      .eq('status', 'active')
      .maybeSingle();
    isAuthorized = !!member;
  }

  return <HeirloomApp gateEnabled={gateEnabled} isAuthorized={isAuthorized} />;
}
