'use client'

import { useState } from 'react'
import { Stack, Textarea, Group, Alert, ActionIcon, Tooltip, Button, Text as MantineText } from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { IconCopy, IconCheck } from '@tabler/icons-react'
import { Text } from '@/components/admin/primitives/Text'
import { PromptFullnessMeter } from '@/components/admin/primitives/PromptFullnessMeter'

type Issue = { description: string; offendingText: string | null }
type CheckResult = { pass: boolean; issues: Issue[] }
type Status = 'idle' | 'checking' | 'saving' | 'saved' | 'error'

export type HistoryEntry = {
  id: string
  version: number
  content: string
  saved_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export function PromptEditor({
  initialPrompt,
  initialVersion,
  initialHistory,
}: {
  initialPrompt: string
  initialVersion: number
  initialHistory: HistoryEntry[]
}) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [status, setStatus] = useState<Status>('idle')
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null)
  const [savedVersion, setSavedVersion] = useState(initialVersion)
  const [errorMsg, setErrorMsg] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>(initialHistory)
  const clipboard = useClipboard({ timeout: 2000 })

  const handleChange = (value: string) => {
    setPrompt(value)
    if (checkResult) setCheckResult(null)
    if (status === 'saved' || status === 'error') setStatus('idle')
  }

  const removeOffendingText = (offendingText: string) => {
    const cleaned = prompt
      .split(offendingText)
      .join('')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    handleChange(cleaned)
  }

  const runCheck = async () => {
    setStatus('checking')
    setCheckResult(null)
    setErrorMsg('')

    try {
      const res = await fetch('/api/admin/prompt/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const result: CheckResult = await res.json()
      setCheckResult(result)

      if (result.pass) {
        await runSave(result)
      } else {
        setStatus('idle')
      }
    } catch {
      setStatus('error')
      setErrorMsg('Safety check failed. Please try again.')
    }
  }

  const runSave = async (result: CheckResult | null) => {
    setStatus('saving')
    const prevPrompt = initialPrompt

    try {
      const res = await fetch('/api/admin/prompt/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, checkResult: result }),
      })
      const data = await res.json()

      if (data.version) {
        if (savedVersion > 0) {
          const archivedEntry: HistoryEntry = {
            id: `local-${savedVersion}`,
            version: savedVersion,
            content: prevPrompt,
            saved_at: new Date().toISOString(),
          }
          setHistory((prev) => [archivedEntry, ...prev])
        }
        setSavedVersion(data.version)
        setStatus('saved')
        setCheckResult(null)
      } else {
        throw new Error(data.error || 'Save failed')
      }
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Save failed. Please try again.')
    }
  }

  const busy = status === 'checking' || status === 'saving'
  const showFailResult = checkResult && !checkResult.pass && status === 'idle'

  return (
    <Stack gap="md">
      <PromptFullnessMeter bodies={[prompt]} />

      <Group justify="space-between" wrap="nowrap">
        <Text
          variant="muted"
          style={{
            fontFamily: 'var(--mantine-font-family-monospace)',
            fontSize: 'var(--mantine-font-size-xs)',
          }}
        >
          Version: {savedVersion > 0 ? `v${savedVersion}` : '—'}
        </Text>

        <Tooltip label={clipboard.copied ? 'Copied!' : 'Copy prompt'} withArrow position="left">
          <ActionIcon
            variant="subtle"
            color={clipboard.copied ? 'teal' : 'gray'}
            size="md"
            aria-label="Copy prompt to clipboard"
            onClick={() => clipboard.copy(prompt)}
          >
            {clipboard.copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
          </ActionIcon>
        </Tooltip>
      </Group>

      <Textarea
        value={prompt}
        onChange={(e) => handleChange(e.target.value)}
        disabled={busy}
        autosize
        minRows={8}
        maxRows={40}
        styles={{
          input: {
            fontFamily: 'var(--mantine-font-family-monospace)',
            fontSize: 'var(--mantine-font-size-sm)',
            lineHeight: 1.6,
          },
        }}
      />

      {showFailResult && (
        <Alert color="orange" variant="light" radius="sm">
          <Stack gap="xs">
            {checkResult.issues.map((issue, i) => {
              const canRemove = !!issue.offendingText && prompt.includes(issue.offendingText)
              return (
                <Group key={i} justify="space-between" wrap="nowrap" align="flex-start">
                  <MantineText size="sm">{issue.description}</MantineText>
                  {canRemove && (
                    <Button
                      variant="subtle"
                      size="xs"
                      color="orange"
                      onClick={() => removeOffendingText(issue.offendingText!)}
                    >
                      Remove
                    </Button>
                  )}
                </Group>
              )
            })}
          </Stack>
        </Alert>
      )}

      {status === 'error' && (
        <Alert color="red" variant="light" radius="sm">
          <MantineText size="sm">{errorMsg}</MantineText>
        </Alert>
      )}

      {status === 'saved' && (
        <Alert color="teal" variant="light" radius="sm">
          <MantineText size="sm">Saved. Version {savedVersion}.</MantineText>
        </Alert>
      )}

      <Group gap="sm">
        <Button
          color="green"
          loading={busy}
          disabled={!prompt.trim()}
          onClick={runCheck}
        >
          Check & Save
        </Button>

        {showFailResult && (
          <Button
            variant="outline"
            color="orange"
            onClick={() => runSave(checkResult)}
          >
            Save Anyway
          </Button>
        )}
      </Group>

      {history.length > 0 && (
        <Stack gap="xs" mt="xl">
          <MantineText
            size="xs"
            c="dimmed"
            style={{
              fontFamily: 'var(--mantine-font-family-monospace)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Version History
          </MantineText>
          {history.map((entry) => (
            <Group key={entry.id} justify="space-between" wrap="nowrap">
              <Group gap="xl" wrap="nowrap">
                <MantineText
                  size="xs"
                  c="dimmed"
                  style={{ fontFamily: 'var(--mantine-font-family-monospace)', minWidth: '32px' }}
                >
                  v{entry.version}
                </MantineText>
                <MantineText
                  size="xs"
                  c="dimmed"
                  style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
                >
                  {formatDate(entry.saved_at)}
                </MantineText>
              </Group>
              <Button variant="subtle" size="xs" onClick={() => handleChange(entry.content)}>
                Restore
              </Button>
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
