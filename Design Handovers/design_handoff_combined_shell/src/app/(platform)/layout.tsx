// app/(platform)/layout.tsx
//
// Wraps every /platform/* route in the unified shell. Keeps the platform-admin
// gate that previously lived in the platform layout — only the chrome changed.
//
// The old PlatformSidebarNav is gone; UnifiedAdminShell renders the merged nav.

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/services/auth';
import { UnifiedAdminShell } from '@/components/admin/shell/UnifiedAdminShell';
import { getActiveTenant } from '@/services/tenant';

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/secondbrainlabs/sign-in');
  if (!user.isPlatformAdmin) redirect('/admin');

  // The tenant section of the sidebar links into /admin/* — which is scoped to a
  // tenant. Resolve which tenant those links target. See handover.md §5 (#1).
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
