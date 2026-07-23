import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCLP } from '@/lib/format';
import {
  getCompanyProfile,
  companyAddressLine,
  companyContactLine,
  type CompanyProfile,
} from '@/lib/company-profile';
import { getLeafItems } from '@/lib/budget-costs';
import type { Budget, BudgetOverhead, WorkItem } from '@/modules/core/lib/data';
import type { BudgetSummary } from '@/lib/apu-costs';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

const COLORS = {
  primary: '#003F66', // Prussian Blue de la marca
  cta: '#FFB915',
  text: '#243B4A',
  muted: '#6B7C88',
  hair: '#D8E0E6',
  phase: '#EEF3F7',
  white: '#FFFFFF',
};

/** "01/02" → "1.2" para leerse como un presupuesto normal. */
function displayPath(path: string): string {
  return path
    .split('/')
    .map(seg => String(Number(seg)))
    .join('.');
}

/** Cantidad con separador de miles chileno (de-DE = "." miles, "," decimales). */
function fmtQty(n: number): string {
  return (n || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

export interface BudgetPdfParams {
  budget: Budget;
  items: WorkItem[];
  overheads: BudgetOverhead[];
  /** El mismo resumen que muestra la pantalla (computeBudgetSummary). */
  summary: BudgetSummary;
  projectName?: string | null;
  clientName?: string | null;
  /** Permite pasar un tenant explícito; si no, usa el de la sesión. */
  tenantId?: string | null;
}

export async function generateBudgetPDF(params: BudgetPdfParams): Promise<void> {
  const { budget, items, overheads, summary, projectName, clientName, tenantId } = params;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentRight = pageWidth - margin;

  const company = await getCompanyProfile(tenantId);

  const y = drawHeader(doc, company, budget, margin, pageWidth);
  const yMeta = drawMeta(doc, { budget, projectName, clientName }, y, margin, pageWidth);

  // ---- Tabla de partidas (árbol EDT: fases en negrita, partidas hoja con valor) ----
  const leafIds = new Set(getLeafItems(items).map(i => i.id));
  const rollup = rollupValues(items, leafIds);
  const sorted = [...items].sort((a, b) => a.path.localeCompare(b.path));
  const phaseRows = new Set<number>();

  const body = sorted.map((it, idx) => {
    const depth = it.path.split('/').length;
    const indent = '   '.repeat(Math.max(0, depth - 1));
    const isLeaf = leafIds.has(it.id);
    if (!isLeaf) phaseRows.add(idx);
    return [
      displayPath(it.path),
      `${indent}${it.name}`,
      isLeaf ? fmtQty(it.quantity) : '',
      isLeaf ? it.unit : '',
      isLeaf ? formatCLP(it.unitPrice) : '',
      formatCLP(rollup.get(it.id) ?? 0),
    ];
  });

  autoTable(doc, {
    startY: yMeta,
    head: [['Ítem', 'Descripción', 'Cant.', 'Un.', 'P. Unitario', 'Total']],
    body: body.length > 0 ? body : [['', 'Este presupuesto todavía no tiene partidas cargadas.', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: 'bold', fontSize: 8.5 },
    styles: { fontSize: 8, textColor: COLORS.text, lineColor: COLORS.hair, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 18 },
      2: { halign: 'right', cellWidth: 18 },
      3: { halign: 'center', cellWidth: 14 },
      4: { halign: 'right', cellWidth: 28 },
      5: { halign: 'right', cellWidth: 30 },
    },
    margin: { left: margin, right: margin },
    didParseCell: (data: any) => {
      if (data.section === 'body' && phaseRows.has(data.row.index)) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = COLORS.phase;
        data.cell.styles.textColor = COLORS.primary;
      }
    },
  });

  let cursorY = doc.lastAutoTable.finalY + 8;

  // ---- Detalle de gastos generales (si hay líneas) ----
  if (overheads.length > 0) {
    cursorY = ensureSpace(doc, cursorY, 14 + overheads.length * 7, margin, pageWidth);
    const ggBody = [...overheads]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map(o => [
        o.name || 'Gasto general',
        o.mode === 'percent' ? `${o.percent || 0}% del costo directo` : 'Monto fijo',
        formatCLP(summary.overheadLines.get(o.id) ?? 0),
      ]);
    autoTable(doc, {
      startY: cursorY,
      head: [['Gastos Generales', 'Base', 'Valor']],
      body: ggBody,
      theme: 'grid',
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: 'bold', fontSize: 8.5 },
      styles: { fontSize: 8, textColor: COLORS.text, lineColor: COLORS.hair, cellPadding: 2 },
      columnStyles: { 2: { halign: 'right', cellWidth: 30 } },
      margin: { left: margin, right: margin },
    });
    cursorY = doc.lastAutoTable.finalY + 8;
  }

  // ---- Resumen / cascada (bloque a la derecha) ----
  cursorY = drawSummary(doc, budget, summary, cursorY, margin, contentRight, pageWidth);

  // ---- Firma del representante legal ----
  drawSignature(doc, company, cursorY, margin, pageWidth);

  drawFooters(doc, company, margin, pageWidth, pageHeight);

  const safeName = (budget.name || 'Presupuesto').replace(/[^\p{L}\p{N}]+/gu, '_');
  doc.save(`Presupuesto_${safeName}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

/** Valor acumulado por partida: cada hoja suma su monto a todos sus ancestros. */
function rollupValues(items: WorkItem[], leafIds: Set<string>): Map<string, number> {
  const byId = new Map(items.map(i => [i.id, i]));
  const total = new Map<string, number>();
  for (const item of items) {
    if (!leafIds.has(item.id)) continue;
    const value = (item.quantity || 0) * (item.unitPrice || 0);
    let node: WorkItem | undefined = item;
    const guard = new Set<string>();
    while (node && !guard.has(node.id)) {
      guard.add(node.id);
      total.set(node.id, (total.get(node.id) ?? 0) + value);
      node = node.parentId ? byId.get(node.parentId) : undefined;
    }
  }
  return total;
}

function drawHeader(
  doc: jsPDF,
  company: CompanyProfile,
  budget: Budget,
  margin: number,
  pageWidth: number
): number {
  let y = margin;

  if (company.logo) {
    try {
      doc.addImage(company.logo, margin, y, 38, 16);
    } catch {
      /* un logo corrupto no debe impedir generar el documento */
    }
  }

  // Datos de la empresa (bajo el logo)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(COLORS.primary);
  doc.text(company.name || 'Presupuesto de Obra', margin, y + 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLORS.muted);
  const lines = [
    company.rut && `RUT: ${company.rut}`,
    company.giro,
    companyAddressLine(company),
    companyContactLine(company),
  ].filter(Boolean) as string[];
  lines.forEach((line, i) => doc.text(line, margin, y + 29 + i * 4));

  // Título a la derecha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(COLORS.primary);
  doc.text('PRESUPUESTO', pageWidth - margin, y + 8, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(COLORS.muted);
  doc.text(`N° ${budget.id.substring(0, 8).toUpperCase()}`, pageWidth - margin, y + 14, { align: 'right' });
  doc.text(
    budget.type === 'adicional' ? 'Presupuesto adicional' : 'Presupuesto principal',
    pageWidth - margin,
    y + 19,
    { align: 'right' }
  );

  y = y + 29 + Math.max(lines.length * 4, 12) + 4;

  doc.setDrawColor(COLORS.primary);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineWidth(0.2);
  return y + 7;
}

function drawMeta(
  doc: jsPDF,
  data: { budget: Budget; projectName?: string | null; clientName?: string | null },
  y: number,
  margin: number,
  pageWidth: number
): number {
  const { budget, projectName, clientName } = data;
  const colRight = pageWidth / 2 + 5;

  const rows: Array<[string, string]> = [
    ['Presupuesto:', budget.name || '—'],
    ['Obra:', projectName || 'Sin obra asignada'],
    ['Cliente:', clientName || '—'],
    ['Fecha:', format(new Date(), "d 'de' MMMM, yyyy", { locale: es })],
  ];

  doc.setFontSize(9);
  rows.forEach((row, i) => {
    const isLeft = i % 2 === 0;
    const x = isLeft ? margin : colRight;
    const lineY = y + Math.floor(i / 2) * 6;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(COLORS.muted);
    doc.text(row[0], x, lineY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(COLORS.text);
    doc.text(row[1], x + 26, lineY);
  });

  return y + Math.ceil(rows.length / 2) * 6 + 4;
}

function drawSummary(
  doc: jsPDF,
  budget: Budget,
  summary: BudgetSummary,
  y: number,
  margin: number,
  contentRight: number,
  pageWidth: number
): number {
  const blockWidth = 92;
  const blockX = contentRight - blockWidth;
  const rowH = 6.5;
  const needed = rowH * 6 + 16;
  y = ensureSpace(doc, y, needed, margin, pageWidth);

  const line = (label: string, value: number, opts: { bold?: boolean; top?: boolean } = {}) => {
    if (opts.top) {
      doc.setDrawColor(COLORS.hair);
      doc.line(blockX, y - 1, contentRight, y - 1);
    }
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.setTextColor(opts.bold ? COLORS.primary : COLORS.text);
    doc.text(label, blockX, y + 3.5);
    doc.text(formatCLP(value), contentRight, y + 3.5, { align: 'right' });
    y += rowH;
  };

  const pct = (n: number | undefined) => (n ? ` (${n}%)` : '');

  line('Costo directo', summary.directCost);
  line('Gastos generales', summary.overheads);
  line(`Imprevistos${pct(budget.contingencyPercent)}`, summary.contingency);
  line(`Utilidad${pct(budget.profitPercent)}`, summary.profit);
  line('Neto', summary.net, { bold: true, top: true });
  line(`IVA${pct(budget.taxPercent ?? 19)}`, summary.tax);

  // Total destacado (azul Prussian con monto en ámbar, igual que en pantalla)
  const totalH = 11;
  doc.setFillColor(COLORS.primary);
  doc.rect(blockX, y, blockWidth, totalH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(COLORS.white);
  doc.text('TOTAL', blockX + 3, y + 7.2);
  doc.setFontSize(12);
  doc.setTextColor(COLORS.cta);
  doc.text(formatCLP(summary.total), contentRight - 3, y + 7.5, { align: 'right' });

  return y + totalH + 6;
}

function drawSignature(
  doc: jsPDF,
  company: CompanyProfile,
  y: number,
  margin: number,
  pageWidth: number
): void {
  const name = company.representanteLegal;
  if (!name && !company.representanteSignature) return;

  const blockW = 70;
  const centerX = margin + blockW / 2;
  y = ensureSpace(doc, y + 6, 34, margin, pageWidth);

  if (company.representanteSignature) {
    try {
      doc.addImage(company.representanteSignature, centerX - 25, y, 50, 18);
    } catch {
      /* firma corrupta: se omite */
    }
  }
  const lineY = y + 20;
  doc.setDrawColor(COLORS.text);
  doc.line(margin, lineY, margin + blockW, lineY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(COLORS.text);
  doc.text(name || '—', centerX, lineY + 5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLORS.muted);
  const sub = [company.representanteCargo, company.representanteRut && `RUT: ${company.representanteRut}`]
    .filter(Boolean)
    .join(' · ');
  if (sub) doc.text(sub, centerX, lineY + 10, { align: 'center' });
}

/** Salta a una página nueva si no queda espacio para el próximo bloque. */
function ensureSpace(doc: jsPDF, y: number, needed: number, margin: number, _pageWidth: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - margin - 12) {
    doc.addPage();
    return margin;
  }
  return y;
}

function drawFooters(
  doc: jsPDF,
  company: CompanyProfile,
  margin: number,
  pageWidth: number,
  pageHeight: number
): void {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(COLORS.hair);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(COLORS.muted);
    const left = company.name || '';
    doc.text(left, margin, pageHeight - 7);
    doc.text(`Página ${i} de ${total}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
  }
}
