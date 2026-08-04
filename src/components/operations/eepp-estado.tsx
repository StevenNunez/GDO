import type { StatusTone } from '@/components/ui/status-badge';
import type { PaymentCertificate } from '@/modules/core/lib/data';

/**
 * Etiquetas y colores del trámite del estado de pago. Vive aparte para que la
 * lista, el detalle y el PDF digan exactamente lo mismo.
 */
export const ESTADO_EEPP: Record<PaymentCertificate['status'], { label: string; tone: StatusTone }> = {
  borrador:   { label: 'Borrador',           tone: 'neutral' },
  presentado: { label: 'Presentado a la ITO', tone: 'info' },
  aprobado:   { label: 'Aprobado',           tone: 'success' },
  rechazado:  { label: 'Rechazado',          tone: 'danger' },
  facturado:  { label: 'Facturado',          tone: 'info' },
  pagado:     { label: 'Pagado',             tone: 'success' },
};

/** Paso siguiente del trámite, o `null` si ya terminó. */
export function siguientePaso(
  status: PaymentCertificate['status'],
): { status: PaymentCertificate['status']; label: string } | null {
  switch (status) {
    case 'borrador':   return { status: 'presentado', label: 'Presentar a la ITO' };
    case 'presentado': return { status: 'aprobado',   label: 'Marcar aprobado' };
    case 'aprobado':   return { status: 'facturado',  label: 'Marcar facturado' };
    case 'facturado':  return { status: 'pagado',     label: 'Marcar pagado' };
    case 'rechazado':  return { status: 'borrador',   label: 'Volver a borrador' };
    default:           return null;
  }
}
