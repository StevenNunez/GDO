import type { StatusTone } from '@/components/ui/status-badge';
import type { EstadoRdi } from '@/lib/rdi';

/**
 * Etiquetas y colores del estado de una RDI. Vive aparte para que la lista y la
 * ficha digan exactamente lo mismo — igual que `eepp-estado` y `adicional-estado`.
 */
export const ESTADO_RDI: Record<EstadoRdi, { label: string; tone: StatusTone }> = {
  abierta:      { label: 'Abierta',      tone: 'info' },
  'por-vencer': { label: 'Por vencer',   tone: 'warning' },
  vencida:      { label: 'Vencida',      tone: 'danger' },
  'sin-plazo':  { label: 'Sin plazo',    tone: 'neutral' },
  respondida:   { label: 'Respondida',   tone: 'success' },
  cerrada:      { label: 'Cerrada',      tone: 'neutral' },
  anulada:      { label: 'Anulada',      tone: 'neutral' },
};

/** Cómo se lee el plazo en la lista, sin tener que abrir la RDI. */
export function textoPlazo(dias: number | null): string {
  if (dias === null) return 'Sin plazo';
  if (dias < 0) return `${Math.abs(dias)} días de atraso`;
  if (dias === 0) return 'Vence hoy';
  return `${dias} días`;
}
