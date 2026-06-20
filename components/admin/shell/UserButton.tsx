'use client';

// components/admin/shell/UserButton.tsx
//
// Sidebar footer: avatar + name + email + overflow menu. Replaces the Clerk
// hosted UserButton — auth actions are wired through the provider-agnostic
// boundary (useAuthActions from @/services/auth/client).

import { Avatar, Group, Menu, Text, UnstyledButton } from '@mantine/core';
import { IconDots, IconLogout, IconUser } from '@tabler/icons-react';
import { useAuthActions } from '@/services/auth/client';
import classes from './UserButton.module.css';

export function UserButton({ name, email }: { name: string; email: string }) {
  const { signOut, openUserProfile } = useAuthActions();

  return (
    <Menu position="top" offset={4} withArrow arrowSize={8} shadow="md">
      <Menu.Target>
        <UnstyledButton className={classes.userbtn} aria-label="Account menu">
          <Group gap={10} wrap="nowrap" w="100%">
            <Avatar
              name={name || email}
              color="initials"
              radius="xl"
              size={30}
              styles={{ root: { flexShrink: 0 } }}
            />
            <div className={classes.meta}>
              {name && <Text className={classes.name}>{name}</Text>}
              <Text className={classes.mail}>{email}</Text>
            </div>
            <IconDots size={16} className={classes.dots} />
          </Group>
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconUser size={14} />}
          onClick={() => openUserProfile()}
        >
          Account
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          color="red"
          leftSection={<IconLogout size={14} />}
          onClick={() => signOut()}
        >
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
