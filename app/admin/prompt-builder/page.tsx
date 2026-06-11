'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'

import { Select, TextInput, Textarea, Collapse, ActionIcon, Checkbox, Stack, Group, Badge, SimpleGrid, Menu, Progress, Skeleton, Alert, Button as MantineButton, Tooltip } from '@mantine/core'
import {
  IconFile,
  IconBrandGoogleDrive,
  IconBrandDropbox,
  IconBox,
  IconScreenshot,
  IconCheck,
  IconPencil,
} from '@tabler/icons-react'
import { useAuthUser } from '@/services/auth/client'
import { Button } from '@/components/admin/primitives/Button'
import { Card } from '@/components/admin/primitives/Card'
import { Text } from '@/components/admin/primitives/Text'
import { useAdminUserId } from '@/services/auth/admin-user-context'
import { readDataStream } from '@/services/chat/server/stream-utils'

// ─── Types & constants ───────────────────────────────────────────────────────

type BlockType = 'identity' | 'knowledge' | 'guardrail' | 'process' | 'escalation'

interface Topic {
  id: string
  name: string
  type: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface DraftBlock {
  title: string
  content: string
  suggestedType?: BlockType
  suggestedTopic?: string
  warning?: string
}

interface ExistingBlock {
  id: string
  title: string
  type: string
  body: string
  is_default: boolean
}

interface DraftCardMeta {
  blockName: string
  type: BlockType | ''
  topicName: string
  isDefault: boolean
  saveError: string | null
  isSaving: boolean
  isChecking: boolean
  issues: CheckIssue[]
  warning: string | null
}

interface CheckIssue {
  description: string
  offendingText: string | null
}

interface CheckResult {
  ok: boolean
  issues: CheckIssue[]
}

const TYPES: { value: BlockType; label: string }[] = [
  { value: 'identity', label: 'Identity & Voice' },
  { value: 'knowledge', label: 'Knowledge' },
  { value: 'guardrail', label: 'Guardrail' },
  { value: 'process', label: 'Process' },
  { value: 'escalation', label: 'Escalation' },
]

const VALID_TYPES = new Set<string>(TYPES.map(t => t.value))

const MAX_EXCHANGES = 10
const WARN_THRESHOLD = 8

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PromptBuilderPage() {
  const ownerId = useAdminUserId()
  const { user: authUser } = useAuthUser()
  const isPlatformAdmin = authUser?.isPlatformAdmin === true

  // Topics from Supabase
  const [allTopics, setAllTopics] = useState<Topic[]>([])
  const [topicsLoading, setTopicsLoading] = useState(true)

  // Form state (metadata)
  const [type, setType] = useState<BlockType | ''>('')
  const [topicId, setTopicId] = useState<string>('')
  const [newTopicMode, setNewTopicMode] = useState(false)
  const [newTopicName, setNewTopicName] = useState('')
  const [isCreatingTopic, setIsCreatingTopic] = useState(false)
  const [blockName, setBlockName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [metadataOpen, setMetadataOpen] = useState(false)

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [draftBlocks, setDraftBlocks] = useState<DraftBlock[]>([])
  const [draftMetas, setDraftMetas] = useState<DraftCardMeta[]>([])
  const [editingCardIndex, setEditingCardIndex] = useState<number | null>(null)
  const [editingCardBody, setEditingCardBody] = useState('')
  const [closingMessage, setClosingMessage] = useState<string | null>(null)
  const [loadingStatusIndex, setLoadingStatusIndex] = useState(0)
  const [contentId, setContentId] = useState<string | null>(null)
  const [fileUploading, setFileUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [uploadedRaw, setUploadedRaw] = useState<string | null>(null)
  const [pendingAutoTrigger, setPendingAutoTrigger] = useState(false)
  const [sessionStartIndex, setSessionStartIndex] = useState(0)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [existingBlocks, setExistingBlocks] = useState<ExistingBlock[]>([])
  const [hasOpeningChoice, setHasOpeningChoice] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Exchange counter — counts user messages in the current session only
  const exchangeCount = chatMessages.slice(sessionStartIndex).filter(m => m.role === 'user').length
  const isAtLimit = exchangeCount >= MAX_EXCHANGES

  // Derived
  const filteredTopics = allTopics.filter(t => t.type === type)
  const selectedTopic = allTopics.find(t => t.id === topicId)

  // Fetch topics on mount
  const fetchTopics = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/topics')
      if (!res.ok) return
      const data: Topic[] = await res.json()
      setAllTopics(data)
    } catch (err) {
      console.error('[fetchTopics] failed:', err)
    } finally {
      setTopicsLoading(false)
    }
  }, [])

  useEffect(() => { fetchTopics() }, [fetchTopics])

  useEffect(() => {
    async function fetchBlocks() {
      try {
        const res = await fetch('/api/admin/blocks')
        if (!res.ok) return
        const data: ExistingBlock[] = await res.json()
        setExistingBlocks(data)
      } catch (err) {
        console.error('[fetchBlocks] failed:', err)
      }
    }
    fetchBlocks()
  }, [])

