'use client'

import { useState } from 'react'
import { Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { CompilePublishModal } from '@/components/admin/prompt-studio/CompilePublishModal'

interface PreviewResponse {
  content: string
  tokenCount: number
}

interface CompileResponse {
  success: boolean
  version: number
  tokenCount: number
  content: string
  updatedAt: string
}

interface PublishButtonProps {
  activeSetId: string | null
  activeSetLabel: string
}

export function PublishButton({ activeSetId, activeSetLabel }: PublishButtonProps) {
  const [compileOpen, setCompileOpen] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [compiledText, setCompiledText] = useState('')
  const [compiledVersion, setCompiledVersion] = useState(0)

  async function handleCompile() {
    setCompiling(true)
    setCompileOpen(true)
    try {
      const res = await fetch('/api/admin/prompt/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_set_id: activeSetId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setCompileOpen(false)
        notifications.show({
          color: 'red',
          title: 'Compile failed',
          message: data?.error ?? 'Compile failed',
        })
        return
      }
      const data: PreviewResponse = await res.json()
      setCompiledText(data.content)
    } catch (err) {
      setCompileOpen(false)
      notifications.show({
        color: 'red',
        title: 'Compile failed',
        message: 'Network error — could not reach the server.',
      })
    } finally {
      setCompiling(false)
    }
  }

  async function handlePublish() {
    try {
      const res = await fetch('/api/admin/prompt/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_set_id: activeSetId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        notifications.show({
          color: 'red',
          title: 'Publish failed',
          message: data?.error ?? 'Publish failed',
        })
        return
      }
      const data: CompileResponse = await res.json()
      setCompiledVersion(data.version)
      setCompileOpen(false)
      notifications.show({
        color: 'green',
        title: 'Prompt published',
        message: `Version ${data.version}`,
      })
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Publish failed',
        message: 'Network error — could not reach the server.',
      })
    }
  }

  return (
    <>
      <Button color="brand" size="sm" onClick={handleCompile}>
        Compile &amp; Publish
      </Button>
      <CompilePublishModal
        opened={compileOpen}
        onClose={() => setCompileOpen(false)}
        compiling={compiling}
        text={compiledText}
        set={{ id: activeSetId ?? '', label: activeSetLabel }}
        version={compiledVersion}
        onPublish={handlePublish}
      />
    </>
  )
}
