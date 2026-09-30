/**
 * Parte diario de avance en PDF.
 *
 * Es el documento que se lleva a la reunión de la mañana y el que se le manda
 * al mandante cuando pide "cómo va la obra". Se descarga cuando alguien lo
 * necesita, no se manda por correo todos los días: el cuarto correo diario que
 * nadie pidió lo terminan filtrando todos, y con él se van los avisos que sí
 * importaban (decisión del usuario, y es la correcta).
 *
 * La marca sale de `company-profile.ts`, nunca un logo fijo.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getCompanyProfile, companyAddressLine } from '@/lib/company-profile';
import { entregarPdf, type SalidaPdf } from '@/lib/pdf-output';
import { CAUSAS_CNC } from '@/lib/last-planner';
import { comoPorcentaje, type ResumenDelDia } from '@/lib/daily-report';
import type { DailyProgress, TrainActivity, WorkUnit } from '@/modules/core/lib/data';

const COLORS = {
  primary: '#00528B',
  secondary: '#7f8c8d',
  text: '#34495e',
  danger: '#b3261e',
  success: '#1e7f46',
};

export interface LineaParteDiario {
  actividad: TrainActivity;
  unidad: WorkUnit | null;
  parte: DailyProgress;
  /** Cuánto avanzó ese día (el acumulado menos el del parte anterior). */
  incremento: number;
}

export async function generateParteDiarioPDF(opts: {
  tenantId: string;
  fecha: Date;
  projectName?: string | null;
  lineas: LineaParteDiario[];
  resumen: ResumenDelDia;
  salida?: SalidaPdf;
}): Promise<Blob> {
  const { tenantId, fecha, projectName, lineas, resumen } = opts;

  const profile = await getCompanyProfile(tenantId);
  const doc = new jsPDF();
  const ancho = doc.internal.pageSize.getWidth();
  let y = 18;

  /* ── Encabezado ─────────────────────────────────────────────────────── */
  doc.setFontSize(14);
  doc.setTextColor(COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text(profile.name || 'Parte diario de avance', 14, y);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.secondary);
  const direccion = companyAddressLine(profile);
  if (direccion) { y += 5; doc.text(direccion, 14, y); }

  doc.setFontSize(13);
  doc.setTextColor(COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('PARTE DIARIO', ancho - 14, 18, { align: 'right' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.text);
  doc.text(
    format(fecha, "EEEE d 'de' MMMM 'de' yyyy", { locale: es }),
    ancho - 14, 24, { align: 'right' },
  );
  if (projectName) doc.text(projectName, ancho - 14, 29, { align: 'right' });

  y += 8;
  doc.setDrawColor(COLORS.primary);
  doc.line(14, y, ancho - 14, y);
  y += 8;

  /* ── Los números del día ────────────────────────────────────────────── */
  doc.setFontSize(9);
  doc.setTextColor(COLORS.text);
  doc.text(
    `${resumen.reportes} unidad(es) reportada(s) · `
    + `${resumen.terminadas} terminada(s) · `
    + `${redondear(resumen.avanceEquivalente)} unidad(es) equivalentes avanzadas · `
    + `${redondear(resumen.jornadas)} jornada(s)`,
    14, y, { maxWidth: ancho - 28 },
  );
  y += 8;

  if (lineas.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(COLORS.secondary);
    doc.text('No se cargó ningún avance en este día.', 14, y);
    return entregarPdf(doc, nombreArchivo(fecha), opts.salida);
  }

  /* ── El detalle ─────────────────────────────────────────────────────── */
  autoTable(doc, {
    startY: y,
    head: [['Actividad', 'Unidad', 'Quedó en', 'Avanzó', 'Jorn.', 'Motivo / observación']],
    body: lineas.map((l) => [
      l.actividad.name,
      l.unidad ? [l.unidad.groupName, l.unidad.name].filter(Boolean).join(' · ') : '—',
      `${comoPorcentaje(l.parte.progress)}%`,
      // El incremento es lo que se hizo HOY; el acumulado ya va en la columna
      // anterior y confundirlos es lo que hace que un parte no cuadre.
      `${l.incremento >= 0 ? '+' : ''}${redondear(l.incremento * 100)}%`,
      l.parte.crewDays != null ? redondear(l.parte.crewDays) : '—',
      [
        l.parte.causeCode ? CAUSAS_CNC[l.parte.causeCode] : '',
        l.parte.notes ?? '',
      ].filter(Boolean).join(' — '),
    ]),
    theme: 'striped',
    headStyles: { fillColor: COLORS.primary, fontSize: 8, textColor: '#ffffff' },
    styles: { fontSize: 8, cellPadding: 2.5, textColor: COLORS.text },
    columnStyles: {
      1: { cellWidth: 30 },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 14, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      // Lo terminado en verde y lo que no avanzó en rojo: la tabla se lee de
      // un vistazo sin comparar porcentajes mentalmente.
      if (data.column.index === 2 && String(data.cell.raw) === '100%') {
        data.cell.styles.textColor = COLORS.success;
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.column.index === 3 && String(data.cell.raw).startsWith('+0%')) {
        data.cell.styles.textColor = COLORS.danger;
      }
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  /* ── Qué frenó la obra ──────────────────────────────────────────────── */
  if (resumen.causas.length > 0) {
    const alto = doc.internal.pageSize.getHeight();
    if (y > alto - 50) { doc.addPage(); y = 20; }

    doc.setFontSize(10);
    doc.setTextColor(COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text('Qué frenó la obra hoy', 14, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [['Causa', 'Unidades frenadas']],
      body: resumen.causas.map((c) => [c.label, String(c.veces)]),
      theme: 'plain',
      headStyles: { fontSize: 8, textColor: COLORS.secondary, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2, textColor: COLORS.text },
      columnStyles: { 1: { cellWidth: 34, halign: 'right' } },
      margin: { left: 14, right: ancho / 2 },
    });
  }

  /* ── Pie ────────────────────────────────────────────────────────────── */
  const alto = doc.internal.pageSize.getHeight();
  doc.setFontSize(6.5);
  doc.setTextColor(COLORS.secondary);
  doc.text(
    'El porcentaje de la columna «Quedó en» es el avance acumulado de la unidad; «Avanzó» es lo '
    + 'hecho en el día. Generado por Gestión de Obras.',
    14, alto - 10, { maxWidth: ancho - 28 },
  );

  return entregarPdf(doc, nombreArchivo(fecha), opts.salida);
}

/** Redondea a un decimal y usa coma, como se escribe en Chile. */
function redondear(n: number): string {
  const v = Math.round(n * 10) / 10;
  return Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
}

function nombreArchivo(fecha: Date): string {
  return `parte-diario-${format(fecha, 'yyyy-MM-dd')}.pdf`;
}
