import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
// Inkwell tokens are shared with jefflougheed.ca but admin lives outside the
// (jefflougheed) route group, so import them explicitly here.
import '../(jefflougheed)/globals.css';

import { adminTheme } from '@/components/admin/theme/mantine-theme';
import { AdminShell } from '@/components/admin/layout/AdminShell';
import { AdminUserProvider } from '@/services/auth/admin-user-context';
import { syncUser, getTenantName } from '@/services/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabaseUserId = await syncUser()
  // Host-derived tenant name for the banner. Falls back to 'Natural Resource'
  // (the primary tenant brand) only if resolution fails, preserving the prior
  // behavior on the error path.
  const tenantName = (await getTenantName()) ?? 'Natural Resource'

  return (
    <AdminUserProvider supabaseUserId={supabaseUserId}>
      <MantineProvider theme={adminTheme}>
        <ColorSchemeScript defaultColorScheme="light" />
        <Notifications position="top-right" />
        <AdminShell tenantName={tenantName}>
          {children}
        </AdminShell>
      </MantineProvider>
    </AdminUserProvider>
  );
}
