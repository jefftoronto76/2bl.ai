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
import { syncUser } from '@/services/auth/sync-user';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabaseUserId = await syncUser()

  return (
    <AdminUserProvider supabaseUserId={supabaseUserId}>
      <MantineProvider theme={adminTheme}>
        <ColorSchemeScript defaultColorScheme="light" />
        <Notifications position="top-right" />
        <AdminShell>
          {children}
        </AdminShell>
      </MantineProvider>
    </AdminUserProvider>
  );
}
