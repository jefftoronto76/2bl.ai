import React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  children: React.ReactNode;
}

// The rest state's hover treatment is desktop-only — `[@media(hover:hover)]:`
// rather than a bare `hover:`. Tailwind v3 leaves `hoverOnlyWhenSupported`
// off by default (and tailwind.config.js does not enable it), so an unguarded
// `hover:` compiles to a plain `:hover` that WebKit synthesizes on touch —
// and it suppresses that first tap's click whenever the synthesized hover
// repaints what is under the finger. Every IconButton is an icon-only control
// (mobile drawer Close-X, modal dismiss, chat header actions), so the cost was
// a wasted first tap on exactly the controls with the smallest hit areas. The
// treatment here is purely decorative — background and text colour, never
// visibility — so dropping it on touch costs nothing.
export function IconButton({ label, active = false, className = '', children, ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        active
          ? 'bg-text-primary/15 text-text-primary'
          : 'text-text-muted [@media(hover:hover)]:hover:bg-text-primary/10 [@media(hover:hover)]:hover:text-text-primary'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
