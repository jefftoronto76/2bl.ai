import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import { adminTheme } from '@/components/admin/theme/mantine-theme';
import { AdminShell } from '@/components/admin/layout/AdminShell';
import { AdminUserProvider } from '@/context/admin-user';
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
