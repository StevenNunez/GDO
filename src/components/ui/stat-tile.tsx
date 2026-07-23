import * as React from 'react';
import { cn } from '@/lib/utils';

export type StatTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

/** Los tonos salen de los tokens semánticos de globals.css, así que funcionan
 *  igual en tema claro y oscuro. Nada de `text-amber-500` suelto. */
const TONES: Record<StatTone, string> = {
  neutral: 'bg-primary/10 text-primary',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
};

export interface StatTileProps {
  label: string;
  value: React.ReactNode;
  icon: React.ElementType;
  tone?: StatTone;
  /** Línea chica bajo el valor (variación, detalle, etc.). */
  sub?: React.ReactNode;
  className?: string;
}

/** Indicador numérico en el lenguaje de la portada: bordes muy redondeados,
 *  valor grande y compacto, ícono en un chip del tono correspondiente. */
export function StatTile({ label, value, icon: Icon, tone = 'neutral', sub, className }: StatTileProps) {
  return (
    <div
      className={cn(
        'group relative flex items-center gap-4 overflow-hidden rounded-3xl border border-border bg-card p-5 text-card-foreground shadow-sm transition-all duration-300 hover:border-cta/40',
        className
      )}
    >
      <span
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110',
          TONES[tone]
        )}
      >
        <Icon className="h-6 w-6" strokeWidth={1.7} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-2xl font-bold tracking-tighter">{value}</p>
        {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}
