'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { readDataStream } from '@/services/chat/server/stream-utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface PendingBlock {
  topicId: string
  topicName: string
  name: string
  content: string
}

interface Props {
  data: any
  onAddBlock: (topicId: string, name: string, content: string) => void
}

function serializeData(data: any): string {
  const sections = [
    { key: 'guardrails', label: 'GUARDRAILS (hard rules, applied first)' },
    { key: 'knowledge',  label: 'KNOWLEDGE (what Sage knows)' },
    { key: 'prompts',    label: 'PROMPTS (voice, behavior, conversion)' },
  ]
  let out = ''
  for (const { key, label } of sections) {
    out += `\n[${label}]\n`
    for (const topic of data[key]?.topics ?? []) {
      out += `  Topic: "${topic.name}" (id: ${topic.id})\n`
      if (topic.blocks.length === 0) {
        out += `    (no blocks yet)\n`
      } else {
        for (const block of topic.blocks) {
          const preview = block.content.length > 120
            ? block.content.slice(0, 120) + '...'
            : block.content
          out += `    Block: "${block.name}" [${block.type}] — ${preview}\n`
        }
      }
    }
  }
  return out
}

async function streamPromptChat(
  messages: Message[],
  systemContext: string,
  onChunk: (accumulated: string) => void
): Promise<void> {
  const response = await fetch('/api/admin/prompt-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemContext }),
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)

  await readDataStream(response, onChunk)
}

function parseAction(text: string): { displayText: string; action: PendingBlock | null } {
  const match = text.match(/\n?\{"action":"add_block"[^\n}]*\}\s*$/)
  if (!match) return { displayText: text, action: null }
  try {
    const action = JSON.parse(match[0].trim())
    return {
      displayText: text.slice(0, text.length - match[0].length).trim(),
      action: {
        topicId: action.topicId,
        topicName: action.topicName,
        name: action.name,
        content: action.content,
      },
    }
  } catch {
    return { displayText: text, action: null }
  }
}

