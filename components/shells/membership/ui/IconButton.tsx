import React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  children: React.ReactNode;
}

export function IconButton({ label, active = false, className = '', children, ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        active
          ? 'bg-text-primary/15 text-text-primary'
          : 'text-text-muted hover:bg-text-primary/10 hover:text-text-primary'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
