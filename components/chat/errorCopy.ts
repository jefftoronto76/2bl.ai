// components/chat/errorCopy.ts
//
// On-brand copy for each classified chat error type (see ChatErrorType in
// services/chat/ui/v1/types.ts). Shared by both chat surfaces' error banners
// (components/shells/widget/WidgetShell.tsx, components/shells/membership/MessageList.tsx).

import type { ChatErrorType } from '@/services/chat/ui/v1/types'

export const ERROR_COPY: Record<ChatErrorType, string> = {
  network: "It looks like you've lost your connection. Check your internet and try again.",
  rate_limited: "We're getting a lot of messages right now. Give it a moment and try again.",
  stream_interrupted: "Your response was cut off. Tap retry and we'll pick it up.",
  auth_error: 'Your session has expired. Refresh the page to continue.',
  unknown: "Something went sideways on our end. It's not you — try again in a moment.",
}
