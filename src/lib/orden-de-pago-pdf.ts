/**
 * Orden de Pago: el documento con el que Finanzas transfiere.
 *
 * Lleva a quién se le paga, a qué cuenta, cuánto y contra qué estado de pago —
 * más el detalle de los descuentos, que es lo que el contratista pregunta
 * apenas ve el monto. Los datos salen de la fila guardada, no se recalculan:
 * una orden emitida es un documento que ya se mandó.
 *
 * La marca sale de `company-profile.ts`, nunca un logo fijo.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCLP } from '@/lib/format';
import { getCompanyProfile, companyAddressLine } from '@/lib/company-profile';
import { toDate } from '@/lib/date-utils';
import { TIPOS_DESCUENTO } from '@/lib/deductions';
import type {
  CertificateDeduction, PaymentOrder, SubcontractCertificate,
} from '@/modules/core/lib/data';

const COLORS = {
  primary: '#00528B',
  secondary: '#7f8c8d',
  text: '#34495e',
  danger: '#b3261e',
};

function fechaCorta(v: Date | string | null | undefined): string {
  const d = toDate(v);
  return d ? format(d, 'dd/MM/yyyy') : '—';
}

function fechaLarga(v: Date | string | null | undefined): string {
  const d = toDate(v);
  return d ? format(d, "dd 'de' MMMM 'de' yyyy", { locale: es }) : '—';
}

export async function generateOrdenDePagoPDF(opts: {
  order: PaymentOrder;
  certificate: SubcontractCertificate | null;
  deductions: CertificateDeduction[];
  subcontractName?: string | null;
  projectName?: string | null;
}): Promise<Blob> {
  const { order, certificate, deductions, subcontractName, projectName } = opts;

  const profile = await getCompanyProfile(order.tenantId);
  const doc = new jsPDF();
  const ancho = doc.internal.pageSize.getWidth();
  let y = 18;

  /* ── Encabezado ─────────────────────────────────────────────────────── */
  doc.setFontSize(14);
  doc.setTextColor(COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text(profile.name || 'Orden de Pago', 14, y);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.secondary);
  const direccion = companyAddressLine(profile);
  if (direccion) { y += 5; doc.text(direccion, 14, y); }
  if (profile.rut) { y += 4; doc.text(`RUT ${profile.rut}`, 14, y); }

  doc.setFontSize(16);
  doc.setTextColor(COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('ORDEN DE PAGO', ancho - 14, 18, { align: 'right' });
  doc.setFontSize(11);
  doc.text(`N° ${order.number}`, ancho - 14, 25, { align: 'right' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.text);
  doc.text(fechaLarga(order.issueDate), ancho - 14, 30, { align: 'right' });

  y += 8;
  doc.setDrawColor(COLORS.primary);
  doc.line(14, y, ancho - 14, y);
  y += 8;

  /* ── A quién se le paga ─────────────────────────────────────────────── */
  autoTable(doc, {
    startY: y,
    head: [['PÁGUESE A', 'DATOS DE TRANSFERENCIA']],
    body: [[
      [
        order.supplierName,
        order.supplierRut ? `RUT ${order.supplierRut}` : '',
        order.email || '',
      ].filter(Boolean).join('\n'),
      [
        order.bank ? `Banco: ${order.bank}` : 'Banco: —',
        order.accountType ? `Tipo: ${order.accountType}` : '',
        order.accountNumber ? `Cuenta: ${order.accountNumber}` : 'Cuenta: —',
      ].filter(Boolean).join('\n'),
    ]],
    theme: 'grid',
    headStyles: { fillColor: COLORS.primary, fontSize: 8, textColor: '#ffffff' },
    styles: { fontSize: 8, cellPadding: 3, textColor: COLORS.text },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  /* ── Contra qué se paga ─────────────────────────────────────────────── */
  const referencia: [string, string][] = [
    ['Obra', projectName || '—'],
    ['Contrato', subcontractName || '—'],
    ['Estado de pago', certificate ? `N° ${certificate.number}` : '—'],
    ['Período', certificate?.periodStart && certificate?.periodEnd
      ? `${fechaCorta(certificate.periodStart)} — ${fechaCorta(certificate.periodEnd)}`
      : '—'],
    ['Factura', order.invoiceNumber || 'Pendiente'],
    ['Vence', order.dueDate ? fechaCorta(order.dueDate) : '—'],
  ];

  autoTable(doc, {
    startY: y,
    body: referencia,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 1.6, textColor: COLORS.text },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38 } },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  /* ── Cómo se llegó al monto ─────────────────────────────────────────── */
  if (certificate) {
    const filas: [string, string][] = [
      ['Avance del período', formatCLP(certificate.periodAmount)],
    ];
    if (certificate.advanceAmortization > 0) {
      filas.push(['Amortización de anticipo', `− ${formatCLP(certificate.advanceAmortization)}`]);
    }
    if (certificate.retentionAmount > 0) {
      filas.push(['Retención', `− ${formatCLP(certificate.retentionAmount)}`]);
    }
    if (certificate.penaltyAmount > 0) {
      filas.push(['Multa por atraso', `− ${formatCLP(certificate.penaltyAmount)}`]);
    }

    // Los descuentos van uno por uno: es exactamente lo que el contratista
    // pregunta apenas ve el monto, y lo que evita la llamada telefónica.
    for (const d of deductions) {
      filas.push([
        `${TIPOS_DESCUENTO[d.kind] ?? 'Descuento'}: ${d.description}`,
        `− ${formatCLP(d.amount)}`,
      ]);
    }

    filas.push(['Neto a pagar', formatCLP(certificate.netAmount)]);
    filas.push([`IVA ${certificate.taxPercent}%`, formatCLP(certificate.taxAmount)]);

    autoTable(doc, {
      startY: y,
      head: [['Detalle', 'Monto']],
      body: filas,
      foot: [['TOTAL A PAGAR', formatCLP(order.amount)]],
      theme: 'striped',
      headStyles: { fillColor: COLORS.primary, fontSize: 8, textColor: '#ffffff' },
      footStyles: { fillColor: '#eef2f6', fontSize: 10, fontStyle: 'bold', textColor: COLORS.primary },
      styles: { fontSize: 8, cellPadding: 2, textColor: COLORS.text },
      columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
      didParseCell: (data) => {
        // Los descuentos en rojo: se leen de un vistazo.
        if (data.section === 'body' && data.column.index === 1
            && String(data.cell.raw).startsWith('−')) {
          data.cell.styles.textColor = COLORS.danger;
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(COLORS.primary);
    doc.text(`TOTAL A PAGAR: ${formatCLP(order.amount)}`, 14, y);
    y += 10;
  }

  /* ── Autorización ───────────────────────────────────────────────────── */
  const alto = doc.internal.pageSize.getHeight();
  if (y > alto - 45) { doc.addPage(); y = 20; }

  doc.setDrawColor(COLORS.secondary);
  doc.line(20, y + 14, 85, y + 14);
  doc.line(ancho - 85, y + 14, ancho - 20, y + 14);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.text);
  doc.text(profile.representanteLegal || 'Autoriza', 20, y + 19);
  doc.text('Recibe conforme', ancho - 85, y + 19);

  doc.setFontSize(7);
  doc.setTextColor(COLORS.secondary);
  doc.text('AUTORIZA EL PAGO', 20, y + 23);
  doc.text(order.supplierName, ancho - 85, y + 23);

  if (order.notes) {
    doc.setFontSize(7.5);
    doc.setTextColor(COLORS.text);
    doc.text(`Observaciones: ${order.notes}`, 14, y + 32, { maxWidth: ancho - 28 });
  }

  doc.setFontSize(6.5);
  doc.setTextColor(COLORS.secondary);
  doc.text(
    `Orden de pago N° ${order.number} · generada por Gestión de Obras`,
    14, alto - 10,
  );

  return doc.output('blob');
}

/** Descarga la orden con un nombre reconocible. */
export async function downloadOrdenDePagoPDF(
  opts: Parameters<typeof generateOrdenDePagoPDF>[0],
): Promise<void> {
  const blob = await generateOrdenDePagoPDF(opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `OP-${String(opts.order.number).padStart(4, '0')}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
