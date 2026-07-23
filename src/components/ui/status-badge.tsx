import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Semantic status tones. Colors are theme-aware CSS tokens (see globals.css /
 * tailwind.config) tuned to stay legible on both light and dark grounds.
 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const toneClass: Record<StatusTone, string> = {
  success: 'bg-success-subtle text-success border-success/25',
  warning: 'bg-warning-subtle text-warning border-warning/25',
  danger: 'bg-danger-subtle text-danger border-danger/25',
  info: 'bg-info-subtle text-info border-info/25',
  neutral: 'bg-muted text-muted-foreground border-border',
};

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  icon?: React.ElementType;
}

/** A small, theme-aware status pill. Use `tone` for the semantic color. */
export function StatusBadge({ tone = 'neutral', icon: Icon, children, className, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        toneClass[tone],
        className
      )}
      {...props}
    >
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
      {children}
    </span>
  );
}
