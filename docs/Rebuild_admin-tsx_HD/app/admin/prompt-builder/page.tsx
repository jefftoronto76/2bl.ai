'use client'

// Prompt Studio · Composer — conversational block builder. Full-bleed chat layout:
// thread sidebar, prompt-set picker, guided exchange that drafts a prompt block, and
// a save-to-set flow. Route: /admin/prompt-builder
//
// The assistant replies here are canned (setTimeout) to demonstrate the flow. Wire
// send()/opening() to your model endpoint and saveDraft() to your block mutation.
// TODO: replace COMPOSER_PROMPT_SETS / COMPOSER_EXISTING with live data.

import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Badge, Box, Button, Center, Group, Menu, Text } from '@mantine/core'
import {
  IconBrandGoogleDrive, IconCamera, IconCheck, IconFile, IconLayoutSidebar, IconPlus, IconSend, IconX,
} from '@tabler/icons-react'
import { COMPOSER_EXISTING, COMPOSER_PROMPT_SETS } from '@/components/admin/lib/fixtures'
import { notify } from '@/components/admin/lib/primitives'
import { ConversationSidebar, type ChatMessage, type Thread } from './ConversationSidebar'
import { DraftCard, MetadataSection, PromptSetPicker, type ComposerSet, type Draft } from './ComposerPickers'

const MAX_EXCHANGES = 10, WARN = 8
const MIN = 60000, HOUR = 3600000, DAY = 86400000
const now = Date.now()
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const bold = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

const CSS = `
.cmp-typing { display: inline-flex; gap: 4px; align-items: center; }
.cmp-typing i { width: 6px; height: 6px; border-radius: 999px; background: var(--mantine-color-gray-5); animation: cmpblink 1.2s infinite both; }
.cmp-typing i:nth-child(2) { animation-delay: 0.2s; }
.cmp-typing i:nth-child(3) { animation-delay: 0.4s; }
@keyframes cmpblink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
.cmp-md p { margin: 0 0 8px; } .cmp-md p:last-child { margin-bottom: 0; }
.cmp-md li { margin: 2px 0 2px 18px; }
.cmp-input-ta { font-family: inherit; font-size: 14px; line-height: 1.5; border: none; outline: none; resize: none; width: 100%; background: transparent; color: var(--mantine-color-text); max-height: 160px; }
`

const SAMPLE_THREADS: Thread[] = [
  { id: 'th-timeline', title: 'Engagement timeline block', group: 'Today', preview: 'Saved a Knowledge block on phasing', ts: now - 40 * MIN, messages: [
    { role: 'user', content: 'Visitors keep asking how long a typical engagement runs. Can we add something?', timestamp: now - 52 * MIN },
    { role: 'assistant', content: "Good catch — that's a Knowledge gap today. Tell me the rough shape of a typical engagement and I'll draft a block Sage can quote.", timestamp: now - 51 * MIN },
    { role: 'user', content: 'Discovery is ~2 weeks, build is 6–8 weeks, then a 2-week handoff.', timestamp: now - 41 * MIN },
    { role: 'assistant', content: "Here's a block drafted from that. Review the type and name, then save it.", timestamp: now - 40 * MIN },
  ] },
  { id: 'th-offlimits', title: 'Off-limits competitors', group: 'Today', preview: 'Named two competitors to avoid', ts: now - 5 * HOUR, messages: [
    { role: 'user', content: 'Our off-limits block is vague. Sage should avoid naming competitors directly.', timestamp: now - 5 * HOUR - 3 * MIN },
    { role: 'assistant', content: 'Understood. Which competitors should Sage decline to discuss, and how should it redirect?', timestamp: now - 5 * HOUR - 2 * MIN },
  ] },
  { id: 'th-persona', title: 'Persona & tone refresh', group: 'This week', preview: 'Tightened the voice guidance', ts: now - 2 * DAY, messages: [
    { role: 'user', content: 'Sage sounds a little stiff. Can we warm up the tone without losing precision?', timestamp: now - 2 * DAY },
    { role: 'assistant', content: 'We can. I drafted an updated Identity & Voice block — plain-spoken, warm, still exact. Take a look.', timestamp: now - 2 * DAY + MIN },
  ] },
  { id: 'th-booking', title: 'Booking flow follow-up', group: 'Earlier', preview: 'Process block for not-ready visitors', ts: now - 9 * DAY, messages: [
    { role: 'user', content: "What happens when someone isn't ready to book yet?", timestamp: now - 9 * DAY },
    { role: 'assistant', content: 'Right now nothing catches them. A short Process block offering a lighter next step would help. Want me to draft one?', timestamp: now - 9 * DAY + MIN },
  ] },
]

