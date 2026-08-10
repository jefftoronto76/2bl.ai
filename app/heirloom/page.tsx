import { getSession, HEIRLOOM_TENANT_ID, getTenantFromRequest } from '@/services/auth';
import { getAdminClient } from '@/services/auth/supabase-admin';
import { headers } from 'next/headers';
import { validateMemberToken } from '@/services/members';
import { validateStoryInviteToken } from '@/services/crm/story-invites';
import HeirloomApp from './HeirloomApp';

export const dynamic = 'force-dynamic';

export default async function HeirloomPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; join?: string }>;
}) {
  const session = await getSession();
  const params = await searchParams;
  const inviteToken = params.invite;
  const joinToken = params.join;

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

  // Story invite link (join searchParam) — a fully separate, parallel
  // mechanism from the invite branch above (story_invite_links, not
  // members.token; see services/crm/story-invites.ts). Deliberately NOT
  // gated on `!isAuthorized` the way the invite-token branch above is: an
  // already-signed-in EXISTING active member opening a join link is
  // already isAuthorized from the member check further up, but the client
  // still needs the token so it can fire the accept call and grant the
  // artifact_subscribers row — chatStore.tsx's mount-time trigger handles
  // exactly this case. So this both (a) grants gate access for a brand-new
  // visitor who isn't authorized yet, and (b) always surfaces the token to
  // the client whenever the link itself is valid, regardless of `session`.
  let storyInviteToken: string | null = null;
  if (joinToken) {
    const link = await validateStoryInviteToken(joinToken);
    if (link !== null) {
      isAuthorized = true;
      storyInviteToken = joinToken;
      // A valid story invite opens the chat drawer automatically, same as
      // the members.auto_open branch above — independent trigger, same
      // effect. Purely additive: does not touch the auto_open branch above.
      autoOpenChat = true;
    }
  }

  console.log('[heirloom/page] props →', { gateEnabled, isAuthorized, isAdmin, hasInviteToken, validatedInviteToken, autoOpenChat, hasMemberId: !!validatedMemberId, hasStoryInviteToken: !!storyInviteToken });

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
      storyInviteToken={storyInviteToken ?? undefined}
    />
  );
}
