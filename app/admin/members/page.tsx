// app/admin/members/page.tsx
//
// Server component. Resolves the current admin's tenant via getAuthContext(),
// loads members for that tenant only (signed-up + invited-only), and renders
// the client list. Does NOT load members across all tenants — that view lives
// in app/(platform)/platform/members/.

import type { CSSProperties } from 'react';
import { getAuthContext } from '@/services/auth';
import { redirect } from 'next/navigation';
import { Box, Stack, Title } from '@mantine/core';
import { getAdminClient } from '@/services/auth/supabase-admin';
import { Text } from '@/components/admin/primitives/Text';
import { MembersList } from './MembersList';
import { MembersDashboard } from './MembersDashboard';
import type { Membership, TenantOption, UserRow } from './types';
import { toInviteLink } from './inviteLink';

export const dynamic = 'force-dynamic';

// Header/scroll-body split (mirrors app/admin/prompt-studio/blocks/page.tsx
// and app/(platform)/platform/members/page.tsx): MembersList's sticky toolbar
// needs its own scroll ancestor with no top padding (pt={0}) for `top: 0` to
// pin flush with no gap.
const HEADER_FRAME_STYLE: CSSProperties = {
  flexShrink: 0,
  borderBottom: '1px solid var(--mantine-color-gray-2)',
  background: '#fff',
};

const SCROLL_AREA_STYLE: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
};

export default async function MembersPage() {
  let authCtx: { owner_id: string; tenant_id: string };
  try {
    authCtx = await getAuthContext();
  } catch {
    redirect('/admin');
  }

  const supabase = getAdminClient();

  // Signed-up members of this tenant, with their user details.
  const { data, error } = await supabase
    .from('members')
    .select(
      `
      id, tenant_id, role, status, created_at, invited_name, token,
      used_at, opened_at, opens, expires_at, revoked_at,
      user:users!user_id!inner ( id, name, email ),
      inviter:users!invited_by ( name, email ),
      tenant:tenants ( id, name, domain )
    `
    )
    .eq('tenant_id', authCtx.tenant_id)
    .not('user_id', 'is', null)
    .order('created_at', { ascending: false });

  // Invited-only: members rows with no linked users row (not yet signed up).
  const { data: inviteOnlyData } = await supabase
    .from('members')
    .select('id, tenant_id, role, status, created_at, invited_name, token, used_at, opened_at, opens, expires_at, revoked_at, inviter:users!invited_by ( name, email ), tenant:tenants ( id, name, domain )')
    .eq('tenant_id', authCtx.tenant_id)
    .is('user_id', null)
    .in('status', ['invited', 'waitlist'])
    .order('created_at', { ascending: false });

  // Orphaned: active/suspended members rows with no user_id — a data-integrity
  // gap (see Known Gaps.md), not a normal invite. Neither query above catches
  // these (not user_id-populated, not status invited/waitlist), so without
  // this they render nowhere in the admin UI at all.
  const { data: orphanedData } = await supabase
    .from('members')
    .select('id, tenant_id, role, status, created_at, invited_name, token, used_at, opened_at, opens, expires_at, revoked_at, inviter:users!invited_by ( name, email ), tenant:tenants ( id, name, domain )')
    .eq('tenant_id', authCtx.tenant_id)
    .is('user_id', null)
    .not('status', 'in', '(invited,waitlist)')
    .order('created_at', { ascending: false });

  // All tenants list for the InviteMemberModal tenant selector.
  const { data: tenantData } = await supabase
    .from('tenants')
    .select('id, name, domain')
    .order('name', { ascending: true });

  const users: UserRow[] = (data ?? []).map((m: any) => ({
    id: m.user.id,
    name: m.user.name ?? '',
    email: m.user.email ?? '',
    memberships: [
      {
        memberId: m.id,
        tenantId: m.tenant_id,
        tenantName: m.tenant?.name ?? 'Unknown tenant',
        tenantDomain: m.tenant?.domain ?? null,
        role: m.role,
        status: m.status,
        plan: 'free',
        joined: m.created_at ?? null,
        lastActive: null,
        invitedName: m.invited_name ?? null,
        invitedByName: m.inviter?.name ?? m.inviter?.email ?? null,
        token: m.token ?? null,
        invite: toInviteLink(m),
      } satisfies Membership,
    ],
  }));

  const invitedRows: UserRow[] = (inviteOnlyData ?? []).map((m: any) => ({
    id: `invite:${m.id}`,
    name: m.invited_name ?? 'Unnamed invitee',
    email: '',
    isInviteOnly: true,
    memberships: [
      {
        memberId: m.id,
        tenantId: m.tenant_id,
        tenantName: m.tenant?.name ?? 'Unknown tenant',
        tenantDomain: m.tenant?.domain ?? null,
        role: m.role,
        status: m.status,
        plan: 'free',
        joined: m.created_at ?? null,
        lastActive: null,
        invitedName: m.invited_name ?? null,
        invitedByName: m.inviter?.name ?? m.inviter?.email ?? null,
        token: m.token ?? null,
        invite: toInviteLink(m),
      } satisfies Membership,
    ],
  }));

  const orphanedRows: UserRow[] = (orphanedData ?? []).map((m: any) => ({
    id: `orphaned:${m.id}`,
    name: m.invited_name ?? 'Unnamed member',
    email: '',
    isOrphaned: true,
    memberships: [
      {
        memberId: m.id,
        tenantId: m.tenant_id,
        tenantName: m.tenant?.name ?? 'Unknown tenant',
        tenantDomain: m.tenant?.domain ?? null,
        role: m.role,
        status: m.status,
        plan: 'free',
        joined: m.created_at ?? null,
        lastActive: null,
        invitedName: m.invited_name ?? null,
        invitedByName: m.inviter?.name ?? m.inviter?.email ?? null,
        token: m.token ?? null,
        invite: toInviteLink(m),
      } satisfies Membership,
    ],
  }));

  const tenants: TenantOption[] = (tenantData ?? []).map((t: any) => ({ id: t.id, name: t.name, domain: t.domain ?? null }));
  const allUsers = [...users, ...invitedRows, ...orphanedRows];

  return (
    <Stack h="100%" gap={0}>
      <Box px={{ base: 16, sm: 24 }} py={{ base: 12, sm: 16 }} style={HEADER_FRAME_STYLE}>
        <Stack gap={2}>
          <Title order={1} fz="lg" fw={600}>
            Members
          </Title>
          <Text variant="muted">Everyone with access to this workspace.</Text>
        </Stack>
      </Box>

      <Box style={SCROLL_AREA_STYLE} px={{ base: 'md', sm: 'lg' }} pb={{ base: 'md', sm: 'lg' }} pt={0}>
        {error ? (
          <Text variant="muted">Unable to load members.</Text>
        ) : (
          <Stack gap="lg">
            <MembersDashboard users={allUsers} />
            <MembersList users={allUsers} tenants={tenants} currentTenantId={authCtx.tenant_id} inviteApiBase="/api/admin/members" />
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
