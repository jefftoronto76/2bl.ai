'use client';

// components/admin/shell/UnifiedAdminShell.tsx
//
// The single chrome that wraps BOTH the platform (/platform/*) and tenant
// (/admin/*) route groups. Mantine AppShell provides the navbar + the mobile
// burger/drawer; the dark sidebar styling comes from the CSS module.
//
// Mounted by both app/(platform)/layout.tsx and app/admin/layout.tsx so the two
// admins share identical chrome. Each layout keeps its own server-side gating;
// this component is purely presentational. See handover.md §2.

import { usePathname } from 'next/navigation';
import { AppShell, Box, Burger, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { UnifiedSidebarNav } from './UnifiedSidebarNav';
import { PAGE_TITLES, isPaddedRoute } from './nav-config';
import classes from './UnifiedAdminShell.module.css';

type Props = {
  tenantName: string;
  user: { name: string; email: string };
  children: React.ReactNode;
};

export function UnifiedAdminShell({ tenantName, user, children }: Props) {
  const [opened, { toggle, close }] = useDisclosure(false);
  const pathname = usePathname();
  const padded = isPaddedRoute(pathname);
  const title = PAGE_TITLES[pathname] ?? '';

  return (
    <AppShell
      header={{ height: 48, collapsed: { desktop: true, mobile: false } }}
      navbar={{
        width: 240,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding={0}
    >
      {/* Mobile-only header with the burger */}
      <AppShell.Header className={classes.mobileHeader} hiddenFrom="sm">
        <Group h="100%" px="md" gap={12}>
          <Burger opened={opened} onClick={toggle} size="sm" aria-label="Toggle navigation" />
          <Text className={classes.mhTitle}>{title}</Text>
        </Group>
      </AppShell.Header>

      {/* Dark sidebar — identical on desktop and in the mobile drawer */}
      <AppShell.Navbar className={classes.navbar}>
        <UnifiedSidebarNav tenantName={tenantName} user={user} onNavigate={close} />
      </AppShell.Navbar>

      {/* Content. Full-bleed tenant screens own their own scroll + header;
          platform + members screens sit in the padded, max-width column. */}
      <AppShell.Main className={classes.main}>
        {padded ? <Box className={classes.mainInner}>{children}</Box> : children}
      </AppShell.Main>
    </AppShell>
  );
}
