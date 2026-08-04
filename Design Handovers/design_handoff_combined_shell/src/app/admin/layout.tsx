// app/admin/layout.tsx
//
// Wraps every /admin/* (tenant) route in the SAME unified shell so the chrome is
// identical across both admins. Keeps the tenant-admin gate that previously
// lived in AdminShell.tsx — only the chrome changed.
//
// Replaces the old AdminShell.tsx + AdminSidebarNav.tsx wrapper.

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/services/auth';
import { UnifiedAdminShell } from '@/components/admin/shell/UnifiedAdminShell';
import { getActiveTenant } from '@/services/tenant';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/secondbrainlabs/sign-in');
  // Tenant admins AND platform admins may view /admin/*; gate per your rules.
  if (!user.canAccessAdmin) redirect('/secondbrainlabs/sign-in');

  const tenant = await getActiveTenant();

  return (
    <UnifiedAdminShell
      tenantName={tenant.name}
      user={{ name: user.name, email: user.email }}
    >
      {children}
    </UnifiedAdminShell>
  );
}
