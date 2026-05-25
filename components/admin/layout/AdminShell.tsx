'use client';

import { Suspense, type ReactNode } from 'react';
import { AppShell, Burger, Drawer, Group, Text, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { UserButton } from '@clerk/nextjs';
import { AdminSidebarNav } from '@/components/admin/navigation/AdminSidebarNav';

export interface AdminShellProps {
  children: ReactNode;
  tenantName: string;
}

function NavContent({ onNavigate, tenantName }: { onNavigate?: () => void; tenantName: string }) {
  return (
    <Stack
      gap={0}
      h="100%"
      data-mantine-color-scheme="dark"
      style={{
        backgroundColor: 'var(--mantine-color-dark-9)',
      }}
    >
      {/* Wordmark */}
      <div style={{ padding: 'var(--mantine-spacing-sm)' }}>
        <Text
          size="md"
          fw={400}
          c="gray.1"
          style={{
            fontFamily: 'var(--mantine-font-family-headings)',
            letterSpacing: '-0.01em',
          }}
        >
          {tenantName}
        </Text>
        <Text
          size="xs"
          c="green.6"
          style={{
            fontFamily: 'var(--mantine-font-family-monospace)',
            fontSize: '9px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          Admin
        </Text>
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, overflowY: 'auto' }} onClick={onNavigate}>
        <Suspense>
          <AdminSidebarNav />
        </Suspense>
      </div>

      {/* Footer — Clerk UserButton */}
      <Stack p="sm">
        <UserButton />
      </Stack>
    </Stack>
  );
}

export function AdminShell({ children, tenantName }: AdminShellProps) {
  const [opened, { toggle, close }] = useDisclosure();

  return (
    <AppShell
      header={{ height: { base: 48, md: 0 } }}
      navbar={{
        width: 240,
        breakpoint: 'md',
      }}
      padding="lg"
    >
      <AppShell.Header
        hiddenFrom="md"
        style={{
          backgroundColor: 'var(--mantine-color-white)',
          borderBottom: '1px solid var(--mantine-color-gray-2)',
        }}
      >
        <Group h="100%" px="md">
          <Burger
            opened={opened}
            onClick={toggle}
            hiddenFrom="md"
            size="sm"
            aria-label="Toggle navigation"
          />
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
        <AppShell.Section>
          <div style={{ padding: 'var(--mantine-spacing-sm)' }}>
            <Text
              size="md"
              fw={400}
              c="gray.1"
              style={{
                fontFamily: 'var(--mantine-font-family-headings)',
                letterSpacing: '-0.01em',
              }}
            >
              {tenantName}
            </Text>
            <Text
              size="xs"
              c="green.6"
              style={{
                fontFamily: 'var(--mantine-font-family-monospace)',
                fontSize: '9px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
              }}
            >
              Admin
            </Text>
          </div>
        </AppShell.Section>

        <AppShell.Section grow style={{ overflowY: 'auto' }}>
          <Suspense>
            <AdminSidebarNav />
          </Suspense>
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
          content: { backgroundColor: 'var(--mantine-color-dark-9)' },
        }}
      >
        <NavContent onNavigate={close} tenantName={tenantName} />
      </Drawer>

      <AppShell.Main
        style={{
          backgroundColor: 'var(--mantine-color-white)',
        }}
      >
        {children}
      </AppShell.Main>
    </AppShell>
  );
}
