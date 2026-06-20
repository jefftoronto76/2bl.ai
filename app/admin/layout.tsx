import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
// Inkwell tokens are shared with jefflougheed.ca but admin lives outside the
// (jefflougheed) route group, so import them explicitly here.
import '../(jefflougheed)/globals.css';

import { adminTheme } from '@/components/admin/theme/mantine-theme';
import { UnifiedAdminShell } from '@/components/admin/shell/UnifiedAdminShell';
import { AdminUserProvider } from '@/services/auth/admin-user-context';
import { syncUser, getCurrentUser, getTenantInfo } from '@/services/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [supabaseUserId, user, tenantInfo] = await Promise.all([
    syncUser(),
    getCurrentUser(),
    getTenantInfo(),
  ]);

  // isPlatformAdmin controls Platform section visibility in the sidebar.
  // Both conditions must hold: users.role = 'platform_admin' AND tenants.type = 'platform'.
  const isPlatformAdmin = (user?.isPlatformAdmin ?? false) && tenantInfo?.type === 'platform';
  const tenantName = tenantInfo?.name ?? 'Natural Resource';

  return (
    <AdminUserProvider supabaseUserId={supabaseUserId}>
      <MantineProvider theme={adminTheme}>
        <ColorSchemeScript defaultColorScheme="light" />
        <Notifications position="top-right" />
        <UnifiedAdminShell
          tenantName={tenantName}
          isPlatformAdmin={isPlatformAdmin}
          user={{ name: user?.name ?? '', email: user?.email ?? '' }}
        >
          {children}
        </UnifiedAdminShell>
      </MantineProvider>
    </AdminUserProvider>
  );
}
