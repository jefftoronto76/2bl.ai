'use client'

import { useState } from 'react'
import { Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { CompilePublishModal } from '@/components/admin/prompt-studio/CompilePublishModal'

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
      const res = await fetch('/api/admin/prompt/compile', {
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
      const data: CompileResponse = await res.json()
      setCompiledText(data.content)
      setCompiledVersion(data.version)
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

  function handlePublish() {
    setCompileOpen(false)
    notifications.show({
      color: 'green',
      title: 'Prompt published',
      message: `Version ${compiledVersion}`,
    })
  }

  return (
    <>
      <Button variant="filled" color="green" size="sm" onClick={handleCompile}>
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