export default function ComposerPage() {
  const userName = 'Jeff Lougheed'
  const existing = COMPOSER_EXISTING
  const newThread = (): Thread => ({ id: 'th-' + Math.random().toString(36).slice(2, 8), title: 'New conversation', group: 'Today', draft: true, ts: Date.now(), messages: [] })

  const [threads, setThreads] = useState<Thread[]>(() => [newThread(), ...SAMPLE_THREADS])
  const [activeId, setActiveId] = useState<string>(() => threads[0].id)
  const active = threads.find((t) => t.id === activeId) || threads[0]
  const [messages, setMessages] = useState<ChatMessage[]>(active.messages)
  const [input, setInput] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [copiedAll, setCopiedAll] = useState(false)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [type, setType] = useState('')
  const [blockName, setBlockName] = useState('')
  const [sideOpen, setSideOpen] = useState(true)
  const [pillsOpen, setPillsOpen] = useState(true)
  const [sets, setSets] = useState<ComposerSet[]>(() => COMPOSER_PROMPT_SETS.map((s) => ({ ...s })))
  const [promptSet, setPromptSet] = useState<string>(() => sets[0].value)
  const activeSet = sets.find((s) => s.value === promptSet) || sets[0]
  const taRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const hasMessages = messages.length > 0
  const exchangeCount = messages.filter((m) => m.role === 'user').length
  const atLimit = exchangeCount >= MAX_EXCHANGES

  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [input])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, drafts, loading])

  const selectThread = (id: string) => {
    const t = threads.find((x) => x.id === id)
    if (!t) return
    setActiveId(id); setMessages(t.messages); setDrafts([]); setInput(''); setLoading(false)
  }
  const startNew = () => {
    const t = newThread()
    setThreads((ts) => [t, ...ts.filter((x) => !(x.draft && x.messages.length === 0))])
    setActiveId(t.id); setMessages([]); setDrafts([]); setInput(''); setLoading(false)
  }
  const renameThread = (id: string, title: string) => setThreads((ts) => ts.map((t) => (t.id === id ? { ...t, title, draft: false } : t)))
  const deleteThread = (id: string) => {
    const remaining = threads.filter((t) => t.id !== id)
    if (id === activeId) {
      const next = remaining[0] || newThread()
      setActiveId(next.id); setMessages(next.messages); setDrafts([]); setInput(''); setLoading(false)
      setThreads(remaining.length ? remaining : [next])
    } else setThreads(remaining)
  }
  const pushAssistant = (text: string, after?: () => void) => {
    setLoading(true)
    setTimeout(() => {
      setMessages((m) => [...m, { role: 'assistant', content: text, timestamp: Date.now() }])
      setLoading(false)
      after?.()
    }, 650)
  }

  const opening = (choice: 'summarize' | 'opportunities' | 'new') => {
    if (choice === 'new') {
      setMessages([{ role: 'assistant', content: "Sounds great — to get started, just type in what you're thinking for the block.", timestamp: Date.now() }])
      return
    }
    const text = choice === 'summarize'
      ? `You currently have ${existing.length} active blocks covering identity, guardrails, knowledge, process, and escalation. The foundation is solid. The biggest opportunity is fleshing out your **Knowledge** blocks with specific engagement details — that's where Sage gets vague today.`
      : `A few gaps stand out:\n\n- **Knowledge**: pricing is routed to a call, but there's no block on what a typical engagement timeline looks like.\n- **Process**: consider a follow-up block for visitors who aren't ready to book.\n- **Guardrail**: your off-limits block could name specific competitors to avoid.`
    setMessages([{ role: 'user', content: choice === 'summarize' ? 'Summarize my prompt' : 'Identify opportunities to improve', timestamp: Date.now() }])
    pushAssistant(text)
  }
  const send = () => {
    const text = input.trim()
    if (!text || loading || atLimit) return
    setInput(''); setDrafts([])
    setMessages((m) => [...m, { role: 'user', content: text, timestamp: Date.now() }])
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setMessages((m) => [...m, { role: 'assistant', content: "Here's a block drafted from what you shared. Review the type and name, then save it.", timestamp: Date.now() }])
      setDrafts([{ title: blockName || 'New block', content: text, suggestedType: type || 'knowledge', suggestedTopic: '' }])
    }, 800)
  }
  const createSet = (name: string, usage_type: string, description: string) => {
    const value = 'set-' + Math.random().toString(36).slice(2, 7)
    setSets((arr) => [...arr, { value, label: name, version: 1, status: 'Draft', usage_type: usage_type || null, description: description || '' }])
    setPromptSet(value)
    notify({ color: 'green', title: 'Prompt set created', message: `"${name}" is ready — new blocks will save here.` })
  }
  const saveDraft = (i: number) => {
    setDrafts((d) => d.filter((_, idx) => idx !== i))
    notify({ color: 'green', title: 'Block saved', message: `Added to ${activeSet.label}.` })
    pushAssistant(`Block saved to ${activeSet.label}. What would you like to build next?`)
  }
  const removeDraft = (i: number) => setDrafts((d) => d.filter((_, idx) => idx !== i))
  const copyAll = () => { navigator.clipboard?.writeText(messages.map((m) => `${m.role}: ${m.content}`).join('\n\n')); setCopiedAll(true); setTimeout(() => setCopiedAll(false), 1500) }
  const copyBubble = (i: number, c: string) => { navigator.clipboard?.writeText(c); setCopiedId(i); setTimeout(() => setCopiedId(null), 1000) }

  const renderMd = (text: string) => (
    <div
      className="cmp-md"
      dangerouslySetInnerHTML={{
        __html: text.split('\n').map((line) => {
          if (line.trim().startsWith('- ')) return `<li>${bold(line.trim().slice(2))}</li>`
          if (!line.trim()) return ''
          return `<p>${bold(line)}</p>`
        }).join(''),
      }}
    />
  )

  const pills = [
    { label: 'Summarize my prompt', disabled: existing.length === 0, onClick: () => opening('summarize') },
    { label: 'Identify opportunities', disabled: existing.length === 0, onClick: () => opening('opportunities') },
    { label: 'Create a new block', disabled: false, onClick: () => opening('new') },
  ]
  const exchBadge = exchangeCount >= MAX_EXCHANGES ? 'red' : exchangeCount >= WARN ? 'yellow' : 'gray'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }} data-screen-label="Prompt Studio · Composer">
      <style>{CSS}</style>
      <ConversationSidebar open={sideOpen} threads={threads} activeId={activeId} onSelect={selectThread} onNew={startNew} onClose={() => setSideOpen(false)} onRename={renameThread} onDelete={deleteThread} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#FAF6EE' }}>
        <Group gap="sm" px="lg" py="sm" wrap="nowrap" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', background: '#fff' }}>
          {!sideOpen && <ActionIcon variant="subtle" color="gray" onClick={() => setSideOpen(true)} aria-label="Conversations"><IconLayoutSidebar size={18} /></ActionIcon>}
          <Text fw={600} style={{ fontFamily: 'var(--mantine-headings-font-family)', fontSize: 18 }}>{active.draft && !hasMessages ? 'Composer' : active.title}</Text>
          <div style={{ flex: 1 }} />
          <Group gap={8} wrap="nowrap" align="center">
            <Text c="dimmed" size="xs" visibleFrom="sm">Building in</Text>
            <PromptSetPicker sets={sets} value={promptSet} setValue={setPromptSet} onCreate={createSet} />
            {exchangeCount > 0 && <Badge variant="light" color={exchBadge} radius="sm" size="sm">{exchangeCount} of {MAX_EXCHANGES}</Badge>}
            <Button size="xs" variant={copiedAll ? 'light' : 'default'} color={copiedAll ? 'green' : 'gray'} disabled={!hasMessages} onClick={copyAll}>{copiedAll ? 'Copied!' : 'Copy all'}</Button>
          </Group>
        </Group>

        <Box style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
          {!hasMessages ? (
            <Center style={{ minHeight: '50%', flexDirection: 'column', textAlign: 'center' }}>
              <Text style={{ fontFamily: 'var(--mantine-headings-font-family)', fontSize: 26, color: 'var(--mantine-color-text)' }}>Welcome back, {userName.split(' ')[0]}.</Text>
              <Text c="dimmed" mt={6}>Build a block, or pick a starting point below.</Text>
            </Center>
          ) : (
            <Box style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--mantine-spacing-md)' }}>
              {drafts.length > 0 && <Text ta="center" c="dimmed" size="sm">Here {drafts.length === 1 ? 'is 1 block' : `are ${drafts.length} blocks`} based on your input.</Text>}
              {messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '78%' }}>
                    <div
                      onClick={() => m.content && copyBubble(i, m.content)} title="Click to copy"
                      style={{
                        cursor: 'pointer', padding: '10px 14px', borderRadius: 14, fontSize: 14, lineHeight: 1.55,
                        background: m.role === 'user' ? 'var(--mantine-color-brand-6)' : '#fff', color: m.role === 'user' ? '#fff' : 'var(--mantine-color-text)',
                        border: m.role === 'user' ? 'none' : '1px solid var(--mantine-color-gray-2)',
                        outline: copiedId === i ? '2px solid var(--mantine-color-green-5)' : '2px solid transparent', outlineOffset: 1,
                      }}
                    >
                      {m.role === 'assistant' ? renderMd(m.content) : m.content}
                    </div>
                    <Text c="dimmed" style={{ fontSize: 11, marginTop: 3, textAlign: m.role === 'user' ? 'right' : 'left' }}>{fmtTime(m.timestamp)}</Text>
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '12px 16px', borderRadius: 14, background: '#fff', border: '1px solid var(--mantine-color-gray-2)' }}>
                    <span className="cmp-typing"><i /><i /><i /></span>
                  </div>
                </div>
              )}
              {drafts.map((d, i) => <DraftCard key={i} draft={d} index={i} count={drafts.length} onSave={saveDraft} onRemove={removeDraft} />)}
              <div ref={endRef} />
            </Box>
          )}
        </Box>

        <Box px="lg" py="md" style={{ borderTop: '1px solid var(--mantine-color-gray-2)', background: '#fff' }}>
          <Box style={{ maxWidth: 760, margin: '0 auto' }}>
            {!hasMessages && pillsOpen && (
              <Group gap={8} mb="sm" wrap="wrap">
                {pills.map((p) => <Button key={p.label} size="xs" variant="default" radius="xl" disabled={p.disabled || atLimit} onClick={p.onClick}>{p.label}</Button>)}
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setPillsOpen(false)} aria-label="Hide suggestions"><IconX size={13} /></ActionIcon>
              </Group>
            )}
            {!hasMessages && !pillsOpen && <Button size="xs" variant="subtle" color="gray" mb="sm" leftSection={<span>✦</span>} onClick={() => setPillsOpen(true)}>Suggestions</Button>}

            <Box style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-md)', background: '#fff', padding: 10 }}>
              <Group gap="sm" align="flex-end" wrap="nowrap">
                <Menu position="top-start" withinPortal shadow="md">
                  <Menu.Target><ActionIcon variant="subtle" color="gray" disabled={atLimit} aria-label="Add content"><IconPlus size={18} /></ActionIcon></Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item leftSection={<IconFile size={16} />} onClick={() => setUploaded(true)}>Add files</Menu.Item>
                    <Menu.Item leftSection={<IconBrandGoogleDrive size={16} />} disabled>Google Drive</Menu.Item>
                    <Menu.Item leftSection={<IconCamera size={16} />} disabled>Take a screenshot</Menu.Item>
                  </Menu.Dropdown>
                </Menu>
                <textarea
                  ref={taRef} className="cmp-input-ta" rows={1} value={input} disabled={atLimit}
                  placeholder={atLimit ? 'Exchange limit reached' : 'Type or paste content for a block…'}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                />
                <ActionIcon variant="filled" color="brand" radius="xl" size={34} disabled={atLimit || !input.trim()} onClick={send} aria-label="Send"><IconSend size={17} /></ActionIcon>
              </Group>
              {uploaded && (
                <Group gap={6} mt={8} pl={4}>
                  <IconCheck size={13} style={{ color: 'var(--mantine-color-green-7)' }} />
                  <Text size="xs" c="dimmed">Saved to assets.</Text>
                  <ActionIcon variant="subtle" color="gray" size="xs" onClick={() => setUploaded(false)}><IconX size={12} /></ActionIcon>
                </Group>
              )}
            </Box>
            <Group justify="space-between" mt={8}>
              <MetadataSection type={type} setType={setType} blockName={blockName} setBlockName={setBlockName} />
              <Text c="dimmed" style={{ fontSize: 11 }}>↵ to send · ⇧↵ new line</Text>
            </Group>
          </Box>
        </Box>
      </div>
    </div>
  )
}
