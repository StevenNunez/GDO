
import jsPDF from 'jspdf';
import { formatCLP } from '@/lib/format';
import { getCompanyProfile } from '@/lib/company-profile';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { WorkItem } from '@/modules/core/lib/data';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

const COLORS = {
  primary: '#00528B',
  secondary: '#7f8c8d',
  text: '#34495e',
  lightGray: '#f8f9f9',
  white: '#ffffff',
};

export async function generateEstadoDePagoPDF(epId: string, contractorName: string, totalValue: number, earnedValue: number, items: WorkItem[]) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  const company = await getCompanyProfile();
  if (company.logo) doc.addImage(company.logo, margin, y, 40, 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(COLORS.primary);
  doc.text("ESTADO DE PAGO", pageWidth / 2, y + 10, { align: "center" });
  
  doc.setFontSize(10);
  doc.setTextColor(COLORS.secondary);
  doc.text(`EP N°: ${epId.substring(0, 8).toUpperCase()}`, pageWidth - margin, y, { align: "right" });

  y += 25;

  doc.setFontSize(10);
  doc.setTextColor(COLORS.text);
  doc.text(`Contratista: ${contractorName}`, margin, y);
  doc.text(`Fecha: ${format(new Date(), "dd 'de' MMMM, yyyy", { locale: es })}`, pageWidth - margin, y, { align: "right" });
  
  y += 10;
  
  doc.setDrawColor(COLORS.lightGray);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  const tableData = items.map(item => [
    item.path,
    item.name,
    item.quantity.toLocaleString('de-DE'),
    item.unit,
    formatCLP(item.unitPrice),
    formatCLP(item.quantity * item.unitPrice),
    `${(item.progress || 0).toFixed(2)}%`,
    formatCLP(item.quantity * item.unitPrice * ((item.progress || 0) / 100)),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Partida', 'Descripción', 'Cant.', 'Und.', 'P. Unitario', 'Total', '% Avance', 'Valor Avance']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white },
    styles: { fontSize: 8 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Totales
  const totalLabelX = pageWidth - margin - 70;
  const totalValueX = pageWidth - margin;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");

  doc.text("Valor Total Contratos:", totalLabelX, y);
  doc.text(formatCLP(totalValue), totalValueX, y, { align: "right" });
  y += 7;

  doc.setFillColor(COLORS.lightGray);
  doc.rect(totalLabelX - 2, y - 5, 72, 8, 'F');
  doc.setTextColor(COLORS.primary);
  doc.text("Valor Ganado (a la fecha):", totalLabelX, y);
  doc.text(formatCLP(earnedValue), totalValueX, y, { align: "right" });
  
  const filename = `Estado_Pago_${contractorName.replace(/ /g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  doc.save(filename);
}
