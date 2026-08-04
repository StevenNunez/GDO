/**
 * PDF del Estado de Pago al mandante: la carátula y el detalle por partida, tal
 * como se presenta a la ITO.
 *
 * Los montos salen de la fila guardada, NO se recalculan: un EEPP aprobado es
 * un documento que ya se cobró, y el PDF tiene que decir lo mismo que se
 * presentó aunque después cambien los precios de la EDT.
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
import type {
  Contract, PaymentCertificate, PaymentCertificateLine, Client, Project,
} from '@/modules/core/lib/data';

const COLORS = {
  primary: '#00528B',
  secondary: '#7f8c8d',
  text: '#34495e',
  danger: '#b3261e',
};

const ETIQUETA_TIPO: Record<Contract['type'], string> = {
  suma_alzada: 'Suma alzada',
  precios_unitarios: 'Serie de precios unitarios',
  administracion_delegada: 'Administración delegada',
};

function fecha(v: Date | string | null | undefined): string {
  const d = toDate(v);
  return d ? format(d, "dd 'de' MMMM, yyyy", { locale: es }) : '—';
}

function fechaCorta(v: Date | string | null | undefined): string {
  const d = toDate(v);
  return d ? format(d, 'dd/MM/yyyy') : '—';
}

export async function generateEeppPDF(opts: {
  eepp: PaymentCertificate;
  lines: PaymentCertificateLine[];
  contract: Contract;
  project?: Project | null;
  client?: Client | null;
}) {
  const { eepp, lines, contract, project, client } = opts;

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
  doc.text('ESTADO DE PAGO', pageWidth / 2, y + 8, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`N° ${eepp.number}`, pageWidth - margin, y + 8, { align: 'right' });

  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLORS.secondary);
  if (company.name) doc.text(company.name, margin, y);
  const dir = companyAddressLine(company);
  if (dir) doc.text(dir, margin, y + 4);

  y += 12;

  /* ── Datos del contrato ── */
  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 8, textColor: COLORS.text, cellPadding: 1.2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 30 },
      2: { fontStyle: 'bold', cellWidth: 30 },
    },
    body: [
      ['Obra', project?.name ?? '—', 'Mandante', client?.name ?? '—'],
      ['Contrato', contract.name, 'Tipo', ETIQUETA_TIPO[contract.type]],
      [
        'Período',
        `${fechaCorta(eepp.periodStart)} — ${fechaCorta(eepp.periodEnd)}`,
        'Emitido',
        fechaCorta(eepp.createdAt),
      ],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  /* ── Detalle por partida ── */
  if (lines.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [[
        'Partida', 'Und.', 'Cant. contrato', 'P. Unitario',
        'Anterior', 'Este período', 'Acumulado',
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

  /* ── Carátula ── */
  // Solo se listan las líneas que tienen valor: una carátula llena de ceros
  // esconde lo que sí se descontó.
  const filas: [string, number][] = [['Avance del período', eepp.periodAmount]];

  if (eepp.feeAmount > 0) {
    filas.push([`Honorario (${contract.feePercent}%)`, eepp.feeAmount]);
  }
  if (eepp.reajusteAmount !== 0) {
    filas.push([`Reajuste (${contract.reajusteType.toUpperCase()})`, eepp.reajusteAmount]);
  }
  if (eepp.advanceAmortization > 0) {
    filas.push([`Amortización anticipo (${eepp.advancePercent}%)`, -eepp.advanceAmortization]);
  }
  if (eepp.retentionAmount > 0) {
    filas.push([`Retención (${eepp.retentionPercent}%)`, -eepp.retentionAmount]);
  }
  if (eepp.penaltyAmount > 0) filas.push(['Multa por atraso', -eepp.penaltyAmount]);
  if (eepp.otherDeductions > 0) {
    filas.push([
      eepp.otherDeductionsNote ? `Otros descuentos — ${eepp.otherDeductionsNote}` : 'Otros descuentos',
      -eepp.otherDeductions,
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
        { content: formatCLP(eepp.netAmount), styles: { fontStyle: 'bold', halign: 'right' } },
      ],
      [`IVA (${eepp.taxPercent}%)`, formatCLP(eepp.taxAmount)],
      [
        { content: 'TOTAL A PAGAR', styles: { fontStyle: 'bold', textColor: COLORS.primary } },
        {
          content: formatCLP(eepp.totalAmount),
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
    `Avance acumulado incluyendo este estado de pago: ${formatCLP(eepp.accumulatedAmount)}`,
    pageWidth - margin, y, { align: 'right' },
  );
  y += 10;

  /* ── Observaciones ── */
  if (eepp.notes) {
    doc.setFontSize(8);
    doc.setTextColor(COLORS.text);
    doc.text('Observaciones:', margin, y);
    y += 4;
    doc.setTextColor(COLORS.secondary);
    doc.text(doc.splitTextToSize(eepp.notes, pageWidth - margin * 2), margin, y);
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

  const xIto = pageWidth - margin - anchoFirma;
  doc.line(xIto, yFirma, xIto + anchoFirma, yFirma);
  doc.text('Inspección Técnica de Obra', xIto + anchoFirma / 2, yFirma + 4, { align: 'center' });

  /* ── Marca de borrador ── */
  // Un borrador impreso no puede confundirse con el documento presentado.
  if (eepp.status === 'borrador') {
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

  doc.save(`EEPP_${eepp.number}_${(project?.name ?? 'obra').replace(/\s+/g, '_')}.pdf`);
}
