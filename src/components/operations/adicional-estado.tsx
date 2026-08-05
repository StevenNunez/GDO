import type { StatusTone } from '@/components/ui/status-badge';
import type { AmendmentStatus, AmendmentType } from '@/modules/core/lib/data';

/**
 * Etiquetas y colores del trámite del adicional. Vive aparte para que la lista,
 * el detalle y el PDF digan exactamente lo mismo — igual que `eepp-estado`.
 */
export const ESTADO_ADICIONAL: Record<AmendmentStatus, { label: string; tone: StatusTone }> = {
  borrador:   { label: 'Borrador',   tone: 'neutral' },
  presentado: { label: 'Presentado al mandante', tone: 'info' },
  aprobado:   { label: 'Aprobado',   tone: 'success' },
  rechazado:  { label: 'Rechazado',  tone: 'danger' },
  anulado:    { label: 'Anulado',    tone: 'neutral' },
};

/** Cómo se llama cada paso del trámite en el botón que lo dispara. */
export const ACCION_ADICIONAL: Record<AmendmentStatus, string> = {
  borrador:   'Volver a borrador',
  presentado: 'Presentar al mandante',
  aprobado:   'Aprobar',
  rechazado:  'Rechazar',
  anulado:    'Anular',
};

/**
 * Una disminución de obra resta: se marca distinto para que no se confunda con
 * un aumento al mirar la lista de reojo.
 */
export function tonoTipoAdicional(type: AmendmentType): StatusTone {
  if (type === 'disminucion_obra') return 'warning';
  if (type === 'aumento_plazo') return 'info';
  return 'neutral';
}
