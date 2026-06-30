'use client';

import { type ReactNode } from 'react';
import { AppShell, Burger, Drawer, Group, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { usePathname } from 'next/navigation';
import { UserButton } from '@/services/auth/ui';
import { UnifiedSidebarNav } from './UnifiedSidebarNav';
import { PAGE_TITLES } from './nav-config';

export interface UnifiedAdminShellProps {
  children: ReactNode;
  tenantName: string;
  isPlatformAdmin: boolean;
}

function Wordmark({ tenantName }: { tenantName: string }) {
  return (
    <div style={{ padding: 'var(--mantine-spacing-sm)' }}>
      <Text
        size="md"
        fw={400}
        style={{
          fontFamily: 'var(--mantine-font-family-headings)',
          letterSpacing: '-0.01em',
          color: 'var(--admin-sidebar-text)',
        }}
      >
        {tenantName}
      </Text>
      <Text
        size="xs"
        style={{
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: '9px',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--admin-accent-hover)',
        }}
      >
        Admin
      </Text>
    </div>
  );
}

function NavContent({ tenantName, isPlatformAdmin, onNavigate }: { tenantName: string; isPlatformAdmin: boolean; onNavigate?: () => void }) {
  return (
    <Stack gap={0} h="100%" style={{ backgroundColor: 'var(--admin-sidebar-bg)' }}>
      <Wordmark tenantName={tenantName} />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <UnifiedSidebarNav tenantName={tenantName} isPlatformAdmin={isPlatformAdmin} onNavigate={onNavigate} />
      </div>
      <Stack p="sm">
        <UserButton />
      </Stack>
    </Stack>
  );
}

export function UnifiedAdminShell({ children, tenantName, isPlatformAdmin }: UnifiedAdminShellProps) {
  const [opened, { toggle, close }] = useDisclosure();
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? '';

  return (
    <AppShell
      header={{ height: { base: 48, md: 0 } }}
      navbar={{
        width: 240,
        breakpoint: 'md',
      }}
      padding="lg"
      style={{ height: '100dvh' }}
    >
      <AppShell.Header
        hiddenFrom="md"
        style={{
          backgroundColor: 'var(--mantine-color-body)',
          borderBottom: '1px solid var(--admin-sidebar-border)',
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
                color: 'var(--mantine-color-ink-6)',
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
        style={{
          backgroundColor: 'var(--admin-sidebar-bg)',
          borderRight: '1px solid var(--admin-sidebar-border)',
        }}
      >
        <AppShell.Section>
          <Wordmark tenantName={tenantName} />
        </AppShell.Section>
        <AppShell.Section grow style={{ overflowY: 'auto' }}>
          <UnifiedSidebarNav tenantName={tenantName} isPlatformAdmin={isPlatformAdmin} />
        </AppShell.Section>
        <AppShell.Section>
          <Stack p="sm">
            <UserButton />
          </Stack>
        </AppShell.Section>
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
          content: { backgroundColor: 'var(--admin-sidebar-bg)' },
        }}
      >
        <NavContent tenantName={tenantName} isPlatformAdmin={isPlatformAdmin} onNavigate={close} />
      </Drawer>

      <AppShell.Main
        style={{
          backgroundColor: 'var(--mantine-color-body)',
          height: '100%',
          overflow: 'auto',
        }}
      >
        {children}
      </AppShell.Main>
    </AppShell>
  );
}
