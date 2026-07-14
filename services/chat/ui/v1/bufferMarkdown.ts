// services/chat/ui/v1/bufferMarkdown.ts
//
// Buffers incomplete trailing markdown so a streaming assistant message never
// flashes raw syntax (an unclosed `**bold`, an in-progress `[BOOKING: ...`
// marker bracket) before it resolves. Pure, no React — bufferMarkdown()
// returns the longest prefix of `text` that contains no unresolved inline
// token; the caller re-renders with the full string once streaming completes
// or the token closes on a later chunk.
//
// Deliberately conservative: plain prose with no markdown syntax at all must
// always pass through unchanged, and every truncation only ever holds back a
// strict suffix — it never rewrites or drops characters from the safe
// prefix. Emphasis delimiters follow CommonMark's flanking rule just enough
// to avoid misreading a `* ` bullet-list marker as an opening `*`: a `*`/`_`
// only opens a run when the following character is non-whitespace. Content
// inside a fenced code block is skipped entirely while scanning for inline
// tokens — backticks/asterisks in a code sample are literal, not markdown.

function isWhitespaceOrEnd(ch: string | undefined): boolean {
  return ch === undefined || /\s/.test(ch)
}

/**
 * Single left-to-right scan tracking every open delimiter (code fence,
 * inline code span, bold/italic run, link/image bracket, link URL parens).
 * Returns the index of the earliest one still unresolved at end-of-string,
 * or text.length if everything closed cleanly.
 */
function findCutoff(text: string): number {
  const n = text.length
  let i = 0

  let inFence = false
  let fenceOpenIndex = -1

  let inCode = false
  let codeDelimLen = 0
  let codeOpenIndex = -1

  let openEmphasis: '*' | '_' | '**' | '__' | null = null
  let openEmphasisIndex = -1

  let bracketDepth = 0
  let bracketOpenIndex = -1

  let inLinkUrl = false
  let linkUrlOpenIndex = -1

  while (i < n) {
    const ch = text[i]

    if (inFence) {
      if (text.startsWith('```', i)) {
        inFence = false
        fenceOpenIndex = -1
        i += 3
        continue
      }
      i++
      continue
    }

    if (text.startsWith('```', i)) {
      inFence = true
      fenceOpenIndex = i
      i += 3
      continue
    }

    if (inCode) {
      if (ch === '`') {
        let run = 0
        let j = i
        while (j < n && text[j] === '`') {
          run++
          j++
        }
        if (run === codeDelimLen) {
          inCode = false
          codeDelimLen = 0
          codeOpenIndex = -1
        }
        i = j
        continue
      }
      i++
      continue
    }

    if (inLinkUrl) {
      if (ch === ')') {
        inLinkUrl = false
        linkUrlOpenIndex = -1
      }
      i++
      continue
    }

    if (ch === '`') {
      let run = 0
      let j = i
      while (j < n && text[j] === '`') {
        run++
        j++
      }
      inCode = true
      codeDelimLen = run
      codeOpenIndex = i
      i = j
      continue
    }

    if (ch === '*' || ch === '_') {
      const isDouble = text[i + 1] === ch
      const width = isDouble ? 2 : 1
      const delim = (isDouble ? ch + ch : ch) as '*' | '_' | '**' | '__'

      if (openEmphasis === delim) {
        openEmphasis = null
        openEmphasisIndex = -1
      } else if (openEmphasis === null && !isWhitespaceOrEnd(text[i + width])) {
        // Only a plausible opener when not immediately followed by
        // whitespace (CommonMark's left-flanking rule) — this is what keeps
        // "* bullet" list markers from being misread as an emphasis opener.
        openEmphasis = delim
        openEmphasisIndex = i
      }
      i += width
      continue
    }

    if (ch === '!' && text[i + 1] === '[') {
      if (bracketDepth === 0) bracketOpenIndex = i
      bracketDepth++
      i += 2
      continue
    }

    if (ch === '[') {
      if (bracketDepth === 0) bracketOpenIndex = i
      bracketDepth++
      i++
      continue
    }

    if (ch === ']' && bracketDepth > 0) {
      bracketDepth--
      if (bracketDepth === 0) {
        if (text[i + 1] === '(') {
          inLinkUrl = true
          linkUrlOpenIndex = bracketOpenIndex
          i += 2
          continue
        }
        bracketOpenIndex = -1
      }
      i++
      continue
    }

    i++
  }

  const cutoffs: number[] = []
  if (inFence) cutoffs.push(fenceOpenIndex)
  if (inCode) cutoffs.push(codeOpenIndex)
  if (openEmphasisIndex !== -1) cutoffs.push(openEmphasisIndex)
  if (bracketDepth > 0 && bracketOpenIndex !== -1) cutoffs.push(bracketOpenIndex)
  if (inLinkUrl && linkUrlOpenIndex !== -1) cutoffs.push(linkUrlOpenIndex)

  return cutoffs.length === 0 ? n : Math.min(...cutoffs)
}

export function bufferMarkdown(text: string): string {
  if (!text) return text
  const cutoff = findCutoff(text)
  return cutoff >= text.length ? text : text.slice(0, cutoff)
}
