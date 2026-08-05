import type { StatusTone } from '@/components/ui/status-badge';
import type { SubcontractCertificate } from '@/modules/core/lib/data';

/**
 * Colores del trámite del estado de pago de subcontrato. Vive aparte porque lo
 * comparten la ficha de la constructora y el portal del subcontratista: es el
 * mismo documento visto desde las dos puntas, y tiene que verse igual.
 */
export const TONO_EEPP_SUBCONTRATO: Record<SubcontractCertificate['status'], StatusTone> = {
  borrador: 'neutral',
  presentado: 'warning',
  aprobado: 'info',
  pagado: 'success',
  rechazado: 'danger',
};
