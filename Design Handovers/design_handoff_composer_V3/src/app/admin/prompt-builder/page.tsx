'use client'

// Composer (Prompt Builder) — REBUILT layout, SAME engine.
//
// This is the production target for the approved redesign (handover.md). The page
// still owns ALL state and ALL API calls — streaming chat, file upload, safety
// check, save-to-Supabase, topics. Those handlers are lifted from the current
// page.tsx unchanged (§6 do-not-regress). What's new is the three-region chrome:
//
//   ┌───────────────┬──────────────────────────────────────────┐
//   │ Conversation  │  top bar: ☰ · title · set picker · badge   │
//   │ Sidebar       ├──────────────────────────────────────────┤
//   │ (overlay      │  scroll: welcome / thread / draft cards    │
//   │  drawer)      ├──────────────────────────────────────────┤
//   │               │  footer: <Composer> + Block metadata       │
//   └───────────────┴──────────────────────────────────────────┘
//
// New components: ConversationSidebar, Composer (Heirloom), PromptSetPicker, DraftCard.
// New state: conversations + activeConversationId + sidebarOpen (history drawer),
//            promptSets + activePromptSetId (prompt-set picker, §4).

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Select, TextInput, Collapse, Stack, Group, SimpleGrid, Card, Skeleton,
  Button as MantineButton, Progress,
} from '@mantine/core'
import { useAuthUser } from '@/services/auth/client'
import { useAdminUserId } from '@/services/auth/admin-user-context'
import { readDataStream } from '@/services/chat/server/stream-utils'
import { Button } from '@/components/admin/primitives/Button'
import { Text } from '@/components/admin/primitives/Text'

import { ConversationSidebar } from '@/components/admin/prompt-builder/ConversationSidebar'
import { Composer, UploadSavedRow, type ComposerPill } from '@/components/admin/prompt-builder/Composer'
import { PromptSetPicker } from '@/components/admin/prompt-builder/PromptSetPicker'
import { DraftCard } from '@/components/admin/prompt-builder/DraftCard'
import {
  TYPES, VALID_TYPES, MAX_EXCHANGES, WARN_THRESHOLD, formatTime,
  type BlockType, type Topic, type ChatMessage, type DraftBlock,
  type ExistingBlock, type DraftCardMeta, type CheckIssue, type CheckResult,
  type Conversation, type PromptSet,
} from '@/components/admin/prompt-builder/types'

