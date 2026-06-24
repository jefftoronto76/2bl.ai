'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'

import { Select, TextInput, Collapse, Stack, Group, Badge, SimpleGrid, Progress, Skeleton, Modal, Checkbox, Text as MantineText } from '@mantine/core'
import { useAuthUser } from '@/services/auth/client'
import { Button } from '@/components/admin/primitives/Button'
import { Card } from '@/components/admin/primitives/Card'
import { Text } from '@/components/admin/primitives/Text'
import { useAdminUserId } from '@/services/auth/admin-user-context'
import { readDataStream } from '@/services/chat/server/stream-utils'
import { DraftCard } from '@/components/admin/prompt-builder/DraftCard'
import { Composer, type ComposerPill, UploadSavedRow } from '@/components/admin/prompt-builder/Composer'
import { ConversationSidebar } from '@/components/admin/prompt-builder/ConversationSidebar'
import { PromptSetPicker } from '@/components/admin/prompt-builder/PromptSetPicker'
import {
  type BlockType, type Topic, type ChatMessage, type DraftBlock, type ExistingBlock,
  type DraftCardMeta, type CheckResult, type Conversation, type PromptSet,
  TYPES, VALID_TYPES, MAX_EXCHANGES, WARN_THRESHOLD, formatTime,
} from '@/components/admin/prompt-builder/types'

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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [showNewConvDialog, setShowNewConvDialog] = useState(false)
  const [skipNewConvConfirm, setSkipNewConvConfirm] = useState(false)
  const [promptSets, setPromptSets] = useState<PromptSet[]>([])
  const [activePromptSetId, setActivePromptSetId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    async function fetchConversations() {
      try {
        const res = await fetch('/api/admin/conversations')
        if (!res.ok) { setConversations([]); return }
        const data: Conversation[] = await res.json()
        setConversations(data)
      } catch {
        setConversations([])
      }
    }
    fetchConversations()
  }, [])

  useEffect(() => {
    async function fetchPromptSets() {
      try {
        const res = await fetch('/api/admin/prompt-sets')
        if (res.status === 404 || !res.ok) { setPromptSets([]); setActivePromptSetId(null); return }
        const body = await res.json()
        const data: PromptSet[] = body.promptSets ?? []
        if (data.length === 0) { setPromptSets([]); setActivePromptSetId(null); return }
        setPromptSets(data)
        const liveSet = data.find(s => s.status === 'Live')
        setActivePromptSetId((liveSet ?? data[0]).id)
      } catch {
        setPromptSets([])
        setActivePromptSetId(null)
      }
    }
    fetchPromptSets()
  }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
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

  function startNewConversation() {
    if (chatMessages.length === 0 || localStorage.getItem('composer:skip-new-confirm') === 'true') {
      resetChat()
      setActiveConversationId(null)
      setSidebarOpen(false)
    } else {
      setSkipNewConvConfirm(false)
      setShowNewConvDialog(true)
    }
  }

  function confirmNewConversation() {
    if (skipNewConvConfirm) {
      localStorage.setItem('composer:skip-new-confirm', 'true')
    }
    setShowNewConvDialog(false)
    resetChat()
    setActiveConversationId(null)
    setSidebarOpen(false)
  }

  async function handleSelectConversation(id: string) {
    if (id === activeConversationId) { setSidebarOpen(false); return }
    try {
      const res = await fetch(`/api/admin/conversations/${id}`)
      if (!res.ok) return
      const convo: {
        id: string
        messages: { role: 'user' | 'assistant'; content: string; timestamp: number }[]
        promptSetId: string | null
      } = await res.json()
      resetChat()
      setChatMessages(convo.messages ?? [])
      setActiveConversationId(convo.id)
      setSessionStartIndex(0)
      if (convo.promptSetId) setActivePromptSetId(convo.promptSetId)
      setSidebarOpen(false)
    } catch (err) {
      console.error('[conversations] hydrate failed:', err)
    }
  }

  function deriveTitle(messages: ChatMessage[]): string {
    const firstUser = messages.find(m => m.role === 'user')
    const t = (firstUser?.content ?? '').trim().replace(/\s+/g, ' ')
    return t ? (t.length > 48 ? t.slice(0, 48) + '…' : t) : 'New conversation'
  }

  async function persistConversation(finalMessages: ChatMessage[]) {
    if (finalMessages.length === 0) return
    const lastAssistant = [...finalMessages].reverse().find(m => m.role === 'assistant')
    const preview = (lastAssistant?.content ?? '').trim().slice(0, 140) || null
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const promptSetId = activePromptSetId && UUID_RE.test(activePromptSetId) ? activePromptSetId : null

    try {
      if (!activeConversationId) {
        const res = await fetch('/api/admin/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: deriveTitle(finalMessages), preview, messages: finalMessages, promptSetId }),
        })
        if (!res.ok) return
        const row = await res.json()
        setActiveConversationId(row.id)
        setConversations(prev => [row, ...prev])
      } else {
        const id = activeConversationId
        const res = await fetch(`/api/admin/conversations/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preview, messages: finalMessages }),
        })
        if (!res.ok) return
        const row = await res.json()
        setConversations(prev => [row, ...prev.filter(c => c.id !== id)])
      }
    } catch (err) {
      console.error('[conversations] persist failed:', err)
    }
  }

  function createPromptSet(label: string) {
    const newSet: PromptSet = { id: String(promptSets.length + 1 + Date.now()), label, version: 1, status: 'Draft' }
    setPromptSets(prev => [...prev, newSet])
    setActivePromptSetId(newSet.id)
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
      const finalThread: ChatMessage[] = [
        ...messages,
        { role: 'assistant', content: displayText, timestamp: placeholderMsg.timestamp },
      ]
      void persistConversation(finalThread)
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
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const promptSetId = activePromptSetId && UUID_RE.test(activePromptSetId) ? activePromptSetId : null

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
          prompt_set_id: promptSetId,
          conversation_id: activeConversationId,
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
  const activeConversation = conversations.find(c => c.id === activeConversationId) ?? null
  const topBarTitle = activeConversation && !activeConversation.draft ? activeConversation.title : 'Composer'

  const pills: ComposerPill[] = [
    {
      label: 'Summarize my prompt',
      disabled: existingBlocks.length === 0,
      onClick: () => {
        const hasCustom = existingBlocks.some(b => !b.is_default)
        const types = [...new Set(existingBlocks.map(b => b.type))]
        const trigger = hasCustom
          ? `The owner has ${existingBlocks.length} existing blocks covering: ${types.join(', ')}. Write a short opening message summarizing what's covered, identifying any missing block types, and suggesting what to build next. Do NOT output the done JSON. Do NOT draft any new blocks.`
          : 'The owner only has default starter blocks — no custom blocks yet. Write a short opening message acknowledging the foundation is set and suggesting they customize or add blocks specific to their business. Do NOT output the done JSON. Do NOT draft any new blocks.'
        sendChatMessage([], trigger)
      },
    },
    {
      label: 'Identify opportunities',
      disabled: existingBlocks.length === 0,
      onClick: () => sendChatMessage([], 'The owner wants to know how to improve their current prompt. Based on the existing blocks listed above, identify gaps (missing block types, weak coverage, potential conflicts) and suggest 2-3 specific improvements. Do NOT output the done JSON. Do NOT draft any new blocks.'),
    },
    {
      label: 'Create a new block',
      onClick: () => setChatMessages([{ role: 'assistant', content: "Sounds great — to get started, just type in what you're thinking for the block.", timestamp: Date.now() }]),
    },
  ]

  const uploadStatus = fileUploading ? (
    <div style={{ padding: '0 14px 8px', fontSize: 12, color: 'var(--mantine-color-dimmed)' }}>
      Processing your document...
      <Progress size="xs" animated value={100} mt={4} />
    </div>
  ) : uploadedFileName && !fileUploading ? (
    <UploadSavedRow name={uploadedFileName} onClear={() => { setUploadedFileName(null); setContentId(null); setUploadedRaw(null) }} />
  ) : uploadError ? (
    <div style={{ padding: '0 14px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--mantine-color-red-6)' }}>{uploadError}</span>
      <button onClick={() => setUploadError(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--mantine-color-gray-5)' }}>✕</button>
    </div>
  ) : undefined

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
    <div className="relative flex h-full min-h-0 flex-row overflow-hidden">
      <style>{`@keyframes thinkingPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
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

      <ConversationSidebar
        open={sidebarOpen}
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onNew={startNewConversation}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Scrim */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: 'absolute', inset: 0, zIndex: 25, background: 'rgba(26,25,23,0.18)' }}
          />
        )}

        {/* Header — single top bar, both states */}
        <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Toggle conversations"
            aria-expanded={sidebarOpen}
            title="Conversations"
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--mantine-color-gray-1)'; e.currentTarget.style.borderColor = 'var(--mantine-color-gray-4)' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = 'var(--mantine-color-gray-3)' }}
            style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, flex: '0 0 auto', border: '1px solid var(--mantine-color-gray-3)', background: '#fff', borderRadius: 'var(--mantine-radius-sm)', color: 'var(--mantine-color-gray-7)', cursor: 'pointer', transition: 'background 120ms ease, border-color 120ms ease' }}
          >
            <HamburgerIcon />
          </button>

          <Text variant="title" style={{ margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {topBarTitle}
          </Text>

          <div style={{ marginLeft: 'auto' }} />

          {promptSets.length > 0 && activePromptSetId && (
            <PromptSetPicker
              sets={promptSets}
              activeId={activePromptSetId}
              onSelect={setActivePromptSetId}
              onCreate={createPromptSet}
            />
          )}

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

          <button
            type="button"
            onClick={handleCopyAll}
            disabled={!hasMessages}
            className="border-none bg-transparent px-0 py-0"
            style={{
              color: copiedAll ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-dimmed)',
              fontFamily: 'var(--mantine-font-family)',
              fontSize: 12,
              cursor: hasMessages ? 'pointer' : 'not-allowed',
              opacity: hasMessages ? 1 : 0.4,
              transition: 'color 150ms ease',
            }}
          >
            {copiedAll ? 'Copied!' : 'Copy all'}
          </button>
        </div>

      {/* ── Empty state ── */}
      {!hasMessages && (
        <div className="flex min-h-0 flex-1 flex-col px-4 py-6 sm:px-6">
          {/* Welcome — centered in the space above the composer */}
          <div className="flex flex-1 flex-col items-center justify-center">
            <p
              className="select-none text-center"
              style={{
                fontFamily: 'var(--mantine-font-family-headings)',
                fontSize: 'clamp(1.25rem, 2.5vw, 1.6rem)',
                color: 'var(--mantine-color-gray-7)',
                fontWeight: 500,
                letterSpacing: '-0.02em',
                maxWidth: 440,
                lineHeight: 1.35,
                margin: 0,
              }}
            >
              Welcome back{authUser?.name ? `, ${authUser.name.split(' ')[0]}` : ''}.
              <br />
              <span style={{ display: 'inline-block', marginTop: 8, fontFamily: 'var(--mantine-font-family)', fontSize: 14, fontWeight: 400, color: 'var(--mantine-color-dimmed)' }}>
                Build a block, or pick a starting point below.
              </span>
            </p>
          </div>

          {/* Composer — pinned toward the bottom (matches the approved prototype) */}
          <div className="flex w-full flex-col items-center gap-2">
            <Composer
              input={chatInput}
              onInputChange={setChatInput}
              onSend={handleSend}
              onPickFile={() => fileInputRef.current?.click()}
              loading={chatLoading}
              atLimit={isAtLimit}
              pills={pills}
              uploadStatus={uploadStatus}
            />
            {metadataSection}
          </div>
        </div>
      )}

      {/* ── Active state: canvas with messages ── */}
      {hasMessages && (
        <>
          <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
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
                          <span className="flex gap-1 items-center px-1 py-1">
                            {[0, 1, 2].map(i => (
                              <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--mantine-color-gray-4)', display: 'inline-block', animation: 'thinkingPulse 1.4s ease-in-out infinite', animationDelay: `${i * 0.2}s` }} />
                            ))}
                          </span>
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
                return (
                  <DraftCard
                    key={cardIndex}
                    draft={draft}
                    meta={meta}
                    index={cardIndex}
                    count={draftBlocks.length}
                    isPlatformAdmin={isPlatformAdmin}
                    isEditing={editingCardIndex === cardIndex}
                    editingBody={editingCardBody}
                    onEditingBodyChange={setEditingCardBody}
                    onStartEdit={() => handleEditCard(cardIndex)}
                    onSaveEdit={() => handleSaveEditCard(cardIndex)}
                    onCancelEdit={handleCancelEditCard}
                    onMetaChange={updates => updateDraftMeta(cardIndex, updates)}
                    onCheckAndSave={() => handleCheckAndSaveBlock(cardIndex)}
                    onSaveAnyway={() => handleSaveAnywayBlock(cardIndex)}
                    onRemove={() => removeDraft(cardIndex)}
                    onRemoveOffending={text => handleRemoveOffendingFromCard(cardIndex, text)}
                  />
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
            <Composer
              input={chatInput}
              onInputChange={setChatInput}
              onSend={handleSend}
              onPickFile={() => fileInputRef.current?.click()}
              loading={chatLoading}
              atLimit={isAtLimit}
              pills={pills}
              uploadStatus={uploadStatus}
            />
            <div className="mt-2">
              {metadataSection}
            </div>
          </div>
        </>
      )}
      </div>

      <Modal
        opened={showNewConvDialog}
        onClose={() => setShowNewConvDialog(false)}
        title="Start a new conversation?"
        size="sm"
      >
        <Stack gap="md">
          <MantineText size="sm" c="dimmed">
            Your current conversation will stay saved in the history. You can come back to it any time.
          </MantineText>
          <Checkbox
            label="Don't ask again"
            checked={skipNewConvConfirm}
            onChange={e => setSkipNewConvConfirm(e.currentTarget.checked)}
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={() => setShowNewConvDialog(false)}>Cancel</Button>
            <Button onClick={confirmNewConversation}>Start fresh</Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  )
}

function HamburgerIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  )
}
