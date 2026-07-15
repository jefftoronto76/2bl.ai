// app/(platform)/platform/members/page.tsx
//
// Platform-admin cross-tenant members view. Mirrors the data-fetching pattern in
// app/admin/members/page.tsx but renders inside PlatformShell instead of AdminShell.
// Reuses the shared MembersList client component and its associated types.

import type { CSSProperties } from 'react';
import { getCurrentUser } from '@/services/auth';
import { redirect } from 'next/navigation';
import { Box, Stack, Title } from '@mantine/core';
import { getAdminClient } from '@/services/auth/supabase-admin';
import { Text } from '@/components/admin/primitives/Text';
import { MembersList } from '@/app/admin/members/MembersList';
import { MembersDashboard } from './MembersDashboard';
import type { Membership, TenantOption, UserRow } from '@/app/admin/members/types';
import { toInviteLink } from '@/app/admin/members/inviteLink';

export const dynamic = 'force-dynamic';

// Header/scroll-body split (mirrors app/admin/prompt-studio/blocks/page.tsx
// and app/admin/page.tsx): MembersList's sticky toolbar needs its own scroll
// ancestor with no top padding (pt={0}) for `top: 0` to pin flush with no gap.
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

export default async function PlatformMembersPage() {
  // Defense in depth — the (platform) layout already gates platform_admin, but
  // this page runs a privileged service-role read across ALL tenants.
  const user = await getCurrentUser();
  if (!user) redirect('/secondbrainlabs/sign-in');
  if (!user.isPlatformAdmin) redirect('/admin');

  const supabase = getAdminClient();

  // Signed-up users with their memberships and tenant names.
  const { data, error } = await supabase
    .from('users')
    .select(
      `
      id, name, email,
      members:members!user_id (
        id, tenant_id, role, status, created_at, invited_name, token,
        used_at, opened_at, opens, expires_at, revoked_at,
        inviter:users!invited_by ( name, email ),
        tenant:tenants ( id, name, domain )
      )
    `
    )
    .order('name', { ascending: true });

  // Invited-only: members rows with no linked users row (not yet signed up).
  const { data: inviteOnlyData } = await supabase
    .from('members')
    .select('id, tenant_id, role, status, created_at, invited_name, token, used_at, opened_at, opens, expires_at, revoked_at, inviter:users!invited_by ( name, email ), tenant:tenants ( id, name, domain )')
    .is('user_id', null)
    .in('status', ['invited', 'waitlist'])
    .order('created_at', { ascending: false });

  const { data: tenantData } = await supabase
    .from('tenants')
    .select('id, name, domain')
    .order('name', { ascending: true });

  const users: UserRow[] = (data ?? []).map((u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    memberships: (u.members ?? []).map(
      (m: any): Membership => ({
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
      })
    ),
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
      },
    ],
  }));

  const tenants: TenantOption[] = (tenantData ?? []).map((t) => ({ id: t.id, name: t.name, domain: t.domain ?? null }));
  const allUsers = [...users, ...invitedRows];

  return (
    <Stack h="100%" gap={0}>
      <Box px={{ base: 16, sm: 24 }} py={{ base: 12, sm: 16 }} style={HEADER_FRAME_STYLE}>
        <Stack gap={2}>
          <Title order={1} fz="lg" fw={600}>
            Members
          </Title>
          <Text variant="muted">Everyone with access across all tenants.</Text>
        </Stack>
      </Box>

      <Box style={SCROLL_AREA_STYLE} px={{ base: 'md', sm: 'lg' }} pb={{ base: 'md', sm: 'lg' }} pt={0}>
        {error ? (
          <Text variant="muted">Unable to load members.</Text>
        ) : (
          <Stack gap="lg">
            <MembersDashboard users={allUsers} />
            <MembersList users={allUsers} tenants={tenants} inviteApiBase="/api/platform/members" />
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
