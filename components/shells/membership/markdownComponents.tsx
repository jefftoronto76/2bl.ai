// Warm, readable prose styling for Heirloom's membership chat — the first
// markdown surface this chat has had. Mirrors the shape of the widget's
// sage/markdownComponents.tsx (same component keys, same inline-vs-block
// code handling) but uses the Heirloom Tailwind tokens instead of inline
// styles, and is intentionally plainer than technical documentation: no
// tables, no strikethrough (not needed, and inert without remark-gfm).
export const membershipMarkdownComponents = {
  p: ({ children }: any) => (
    <p className="mb-3 font-body text-base leading-relaxed text-text-primary last:mb-0">{children}</p>
  ),
  strong: ({ children }: any) => (
    <strong className="font-semibold text-text-primary">{children}</strong>
  ),
  em: ({ children }: any) => <em className="italic">{children}</em>,
  a: ({ href, children }: any) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline underline-offset-2"
    >
      {children}
    </a>
  ),
  ul: ({ children }: any) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }: any) => (
    <li className="font-body text-base leading-relaxed text-text-primary">{children}</li>
  ),
  pre: ({ children }: any) => <>{children}</>,
  code: ({ children, className }: any) => {
    const isBlock = Boolean(className?.startsWith('language-'))
    return (
      <code
        className={
          isBlock
            ? 'mb-3 block rounded-lg bg-surface px-3 py-2 font-mono text-[13px] text-text-primary last:mb-0'
            : 'rounded bg-surface px-1 py-0.5 font-mono text-[13px] text-text-primary'
        }
      >
        {children}
      </code>
    )
  },
}
