'use client';

// components/admin/shell/UserButton.tsx
//
// Sidebar footer user button (avatar + name/email + overflow dots). Ported from
// the prototype's `.userbtn`. Wire the menu (sign out, account) to your existing
// auth actions — left as a no-op here.

import { Avatar, Group, Text, UnstyledButton } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import classes from './UserButton.module.css';

export function UserButton({ name, email }: { name: string; email: string }) {
  return (
    <UnstyledButton className={classes.userbtn}>
      <Group gap={10} wrap="nowrap" w="100%">
        <Avatar name={name} color="initials" radius="xl" size={30} />
        <div className={classes.meta}>
          <Text className={classes.name}>{name}</Text>
          <Text className={classes.mail}>{email}</Text>
        </div>
        <IconDots size={16} className={classes.dots} />
      </Group>
    </UnstyledButton>
  );
}
