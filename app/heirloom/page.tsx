import { getSession, HEIRLOOM_TENANT_ID } from '@/services/auth';
import { getAdminClient } from '@/services/auth/supabase-admin';
import { validateInvite } from '@/services/invites';
import HeirloomApp from './HeirloomApp';

export const dynamic = 'force-dynamic';

export default async function HeirloomPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const session = await getSession();
  const params = await searchParams;
  const inviteToken = params.invite;

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

  // Check if the signed-in user is an active member. members.clerk_id stores
  // the provider subject id — providerUserId maps to it 1:1 today. Moving this
  // query behind a service helper (isActiveMember) is a flagged follow-up.
  let isAuthorized = false;
  if (session) {
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('clerk_id', session.providerUserId)
      .eq('tenant_id', HEIRLOOM_TENANT_ID)
      .eq('status', 'active')
      .maybeSingle();
    isAuthorized = !!member;
  }

  // A valid unused invite token also grants full access.
  if (!isAuthorized && inviteToken) {
    const row = await validateInvite(inviteToken);
    if (row !== null) isAuthorized = true;
  }

  return <HeirloomApp gateEnabled={gateEnabled} isAuthorized={isAuthorized} />;
}
