/**
 * PDF de presentación de un adicional al mandante: qué obra extraordinaria es,
 * por qué se originó, cuánto vale, cuántos días de plazo pide y cómo deja el
 * contrato si se aprueba.
 *
 * Es el documento que se firma, así que muestra el **antes y el después** del
 * contrato: un mandante no aprueba "18.500.000 más", aprueba pasar de un monto
 * y un plazo a otros.
 *
 * La marca sale de `company-profile.ts` (nunca un logo fijo): cada empresa emite
 * con la suya, y si no cargó ninguno no se dibuja nada.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCLP } from '@/lib/format';
import { getCompanyProfile, companyAddressLine } from '@/lib/company-profile';
import { toDate } from '@/lib/date-utils';
import { calcFechaTermino } from '@/lib/contract';
import { montoConSigno, TIPOS_ADICIONAL, CAUSAS_ADICIONAL } from '@/lib/amendment';
import type { Amendment, Contract, WorkItem } from '@/modules/core/lib/data';

const COLORS = {
  primary: '#00528B',
  secondary: '#7f8c8d',
  text: '#34495e',
  danger: '#b3261e',
};

function fecha(v: Date | string | null | undefined): string {
  const d = toDate(v);
  return d ? format(d, "dd 'de' MMMM, yyyy", { locale: es }) : '—';
}

function fechaCorta(v: Date | string | null | undefined): string {
  const d = toDate(v);
  return d ? format(d, 'dd/MM/yyyy') : '—';
}

export async function generateAdicionalPDF(opts: {
  amendment: Amendment;
  contract: Contract;
  /** Partidas hoja del presupuesto que lo valoriza. Vacío si no tiene. */
  partidas: WorkItem[];
  projectName?: string | null;
  clientName?: string | null;
  tenantId?: string | null;
}) {
  const { amendment, contract, partidas, projectName, clientName } = opts;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  /* ── Encabezado ── */
  const company = await getCompanyProfile();
  if (company.logo) {
    doc.addImage(company.logo, margin, y, 38, 14);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(COLORS.primary);
  doc.text('ADICIONAL DE OBRA', pageWidth / 2, y + 8, { align: 'center' });

  doc.setFontSize(11);
  doc.text(`N° ${amendment.number}`, pageWidth - margin, y + 8, { align: 'right' });

  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLORS.secondary);
  if (company.name) doc.text(company.name, margin, y);
  const dir = companyAddressLine(company);
  if (dir) doc.text(dir, margin, y + 4);

  y += 12;

  /* ── Identificación ── */
  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 8, textColor: COLORS.text, cellPadding: 1.2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 30 },
      2: { fontStyle: 'bold', cellWidth: 30 },
    },
    body: [
      ['Obra', projectName ?? '—', 'Mandante', clientName ?? '—'],
      ['Contrato', contract.name, 'Tipo', TIPOS_ADICIONAL[amendment.type]],
      ['Origen', CAUSAS_ADICIONAL[amendment.cause], 'Detectado', fechaCorta(amendment.detectedAt)],
      ['Referencia', amendment.reference ?? '—', 'Emitido', fechaCorta(new Date())],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  /* ── Descripción ── */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(COLORS.primary);
  doc.text(amendment.name, margin, y);
  y += 5;

  if (amendment.description) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(COLORS.text);
    const lineas = doc.splitTextToSize(amendment.description, pageWidth - margin * 2);
    doc.text(lineas, margin, y);
    y += lineas.length * 4 + 4;
  }

  /* ── Detalle por partida ── */
  if (partidas.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Partida', 'Und.', 'Cantidad', 'P. Unitario', 'Total']],
      body: partidas.map((p) => [
        p.name,
        p.unit ?? '',
        (p.quantity ?? 0).toLocaleString('es-CL'),
        formatCLP(p.unitPrice),
        formatCLP((p.quantity ?? 0) * (p.unitPrice ?? 0)),
      ]),
      theme: 'grid',
      headStyles: { fillColor: COLORS.primary, fontSize: 7.5, halign: 'center' },
      styles: { fontSize: 7.5, textColor: COLORS.text, cellPadding: 1.5 },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold' },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  /* ── Efecto en el contrato ──
   * El monto y el plazo vigentes de esta hoja consideran SOLO este adicional
   * sobre el contrato original: es lo que el mandante está firmando acá. El
   * acumulado con los demás adicionales vive en la pantalla del módulo. */
  const monto = montoConSigno(amendment);
  const montoResultante = (contract.amountNet ?? 0) + monto;
  const terminoActual = calcFechaTermino(contract.startDate, contract.plazoDias);
  const terminoResultante = calcFechaTermino(
    contract.startDate, contract.plazoDias, amendment.extraDays ?? 0,
  );

  const anchoTabla = 110;
  autoTable(doc, {
    startY: y,
    margin: { left: pageWidth - margin - anchoTabla },
    tableWidth: anchoTabla,
    theme: 'plain',
    styles: { fontSize: 8.5, textColor: COLORS.text, cellPadding: 1.6 },
    columnStyles: { 1: { halign: 'right' } },
    body: [
      ['Monto del contrato', formatCLP(contract.amountNet ?? 0)],
      [
        monto < 0 ? 'Disminución de obra' : 'Este adicional',
        monto === 0 ? '—' : `${monto < 0 ? '-' : '+'}${formatCLP(Math.abs(monto))}`,
      ],
      [
        { content: 'Monto resultante', styles: { fontStyle: 'bold', textColor: COLORS.primary } },
        {
          content: formatCLP(montoResultante),
          styles: { fontStyle: 'bold', halign: 'right', textColor: COLORS.primary },
        },
      ],
      ['Plazo vigente', contract.plazoDias ? `${contract.plazoDias} días` : '—'],
      ['Aumento de plazo', amendment.extraDays > 0 ? `+${amendment.extraDays} días` : '—'],
      [
        { content: 'Nueva fecha de término', styles: { fontStyle: 'bold' } },
        {
          content: terminoResultante ? fechaCorta(terminoResultante) : '—',
          styles: { fontStyle: 'bold', halign: 'right' },
        },
      ],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  if (terminoActual && amendment.extraDays > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(COLORS.secondary);
    doc.text(
      `Fecha de término sin este adicional: ${fechaCorta(terminoActual)}`,
      pageWidth - margin, y, { align: 'right' },
    );
    y += 6;
  }

  /* ── Observaciones ── */
  if (amendment.notes) {
    doc.setFontSize(8);
    doc.setTextColor(COLORS.text);
    doc.text('Observaciones:', margin, y);
    y += 4;
    doc.setTextColor(COLORS.secondary);
    doc.text(doc.splitTextToSize(amendment.notes, pageWidth - margin * 2), margin, y);
    y += 12;
  }

  /* ── Firmas ── */
  const anchoFirma = 60;
  const yFirma = Math.max(y + 12, doc.internal.pageSize.getHeight() - 45);
  doc.setDrawColor(COLORS.secondary);
  doc.setFontSize(8);
  doc.setTextColor(COLORS.text);

  doc.line(margin, yFirma, margin + anchoFirma, yFirma);
  doc.text('Contratista', margin + anchoFirma / 2, yFirma + 4, { align: 'center' });

  const xMandante = pageWidth - margin - anchoFirma;
  doc.line(xMandante, yFirma, xMandante + anchoFirma, yFirma);
  doc.text('Mandante / ITO', xMandante + anchoFirma / 2, yFirma + 4, { align: 'center' });

  /* ── Marca de borrador ── */
  // Un borrador impreso no puede confundirse con el documento presentado.
  if (amendment.status === 'borrador') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(52);
    doc.setTextColor(COLORS.danger);
    (doc as any).setGState?.(new (doc as any).GState({ opacity: 0.12 }));
    doc.text('BORRADOR', pageWidth / 2, doc.internal.pageSize.getHeight() / 2, {
      align: 'center', angle: 35,
    });
    (doc as any).setGState?.(new (doc as any).GState({ opacity: 1 }));
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(COLORS.secondary);
  doc.text(
    `Documento generado el ${fecha(new Date())}`,
    pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' },
  );

  doc.save(`Adicional_${amendment.number}_${(projectName ?? 'obra').replace(/\s+/g, '_')}.pdf`);
}
