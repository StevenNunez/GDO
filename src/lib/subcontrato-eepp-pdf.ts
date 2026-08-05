/**
 * PDF del estado de pago de un subcontrato: el documento que el subcontratista
 * presenta y que la empresa aprueba.
 *
 * Los montos salen de la fila guardada, NO se recalculan: un estado de pago
 * aprobado es un documento que ya se cobró, y editar un precio del itemizado en
 * marzo no puede cambiar lo que decía el de enero.
 *
 * La marca sale de `company-profile.ts` (nunca un logo fijo): es la empresa que
 * paga la que emite el documento.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCLP } from '@/lib/format';
import { getCompanyProfile, companyAddressLine } from '@/lib/company-profile';
import { toDate } from '@/lib/date-utils';
import { ESTADOS_EEPP_SUBCONTRATO } from '@/lib/subcontract';
import type {
  Subcontract, SubcontractCertificate, SubcontractCertificateLine,
} from '@/modules/core/lib/data';

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

export async function generateSubcontratoEeppPDF(opts: {
  certificate: SubcontractCertificate;
  lines: SubcontractCertificateLine[];
  subcontract: Subcontract;
  projectName?: string | null;
}) {
  const { certificate: c, lines, subcontract: sub, projectName } = opts;

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
  doc.setFontSize(14);
  doc.setTextColor(COLORS.primary);
  doc.text('ESTADO DE PAGO · SUBCONTRATO', pageWidth / 2, y + 8, { align: 'center' });

  doc.setFontSize(11);
  doc.text(`N° ${c.number}`, pageWidth - margin, y + 8, { align: 'right' });

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
      ['Obra', projectName ?? '—', 'Subcontratista', sub.supplierName ?? '—'],
      ['Subcontrato', sub.name, 'Estado', ESTADOS_EEPP_SUBCONTRATO[c.status]],
      [
        'Período',
        `${fechaCorta(c.periodStart)} — ${fechaCorta(c.periodEnd)}`,
        'Emitido',
        fechaCorta(c.createdAt),
      ],
      [
        'F30',
        c.f30Date ? fechaCorta(c.f30Date) : 'No presentado',
        'F30-1',
        c.f30_1Date ? fechaCorta(c.f30_1Date) : 'No presentado',
      ],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  /* ── Detalle por partida ── */
  if (lines.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [[
        'Partida', 'Und.', 'Contratado', 'P. Unitario', 'Anterior', 'Este período', 'Acumulado',
      ]],
      body: lines.map((l) => [
        l.name,
        l.unit ?? '',
        l.quantityContract.toLocaleString('es-CL'),
        formatCLP(l.unitPrice),
        formatCLP(l.previousAmount),
        formatCLP(l.periodAmount),
        formatCLP(l.accumulatedAmount),
      ]),
      theme: 'grid',
      headStyles: { fillColor: COLORS.primary, fontSize: 7.5, halign: 'center' },
      styles: { fontSize: 7.5, textColor: COLORS.text, cellPadding: 1.5 },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
        6: { halign: 'right' },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  /* ── Carátula ──
   * Solo se listan las líneas con valor: una carátula llena de ceros esconde
   * lo que sí se descontó. */
  const filas: [string, number][] = [['Avance del período', c.periodAmount]];

  if (c.advanceAmortization > 0) {
    filas.push([`Amortización anticipo (${c.advancePercent}%)`, -c.advanceAmortization]);
  }
  if (c.retentionAmount > 0) {
    filas.push([`Retención (${c.retentionPercent}%)`, -c.retentionAmount]);
  }
  if (c.penaltyAmount > 0) filas.push(['Multa por atraso', -c.penaltyAmount]);
  if (c.otherDeductions > 0) {
    filas.push([
      c.otherDeductionsNote ? `Otros descuentos — ${c.otherDeductionsNote}` : 'Otros descuentos',
      -c.otherDeductions,
    ]);
  }

  const anchoCaratula = 95;
  autoTable(doc, {
    startY: y,
    margin: { left: pageWidth - margin - anchoCaratula },
    tableWidth: anchoCaratula,
    theme: 'plain',
    styles: { fontSize: 8.5, textColor: COLORS.text, cellPadding: 1.6 },
    columnStyles: { 1: { halign: 'right' } },
    body: [
      ...filas.map(([label, monto]) => [
        label,
        monto < 0 ? `-${formatCLP(Math.abs(monto))}` : formatCLP(monto),
      ]),
      [
        { content: 'Neto a facturar', styles: { fontStyle: 'bold' } },
        { content: formatCLP(c.netAmount), styles: { fontStyle: 'bold', halign: 'right' } },
      ],
      [`IVA (${c.taxPercent}%)`, formatCLP(c.taxAmount)],
      [
        { content: 'TOTAL A PAGAR', styles: { fontStyle: 'bold', textColor: COLORS.primary } },
        {
          content: formatCLP(c.totalAmount),
          styles: { fontStyle: 'bold', halign: 'right', textColor: COLORS.primary },
        },
      ],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(COLORS.secondary);
  doc.text(
    `Avance acumulado incluyendo este estado de pago: ${formatCLP(c.accumulatedAmount)}`,
    pageWidth - margin, y, { align: 'right' },
  );
  y += 10;

  /* ── Aviso de cumplimiento laboral ── */
  if (sub.requiresLaborCompliance && !c.f30_1Date) {
    doc.setFontSize(8);
    doc.setTextColor(COLORS.danger);
    doc.text(
      'Pendiente: certificado F30-1 del período. Sin él no se puede cursar el pago (Ley 20.123).',
      margin, y,
    );
    y += 8;
  }

  /* ── Firmas ── */
  const anchoFirma = 60;
  const yFirma = Math.max(y + 12, doc.internal.pageSize.getHeight() - 45);
  doc.setDrawColor(COLORS.secondary);
  doc.setFontSize(8);
  doc.setTextColor(COLORS.text);

  doc.line(margin, yFirma, margin + anchoFirma, yFirma);
  doc.text('Subcontratista', margin + anchoFirma / 2, yFirma + 4, { align: 'center' });

  const xEmpresa = pageWidth - margin - anchoFirma;
  doc.line(xEmpresa, yFirma, xEmpresa + anchoFirma, yFirma);
  doc.text('Empresa contratante', xEmpresa + anchoFirma / 2, yFirma + 4, { align: 'center' });

  /* ── Marca de borrador ── */
  if (c.status === 'borrador') {
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

  doc.save(`EEPP_Subcontrato_${c.number}_${sub.name.replace(/\s+/g, '_')}.pdf`);
}
