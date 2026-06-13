import { getSession, HEIRLOOM_TENANT_ID, getTenantFromRequest } from '@/services/auth';
import { getAdminClient } from '@/services/auth/supabase-admin';
import { headers } from 'next/headers';
import { validateMemberToken } from '@/services/members';
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

  // Resolve the tenant from the request Host header — same pattern as every
  // other public route. No hardcoded tenant ID.
  const hdrs = await headers();
  const tenantId = await getTenantFromRequest({ headers: hdrs } as unknown as Request);

  const supabase = getAdminClient();

  // Gate and auth default to safe values when the tenant cannot be resolved
  // (e.g. Vercel preview without PREVIEW_TENANT_ID set).
  let gateEnabled = true;
  let isAuthorized = false;
  let isAdmin = false;

  if (tenantId) {
    // Read the invite gate toggle from tenants.settings JSONB.
    // Default to true (gate on) when the key is absent — preserves safe behavior
    // until the admin explicitly disables it.
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .maybeSingle();

    const tenantSettings = tenantRow?.settings as Record<string, unknown> | null;
    gateEnabled = (tenantSettings?.invite_gate_enabled as boolean | undefined) ?? true;

    // Check if the signed-in user is an active member of this tenant.
    if (session) {
      const { data: member } = await supabase
        .from('members')
        .select('id, role')
        .eq('clerk_id', session.providerUserId)
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .maybeSingle();
      isAuthorized = !!member;
      isAdmin = member?.role === 'admin' || member?.role === 'owner';
    }
  }

  // A valid unused members.token also grants full access.
  let invitedName: string | null = null;
  if (!isAuthorized && inviteToken) {
    const row = await validateMemberToken(inviteToken);
    if (row !== null) {
      isAuthorized = true;
      invitedName = row.invited_name ?? null;
    }
  }

  const hasInviteToken = !!inviteToken;

  // Pass the raw token to the client only when it was the authorization path
  // (valid + unused). When the user is already a signed-in active member the
  // token path didn't fire, so there is nothing to accept.
  const validatedInviteToken =
    isAuthorized && inviteToken && !session ? inviteToken : undefined;

  return (
    <HeirloomApp
      gateEnabled={gateEnabled}
      isAuthorized={isAuthorized}
      isAdmin={isAdmin}
      invitedName={invitedName}
      hasInviteToken={hasInviteToken}
      inviteToken={validatedInviteToken}
    />
  );
}
