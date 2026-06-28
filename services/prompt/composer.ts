// services/prompt/composer.ts
//
// Pure prompt-assembly for the admin prompt-building surface. Returns system
// prompt strings; the route handlers own the runChatStream call and the 502
// error catch.
//
//   - getCompiledComposerSystem  → DB-driven system string for POST /api/admin/blocks/chat
//                                   falls back to BLOCKS_COMPOSER_SYSTEM when no live
//                                   compiled prompt exists for the compiler prompt set
//   - buildBlocksComposerSystem  → legacy hardcoded assembly (kept as fallback reference)
//   - buildPromptChatSystem      → system string for POST /api/admin/prompt-chat

import { getAdminClient } from '@/services/auth/supabase-admin'

export interface BlocksComposerInput {
  type: string
  topic: string
  content_type: string
  content: string
  messages: { role: string; content: string }[]
  documentContext?: string
  existingBlocks?: { title: string; type: string; body: string }[]
}

export interface PromptChatInput {
  messages: { role: string; content: string }[]
  systemContext: string
}

const BLOCKS_COMPOSER_SYSTEM = `You are a prompt block builder for Sage, an AI sales assistant. Your job is to help the owner create well-structured prompt blocks through conversation.

A block is one focused instruction or piece of context that will be compiled into Sage's master system prompt. There are five block types:

- Identity — who Sage is, tone, personality, voice
- Knowledge — factual context about the business, owner, or services
- Guardrail — a rule or constraint on what Sage should or should not do
- Process — step-by-step instructions for how Sage should handle a specific situation
- Escalation — when and how Sage should route a visitor to a human or off-ramp

Your process:
1. ALWAYS draft first. When the owner provides any content — typed, pasted, or uploaded — immediately draft one or more blocks from it. Never ask a clarifying question before attempting a draft.
2. If the content is rich enough to warrant multiple blocks, draft all of them in sequence. Present each draft clearly with its suggested type and topic.
3. Present drafts and ask if they capture what the owner meant.
4. Refine based on feedback, then commit to a final version.
5. For each block you draft, output the block prose followed immediately by its JSON object on the next line. One JSON object per block, output immediately when drafted — do not wait for confirmation.
{"done":true,"title":"[block title]","content":"[full block text]","type":"[suggested type]","topic":"[suggested topic]"}
When relevant, include an optional "warning" field with one concise sentence describing an issue the owner should know about — for example: overlap with an existing block, missing context, or a potential conflict. Format: {"done":true,"title":"...","content":"...","type":"...","topic":"...","warning":"One concise sentence describing the issue."}. Omit the field entirely if no warning applies.
6. After the last JSON object, output a closing message of 30 words or fewer. Confirm what was built and invite the owner to save, edit, or ask for changes. Do not repeat or summarize block content. Conversational, not formal.

Rules:
- Draft first, ask later. Only ask a clarifying question if it is genuinely impossible to draft anything from the input — this is the last resort, not the default.
- Even with minimal input, attempt a draft. A rough draft the owner can react to is always better than a question.
- Write blocks in second person directed at Sage ("When a visitor asks X, you should Y...")
- One idea per block, maximum 150 words
- Always suggest the block type and topic — the owner can override in the metadata sidebar
- You have a maximum of 10 exchanges per session`

/** Returns the assembled system prompt string for the block composer. */
export function buildBlocksComposerSystem(input: BlocksComposerInput): string {
  const { documentContext, existingBlocks } = input

  const documentSection = documentContext
    ? `\n\nThe owner has uploaded a document. Here is its content:\n\n${documentContext}\n\nUse this to suggest relevant blocks.`
    : ''

  const blocksSection =
    existingBlocks && existingBlocks.length > 0
      ? `\n\nHere are the owner's existing blocks:\n\n${existingBlocks.map(b => `- [${b.type}] ${b.title}: ${b.body}`).join('\n')}\n\nDo not duplicate existing blocks. Suggest blocks that fill gaps or complement what exists.`
      : ''

  return BLOCKS_COMPOSER_SYSTEM + documentSection + blocksSection
}

/**
 * DB-driven composer system prompt. Looks up the live compiler prompt set
 * (is_composer_prompt = true, status = 'live'), fetches its compiled prompt,
 * and appends dynamic XML context sections. Falls back to BLOCKS_COMPOSER_SYSTEM
 * when no compiled row exists.
 */
export async function getCompiledComposerSystem(input: BlocksComposerInput): Promise<string> {
  const { documentContext, existingBlocks } = input

  let basePrompt = BLOCKS_COMPOSER_SYSTEM

  try {
    const supabase = getAdminClient()

    const { data: promptSet } = await supabase
      .from('prompt_sets')
      .select('id')
      .eq('is_composer_prompt', true)
      .eq('status', 'live')
      .maybeSingle()

    if (promptSet?.id) {
      const { data: compiled } = await supabase
        .from('compiled_prompts')
        .select('content')
        .eq('prompt_set_id', promptSet.id)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (compiled?.content) {
        basePrompt = compiled.content
      }
    }
  } catch (err) {
    console.error('[composer] getCompiledComposerSystem: falling back to hardcoded prompt', err)
  }

  const documentSection = documentContext
    ? `\n\n<document_context>\n${documentContext}\n</document_context>`
    : ''

  const blocksSection =
    existingBlocks && existingBlocks.length > 0
      ? `\n\n<existing_blocks>\n${existingBlocks.map(b => `  <block type="${b.type}" title="${b.title}">${b.body}</block>`).join('\n')}\n</existing_blocks>`
      : ''

  return basePrompt + documentSection + blocksSection
}

/** Returns the assembled system prompt string for the prompt-builder chat. */
export function buildPromptChatSystem(input: PromptChatInput): string {
  const { systemContext } = input
  return `You are a helpful AI assistant for the Natural Resource Prompt Builder — an admin tool used to build and manage the system prompt for Sage, an AI assistant on jefflougheed.ca.

Your job: help the admin understand, improve, and add content to their prompt blocks. Answer questions about prompt engineering, suggest improvements, and help draft new block content.

If the user explicitly asks you to create or add a block, end your response with a JSON action on its own line in this exact format (no other text after it):
{"action":"add_block","topicId":"<id>","topicName":"<name>","name":"<short block name>","content":"<block content, max 150 words>"}

Only include the JSON action when the user has explicitly asked to create/add a block. For questions, analysis, and suggestions, just respond in plain text.

Be concise and direct. Professional tone.

Current prompt builder contents:
${systemContext}`
}
