export const markdownComponents = {
  p: ({ children }: any) => (
    <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '16px', color: 'var(--color-text-primary)', margin: '0 0 12px 0' }}>
      {children}
    </p>
  ),
  strong: ({ children }: any) => (
    <strong style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{children}</strong>
  ),
  ul: ({ children }: any) => (
    <ul style={{ paddingLeft: '16px', marginBottom: '12px', listStyleType: 'disc' }}>{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol style={{ paddingLeft: '16px', marginBottom: '12px' }}>{children}</ol>
  ),
  li: ({ children }: any) => <li>{children}</li>,
  pre: ({ children }: any) => <>{children}</>,
  code: ({ children, className }: any) => {
    const isBlock = Boolean(className?.startsWith('language-'))
    return (
      <code style={{
        fontFamily: 'DM Mono, monospace',
        fontSize: '13px',
        background: 'var(--color-border)',
        padding: isBlock ? '8px' : '2px 4px',
        borderRadius: isBlock ? '6px' : '3px',
        display: isBlock ? 'block' : 'inline',
        marginBottom: isBlock ? '12px' : '0',
      }}>
        {children}
      </code>
    )
  },
}
