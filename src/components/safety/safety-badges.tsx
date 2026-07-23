import * as React from 'react';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

/**
 * Badges del módulo de Seguridad.
 *
 * `getStatusBadge` estaba copiado en 6 páginas y `getRiskBadge` en otras 6,
 * cada una con sus propios colores fijos (`bg-yellow-500`, `bg-green-600`,
 * `bg-black`…). Las copias ya se habían desincronizado en las etiquetas.
 * Aquí viven las tres escalas del dominio, una sola vez.
 */

// ── Estado de una tarea (checklist o inspección asignada) ────────────────────

type TaskStatus = 'assigned' | 'open' | 'in-progress' | 'completed' | 'approved' | 'rejected';

const TASK_STATUS: Record<TaskStatus, { label: string; tone: StatusTone }> = {
  assigned: { label: 'Asignado', tone: 'info' },
  open: { label: 'Abierta', tone: 'info' },
  'in-progress': { label: 'En Progreso', tone: 'warning' },
  completed: { label: 'Completado', tone: 'success' },
  approved: { label: 'Aprobado', tone: 'success' },
  rejected: { label: 'Rechazado', tone: 'danger' },
};

export interface TaskStatusBadgeProps {
  status: string;
  /**
   * En las bandejas de revisión, `completed` no significa "listo" sino
   * "esperando que el APR lo revise", así que cambia etiqueta y tono.
   */
  review?: boolean;
  className?: string;
}

export function TaskStatusBadge({ status, review = false, className }: TaskStatusBadgeProps) {
  if (review && status === 'completed') {
    return <StatusBadge tone="warning" className={className}>Listo para Revisar</StatusBadge>;
  }
  const cfg = TASK_STATUS[status as TaskStatus];
  if (!cfg) return <StatusBadge tone="neutral" className={className}>{status}</StatusBadge>;
  return <StatusBadge tone={cfg.tone} className={className}>{cfg.label}</StatusBadge>;
}

// ── Nivel de riesgo de una inspección ────────────────────────────────────────

/** `fatal` va en danger sólido (no tinte) para que salte a la vista. */
const SOLID_DANGER = 'bg-danger text-background border-danger';

const INSPECTION_RISK: Record<string, { label: string; tone: StatusTone; solid?: boolean }> = {
  leve: { label: 'Leve', tone: 'warning' },
  grave: { label: 'Grave', tone: 'danger' },
  fatal: { label: 'Fatal', tone: 'danger', solid: true },
};

export interface RiskBadgeProps {
  level?: string | null;
  /** Antepone «Riesgo » a la etiqueta (usado en la vista de detalle). */
  withPrefix?: boolean;
  className?: string;
}

/** Riesgo de inspección: leve / grave / fatal. Devuelve `null` si no hay nivel. */
export function InspectionRiskBadge({ level, withPrefix = false, className }: RiskBadgeProps) {
  if (!level) return null;
  const cfg = INSPECTION_RISK[level];
  if (!cfg) return null;
  return (
    <StatusBadge tone={cfg.tone} className={cn(cfg.solid && SOLID_DANGER, className)}>
      {withPrefix ? `Riesgo ${cfg.label}` : cfg.label}
    </StatusBadge>
  );
}

// ── Nivel de riesgo de una observación de conducta ───────────────────────────

const OBSERVATION_RISK: Record<string, { label: string; tone: StatusTone; solid?: boolean }> = {
  aceptable: { label: 'Aceptable', tone: 'success' },
  leve: { label: 'Leve', tone: 'warning' },
  grave: { label: 'Grave', tone: 'danger' },
  gravisimo: { label: 'Gravísimo', tone: 'danger', solid: true },
};

/** Riesgo de observación de conducta: aceptable / leve / grave / gravísimo. */
export function ObservationRiskBadge({ level, className }: RiskBadgeProps) {
  const cfg = level ? OBSERVATION_RISK[level] : undefined;
  if (!cfg) return <StatusBadge tone="neutral" className={className}>N/A</StatusBadge>;
  return (
    <StatusBadge tone={cfg.tone} className={cn(cfg.solid && SOLID_DANGER, className)}>
      {cfg.label}
    </StatusBadge>
  );
}
