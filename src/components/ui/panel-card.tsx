import * as React from 'react';
import { SurfaceCard } from '@/components/ui/surface-card';
import { cn } from '@/lib/utils';
import type { StatTone } from '@/components/ui/stat-tile';

const TONES: Record<StatTone, string> = {
  neutral: 'bg-primary/10 text-primary',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
};

export interface PanelCardProps {
  title: string;
  description?: React.ReactNode;
  icon?: React.ElementType;
  tone?: StatTone;
  /** Botones o enlaces alineados a la derecha del título. */
  actions?: React.ReactNode;
  /** Pie del panel, separado por una línea. */
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

/** Panel de sección dentro de un módulo: mismo lenguaje que las cards de la
 *  portada (muy redondeado, borde tenue) pero sin el hover que las levanta. */
export function PanelCard({
  title,
  description,
  icon: Icon,
  tone = 'neutral',
  actions,
  footer,
  className,
  contentClassName,
  children,
}: PanelCardProps) {
  return (
    <SurfaceCard interactive={false} className={className}>
      <div className="flex items-start justify-between gap-3 p-6 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                TONES[tone]
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={1.8} />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold tracking-tight">{title}</h2>
            {description && (
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      <div className={cn('flex-1 px-6 pb-6', contentClassName)}>{children}</div>

      {footer && <div className="border-t border-border px-6 py-3">{footer}</div>}
    </SurfaceCard>
  );
}
