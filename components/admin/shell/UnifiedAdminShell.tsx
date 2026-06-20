'use client';

import { type ReactNode } from 'react';
import { AppShell, Burger, Drawer, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { usePathname } from 'next/navigation';
import { UnifiedSidebarNav } from './UnifiedSidebarNav';
import { PAGE_TITLES, isPaddedRoute } from './nav-config';

export interface UnifiedAdminShellProps {
  children: ReactNode;
  tenantName: string;
}

export function UnifiedAdminShell({ children, tenantName }: UnifiedAdminShellProps) {
  const [opened, { toggle, close }] = useDisclosure();
  const pathname = usePathname();
  const padded = isPaddedRoute(pathname);
  const title = PAGE_TITLES[pathname] ?? '';

  return (
    <AppShell
      header={{ height: { base: 48, md: 0 } }}
      navbar={{
        width: 240,
        breakpoint: 'md',
      }}
      padding={0}
    >
      <AppShell.Header
        hiddenFrom="md"
        style={{
          backgroundColor: 'var(--mantine-color-white)',
          borderBottom: '1px solid var(--mantine-color-gray-2)',
        }}
      >
        <Group h="100%" px="md" gap={12}>
          <Burger
            opened={opened}
            onClick={toggle}
            hiddenFrom="md"
            size="sm"
            aria-label="Toggle navigation"
          />
          {title ? (
            <Text
              fw={600}
              style={{
                fontFamily: 'var(--mantine-font-family-headings)',
                fontSize: '15px',
                color: 'var(--mantine-color-dark-9)',
              }}
            >
              {title}
            </Text>
          ) : null}
        </Group>
      </AppShell.Header>

      {/* Desktop sidebar */}
      <AppShell.Navbar
        p="sm"
        withBorder={false}
        visibleFrom="md"
        data-mantine-color-scheme="dark"
        style={{
          backgroundColor: 'var(--mantine-color-dark-9)',
          borderRight: '1px solid var(--mantine-color-dark-6)',
        }}
      >
        <UnifiedSidebarNav tenantName={tenantName} />
      </AppShell.Navbar>

      {/* Mobile drawer */}
      <Drawer
        opened={opened}
        onClose={close}
        position="left"
        size={240}
        hiddenFrom="md"
        withCloseButton={false}
        transitionProps={{ duration: 400 }}
        styles={{
          body: { padding: 0, height: '100%' },
          content: { backgroundColor: 'var(--mantine-color-dark-9)' },
        }}
      >
        <UnifiedSidebarNav tenantName={tenantName} onNavigate={close} />
      </Drawer>

      <AppShell.Main
        style={{
          backgroundColor: 'var(--mantine-color-white)',
        }}
      >
        {padded ? (
          <div style={{ maxWidth: 1080, padding: 24 }}>
            {children}
          </div>
        ) : (
          children
        )}
      </AppShell.Main>
    </AppShell>
  );
}
