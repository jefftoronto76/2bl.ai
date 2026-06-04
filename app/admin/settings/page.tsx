import { Stack } from '@mantine/core'
import { Text } from '@/components/admin/primitives/Text'
import { SageParameters } from './SageParameters'
import { ChatThresholds } from './ChatThresholds'

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <Text variant="title">Settings</Text>
      </div>
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <Stack gap="lg">
          <section aria-labelledby="parameters-heading">
            <SageParameters />
          </section>
          <section aria-labelledby="thresholds-heading">
            <ChatThresholds />
          </section>
        </Stack>
      </div>
    </div>
  )
}
