'use client'

import { Accordion } from '@mantine/core'
import { Text } from '@/components/admin/primitives/Text'
import { SageParameters } from './SageParameters'
import { ChatThresholds } from './ChatThresholds'
import { InviteGate } from './InviteGate'
import { Appearance } from './Appearance'

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <Text variant="title">Settings</Text>
      </div>
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <Accordion multiple variant="separated" defaultValue={[]}>
          <Accordion.Item value="parameters">
            <Accordion.Control>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 'var(--mantine-font-size-md)' }}>Parameters</span>
              <span style={{ display: 'block', fontSize: 'var(--mantine-font-size-sm)', color: 'var(--mantine-color-dimmed)' }}>Values Sage uses in conversation, such as booking links.</span>
            </Accordion.Control>
            <Accordion.Panel>
              <SageParameters />
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="thresholds">
            <Accordion.Control>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 'var(--mantine-font-size-md)' }}>Chat Thresholds</span>
              <span style={{ display: 'block', fontSize: 'var(--mantine-font-size-sm)', color: 'var(--mantine-color-dimmed)' }}>How long Sage waits before moving a session from In-progress → Active → Abandoned.</span>
            </Accordion.Control>
            <Accordion.Panel>
              <ChatThresholds />
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="invite-gate">
            <Accordion.Control>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 'var(--mantine-font-size-md)' }}>Invite Gate</span>
              <span style={{ display: 'block', fontSize: 'var(--mantine-font-size-sm)', color: 'var(--mantine-color-dimmed)' }}>Control whether this chat requires membership or an invite to access.</span>
            </Accordion.Control>
            <Accordion.Panel>
              <InviteGate />
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="appearance">
            <Accordion.Control>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 'var(--mantine-font-size-md)' }}>Appearance</span>
              <span style={{ display: 'block', fontSize: 'var(--mantine-font-size-sm)', color: 'var(--mantine-color-dimmed)' }}>Colors, fonts, and brand tokens for your storefront.</span>
            </Accordion.Control>
            <Accordion.Panel>
              <Appearance />
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </div>
    </div>
  )
}
