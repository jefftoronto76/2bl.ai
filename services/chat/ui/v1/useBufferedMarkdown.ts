'use client'

import { useMemo } from 'react'
import { bufferMarkdown } from './bufferMarkdown'

/**
 * Returns `content` with any incomplete trailing markdown token held back,
 * when `active` (this is the message currently being streamed into).
 * Returns `content` unchanged once streaming has moved on or finished —
 * already-settled messages never need buffering.
 */
export function useBufferedMarkdown(content: string, active: boolean): string {
  return useMemo(() => (active ? bufferMarkdown(content) : content), [content, active])
}
