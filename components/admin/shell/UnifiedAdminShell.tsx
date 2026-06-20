'use client';

// components/admin/shell/UnifiedAdminShell.tsx
//
// Single chrome wrapping both /admin/* (tenant) and /platform/* (platform)
// route groups. Mantine AppShell provides the sidebar + mobile burger collapse.
// Gating lives in each route group's layout.tsx — this component is purely
// presentational.

import { usePathname } from 'next/navigation';
import { AppShell, Box, Burger, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { UnifiedSidebarNav } from './UnifiedSidebarNav';
import { PAGE_TITLES, isPaddedRoute } from './nav-config';
import classes from './UnifiedAdminShell.module.css';

type Props = {
  tenantName: string;
  isPlatformAdmin: boolean;
  user: { name: string; email: string };
  children: React.ReactNode;
};

export function UnifiedAdminShell({ tenantName, isPlatformAdmin, user, children }: Props) {
  const [mobileOpened, { toggle, close }] = useDisclosure(false);
  const pathname = usePathname();
  const padded = isPaddedRoute(pathname);
  const title = PAGE_TITLES[pathname] ?? '';

  return (
    <AppShell
      header={{ height: 48, collapsed: !mobileOpened }}
      navbar={{
        width: 240,
        breakpoint: 'md',
        collapsed: { mobile: !mobileOpened },
      }}
      padding={0}
    >
      {/* Mobile-only header with the burger */}
      <AppShell.Header className={classes.mobileHeader} hiddenFrom="md">
        <Group h="100%" px="md" gap={12}>
          <Burger opened={mobileOpened} onClick={toggle} size="sm" aria-label="Toggle navigation" />
          {title && <Text className={classes.mhTitle}>{title}</Text>}
        </Group>
      </AppShell.Header>

      {/* Dark sidebar */}
      <AppShell.Navbar className={classes.navbar}>
        <UnifiedSidebarNav
          tenantName={tenantName}
          isPlatformAdmin={isPlatformAdmin}
          user={user}
          onNavigate={close}
        />
      </AppShell.Navbar>

      {/* Content area. Platform + /admin/members sit in the padded column;
          full-bleed tenant screens own their own scroll + header. */}
      <AppShell.Main className={classes.main}>
        {padded ? <Box className={classes.mainInner}>{children}</Box> : children}
      </AppShell.Main>
    </AppShell>
  );
}