export default function PromptBuilderPage() {
  const ownerId = useAdminUserId()
  const { user: authUser } = useAuthUser()
  const isPlatformAdmin = authUser?.isPlatformAdmin === true

  // ── Topics ──────────────────────────────────────────────────────────────────
  const [allTopics, setAllTopics] = useState<Topic[]>([])
  const [topicsLoading, setTopicsLoading] = useState(true)

  // ── Metadata form ─────────────────────────────────────────────────────────────
  const [type, setType] = useState<BlockType | ''>('')
  const [topicId, setTopicId] = useState('')
  const [newTopicMode, setNewTopicMode] = useState(false)
  const [newTopicName, setNewTopicName] = useState('')
  const [isCreatingTopic, setIsCreatingTopic] = useState(false)
  const [blockName, setBlockName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [metadataOpen, setMetadataOpen] = useState(false)

  // ── Chat ──────────────────────────────────────────────────────────────────────
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

  // ── NEW: conversation history drawer ───────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // ── NEW: prompt-set picker (which set a saved block lands in, §4) ───────────────
  // Until GET /api/admin/prompt-sets is wired, this is [] and the picker hides.
  // Reuse the same endpoint that feeds the Blocks header, scoped to writable sets.
  const [promptSets, setPromptSets] = useState<PromptSet[]>([])
  const [activePromptSetId, setActivePromptSetId] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Exchange counter — user messages in the current session only.
  const exchangeCount = chatMessages.slice(sessionStartIndex).filter(m => m.role === 'user').length
  const isAtLimit = exchangeCount >= MAX_EXCHANGES

  const filteredTopics = allTopics.filter(t => t.type === type)
  const selectedTopic = allTopics.find(t => t.id === topicId)
  const hasMessages = chatMessages.length > 0
  const activeConversation = conversations.find(c => c.id === activeConversationId) ?? null
  const topBarTitle = activeConversation && !activeConversation.draft ? activeConversation.title : 'Composer'

  // ── Effects ─────────────────────────────────────────────────────────────────────
  const fetchTopics = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/topics')
      if (!res.ok) return
      setAllTopics(await res.json())
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
        setExistingBlocks(await res.json())
      } catch (err) {
        console.error('[fetchBlocks] failed:', err)
      }
    }
    fetchBlocks()
  }, [])

  // NEW: list past conversations for the drawer. Until the endpoint exists this
  // 404s harmlessly and the drawer is empty (screen behaves exactly like today).
  useEffect(() => {
    async function fetchConversations() {
      try {
        const res = await fetch('/api/admin/conversations')
        if (!res.ok) return
        const data: Conversation[] = await res.json()
        setConversations(data)
      } catch (err) {
        console.error('[fetchConversations] failed:', err)
      }
    }
    fetchConversations()
  }, [])

  // NEW: list the prompt sets the owner can write to (same endpoint the Blocks
  // header uses). Picks a sensible default active set. Until the endpoint exists
  // this 404s harmlessly, the list stays [], and the picker hides.
  useEffect(() => {
    async function fetchPromptSets() {
      try {
        const res = await fetch('/api/admin/prompt-sets')
        if (!res.ok) return
        const data: PromptSet[] = await res.json()
        setPromptSets(data)
        // Default: last-used (TODO: persist), else the first Live set, else first.
        setActivePromptSetId(
          prev => prev ?? (data.find(s => s.status === 'Live')?.id ?? data[0]?.id ?? null)
        )
      } catch (err) {
        console.error('[fetchPromptSets] failed:', err)
      }
    }
    fetchPromptSets()
  }, [])

  useEffect(() => {
    if (filteredTopics.length > 0 && !filteredTopics.find(t => t.id === topicId)) {
      setTopicId(filteredTopics[0].id)
    }
  }, [type, filteredTopics, topicId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  // Cycle the drafting status text while skeleton cards show.
  useEffect(() => {
    if (!chatLoading) { setLoadingStatusIndex(0); return }
    const t1 = setTimeout(() => setLoadingStatusIndex(1), 4000)
    const t2 = setTimeout(() => setLoadingStatusIndex(2), 8000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [chatLoading])

  // Auto-trigger after a successful upload.
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

  // ── Opening choices (now driven by composer suggestion pills) ───────────────────
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
    setChatMessages([]); setChatInput(''); setChatLoading(false)
    setDraftBlocks([]); setDraftMetas([]); setEditingCardIndex(null); setEditingCardBody('')
    setClosingMessage(null); setContentId(null); setFile(null); setFileUploading(false)
    setUploadError(null); setUploadedFileName(null); setUploadedRaw(null); setPendingAutoTrigger(false)
    setHasOpeningChoice(false); setSessionStartIndex(0)
  }

  // ── NEW: conversation drawer actions ────────────────────────────────────────────
  // Start a fresh, unsent conversation. Persistence is lazy — a row is only written
  // on first send (see handover §3). Discards any other unsent draft.
  function startNewConversation() {
    const draft: Conversation = {
      id: 'draft-' + Math.random().toString(36).slice(2, 8),
      title: 'New conversation', preview: '', updatedAt: Date.now(), draft: true, messages: [],
    }
    setConversations(prev => [draft, ...prev.filter(c => !c.draft)])
    setActiveConversationId(draft.id)
    resetChat()
    setSidebarOpen(false)
  }

  // Open a past conversation: hydrate its messages (lazy-fetch by id if absent).
  async function selectConversation(id: string) {
    setSidebarOpen(false)
    const found = conversations.find(c => c.id === id)
    if (!found) return
    setActiveConversationId(id)
    resetChat()
    let messages = found.messages
    if (!messages) {
      try {
        const res = await fetch(`/api/admin/conversations/${id}`)
        if (res.ok) {
          const data: Conversation = await res.json()
          messages = data.messages ?? []
          setConversations(prev => prev.map(c => (c.id === id ? { ...c, messages } : c)))
        }
      } catch (err) {
        console.error('[selectConversation] hydrate failed:', err)
      }
    }
    setChatMessages(messages ?? [])
    setHasOpeningChoice((messages ?? []).length > 0)
    setSessionStartIndex(messages?.length ?? 0)
  }

  // ── NEW: prompt-set picker actions (§4) ─────────────────────────────────────────
  // Create a new Draft v1 set, select it, and prepend it so the next saved block
  // lands there. Optimistic; reconcile the id from the POST response.
  async function createPromptSet(label: string) {
    const name = label.trim()
    if (!name) return
    const optimistic: PromptSet = { id: 'new-' + Math.random().toString(36).slice(2, 8), label: name, version: 1, status: 'Draft' }
    setPromptSets(prev => [...prev, optimistic])
    setActivePromptSetId(optimistic.id)
    try {
      const res = await fetch('/api/admin/prompt-sets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: name }),
      })
      if (!res.ok) return
      const saved: PromptSet = await res.json()
      setPromptSets(prev => prev.map(s => (s.id === optimistic.id ? saved : s)))
      setActivePromptSetId(saved.id)
    } catch (err) {
      console.error('[createPromptSet] failed:', err)
    }
  }

  // ── File upload ───────────────────────────────────────────────────────────────
  async function handleFileUpload(f: File) {
    setFile(f); setFileUploading(true); setUploadError(null); setUploadedFileName(null)
    const formData = new FormData()
    formData.append('file', f)
    try {
      const res = await fetch('/api/admin/assets/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setUploadError(data?.error ?? 'Upload failed'); setFile(null); return
      }
      const data: { content_id: string; name: string; raw: string } = await res.json()
      setContentId(data.content_id); setUploadedFileName(data.name); setUploadedRaw(data.raw)
      setFile(null); setPendingAutoTrigger(true)
    } catch (err) {
      console.error('[handleFileUpload] failed:', err)
      setUploadError('Network error — could not upload file'); setFile(null)
    } finally {
      setFileUploading(false)
    }
  }

  // ── Copy ────────────────────────────────────────────────────────────────────────
  function handleCopyBubble(index: number, content: string) {
    navigator.clipboard.writeText(content)
    setCopiedId(index); setTimeout(() => setCopiedId(null), 1000)
  }
  function handleCopyAll() {
    navigator.clipboard.writeText(chatMessages.map(m => `${m.role}: ${m.content}`).join('\n\n'))
    setCopiedAll(true); setTimeout(() => setCopiedAll(false), 1500)
  }

  // ── Metadata / topics ─────────────────────────────────────────────────────────
  function handleTypeChange(value: string | null) {
    setType((value ?? '') as BlockType | ''); setTopicId(''); setNewTopicMode(false)
  }
  function handleTopicChange(value: string | null) {
    if (value === '__new__') { setNewTopicMode(true); setNewTopicName('') }
    else { setNewTopicMode(false); setTopicId(value ?? '') }
  }
  function cancelNewTopic() { setNewTopicMode(false); setNewTopicName('') }
  async function confirmNewTopic() {
    const name = newTopicName.trim()
    if (!name) return
    setIsCreatingTopic(true)
    try {
      const res = await fetch('/api/admin/topics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type }),
      })
      if (!res.ok) { console.error('[confirmNewTopic] insert failed:', await res.json()); return }
      const newTopic: Topic = await res.json()
      setAllTopics(prev => [...prev, newTopic]); setTopicId(newTopic.id)
      setNewTopicMode(false); setNewTopicName('')
    } catch (err) {
      console.error('[confirmNewTopic] request failed:', err)
    } finally {
      setIsCreatingTopic(false)
    }
  }

  // ── Stream parsing — balanced-brace extraction of {done:true,…} blocks ──────────
  function parseAllDoneJson(text: string): { displayText: string; drafts: DraftBlock[]; closingMessage: string | null } {
    const drafts: DraftBlock[] = []
    let displayText = text
    const jsonStarts: number[] = []
    for (let i = 0; i < text.length; i++) if (text[i] === '{') jsonStarts.push(i)

    const matched: { start: number; end: number }[] = []
    for (const start of jsonStarts) {
      let depth = 0, end = -1
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++
        else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break } }
      }
      if (end === -1) continue
      const candidate = text.slice(start, end + 1)
      try {
        const parsed = JSON.parse(candidate)
        if (parsed.done && parsed.title && parsed.content) {
          const draft: DraftBlock = { title: parsed.title, content: parsed.content }
          if (typeof parsed.type === 'string' && VALID_TYPES.has(parsed.type.toLowerCase())) draft.suggestedType = parsed.type.toLowerCase() as BlockType
          if (typeof parsed.topic === 'string' && parsed.topic.trim()) draft.suggestedTopic = parsed.topic.trim()
          if (typeof parsed.warning === 'string' && parsed.warning.trim()) draft.warning = parsed.warning.trim()
          drafts.push(draft); matched.push({ start, end: end + 1 })
        }
      } catch { /* not valid JSON — skip */ }
    }

    let closingMessage: string | null = null
    if (matched.length > 0) {
      const lastEnd = matched[matched.length - 1].end
      const trailing = text.slice(lastEnd).replace(/^[\s`\-]+/, '').trim()
      closingMessage = trailing.length > 0 ? trailing : null
    }
    for (let i = matched.length - 1; i >= 0; i--) {
      displayText = displayText.slice(0, matched[i].start) + displayText.slice(matched[i].end)
    }
    return { displayText: displayText.trim(), drafts, closingMessage }
  }

  // ── Send (streaming) ────────────────────────────────────────────────────────────
  async function sendChatMessage(messages: ChatMessage[], hiddenPrompt?: string) {
    setChatLoading(true); setClosingMessage(null)
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type, topic: topicName, content_type: contentType, content: raw, messages: apiMessages,
          ...(uploadedRaw ? { documentContext: uploadedRaw } : {}),
          ...(existingBlocks.length > 0 ? { existingBlocks: existingBlocks.map(b => ({ title: b.title, type: b.type, body: b.body })) } : {}),
        }),
      })
      if (!response.ok) throw new Error(`API error: ${response.status}`)

      const finalText = await readDataStream(response, accumulated => {
        const { displayText } = parseAllDoneJson(accumulated)
        setChatMessages([...messages, { role: 'assistant', content: displayText, timestamp: placeholderMsg.timestamp }])
      })

      const { displayText, drafts, closingMessage: parsedClosing } = parseAllDoneJson(finalText)
      setChatMessages([...messages, { role: 'assistant', content: displayText, timestamp: placeholderMsg.timestamp }])
      setClosingMessage(parsedClosing)
      if (drafts.length > 0) {
        setDraftBlocks(drafts)
        setDraftMetas(drafts.map(d => ({
          blockName: d.title, type: d.suggestedType ?? '', topicName: d.suggestedTopic ?? '',
          isDefault: false, saveError: null, isSaving: false, isChecking: false, issues: [], warning: d.warning ?? null,
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
    setChatInput(''); setDraftBlocks([]); setDraftMetas([]); setEditingCardIndex(null); setEditingCardBody(''); setClosingMessage(null)
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() }
    await sendChatMessage([...chatMessages, userMsg])
    textareaRef.current?.focus()
  }

  // ── Draft card actions ──────────────────────────────────────────────────────────
  function updateDraftMeta(index: number, updates: Partial<DraftCardMeta>) {
    setDraftMetas(prev => prev.map((m, i) => (i === index ? { ...m, ...updates } : m)))
  }
  function removeDraft(index: number) {
    setDraftBlocks(prev => prev.filter((_, i) => i !== index))
    setDraftMetas(prev => prev.filter((_, i) => i !== index))
    if (editingCardIndex === index) { setEditingCardIndex(null); setEditingCardBody('') }
  }
  function handleEditCard(index: number) {
    const draft = draftBlocks[index]; if (!draft) return
    setEditingCardIndex(index); setEditingCardBody(draft.content)
  }
  function handleCancelEditCard() { setEditingCardIndex(null); setEditingCardBody('') }
  function handleSaveEditCard(index: number) {
    setDraftBlocks(prev => prev.map((d, i) => (i === index ? { ...d, content: editingCardBody } : d)))
    setEditingCardIndex(null); setEditingCardBody('')
  }

  async function runCardSafetyCheck(body: string): Promise<CheckResult> {
    try {
      const res = await fetch('/api/admin/prompt/compile/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
      })
      if (!res.ok) return { ok: true, issues: [] }
      const data: CheckResult = await res.json()
      return { ok: data.ok === true, issues: Array.isArray(data.issues) ? data.issues : [] }
    } catch (err) {
      console.error('[PromptBuilder] card safety check failed:', err)
      return { ok: true, issues: [] }
    }
  }

  async function saveBlockToSupabase(index: number, draft: DraftBlock, meta: DraftCardMeta): Promise<boolean> {
    if (!ownerId) return false
    updateDraftMeta(index, { saveError: null, isSaving: true })
    try {
      let resolvedTopicId = ''
      if (meta.topicName.trim() && meta.type) {
        const existing = allTopics.find(t => t.type === meta.type && t.name.toLowerCase() === meta.topicName.trim().toLowerCase())
        if (existing) resolvedTopicId = existing.id
        else {
          const topicRes = await fetch('/api/admin/topics', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: meta.topicName.trim(), type: meta.type }),
          })
          if (topicRes.ok) { const newTopic: Topic = await topicRes.json(); setAllTopics(prev => [...prev, newTopic]); resolvedTopicId = newTopic.id }
        }
      }
      const res = await fetch('/api/admin/blocks/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: meta.type, topic_id: resolvedTopicId || null, title: meta.blockName.trim(),
          body: draft.content, source_id: contentId, owner_id: ownerId, is_default: meta.isDefault,
          prompt_set_id: activePromptSetId,   // NEW (§4) — routes the block to the selected set
          messages: chatMessages.slice(sessionStartIndex).map(m => ({ role: m.role, content: m.content })),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        updateDraftMeta(index, { saveError: data?.error ?? 'Failed to save block.', isSaving: false })
        return false
      }
      removeDraft(index)
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
    const draft = draftBlocks[index]; const meta = draftMetas[index]
    if (!draft || !meta || !ownerId) return
    const missing: string[] = []
    if (!meta.type) missing.push('type')
    if (!meta.blockName.trim()) missing.push('block name')
    if (missing.length > 0) { updateDraftMeta(index, { saveError: `Missing required fields: ${missing.join(', ')}.` }); return }
    updateDraftMeta(index, { isChecking: true, issues: [], saveError: null })
    const result = await runCardSafetyCheck(draft.content)
    if (!result.ok && result.issues.length > 0) { updateDraftMeta(index, { isChecking: false, issues: result.issues }); return }
    updateDraftMeta(index, { isChecking: false })
    await saveBlockToSupabase(index, draft, meta)
  }

  async function handleSaveAnywayBlock(index: number) {
    const draft = draftBlocks[index]; const meta = draftMetas[index]
    if (!draft || !meta || !ownerId) return
    const missing: string[] = []
    if (!meta.type) missing.push('type')
    if (!meta.blockName.trim()) missing.push('block name')
    if (missing.length > 0) { updateDraftMeta(index, { saveError: `Missing required fields: ${missing.join(', ')}.` }); return }
    updateDraftMeta(index, { issues: [], saveError: null })
    await saveBlockToSupabase(index, draft, meta)
  }

  function handleRemoveOffendingFromCard(index: number, offendingText: string) {
    setDraftBlocks(prev => prev.map((d, i) => (i === index ? { ...d, content: d.content.replace(offendingText, '') } : d)))
    setDraftMetas(prev => prev.map((m, i) => (i !== index ? m : { ...m, issues: m.issues.filter(iss => iss.offendingText !== offendingText) })))
  }

  // ── Derived view bits ───────────────────────────────────────────────────────────
  const pills: ComposerPill[] = [
    { label: 'Summarize my prompt', disabled: existingBlocks.length === 0, onClick: () => handleOpeningChoice('summarize') },
    { label: 'Identify opportunities', disabled: existingBlocks.length === 0, onClick: () => handleOpeningChoice('opportunities') },
    { label: 'Create a new block', disabled: false, onClick: () => handleOpeningChoice('new') },
  ]

  const uploadStatus = (
    <>
      {fileUploading && (
        <Stack gap={4} px="sm" pb="xs">
          <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-xs)' }}>Processing your document...</Text>
          <Progress size="xs" animated value={100} />
        </Stack>
      )}
      {uploadedFileName && !fileUploading && (
        <UploadSavedRow name={uploadedFileName} onClear={() => { setUploadedFileName(null); setContentId(null); setUploadedRaw(null) }} />
      )}
      {uploadError && !fileUploading && (
        <Group gap="xs" px="sm" pb="xs">
          <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-xs)', color: 'var(--mantine-color-red-6)' }}>{uploadError}</Text>
          <button type="button" onClick={() => setUploadError(null)} aria-label="Dismiss error" style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
        </Group>
      )}
    </>
  )

  // Collapsible "Block metadata" panel — unchanged from current production.
  const metadataSection = (
    <div style={{ width: '100%', maxWidth: 720, margin: '8px auto 0' }}>
      <button
        type="button"
        onClick={() => setMetadataOpen(o => !o)}
        aria-expanded={metadataOpen}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', color: 'var(--mantine-color-dimmed)', fontFamily: 'var(--mantine-font-family)', fontSize: 12 }}
      >
        Block metadata
        <span style={{ display: 'inline-block', transition: 'transform 150ms ease', transform: metadataOpen ? 'rotate(180deg)' : 'rotate(0deg)', fontSize: 10 }}>▾</span>
      </button>
      <Collapse in={metadataOpen}>
        <Stack gap="sm" pt="xs">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Select label="Type" placeholder="Select a type..." data={TYPES} value={type || null} onChange={handleTypeChange} allowDeselect={false} size="sm" />
            {type && (
              <Stack gap={6}>
                {topicsLoading ? (
                  <Text variant="muted" className="text-xs">Loading topics...</Text>
                ) : (
                  <Select
                    label="Topic" placeholder="Select a topic..."
                    data={[...filteredTopics.map(t => ({ value: t.id, label: t.name })), { value: '__new__', label: 'New topic...' }]}
                    value={newTopicMode ? '__new__' : (topicId || null)} onChange={handleTopicChange} allowDeselect={false} size="sm"
                  />
                )}
                {newTopicMode && (
                  <Group gap="xs" wrap="nowrap">
                    <TextInput autoFocus value={newTopicName} onChange={e => setNewTopicName(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') confirmNewTopic() }} placeholder="Topic name..." style={{ flex: 1, minWidth: 0 }} size="sm" />
                    <Button size="sm" variant="primary" onClick={confirmNewTopic} disabled={isCreatingTopic}>{isCreatingTopic ? '...' : 'Add'}</Button>
                    <Button size="sm" variant="ghost" onClick={cancelNewTopic} disabled={isCreatingTopic}>Cancel</Button>
                  </Group>
                )}
              </Stack>
            )}
          </SimpleGrid>
          <TextInput label="Block name" value={blockName} onChange={e => setBlockName(e.currentTarget.value)} placeholder="e.g. Off-limit topics, Career summary..." size="sm" />
        </Stack>
      </Collapse>
    </div>
  )

  // ── Render — three-region chat-app layout ───────────────────────────────────────
  return (
    <div className="relative flex h-full min-h-0 flex-row overflow-hidden" data-screen-label="Admin · Composer">
      <ConversationSidebar
        open={sidebarOpen}
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={selectConversation}
        onNew={startNewConversation}
        onClose={() => setSidebarOpen(false)}
      />
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'absolute', inset: 0, zIndex: 25, background: 'rgba(26,25,23,0.18)' }}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col min-h-0">
        {/* Top bar: hamburger · title · Copy all · exchange badge */}
        <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Toggle conversations"
            aria-expanded={sidebarOpen}
            title="Conversations"
            className="grid h-[34px] w-[34px] place-items-center rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <Text variant="title" style={{ margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{topBarTitle}</Text>
          <span className="ml-auto" />
          {/* NEW (§4): which prompt set a saved block lands in, + inline create. Hidden until sets load. */}
          {promptSets.length > 0 && activePromptSetId && (
            <PromptSetPicker
              sets={promptSets}
              activeId={activePromptSetId}
              onSelect={setActivePromptSetId}
              onCreate={createPromptSet}
            />
          )}
          {exchangeCount > 0 && (
            <span
              className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full border px-2.5 text-[11px]"
              style={{
                fontFamily: 'var(--mantine-font-family-monospace)',
                borderColor: exchangeCount >= MAX_EXCHANGES ? 'var(--mantine-color-red-5)' : exchangeCount >= WARN_THRESHOLD ? '#f59f00' : 'var(--mantine-color-gray-3)',
                color: exchangeCount >= MAX_EXCHANGES ? 'var(--mantine-color-red-6)' : exchangeCount >= WARN_THRESHOLD ? '#e67700' : 'var(--mantine-color-gray-7)',
              }}
            >
              {exchangeCount} of {MAX_EXCHANGES} exchanges
            </span>
          )}
          <button
            type="button"
            onClick={handleCopyAll}
            disabled={!hasMessages}
            className="border-none bg-transparent text-xs disabled:opacity-40"
            style={{ color: copiedAll ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-dimmed)', cursor: hasMessages ? 'pointer' : 'not-allowed' }}
          >
            {copiedAll ? 'Copied!' : 'Copy all'}
          </button>
        </div>

        {/* Scroll region: welcome / thread / draft cards */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {!hasMessages ? (
            <div className="flex flex-1 flex-col items-center justify-center px-4 py-6 text-center">
              <p style={{ fontFamily: 'var(--mantine-font-family-headings)', fontSize: 'clamp(1.25rem,2.5vw,1.6rem)', color: 'var(--mantine-color-gray-7)', fontWeight: 500, letterSpacing: '-0.02em', maxWidth: 440, lineHeight: 1.35, margin: 0 }}>
                Welcome back{authUser?.name ? `, ${authUser.name.split(' ')[0]}` : ''}.<br />
                <span style={{ display: 'inline-block', marginTop: 8, fontFamily: 'var(--mantine-font-family)', fontSize: 14, fontWeight: 400, color: 'var(--mantine-color-dimmed)' }}>
                  Build a block, or pick a starting point below.
                </span>
              </p>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-[800px] flex-col gap-4 px-4 py-4 sm:px-6">
              {draftBlocks.length > 0 && (
                <Text variant="muted" style={{ textAlign: 'center', padding: 'var(--mantine-spacing-md) 0' }}>
                  Here {draftBlocks.length === 1 ? 'is 1 block' : `are ${draftBlocks.length} blocks`} based on your input.
                </Text>
              )}

              {/* Plain message turns */}
              {draftBlocks.length === 0 && !(chatLoading && chatMessages.some(m => m.role === 'user')) &&
                chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className="flex max-w-[85%] flex-col gap-1 sm:max-w-[75%]">
                      <div
                        className={`cursor-pointer rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'whitespace-pre-wrap text-white' : 'text-gray-900 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-1'}`}
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
                        {msg.role === 'assistant'
                          ? (msg.content ? <ReactMarkdown>{msg.content}</ReactMarkdown> : chatLoading ? <span className="text-gray-400">Thinking...</span> : null)
                          : msg.content}
                      </div>
                      <span className={`text-xs ${msg.role === 'user' ? 'text-right' : 'text-left'}`} style={{ color: 'var(--mantine-color-gray-5)' }}>
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                  </div>
                ))}

              {/* Drafting turn — keep production's skeleton cards + cycling status */}
              {draftBlocks.length === 0 && chatLoading && chatMessages.some(m => m.role === 'user') && (
                <>
                  <Text variant="muted" style={{ textAlign: 'center', padding: 'var(--mantine-spacing-sm) 0' }}>
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
                          {[60, 40, 50].map((w, k) => (
                            <Stack key={k} gap={4}><Skeleton height={10} width={w} radius="sm" /><Skeleton height={36} radius="sm" /></Stack>
                          ))}
                        </SimpleGrid>
                        <Group gap="xs"><Skeleton height={32} width={100} radius="sm" /><Skeleton height={32} width={80} radius="sm" /></Group>
                      </Stack>
                    </Card>
                  ))}
                </>
              )}

              {/* Block confirmation cards */}
              {draftBlocks.map((draft, cardIndex) => {
                const meta = draftMetas[cardIndex]
                if (!meta) return null
                return (
                  <DraftCard
                    key={cardIndex}
                    draft={draft} meta={meta} index={cardIndex} count={draftBlocks.length}
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

              {/* AI closing message */}
              {draftBlocks.length > 0 && closingMessage && (
                <Text variant="muted" style={{ textAlign: 'center', padding: 'var(--mantine-spacing-sm) var(--mantine-spacing-md)', fontSize: 'var(--mantine-font-size-sm)', lineHeight: 1.6 }}>
                  {closingMessage}
                </Text>
              )}

              {/* Exchange limit */}
              {isAtLimit && draftBlocks.length === 0 && (
                <Card variant="outlined" style={{ borderColor: 'var(--mantine-color-red-2)', backgroundColor: 'var(--mantine-color-red-0)' }}>
                  <Stack gap="xs">
                    <Text variant="label" style={{ color: 'var(--mantine-color-red-7)' }}>Exchange limit reached</Text>
                    <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>You&apos;ve reached the exchange limit for this session. Save your block or start a new chat.</Text>
                    <Group gap="xs"><Button variant="ghost" size="sm" onClick={resetChat}>Start new chat</Button></Group>
                  </Stack>
                </Card>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Footer: Heirloom composer + Block metadata */}
        <div className="shrink-0 px-4 py-3 sm:px-6 sm:pb-[18px]">
          <Composer
            input={chatInput}
            onInputChange={setChatInput}
            onSend={handleSend}
            onPickFile={() => fileInputRef.current?.click()}
            loading={chatLoading}
            atLimit={isAtLimit}
            pills={hasMessages ? null : pills}
            uploadStatus={uploadStatus}
          />
          {metadataSection}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={e => { const f = e.target.files?.[0] ?? null; if (f) handleFileUpload(f); e.target.value = '' }}
            style={{ display: 'none' }}
          />
        </div>
      </div>
    </div>
  )
}
