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
  let gateEnabled = false;
  let isAuthorized = false;
  let isAdmin = false;

  if (tenantId) {
    // Read the invite gate toggle from tenants.settings JSONB.
    // Default to false (gate off) when the key is absent — gate is opt-in;
    // an admin must explicitly set invite_gate_enabled: true to enable it.
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .maybeSingle();

    const tenantSettings = tenantRow?.settings as Record<string, unknown> | null;
    gateEnabled = (tenantSettings?.invite_gate_enabled as boolean | undefined) ?? false;

    // Check if the signed-in user is an active member of this tenant.
    if (session) {
      const { data: member } = await supabase
        .from('members')
        .select('id, role')
        .eq('clerk_id', session.providerUserId)
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .maybeSingle();
      console.log('[heirloom/page] member row:', member);
      isAuthorized = !!member;
      isAdmin = member?.role === 'admin' || member?.role === 'owner';
      console.log('[heirloom/page] isAdmin:', isAdmin, '| isAuthorized:', isAuthorized, '| tenantId:', tenantId);
    }
  }

  // A valid unused members.token also grants full access.
  let invitedName: string | null = null;
  let autoOpenChat = false;
  let memberId: string | null = null;
  if (!isAuthorized && inviteToken) {
    const row = await validateMemberToken(inviteToken);
    if (row !== null) {
      isAuthorized = true;
      invitedName = row.invited_name ?? null;
      autoOpenChat = row.auto_open ?? false;
      memberId = row.id;
    }
  }

  const hasInviteToken = !!inviteToken;

  // Pass the raw token to the client only when it was the authorization path
  // (valid + unused). When the user is already a signed-in active member the
  // token path didn't fire, so there is nothing to accept.
  const validatedInviteToken =
    isAuthorized && inviteToken && !session ? inviteToken : undefined;

  // Pass memberId only for pre-auth invite holders — it lets getMemberContext
  // look up the member directly without needing chat_sessions.user_id.
  const validatedMemberId =
    isAuthorized && !session && memberId ? memberId : undefined;

  console.log('[heirloom/page] props →', { gateEnabled, isAuthorized, isAdmin, hasInviteToken, validatedInviteToken, autoOpenChat, hasMemberId: !!validatedMemberId });

  return (
    <HeirloomApp
      gateEnabled={gateEnabled}
      isAuthorized={isAuthorized}
      isAdmin={isAdmin}
      invitedName={invitedName}
      hasInviteToken={hasInviteToken}
      inviteToken={validatedInviteToken}
      memberId={validatedMemberId}
      autoOpenChat={autoOpenChat}
    />
  );
}
