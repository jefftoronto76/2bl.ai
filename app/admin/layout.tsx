import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
// Inkwell tokens are shared with jefflougheed.ca but admin lives outside the
// (jefflougheed) route group, so import them explicitly here.
import '../(jefflougheed)/globals.css';

import { buildAdminTheme } from '@/components/admin/theme/mantine-theme';
import { UnifiedAdminShell } from '@/components/admin/shell/UnifiedAdminShell';
import { AdminUserProvider } from '@/services/auth/admin-user-context';
import { syncUser, getTenantName, getCurrentUser, getTenantType, getAuthContext } from '@/services/auth';
import { getTenantBranding } from '@/services/branding/get-tenant-branding';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [supabaseUserId, user, tenantName, tenantType] = await Promise.all([
    syncUser(),
    getCurrentUser(),
    getTenantName(),
    getTenantType(),
  ])

  // Build a dynamic Mantine theme from the tenant's saved branding.
  // Falls back to the inkwell default theme if auth or DB fails.
  let adminTheme = buildAdminTheme();
  try {
    const authCtx = await getAuthContext();
    const branding = await getTenantBranding(authCtx.tenant_id);
    adminTheme = buildAdminTheme(branding);
  } catch {
    // Non-fatal — default theme is already set above.
  }
  const isPlatformAdmin = user?.isPlatformAdmin === true && tenantType === 'platform'
  console.log('[admin layout]', { isPlatformAdmin: user?.isPlatformAdmin, tenantType, computed: user?.isPlatformAdmin === true && tenantType === 'platform' })

  return (
    <AdminUserProvider supabaseUserId={supabaseUserId}>
      <MantineProvider theme={adminTheme}>
        <ColorSchemeScript defaultColorScheme="light" />
        <Notifications position="top-right" />
        <UnifiedAdminShell tenantName={tenantName ?? 'Natural Resource'} isPlatformAdmin={isPlatformAdmin}>
          {children}
        </UnifiedAdminShell>
      </MantineProvider>
    </AdminUserProvider>
  );
}
