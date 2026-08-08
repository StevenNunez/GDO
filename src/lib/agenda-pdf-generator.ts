/**
 * Resumen de la agenda en PDF, para descargar cuando alguien lo necesita.
 *
 * Se eligió esto en vez de un correo diario automático (decisión del usuario, y
 * es la correcta): un botón lo aprieta quien lo necesita, cuando lo necesita.
 * El cuarto correo diario que nadie pidió lo terminan filtrando todos, y con él
 * se van los avisos que sí importaban.
 *
 * La marca sale de `company-profile.ts`, nunca un logo fijo.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getCompanyProfile, companyAddressLine } from '@/lib/company-profile';
import { EVENTO_LABEL, type EventoAgenda } from '@/lib/agenda';
import { entregarPdf, type SalidaPdf } from '@/lib/pdf-output';

const COLORS = {
  primary: '#00528B',
  secondary: '#7f8c8d',
  text: '#34495e',
  danger: '#b3261e',
  warning: '#8a6100',
};

export async function generateAgendaPDF(opts: {
  tenantId: string;
  eventos: EventoAgenda[];
  projectName?: string | null;
  /** Días hacia adelante que cubre el resumen, para decirlo en el documento. */
  horizonte: number;
  /** `blob` devuelve el PDF sin descargarlo, para adjuntarlo a un correo. */
  salida?: SalidaPdf;
}): Promise<Blob> {
  const { tenantId, eventos, projectName, horizonte } = opts;

  const profile = await getCompanyProfile(tenantId);
  const doc = new jsPDF();
  const ancho = doc.internal.pageSize.getWidth();
  let y = 18;

  /* ── Encabezado ─────────────────────────────────────────────────────── */
  doc.setFontSize(14);
  doc.setTextColor(COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text(profile.name || 'Resumen de vencimientos', 14, y);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.secondary);
  const direccion = companyAddressLine(profile);
  if (direccion) { y += 5; doc.text(direccion, 14, y); }

  doc.setFontSize(13);
  doc.setTextColor(COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('VENCIMIENTOS', ancho - 14, 18, { align: 'right' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.text);
  doc.text(
    format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: es }),
    ancho - 14, 24, { align: 'right' },
  );
  if (projectName) {
    doc.text(projectName, ancho - 14, 29, { align: 'right' });
  }

  y += 8;
  doc.setDrawColor(COLORS.primary);
  doc.line(14, y, ancho - 14, y);
  y += 8;

  /* ── Resumen en una línea ───────────────────────────────────────────── */
  const vencidos = eventos.filter((e) => e.dias < 0);
  const hoyMismo = eventos.filter((e) => e.dias === 0);
  const proximos = eventos.filter((e) => e.dias > 0);

  doc.setFontSize(9);
  doc.setTextColor(COLORS.text);
  doc.text(
    `${vencidos.length} vencido(s) · ${hoyMismo.length} vence(n) hoy · `
    + `${proximos.length} en los próximos ${horizonte} días`,
    14, y,
  );
  y += 8;

  if (eventos.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(COLORS.secondary);
    doc.text('No hay nada vencido ni por vencer en el período.', 14, y);
    return entregarPdf(doc, nombreArchivo(), opts.salida);
  }

  /* ── La tabla ───────────────────────────────────────────────────────── */
  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Tipo', 'Detalle', 'Estado']],
    body: eventos.map((e) => [
      format(e.fecha, 'dd/MM/yyyy'),
      EVENTO_LABEL[e.tipo],
      [e.titulo, e.detalle].filter(Boolean).join(' — '),
      e.dias < 0
        ? `Vencido hace ${Math.abs(e.dias)} d`
        : e.dias === 0 ? 'Vence hoy' : `En ${e.dias} d`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: COLORS.primary, fontSize: 8, textColor: '#ffffff' },
    styles: { fontSize: 8, cellPadding: 2.5, textColor: COLORS.text },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 42 },
      3: { cellWidth: 30, halign: 'right' },
    },
    didParseCell: (data) => {
      // Lo vencido en rojo y lo que vence hoy también: se lee de un vistazo
      // sin tener que comparar fechas mentalmente.
      if (data.section !== 'body' || data.column.index !== 3) return;
      const texto = String(data.cell.raw);
      if (texto.startsWith('Vencido') || texto === 'Vence hoy') {
        data.cell.styles.textColor = COLORS.danger;
        data.cell.styles.fontStyle = 'bold';
      } else {
        data.cell.styles.textColor = COLORS.warning;
      }
    },
  });

  /* ── Pie ────────────────────────────────────────────────────────────── */
  const alto = doc.internal.pageSize.getHeight();
  doc.setFontSize(6.5);
  doc.setTextColor(COLORS.secondary);
  doc.text(
    'Las fechas salen de cada documento (contratos, garantías, expedientes, órdenes de pago, '
    + 'arriendos). Generado por Gestión de Obras.',
    14, alto - 10, { maxWidth: ancho - 28 },
  );

  return entregarPdf(doc, nombreArchivo(), opts.salida);
}

function nombreArchivo(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `Vencimientos_${d.getFullYear()}-${mm}-${dd}.pdf`;
}
