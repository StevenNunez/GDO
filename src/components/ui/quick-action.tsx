import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface QuickActionProps {
  href: string;
  icon: React.ElementType;
  label: string;
  className?: string;
}

/**
 * Botón-acceso de una fila de acciones rápidas (arriba de un módulo).
 * Compacto y horizontal, para no competir con las ModuleCard.
 */
export function QuickAction({ href, icon: Icon, label, className }: QuickActionProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm transition-all duration-300',
        'hover:-translate-y-0.5 hover:border-cta/50 hover:shadow-[0_12px_28px_-12px_hsl(var(--cta)/0.3)]',
        className
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-muted to-muted/60 text-cta shadow-inner transition-transform duration-300 group-hover:scale-110">
        <Icon className="h-5 w-5" strokeWidth={1.6} />
      </span>
      <span className="text-sm font-semibold tracking-tight transition-colors group-hover:text-primary">
        {label}
      </span>
    </Link>
  );
}
