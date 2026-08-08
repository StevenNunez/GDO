/**
 * Documento del contrato de subcontrato: la carátula con las condiciones
 * pactadas, el itemizado y los espacios de firma de las dos partes.
 *
 * NO pretende ser el texto legal del contrato — ese lo redacta cada empresa con
 * su abogado y se adjunta aparte. Esto es lo que en obra se llama la carátula:
 * el resumen de lo que se acordó, que es justo lo que nadie encuentra cuando
 * hay que discutir una multa o una retención.
 *
 * La marca sale de `company-profile.ts` (nunca un logo fijo): el contrato lo
 * emite la empresa que paga, y cada tenant tiene la suya.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCLP } from '@/lib/format';
import { getCompanyProfile, companyAddressLine } from '@/lib/company-profile';
import { toDate } from '@/lib/date-utils';
import { entregarPdf, type SalidaPdf } from '@/lib/pdf-output';
import type {
  DocumentSignature, Subcontract, SubcontractItem, Supplier,
} from '@/modules/core/lib/data';

const COLORS = {
  primary: '#00528B',
  secondary: '#7f8c8d',
  text: '#34495e',
};

const TIPO_CONTRATO: Record<Subcontract['type'], string> = {
  suma_alzada: 'Suma alzada',
  precios_unitarios: 'Precios unitarios',
  administracion_delegada: 'Administración delegada',
};

function fechaLarga(v: Date | string | null | undefined): string {
  const d = toDate(v);
  return d ? format(d, "dd 'de' MMMM 'de' yyyy", { locale: es }) : '—';
}

function fechaCorta(v: Date | string | null | undefined): string {
  const d = toDate(v);
  return d ? format(d, 'dd/MM/yyyy') : '—';
}

function monto(valor: number, moneda: 'CLP' | 'UF'): string {
  return moneda === 'UF'
    ? `${valor.toLocaleString('es-CL', { maximumFractionDigits: 2 })} UF`
    : formatCLP(valor);
}

export async function generateSubcontratoContratoPDF(opts: {
  subcontract: Subcontract;
  items: SubcontractItem[];
  contractor: Supplier | null;
  signatures: DocumentSignature[];
  projectName?: string | null;
  /** `blob` devuelve el PDF sin descargarlo, para adjuntarlo a un correo. */
  salida?: SalidaPdf;
}): Promise<Blob> {
  const { subcontract: sc, items, contractor, signatures, projectName } = opts;

  const profile = await getCompanyProfile(sc.tenantId);
  const doc = new jsPDF();
  const ancho = doc.internal.pageSize.getWidth();
  let y = 18;

  /* ── Encabezado ─────────────────────────────────────────────────────── */
  doc.setFontSize(15);
  doc.setTextColor(COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text(profile.name || 'Contrato de subcontrato', 14, y);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.secondary);
  const direccion = companyAddressLine(profile);
  if (direccion) { y += 5; doc.text(direccion, 14, y); }
  if (profile.rut) { y += 4; doc.text(`RUT ${profile.rut}`, 14, y); }

  doc.setFontSize(13);
  doc.setTextColor(COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('CONTRATO DE SUBCONTRATO', ancho - 14, 18, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.text);
  doc.text(sc.code ? `N° ${sc.code}` : 'Sin número', ancho - 14, 24, { align: 'right' });

  y += 8;
  doc.setDrawColor(COLORS.primary);
  doc.line(14, y, ancho - 14, y);
  y += 8;

  /* ── Las partes ─────────────────────────────────────────────────────── */
  autoTable(doc, {
    startY: y,
    head: [['MANDANTE (quien encarga)', 'CONTRATISTA (quien ejecuta)']],
    body: [[
      [
        profile.name || '—',
        profile.rut ? `RUT ${profile.rut}` : '',
        profile.representanteLegal ? `Representante: ${profile.representanteLegal}` : '',
      ].filter(Boolean).join('\n'),
      [
        contractor?.legalName || contractor?.name || sc.supplierName || '—',
        contractor?.rut ? `RUT ${contractor.rut}` : '',
        contractor?.representativeName ? `Representante: ${contractor.representativeName}` : '',
        contractor?.representativeRut ? `RUT ${contractor.representativeRut}` : '',
      ].filter(Boolean).join('\n'),
    ]],
    theme: 'grid',
    headStyles: { fillColor: COLORS.primary, fontSize: 8, textColor: '#ffffff' },
    styles: { fontSize: 8, cellPadding: 3, textColor: COLORS.text },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  /* ── Condiciones pactadas ───────────────────────────────────────────── */
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.primary);
  doc.text('Condiciones', 14, y);
  y += 3;

  const condiciones: [string, string][] = [
    ['Obra', projectName || '—'],
    ['Objeto', sc.name],
    ['Modalidad', TIPO_CONTRATO[sc.type]],
    ['Monto neto', monto(sc.amountNet, sc.currency)],
    ['Anticipo', sc.advancePercent > 0
      ? `${sc.advancePercent}% · se amortiza en cada estado de pago según avance`
      : 'Sin anticipo'],
    ['Retención', sc.retentionPercent > 0
      ? `${sc.retentionPercent}%${sc.retentionCapPercent ? ` · tope ${sc.retentionCapPercent}% del contrato` : ''} · se devuelve al recibir la obra`
      : 'Sin retención'],
    ['Multa por atraso', sc.multaMode === 'permil_contrato'
      ? `${sc.multaValue}‰ del contrato por día de atraso`
      : `${formatCLP(sc.multaValue)} por día de atraso`],
    ['Fecha de inicio', fechaLarga(sc.startDate)],
    ['Plazo', sc.plazoDias ? `${sc.plazoDias} días corridos` : '—'],
    ['IVA', `${sc.taxPercent}%`],
    ['Cumplimiento laboral', sc.requiresLaborCompliance
      ? 'Se exige F30-1 vigente del período antes de cursar cada estado de pago (Ley 20.123)'
      : 'No se exige F30-1 para este contrato'],
  ];

  autoTable(doc, {
    startY: y,
    body: condiciones,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 1.8, textColor: COLORS.text },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 42 },
      1: { cellWidth: 'auto' },
    },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  /* ── Itemizado ──────────────────────────────────────────────────────── */
  if (items.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(COLORS.primary);
    doc.text('Itemizado', 14, y);
    y += 3;

    autoTable(doc, {
      startY: y,
      head: [['Partida', 'Un.', 'Cantidad', 'P. unitario', 'Total']],
      body: items.map((i) => [
        i.name,
        i.unit ?? '—',
        i.quantity.toLocaleString('es-CL'),
        monto(i.unitPrice, sc.currency),
        monto(i.quantity * i.unitPrice, sc.currency),
      ]),
      foot: [[
        'Total itemizado', '', '', '',
        monto(items.reduce((a, i) => a + i.quantity * i.unitPrice, 0), sc.currency),
      ]],
      theme: 'striped',
      headStyles: { fillColor: COLORS.primary, fontSize: 8, textColor: '#ffffff' },
      footStyles: { fillColor: '#eef2f6', fontSize: 8, fontStyle: 'bold', textColor: COLORS.text },
      styles: { fontSize: 8, cellPadding: 2, textColor: COLORS.text },
      columnStyles: {
        2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  /* ── Firmas ─────────────────────────────────────────────────────────── */
  const alto = doc.internal.pageSize.getHeight();
  if (y > alto - 60) { doc.addPage(); y = 20; }

  const empresa = signatures.find((s) => s.party === 'empresa') ?? null;
  const contraparte = signatures.find((s) => s.party === 'contraparte') ?? null;

  const bloqueFirma = async (
    firma: DocumentSignature | null,
    titulo: string,
    respaldo: string,
    x: number,
  ) => {
    const anchoBloque = (ancho - 28) / 2 - 6;

    // La imagen de la firma va SOBRE la línea, no encima del texto: si el
    // trazo tapa el nombre, el documento impreso no sirve como respaldo.
    if (firma?.signature) {
      try {
        doc.addImage(firma.signature, 'PNG', x + 10, y - 2, 40, 16);
      } catch { /* una firma ilegible no puede romper el documento entero */ }
    }

    doc.setDrawColor(COLORS.secondary);
    doc.line(x, y + 16, x + anchoBloque, y + 16);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(COLORS.text);
    doc.text(firma?.signerName || respaldo, x, y + 21);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(COLORS.secondary);
    doc.setFontSize(7);
    const detalle = [
      firma?.signerRut ? `RUT ${firma.signerRut}` : '',
      firma?.signerRole || '',
      firma ? `Firmado el ${fechaCorta(firma.signedAt)}` : 'Pendiente de firma',
    ].filter(Boolean);
    detalle.forEach((linea, i) => doc.text(linea, x, y + 25 + i * 3.5));

    doc.setFontSize(7);
    doc.setTextColor(COLORS.primary);
    doc.text(titulo, x, y + 25 + detalle.length * 3.5 + 2);
  };

  await bloqueFirma(empresa, 'POR EL MANDANTE', profile.representanteLegal || profile.name || '—', 14);
  await bloqueFirma(contraparte, 'POR EL CONTRATISTA',
    contractor?.representativeName || contractor?.name || sc.supplierName || '—',
    ancho / 2 + 2);

  /* ── Pie ────────────────────────────────────────────────────────────── */
  doc.setFontSize(6.5);
  doc.setTextColor(COLORS.secondary);
  doc.text(
    'Documento generado por Gestión de Obras. Las firmas son firma simple: '
    + 'acreditan quién aprobó y cuándo, con sello de integridad del documento.',
    14, alto - 10,
  );

  const nombre = `Contrato_${(sc.code || sc.name).replace(/[^\w-]+/g, '_')}.pdf`;
  return entregarPdf(doc, nombre, opts.salida);
}
