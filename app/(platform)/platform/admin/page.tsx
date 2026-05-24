import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Stack, Title } from '@mantine/core';
import { getAdminClient } from '@/lib/supabase-admin';
import { Text } from '@/components/admin/primitives/Text';
import { TenantList, type TenantRow } from './TenantList';

export const dynamic = 'force-dynamic';

export default async function PlatformTenantsPage() {
  // Defense in depth: the (platform) layout already gates platform_admin, but
  // this page runs a privileged service-role read across ALL tenants. Re-verify
  // here so the cross-tenant query never executes for a non-admin, rather than
  // relying on layout/page render ordering.
  const user = await currentUser();
  if (!user) {
    redirect('/secondbrainlabs/sign-in');
  }
  const role = (user.publicMetadata as Record<string, unknown>)?.role;
  if (role !== 'platform_admin') {
    redirect('/admin');
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('tenants')
    .select('id, parent_id, name, slug, type, domain')
    .order('name', { ascending: true });

  const tenants: TenantRow[] = (data ?? []).map((t) => ({
    id: t.id,
    parent_id: t.parent_id,
    name: t.name,
    slug: t.slug,
    type: t.type,
    domain: t.domain,
  }));

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={1} fz="lg" fw={600}>
          Tenants
        </Title>
        <Text variant="muted">Every tenant on the platform, grouped by parent.</Text>
      </Stack>

      {error ? (
        <Text variant="muted">Unable to load tenants.</Text>
      ) : (
        <TenantList tenants={tenants} />
      )}
    </Stack>
  );
}