export function PromptBuilderChat({ data, onAddBlock }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isError, setIsError] = useState(false)
  const [pendingBlock, setPendingBlock] = useState<PendingBlock | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Greeting on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: "Hello! I'm here to help you build your prompts. What would you like to work on today?",
      }])
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [messages, isOpen])

  async function send() {
    const text = input.trim()
    if (!text || isStreaming) return

    setIsError(false)
    setPendingBlock(null)

    const userMsg: Message = { role: 'user', content: text }
    const history = [...messages, userMsg]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setIsStreaming(true)

    try {
      const systemContext = serializeData(data)
      let finalText = ''

      await streamPromptChat(history, systemContext, (accumulated) => {
        finalText = accumulated
        // Strip partial JSON action from display during streaming
        const displayText = accumulated.replace(/\n?\{"action":"add_block"[^\n}]*$/, '')
        setMessages([...history, { role: 'assistant', content: displayText }])
      })

      // Parse final response for block action
      const { displayText, action } = parseAction(finalText)
      setMessages([...history, { role: 'assistant', content: displayText }])
      if (action) setPendingBlock(action)
    } catch {
      setMessages(history)
      setIsError(true)
    }

    setIsStreaming(false)
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function confirmAddBlock() {
    if (!pendingBlock) return
    onAddBlock(pendingBlock.topicId, pendingBlock.name, pendingBlock.content)
    const confirmation = `Done! I've added "${pendingBlock.name}" to the ${pendingBlock.topicName} topic.`
    setMessages(m => [...m, { role: 'assistant', content: confirmation }])
    setPendingBlock(null)
  }

  return (
    <>
      {/* Fixed bottom banner */}
      <div
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          background: 'var(--mantine-color-green-filled)',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span style={{ color: 'var(--mantine-color-white)', fontSize: '14px', fontWeight: 500 }}>
          Need help? Chat with our AI assistant
        </span>
      </div>

      {/* Overlay */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 50,
              background: 'rgba(0,0,0,0.3)',
              backdropFilter: 'blur(4px)',
            }}
          />

          {/* Modal */}
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 51,
              width: '100%',
              maxWidth: '780px',
              height: '600px',
              background: 'var(--mantine-color-white)',
              borderRadius: 'var(--mantine-radius-lg)',
              boxShadow: 'var(--mantine-shadow-xl)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px 18px',
              borderBottom: '1px solid var(--mantine-color-gray-2)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '18px', color: 'var(--mantine-color-dark-9)' }}>
                  Chat Assistant
                </div>
                <div style={{ fontSize: '13px', color: 'var(--mantine-color-gray-5)', marginTop: '3px' }}>
                  Ask me anything about your prompts
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  color: 'var(--mantine-color-gray-5)',
                  fontSize: '20px',
                  lineHeight: 1,
                  marginTop: '2px',
                }}
                aria-label="Close chat"
              >
                ×
              </button>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}>
              {messages.map((msg, i) => {
                const isEmptyAssistant = msg.role === 'assistant' && !msg.content
                return (
                  <div
                    key={i}
                    style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
                  >
                    {isEmptyAssistant && isStreaming ? (
                      // Typing indicator
                      <div style={{
                        background: 'var(--mantine-color-gray-1)',
                        borderRadius: 'var(--mantine-radius-md)',
                        padding: '12px 16px',
                        display: 'flex',
                        gap: '5px',
                        alignItems: 'center',
                      }}>
                        {[0, 1, 2].map(j => (
                          <div key={j} style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            background: 'var(--mantine-color-gray-5)',
                            animation: `pbChatPulse 1.2s ease-in-out ${j * 0.2}s infinite`,
                          }} />
                        ))}
                      </div>
                    ) : msg.content ? (
                      <div style={{
                        maxWidth: '75%',
                        padding: '12px 16px',
                        background: msg.role === 'user' ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-gray-1)',
                        color: msg.role === 'user' ? 'var(--mantine-color-white)' : 'var(--mantine-color-dark-9)',
                        borderRadius: 'var(--mantine-radius-md)',
                        fontSize: '14px',
                        lineHeight: 1.65,
                        whiteSpace: 'pre-wrap',
                      }}>
                        {msg.content}
                      </div>
                    ) : null}
                  </div>
                )
              })}

              {/* Pending block confirm card */}
              {pendingBlock && (
                <div style={{
                  border: '1px solid var(--mantine-color-gray-2)',
                  borderRadius: 'var(--mantine-radius-md)',
                  padding: '14px 16px',
                  background: 'var(--mantine-color-white)',
                  flexShrink: 0,
                }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--mantine-color-gray-5)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: '8px',
                    fontFamily: 'var(--mantine-font-family-monospace)',
                  }}>
                    Suggested block → {pendingBlock.topicName}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--mantine-color-dark-9)', marginBottom: '4px' }}>
                    {pendingBlock.name}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--mantine-color-gray-5)', lineHeight: 1.55, marginBottom: '12px' }}>
                    {pendingBlock.content}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={confirmAddBlock}
                      style={{
                        padding: '6px 14px',
                        background: 'var(--mantine-color-green-filled)',
                        color: 'var(--mantine-color-white)',
                        border: 'none',
                        borderRadius: 'var(--mantine-radius-sm)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Add block
                    </button>
                    <button
                      onClick={() => setPendingBlock(null)}
                      style={{
                        padding: '6px 14px',
                        background: 'transparent',
                        color: 'var(--mantine-color-gray-5)',
                        border: '1px solid var(--mantine-color-gray-2)',
                        borderRadius: 'var(--mantine-radius-sm)',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {isError && (
                <div style={{ fontSize: '13px', color: 'var(--mantine-color-red-5)' }}>
                  Something went wrong. Please try again.
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div style={{
              borderTop: '1px solid var(--mantine-color-gray-2)',
              padding: '14px 24px 16px',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Type your message..."
                  rows={1}
                  style={{
                    flex: 1,
                    background: 'var(--mantine-color-gray-1)',
                    border: '1px solid var(--mantine-color-gray-2)',
                    borderRadius: 'var(--mantine-radius-md)',
                    padding: '10px 14px',
                    fontSize: '14px',
                    color: 'var(--mantine-color-dark-9)',
                    resize: 'none',
                    outline: 'none',
                    lineHeight: 1.5,
                    minHeight: '42px',
                    maxHeight: '120px',
                  }}
                />
                <button
                  onClick={send}
                  disabled={isStreaming || !input.trim()}
                  style={{
                    width: '38px',
                    height: '38px',
                    background: isStreaming || !input.trim() ? 'var(--mantine-color-gray-3)' : 'var(--mantine-color-green-filled)',
                    border: 'none',
                    borderRadius: 'var(--mantine-radius-md)',
                    cursor: isStreaming || !input.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'background 0.15s',
                  }}
                  aria-label="Send message"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--mantine-color-gray-5)' }}>
                Press Enter to send, Shift+Enter for new line
              </div>
            </div>
          </div>

          <style>{`
            @keyframes pbChatPulse {
              0%, 100% { opacity: 0.3; transform: scale(0.8); }
              50%       { opacity: 1;   transform: scale(1.1); }
            }
          `}</style>
        </>
      )}
    </>
  )
}
