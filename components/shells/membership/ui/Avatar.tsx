interface AvatarProps {
  initials: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function Avatar({ initials, size = 'md', className = '' }: AvatarProps) {
  const sizes = {
    sm: 'w-8 h-8 text-base',
    md: 'w-10 h-10 text-base',
  };

  return (
    <div
      className={`${sizes[size]} rounded-full bg-accent flex items-center justify-center font-body font-semibold text-background uppercase select-none ${className}`}
    >
      {initials}
    </div>
  );
}