  useEffect(() => {
    if (filteredTopics.length > 0 && !filteredTopics.find(t => t.id === topicId)) {
      setTopicId(filteredTopics[0].id)
    }
  }, [type, filteredTopics, topicId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  // Cycle through timed status messages while loading skeleton cards.
  // Stays on the last message once reached. Resets when loading stops.
  useEffect(() => {
    if (!chatLoading) {
      setLoadingStatusIndex(0)
      return
    }
    const t1 = setTimeout(() => setLoadingStatusIndex(1), 4000)
    const t2 = setTimeout(() => setLoadingStatusIndex(2), 8000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [chatLoading])

  // Auto-trigger Composer after a successful upload.
  // Runs in a fresh render cycle so all upload state (uploadedRaw, file=null,
  // fileUploading=false) has committed and sendChatMessage's closure is current.
  useEffect(() => {
    if (!pendingAutoTrigger || !uploadedRaw) return
    setPendingAutoTrigger(false)

    const triggerMsg: ChatMessage = {
      role: 'user',
      content: "I've uploaded a document. Please analyze it and suggest the most useful blocks for Sage.",
      timestamp: Date.now(),
    }
    sendChatMessage([triggerMsg])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoTrigger, uploadedRaw])

  function handleOpeningChoice(choice: 'summarize' | 'opportunities' | 'new') {
    setHasOpeningChoice(true)
    if (choice === 'new') {
      setChatMessages([{
        role: 'assistant',
        content: "Sounds great — to get started, just type in what you're thinking for the block.",
        timestamp: Date.now(),
      }])
      textareaRef.current?.focus()
      return
    }
    let trigger: string
    if (choice === 'summarize') {
      const hasCustom = existingBlocks.some(b => !b.is_default)
      if (hasCustom) {
        const types = [...new Set(existingBlocks.map(b => b.type))]
        trigger = `The owner has ${existingBlocks.length} existing blocks covering: ${types.join(', ')}. Write a short opening message summarizing what's covered, identifying any missing block types, and suggesting what to build next. Do NOT output the done JSON. Do NOT draft any new blocks.`
      } else {
        trigger = 'The owner only has default starter blocks — no custom blocks yet. Write a short opening message acknowledging the foundation is set and suggesting they customize or add blocks specific to their business. Do NOT output the done JSON. Do NOT draft any new blocks.'
      }
    } else {
      trigger = 'The owner wants to know how to improve their current prompt. Based on the existing blocks listed above, identify gaps (missing block types, weak coverage, potential conflicts) and suggest 2-3 specific improvements. Do NOT output the done JSON. Do NOT draft any new blocks.'
    }
    sendChatMessage([], trigger)
  }

  function resetChat() {
    setChatMessages([])
    setChatInput('')
    setChatLoading(false)
    setDraftBlocks([])
    setDraftMetas([])
    setEditingCardIndex(null)
    setEditingCardBody('')
    setClosingMessage(null)
    setContentId(null)
    setFile(null)
    setFileUploading(false)
    setUploadError(null)
    setUploadedFileName(null)
    setUploadedRaw(null)
    setPendingAutoTrigger(false)
  }

  async function handleFileUpload(f: File) {
    setFile(f)
    setFileUploading(true)
    setUploadError(null)
    setUploadedFileName(null)

    const formData = new FormData()
    formData.append('file', f)

    try {
      const res = await fetch('/api/admin/assets/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setUploadError(data?.error ?? 'Upload failed')
        setFile(null)
        return
      }

      const data: { content_id: string; name: string; raw: string } = await res.json()
      setContentId(data.content_id)
      setUploadedFileName(data.name)
      setUploadedRaw(data.raw)
      setFile(null)
      setPendingAutoTrigger(true)
    } catch (err) {
      console.error('[handleFileUpload] failed:', err)
      setUploadError('Network error — could not upload file')
      setFile(null)
    } finally {
      setFileUploading(false)
    }
  }

  function handleCopyBubble(index: number, content: string) {
    navigator.clipboard.writeText(content)
    setCopiedId(index)
    setTimeout(() => setCopiedId(null), 1000)
  }

  function handleCopyAll() {
    const text = chatMessages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n\n')
    navigator.clipboard.writeText(text)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 1500)
  }

  function handleTypeChange(value: string | null) {
    const newType = (value ?? '') as BlockType | ''
    setType(newType)
    setTopicId('')
    setNewTopicMode(false)
  }

  function handleTopicChange(value: string | null) {
    if (value === '__new__') {
      setNewTopicMode(true)
      setNewTopicName('')
    } else {
      setNewTopicMode(false)
      setTopicId(value ?? '')
    }
  }

  function cancelNewTopic() {
    setNewTopicMode(false)
    setNewTopicName('')
  }

  async function confirmNewTopic() {
    const name = newTopicName.trim()
    if (!name) return

    setIsCreatingTopic(true)
    try {
      const res = await fetch('/api/admin/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type }),
      })
      if (!res.ok) {
        console.error('[confirmNewTopic] insert failed:', await res.json())
        return
      }
      const newTopic: Topic = await res.json()
      setAllTopics(prev => [...prev, newTopic])
      setTopicId(newTopic.id)
      setNewTopicMode(false)
      setNewTopicName('')
    } catch (err) {
      console.error('[confirmNewTopic] request failed:', err)
    } finally {
      setIsCreatingTopic(false)
    }
  }

  function parseAllDoneJson(text: string): { displayText: string; drafts: DraftBlock[]; closingMessage: string | null } {
    const drafts: DraftBlock[] = []
    let displayText = text

    // Match JSON objects containing "done":true anywhere in the text.
    // Uses a balanced-brace approach: find { then count braces to find the matching }.
    const jsonStarts: number[] = []
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') jsonStarts.push(i)
    }

    const matched: { start: number; end: number }[] = []
    for (const start of jsonStarts) {
      let depth = 0
      let end = -1
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++
        else if (text[i] === '}') {
          depth--
          if (depth === 0) { end = i; break }
        }
      }
      if (end === -1) continue

      const candidate = text.slice(start, end + 1)
      try {
        const parsed = JSON.parse(candidate)
        if (parsed.done && parsed.title && parsed.content) {
          const draft: DraftBlock = { title: parsed.title, content: parsed.content }
          if (typeof parsed.type === 'string' && VALID_TYPES.has(parsed.type.toLowerCase())) {
            draft.suggestedType = parsed.type.toLowerCase() as BlockType
          }
          if (typeof parsed.topic === 'string' && parsed.topic.trim()) {
            draft.suggestedTopic = parsed.topic.trim()
          }
          if (typeof parsed.warning === 'string' && parsed.warning.trim()) {
            draft.warning = parsed.warning.trim()
          }
          drafts.push(draft)
          matched.push({ start, end: end + 1 })
        }
      } catch { /* not valid JSON — skip */ }
    }

    // Extract closing message — text after the last matched JSON object.
    // Strip leading markdown artifacts (backticks, dashes, whitespace).
    let closingMessage: string | null = null
    if (matched.length > 0) {
      const lastEnd = matched[matched.length - 1].end
      const trailing = text.slice(lastEnd).replace(/^[\s`\-]+/, '').trim()
      closingMessage = trailing.length > 0 ? trailing : null
    }

    // Strip matched JSON from display text (reverse order to preserve indices)
    for (let i = matched.length - 1; i >= 0; i--) {
      displayText = displayText.slice(0, matched[i].start) + displayText.slice(matched[i].end)
    }

    return { displayText: displayText.trim(), drafts, closingMessage }
  }

  async function sendChatMessage(messages: ChatMessage[], hiddenPrompt?: string) {
    setChatLoading(true)
    setClosingMessage(null)
    const placeholderMsg: ChatMessage = { role: 'assistant', content: '', timestamp: Date.now() }
    setChatMessages([...messages, placeholderMsg])

    try {
      const contentType = file ? 'upload' : 'text'
      const raw = file ? file.name : chatInput
      const topicName = selectedTopic?.name ?? ''

      const apiMessages = [
        ...(hiddenPrompt ? [{ role: 'user', content: hiddenPrompt }] : []),
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ]

      const response = await fetch('/api/admin/blocks/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          topic: topicName,
          content_type: contentType,
          content: raw,
          messages: apiMessages,
          ...(uploadedRaw ? { documentContext: uploadedRaw } : {}),
          ...(existingBlocks.length > 0 ? { existingBlocks: existingBlocks.map(b => ({ title: b.title, type: b.type, body: b.body })) } : {}),
        }),
      })

      if (!response.ok) throw new Error(`API error: ${response.status}`)

      const finalText = await readDataStream(response, (accumulated) => {
        const { displayText } = parseAllDoneJson(accumulated)
        setChatMessages([...messages, { role: 'assistant', content: displayText, timestamp: placeholderMsg.timestamp }])
      })

      const { displayText, drafts, closingMessage: parsedClosing } = parseAllDoneJson(finalText)
      console.log('[parseAllDoneJson] finalText length:', finalText.length, 'drafts found:', drafts.length, 'finalText tail:', finalText.slice(-300))
      setChatMessages([...messages, { role: 'assistant', content: displayText, timestamp: placeholderMsg.timestamp }])
      setClosingMessage(parsedClosing)
      if (drafts.length > 0) {
        setDraftBlocks(drafts)
        console.log('[setDraftBlocks] drafts:', JSON.stringify(drafts.map(d => ({ title: d.title, type: d.suggestedType }))))
        setDraftMetas(drafts.map(d => ({
          blockName: d.title,
          type: d.suggestedType ?? '',
          topicName: d.suggestedTopic ?? '',
          isDefault: false,
          saveError: null,
          isSaving: false,
          isChecking: false,
          issues: [],
          warning: d.warning ?? null,
        })))
      }
    } catch (err) {
      console.error('[chat] request failed:', err)
      setChatMessages(messages)
    } finally {
      setChatLoading(false)
    }
  }

  async function handleSend() {
    const text = chatInput.trim()
    if (!text || chatLoading || isAtLimit) return

    setChatInput('')
    setDraftBlocks([])
    setDraftMetas([])
    setEditingCardIndex(null)
    setEditingCardBody('')
    setClosingMessage(null)
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() }
    const updated = [...chatMessages, userMsg]
    await sendChatMessage(updated)
    textareaRef.current?.focus()
  }

  function updateDraftMeta(index: number, updates: Partial<DraftCardMeta>) {
    setDraftMetas(prev => prev.map((m, i) => i === index ? { ...m, ...updates } : m))
  }

  function removeDraft(index: number) {
    setDraftBlocks(prev => prev.filter((_, i) => i !== index))
    setDraftMetas(prev => prev.filter((_, i) => i !== index))
    if (editingCardIndex === index) {
      setEditingCardIndex(null)
      setEditingCardBody('')
    }
  }

  function handleEditCard(index: number) {
    const draft = draftBlocks[index]
    if (!draft) return
    setEditingCardIndex(index)
    setEditingCardBody(draft.content)
  }

  function handleCancelEditCard() {
    setEditingCardIndex(null)
    setEditingCardBody('')
  }

  function handleSaveEditCard(index: number) {
    setDraftBlocks(prev => prev.map((d, i) => (i === index ? { ...d, content: editingCardBody } : d)))
    setEditingCardIndex(null)
    setEditingCardBody('')
  }

  async function runCardSafetyCheck(body: string): Promise<CheckResult> {
    console.log('[PromptBuilder] card safety check dispatch, length:', body.length)
    try {
      const res = await fetch('/api/admin/prompt/compile/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) {
        console.error('[PromptBuilder] card safety check HTTP error:', res.status)
        return { ok: true, issues: [] }
      }
      const data: CheckResult = await res.json()
      console.log('[PromptBuilder] card safety check result:', {
        ok: data.ok,
        issueCount: data.issues?.length ?? 0,
      })
      return {
        ok: data.ok === true,
        issues: Array.isArray(data.issues) ? data.issues : [],
      }
    } catch (err) {
      console.error('[PromptBuilder] card safety check failed:', err)
      return { ok: true, issues: [] }
    }
  }

  async function saveBlockToSupabase(index: number, draft: DraftBlock, meta: DraftCardMeta): Promise<boolean> {
    if (!ownerId) return false

    updateDraftMeta(index, { saveError: null, isSaving: true })
    try {
      // Resolve topic: find existing or create new
      let topicId = ''
      if (meta.topicName.trim() && meta.type) {
        const existing = allTopics.find(
          t => t.type === meta.type && t.name.toLowerCase() === meta.topicName.trim().toLowerCase()
        )
        if (existing) {
          topicId = existing.id
        } else {
          const topicRes = await fetch('/api/admin/topics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: meta.topicName.trim(), type: meta.type }),
          })
          if (topicRes.ok) {
            const newTopic: Topic = await topicRes.json()
            setAllTopics(prev => [...prev, newTopic])
            topicId = newTopic.id
          }
        }
      }

      console.log('[PromptBuilder] card save dispatch:', { index, title: meta.blockName })
      const res = await fetch('/api/admin/blocks/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: meta.type,
          topic_id: topicId || null,
          title: meta.blockName.trim(),
          body: draft.content,
          source_id: contentId,
          owner_id: ownerId,
          is_default: meta.isDefault,
          messages: chatMessages.slice(sessionStartIndex).map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        console.error('[PromptBuilder] card save failed:', data?.error ?? res.status)
        updateDraftMeta(index, { saveError: data?.error ?? 'Failed to save block.', isSaving: false })
        return false
      }

      console.log('[PromptBuilder] card save success:', { index })
      removeDraft(index)

      // If all drafts saved, inject continuation message
      if (draftBlocks.length <= 1) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: 'Block saved! What would you like to build next?', timestamp: Date.now() }])
        setSessionStartIndex(chatMessages.length + 1)
        textareaRef.current?.focus()
      }
      return true
    } catch (err) {
      console.error('[PromptBuilder] card save request failed:', err)
      updateDraftMeta(index, { saveError: 'Network error — could not reach the server.', isSaving: false })
      return false
    }
  }

  async function handleCheckAndSaveBlock(index: number) {
    const draft = draftBlocks[index]
    const meta = draftMetas[index]
    if (!draft || !meta || !ownerId) return

    // Validate required fields before spending a check call
    const missing: string[] = []
    if (!meta.type) missing.push('type')
    if (!meta.blockName.trim()) missing.push('block name')
    if (missing.length > 0) {
      updateDraftMeta(index, { saveError: `Missing required fields: ${missing.join(', ')}.` })
      return
    }

    console.log('[PromptBuilder] check & save card:', { index })
    // Clear stale issues and errors before running
    updateDraftMeta(index, { isChecking: true, issues: [], saveError: null })
    const result = await runCardSafetyCheck(draft.content)

    if (!result.ok && result.issues.length > 0) {
      console.log('[PromptBuilder] card check flagged issues, keeping card open:', { index, count: result.issues.length })
      updateDraftMeta(index, { isChecking: false, issues: result.issues })
      return
    }

    // Clean — proceed to save
    console.log('[PromptBuilder] card check clean, dispatching save:', { index })
    updateDraftMeta(index, { isChecking: false })
    await saveBlockToSupabase(index, draft, meta)
  }

  async function handleSaveAnywayBlock(index: number) {
    const draft = draftBlocks[index]
    const meta = draftMetas[index]
    if (!draft || !meta || !ownerId) return

    const missing: string[] = []
    if (!meta.type) missing.push('type')
    if (!meta.blockName.trim()) missing.push('block name')
    if (missing.length > 0) {
      updateDraftMeta(index, { saveError: `Missing required fields: ${missing.join(', ')}.` })
      return
    }

    console.log('[PromptBuilder] card save anyway (bypass check):', { index })
    // Clear issues so they don't linger after the bypass save
    updateDraftMeta(index, { issues: [], saveError: null })
    await saveBlockToSupabase(index, draft, meta)
  }

  function handleRemoveOffendingFromCard(index: number, offendingText: string) {
    console.log('[PromptBuilder] remove offending from card:', { index, length: offendingText.length })
    setDraftBlocks(prev => prev.map((d, i) => (
      i === index ? { ...d, content: d.content.replace(offendingText, '') } : d
    )))
    // Drop this issue and any duplicates referencing the same offendingText
    setDraftMetas(prev => prev.map((m, i) => {
      if (i !== index) return m
      return { ...m, issues: m.issues.filter(iss => iss.offendingText !== offendingText) }
    }))
  }


  // ─── Render ──────────────────────────────────────────────────────────────────

  const hasMessages = chatMessages.length > 0

  /* Shared composer container — bordered box with textarea + button row */
  const composerContainer = (
    <div
      className="mx-auto w-full max-w-[800px]"
      style={{
        border: '1px solid var(--mantine-color-gray-3)',
        borderRadius: 'var(--mantine-radius-md)',
        boxShadow: hasMessages ? undefined : '0 2px 8px rgba(0,0,0,0.04)',
        overflow: 'hidden',
      }}
    >
      {/* Textarea — unstyled, no border */}
      <Textarea
        ref={textareaRef}
        value={chatInput}
        onChange={e => setChatInput(e.currentTarget.value)}
        placeholder={isAtLimit ? 'Exchange limit reached' : 'Type or paste content...'}
        autosize
        minRows={hasMessages ? 1 : 2}
        maxRows={4}
        disabled={isAtLimit}
        variant="unstyled"
        styles={{
          input: {
            padding: hasMessages ? '12px 16px' : '16px 20px',
            fontSize: '16px',
            lineHeight: 1.5,
          },
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
          }
        }}
      />

      {/* Button row — inside container */}
      <Group
        justify="space-between"
        style={{ padding: hasMessages ? '4px 8px 8px' : '8px 12px 12px' }}
      >
        {/* Left: upload menu */}
        <Menu position="top-start" withinPortal shadow="md">
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              aria-label="Add content"
              disabled={isAtLimit}
            >
              <svg viewBox="0 0 16 16" width={16} height={16} fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 3v10M3 8h10" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconFile size={16} />}
              onClick={() => fileInputRef.current?.click()}
            >
              Add files
            </Menu.Item>
            <Menu.Item leftSection={<IconBrandGoogleDrive size={16} />} disabled>
              Google Drive
            </Menu.Item>
            <Menu.Item leftSection={<IconBrandDropbox size={16} />} disabled>
              Dropbox
            </Menu.Item>
            <Menu.Item leftSection={<IconBox size={16} />} disabled>
              Box
            </Menu.Item>
            <Menu.Item leftSection={<IconScreenshot size={16} />} disabled>
              Take a screenshot
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={e => {
            const f = e.target.files?.[0] ?? null
            if (f) handleFileUpload(f)
            e.target.value = ''
          }}
          style={{ display: 'none' }}
        />

        {/* Right: send */}
        <ActionIcon
          variant="filled"
          size="lg"
          onClick={handleSend}
          disabled={chatLoading || isAtLimit || !chatInput.trim()}
          aria-label="Send message"
        >
          <svg viewBox="0 0 16 16" width={16} height={16} fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 8h10M9 4l4 4-4 4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </ActionIcon>
      </Group>

      {/* File upload status */}
      {fileUploading && (
        <Stack gap={4} px="sm" pb="xs" mt={-4}>
          <span
            style={{
              color: 'var(--mantine-color-dimmed)',
              fontFamily: 'var(--mantine-font-family)',
              fontSize: 'var(--mantine-font-size-xs)',
            }}
          >
            Processing your document...
          </span>
          <Progress size="xs" animated value={100} />
        </Stack>
      )}
      {uploadedFileName && !fileUploading && (
        <Group gap="xs" px="sm" pb="xs" mt={-4}>
          <span
            style={{
              color: 'var(--mantine-color-green-6)',
              fontFamily: 'var(--mantine-font-family)',
              fontSize: 'var(--mantine-font-size-xs)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <IconCheck size={12} style={{ marginRight: 4 }} />
            Saved to assets.
          </span>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="xs"
            onClick={() => { setUploadedFileName(null); setContentId(null); setUploadedRaw(null) }}
            aria-label="Remove file"
          >
            ✕
          </ActionIcon>
        </Group>
      )}
      {uploadError && !fileUploading && (
        <Group gap="xs" px="sm" pb="xs" mt={-4}>
          <span
            style={{
              color: 'var(--mantine-color-red-6)',
              fontFamily: 'var(--mantine-font-family)',
              fontSize: 'var(--mantine-font-size-xs)',
            }}
          >
            {uploadError}
          </span>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="xs"
            onClick={() => setUploadError(null)}
            aria-label="Dismiss error"
          >
            ✕
          </ActionIcon>
        </Group>
      )}
    </div>
  )

  /* Shared metadata trigger + collapsible fields */
  const metadataSection = (
    <div className={hasMessages ? '' : 'w-full max-w-[800px] max-sm:max-w-full'}>
      <button
        type="button"
        onClick={() => setMetadataOpen(o => !o)}
        className="flex items-center gap-1 bg-transparent border-none cursor-pointer px-0 py-1"
        style={{
          color: 'var(--mantine-color-dimmed)',
          fontFamily: 'var(--mantine-font-family)',
          fontSize: '12px',
        }}
        aria-expanded={metadataOpen}
      >
        Block metadata
        <span
          style={{
            display: 'inline-block',
            transition: 'transform 150ms ease',
            transform: metadataOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            fontSize: '10px',
          }}
        >
          ▾
        </span>
      </button>

      <Collapse in={metadataOpen}>
        <Stack gap="sm" pt="xs">
          {/* Row 1: Type + Topic side by side */}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Select
              label="Type"
              placeholder="Select a type..."
              data={TYPES}
              value={type || null}
              onChange={handleTypeChange}
              allowDeselect={false}
              size="sm"
            />

            {type && (
              <Stack gap={6}>
                {topicsLoading ? (
                  <Text variant="muted" className="text-xs">Loading topics...</Text>
                ) : (
                  <Select
                    label="Topic"
                    placeholder="Select a topic..."
                    data={[
                      ...filteredTopics.map(t => ({ value: t.id, label: t.name })),
                      { value: '__new__', label: 'New topic...' },
                    ]}
                    value={newTopicMode ? '__new__' : (topicId || null)}
                    onChange={handleTopicChange}
                    allowDeselect={false}
                    size="sm"
                  />
                )}

                {newTopicMode && (
                  <Group gap="xs" wrap="nowrap">
                    <TextInput
                      autoFocus
                      value={newTopicName}
                      onChange={e => setNewTopicName(e.currentTarget.value)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmNewTopic() }}
                      placeholder="Topic name..."
                      style={{ flex: 1, minWidth: 0 }}
                      size="sm"
                    />
                    <Button size="sm" variant="primary" onClick={confirmNewTopic} disabled={isCreatingTopic}>
                      {isCreatingTopic ? '...' : 'Add'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelNewTopic} disabled={isCreatingTopic}>
                      Cancel
                    </Button>
                  </Group>
                )}
              </Stack>
            )}
          </SimpleGrid>

          {/* Row 2: Block name full width */}
          <TextInput
            label="Block name"
            value={blockName}
            onChange={e => setBlockName(e.currentTarget.value)}
            placeholder="e.g. Off-limit topics, Career summary..."
            size="sm"
          />
        </Stack>
      </Collapse>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <Text variant="title">Composer</Text>
      </div>

      {/* ── Empty state: golden ratio positioning ── */}
      {!hasMessages && (
        <div className="flex min-h-0 flex-1 flex-col items-center px-4 sm:px-6">
          {/* Top spacer — 38% of available height (golden ratio) */}
          <div style={{ flex: '0 0 38%' }} />

          {!hasOpeningChoice ? (
            <>
              <p
                className="select-none text-center"
                style={{
                  fontFamily: 'var(--mantine-font-family-headings)',
                  fontSize: 'clamp(1.125rem, 2.5vw, 1.5rem)',
                  color: 'var(--mantine-color-gray-6)',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  maxWidth: '400px',
                  lineHeight: 1.4,
                  marginBottom: '20px',
                }}
              >
                Welcome back{authUser?.name ? `, ${authUser.name.split(' ')[0]}` : ''}.
              </p>
              <Stack gap="xs" style={{ width: '100%', maxWidth: 400, marginBottom: 24 }}>
                <Tooltip
                  label="Add blocks first to use this option."
                  disabled={existingBlocks.length > 0}
                  events={{ hover: true, focus: true, touch: true }}
                >
                  <MantineButton
                    variant="light"
                    color="green"
                    size="md"
                    fullWidth
                    disabled={existingBlocks.length === 0}
                    data-disabled={existingBlocks.length === 0 || undefined}
                    onClick={(e) => {
                      if (existingBlocks.length === 0) { e.preventDefault(); return }
                      handleOpeningChoice('summarize')
                    }}
                  >
                    Summarize my prompt
                  </MantineButton>
                </Tooltip>
                <Tooltip
                  label="Add blocks first to use this option."
                  disabled={existingBlocks.length > 0}
                  events={{ hover: true, focus: true, touch: true }}
                >
                  <MantineButton
                    variant="light"
                    color="green"
                    size="md"
                    fullWidth
                    disabled={existingBlocks.length === 0}
                    data-disabled={existingBlocks.length === 0 || undefined}
                    onClick={(e) => {
                      if (existingBlocks.length === 0) { e.preventDefault(); return }
                      handleOpeningChoice('opportunities')
                    }}
                  >
                    Identify opportunities to improve
                  </MantineButton>
                </Tooltip>
                <MantineButton
                  variant="light"
                  color="green"
                  size="md"
                  fullWidth
                  onClick={() => handleOpeningChoice('new')}
                >
                  Create a new block
                </MantineButton>
              </Stack>
            </>
          ) : (
            <p
              className="select-none text-center"
              style={{
                fontFamily: 'var(--mantine-font-family-headings)',
                fontSize: 'clamp(1.125rem, 2.5vw, 1.5rem)',
                color: 'var(--mantine-color-gray-6)',
                fontWeight: 500,
                letterSpacing: '-0.02em',
                maxWidth: '400px',
                lineHeight: 1.4,
                marginBottom: '20px',
              }}
            >
              What would you like to add to your prompt?
            </p>
          )}
          {composerContainer}
          <div className="mt-2">
            {metadataSection}
          </div>

          {/* Bottom spacer — absorbs remaining space */}
          <div style={{ flex: '1 1 0%' }} />
        </div>
      )}

      {/* ── Active state: canvas with messages ── */}
      {hasMessages && (
        <>
          <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
            {/* Top bar: Copy all + Exchange counter */}
            <div className="sticky top-0 z-10 flex items-center justify-end gap-2 px-4 py-2 sm:px-6">
              <button
                type="button"
                onClick={handleCopyAll}
                className="border-none bg-transparent cursor-pointer px-0 py-0"
                style={{
                  color: copiedAll ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-dimmed)',
                  fontFamily: 'var(--mantine-font-family)',
                  fontSize: '12px',
                  transition: 'color 150ms ease',
                }}
              >
                {copiedAll ? 'Copied!' : 'Copy all'}
              </button>
              {exchangeCount > 0 && (
                <Badge
                  variant="outline"
                  color={exchangeCount >= MAX_EXCHANGES ? 'red' : exchangeCount >= WARN_THRESHOLD ? 'yellow' : 'gray'}
                  radius="xl"
                  size="sm"
                  style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}
                >
                  {exchangeCount} of {MAX_EXCHANGES} exchanges
                </Badge>
              )}
            </div>

            {/* Chat thread */}
            <div className="mx-auto flex w-full max-w-[800px] flex-col gap-4 px-4 py-4 sm:px-6">
              {draftBlocks.length > 0 ? (
                <Text
                  variant="muted"
                  style={{
                    textAlign: 'center',
                    padding: 'var(--mantine-spacing-md) 0',
                    fontFamily: 'var(--mantine-font-family)',
                  }}
                >
                  Here {draftBlocks.length === 1 ? 'is 1 block' : `are ${draftBlocks.length} blocks`} based on your input.
                </Text>
              ) : chatLoading && chatMessages.some(m => m.role === 'user') ? (
                <>
                  <Text
                    variant="muted"
                    style={{
                      textAlign: 'center',
                      padding: 'var(--mantine-spacing-sm) 0',
                      fontFamily: 'var(--mantine-font-family)',
                    }}
                  >
                    {['Reviewing supplied content...', 'Analyzing block options...', 'Creating blocks...'][loadingStatusIndex]}
                  </Text>
                  {[0, 1].map(i => (
                    <Card key={`skeleton-${i}`} variant="outlined">
                      <Stack gap="sm">
                        <Skeleton height={10} width={90} radius="sm" />
                        <Skeleton height={14} radius="sm" />
                        <Skeleton height={14} width="85%" radius="sm" />
                        <Skeleton height={14} width="70%" radius="sm" />
                        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                          <Stack gap={4}>
                            <Skeleton height={10} width={60} radius="sm" />
                            <Skeleton height={36} radius="sm" />
                          </Stack>
                          <Stack gap={4}>
                            <Skeleton height={10} width={40} radius="sm" />
                            <Skeleton height={36} radius="sm" />
                          </Stack>
                          <Stack gap={4}>
                            <Skeleton height={10} width={50} radius="sm" />
                            <Skeleton height={36} radius="sm" />
                          </Stack>
                        </SimpleGrid>
                        <Group gap="xs">
                          <Skeleton height={32} width={100} radius="sm" />
                          <Skeleton height={32} width={80} radius="sm" />
                        </Group>
                      </Stack>
                    </Card>
                  ))}
                </>
              ) : (
                chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className="flex max-w-[85%] flex-col gap-1 sm:max-w-[75%]">
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed cursor-pointer ${
                        msg.role === 'user'
                          ? 'whitespace-pre-wrap text-white'
                          : 'text-gray-900 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-1'
                      }`}
                      style={{
                        transition: 'outline 150ms ease, background-color 150ms ease',
                        outline: copiedId === i ? '2px solid var(--mantine-color-green-4)' : '2px solid transparent',
                        ...(msg.role === 'user'
                          ? { backgroundColor: 'var(--mantine-color-green-filled)' }
                          : { backgroundColor: copiedId === i ? 'var(--mantine-color-green-0)' : 'var(--mantine-color-gray-0)' }),
                      }}
                      onClick={() => msg.content && handleCopyBubble(i, msg.content)}
                      title="Click to copy"
                    >
                      {msg.role === 'assistant' ? (
                        msg.content ? (
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        ) : chatLoading ? (
                          <span className="text-gray-400">Thinking...</span>
                        ) : null
                      ) : (
                        msg.content
                      )}
                    </div>
                    <span
                      className={`text-xs ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
                      style={{ color: 'var(--mantine-color-gray-5)' }}
                    >
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                </div>
              ))
              )}

              {/* Block confirmation cards */}
              {draftBlocks.map((draft, cardIndex) => {
                const meta = draftMetas[cardIndex]
                if (!meta) return null
                const isEditingCard = editingCardIndex === cardIndex
                const hasIssues = meta.issues.length > 0
                const busy = meta.isChecking || meta.isSaving
                return (
                  <Card key={cardIndex} variant="outlined">
                    <Stack gap="sm">
                      <Group justify="space-between" wrap="nowrap">
                        <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Block ready{draftBlocks.length > 1 ? ` (${cardIndex + 1} of ${draftBlocks.length})` : ''}
                        </Text>
                        {!isEditingCard && (
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            onClick={() => handleEditCard(cardIndex)}
                            aria-label="Edit block content"
                          >
                            <IconPencil size={14} />
                          </ActionIcon>
                        )}
                      </Group>
                      {isEditingCard ? (
                        <Stack gap="xs">
                          <Textarea
                            value={editingCardBody}
                            onChange={e => setEditingCardBody(e.currentTarget.value)}
                            autosize
                            minRows={4}
                            maxRows={16}
                            size="sm"
                            styles={{
                              input: {
                                fontSize: 'var(--mantine-font-size-sm)',
                                lineHeight: 1.6,
                              },
                            }}
                          />
                          <Group gap="xs">
                            <Button variant="primary" size="sm" onClick={() => handleSaveEditCard(cardIndex)}>
                              Save
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleCancelEditCard}>
                              Cancel
                            </Button>
                          </Group>
                        </Stack>
                      ) : (
                        <Text variant="muted" style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--mantine-font-size-sm)', lineHeight: 1.6 }}>
                          {draft.content}
                        </Text>
                      )}
                      {meta.warning && (
                        <Alert color="yellow" variant="light" radius="sm" p="sm">
                          <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-xs)', color: 'var(--mantine-color-yellow-9)' }}>
                            {meta.warning}
                          </Text>
                        </Alert>
                      )}
                      {hasIssues && (
                        <Alert
                          color="yellow"
                          variant="light"
                          radius="sm"
                          title="Safety check flagged this block"
                        >
                          <Stack gap="xs">
                            {meta.issues.map((issue, i) => (
                              <Stack key={i} gap={4}>
                                <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
                                  {issue.description}
                                </Text>
                                {issue.offendingText && (
                                  <Stack gap={4}>
                                    <Text
                                      variant="muted"
                                      style={{
                                        fontFamily: 'var(--mantine-font-family-monospace)',
                                        fontSize: 'var(--mantine-font-size-xs)',
                                        backgroundColor: 'var(--mantine-color-yellow-0)',
                                        padding: '2px 6px',
                                        borderRadius: 'var(--mantine-radius-sm)',
                                        wordBreak: 'break-word',
                                      }}
                                    >
                                      {issue.offendingText}
                                    </Text>
                                    <MantineButton
                                      variant="subtle"
                                      color="yellow"
                                      size="xs"
                                      onClick={() => handleRemoveOffendingFromCard(cardIndex, issue.offendingText!)}
                                      disabled={busy}
                                      style={{ alignSelf: 'flex-start' }}
                                    >
                                      Remove
                                    </MantineButton>
                                  </Stack>
                                )}
                              </Stack>
                            ))}
                          </Stack>
                        </Alert>
                      )}
                      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                        <TextInput
                          label="Block name"
                          value={meta.blockName}
                          onChange={e => updateDraftMeta(cardIndex, { blockName: e.currentTarget.value })}
                          placeholder="e.g. Curious Mindset"
                          size="sm"
                        />
                        <Select
                          label="Type"
                          placeholder="Select a type..."
                          data={TYPES}
                          value={meta.type || null}
                          onChange={v => updateDraftMeta(cardIndex, { type: (v ?? '') as BlockType | '' })}
                          allowDeselect={false}
                          size="sm"
                        />
                        <TextInput
                          label="Topic"
                          value={meta.topicName}
                          onChange={e => updateDraftMeta(cardIndex, { topicName: e.currentTarget.value })}
                          placeholder="e.g. About, Services..."
                          size="sm"
                        />
                      </SimpleGrid>
                      {isPlatformAdmin && (
                        <Checkbox
                          label="Mark as default block"
                          checked={meta.isDefault}
                          onChange={(e) => updateDraftMeta(cardIndex, { isDefault: e.currentTarget.checked })}
                          size="sm"
                        />
                      )}
                      {meta.saveError && (
                        <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)', color: 'var(--mantine-color-red-6)' }}>
                          {meta.saveError}
                        </Text>
                      )}
                      <Group gap="xs">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleCheckAndSaveBlock(cardIndex)}
                          disabled={busy}
                        >
                          {meta.isChecking ? 'Checking...' : meta.isSaving ? 'Saving...' : 'Check & Save'}
                        </Button>
                        {hasIssues && (
                          <MantineButton
                            variant="default"
                            color="yellow"
                            size="sm"
                            onClick={() => handleSaveAnywayBlock(cardIndex)}
                            disabled={meta.isChecking}
                            loading={meta.isSaving}
                          >
                            Save Anyway
                          </MantineButton>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => removeDraft(cardIndex)} disabled={busy}>
                          Discard
                        </Button>
                      </Group>
                    </Stack>
                  </Card>
                )
              })}

              {/* AI closing message — shown below the last card when drafts exist */}
              {draftBlocks.length > 0 && closingMessage && (
                <Text
                  variant="muted"
                  style={{
                    textAlign: 'center',
                    padding: 'var(--mantine-spacing-sm) var(--mantine-spacing-md)',
                    fontFamily: 'var(--mantine-font-family)',
                    fontSize: 'var(--mantine-font-size-sm)',
                    lineHeight: 1.6,
                  }}
                >
                  {closingMessage}
                </Text>
              )}

              {/* Exchange limit message */}
              {isAtLimit && draftBlocks.length === 0 && (
                <Card variant="outlined" style={{ borderColor: 'var(--mantine-color-red-2)', backgroundColor: 'var(--mantine-color-red-0)' }}>
                  <Stack gap="xs">
                    <Text variant="label" style={{ color: 'var(--mantine-color-red-7)' }}>
                      Exchange limit reached
                    </Text>
                    <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
                      You&apos;ve reached the exchange limit for this session. Save your block or start a new chat.
                    </Text>
                    <Group gap="xs">
                      <Button variant="ghost" size="sm" onClick={resetChat}>
                        Start new chat
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Composer — pinned at bottom */}
          <div className="shrink-0 border-t border-gray-200 px-4 py-3 sm:px-6">
            {composerContainer}
            <div className="mt-2">
              {metadataSection}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
