import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { LibroObra, LibroObraAsiento } from '@/modules/core/lib/data';
import { toDate } from '@/lib/date-utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

const C = {
  primary: [31, 78, 121] as [number, number, number],
  dark: [30, 30, 30] as [number, number, number],
  muted: [100, 100, 100] as [number, number, number],
  light: [240, 240, 240] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  border: [180, 180, 180] as [number, number, number],
  amber: [180, 120, 0] as [number, number, number],
};

const TIPO_LABELS: Record<string, string> = {
  'inicio-obra': 'Inicio de Obra',
  'entrega-terreno': 'Entrega de Terreno',
  'orden-trabajo': 'Orden de Trabajo',
  'modificacion-proyecto': 'Modificación de Proyecto',
  'observacion-ito': 'Observación del ITO',
  'respuesta-constructor': 'Respuesta del Constructor',
  'avance': 'Avance de Obra',
  'incidente': 'Incidente / Accidente',
  'paralizacion': 'Paralización',
  'reanudacion': 'Reanudación',
  'termino-obra': 'Término de Obra',
};

const ROL_LABELS: Record<string, string> = {
  'propietario': 'Propietario',
  'arquitecto': 'Arquitecto',
  'calculista': 'Calculista',
  'constructor': 'Constructor',
  'ito': 'Inspector Técnico (ITO)',
  'revisor': 'Revisor Independiente',
};

const fmtDate = (d: any) => {
  const dt = toDate(d);
  if (!dt) return '—';
  return format(dt, "d 'de' MMMM 'de' yyyy", { locale: es });
};

export async function generateLibroObraPDF(
  libro: LibroObra,
  asientos: LibroObraAsiento[]
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const margin = 15;
  const contentW = W - margin * 2;

  // ── PÁGINA 1: CARÁTULA ──────────────────────────────────────────────────────
  // Fondo header
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, W, 42, 'F');

  // Títulos header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...C.white);
  doc.text('LIBRO DE OBRA DIGITAL', W / 2, 18, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Documento Oficial — República de Chile', W / 2, 27, { align: 'center' });

  doc.setFontSize(9);
  doc.text(`Generado el ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })}`, W / 2, 35, { align: 'center' });

  // Estado badge
  const estadoColor = libro.estado === 'vigente' ? [0, 140, 70] : [150, 30, 30];
  doc.setFillColor(...(estadoColor as [number, number, number]));
  doc.roundedRect(W - margin - 28, 11, 26, 8, 2, 2, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(libro.estado === 'vigente' ? 'VIGENTE' : 'CERRADO', W - margin - 15, 16.5, { align: 'center' });

  let y = 52;

  // Identificación del proyecto
  doc.setFillColor(...C.light);
  doc.rect(margin, y - 4, contentW, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.primary);
  doc.text('IDENTIFICACIÓN DEL PROYECTO', margin + 3, y + 3);
  y += 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...C.dark);
  doc.text(libro.nombreProyecto, margin, y + 5);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.muted);
  doc.text(`${libro.direccionObra}, ${libro.comunaObra}`, margin, y + 3);
  y += 8;

  // Permiso
  doc.setFontSize(9);
  doc.setTextColor(...C.dark);
  doc.text(`Permiso Municipal N° ${libro.numeroPermiso}`, margin, y);
  if (libro.fechaPermiso) {
    doc.text(`  —  Fecha: ${fmtDate(libro.fechaPermiso)}`, margin + 50, y);
  }
  y += 10;

  // Hitos
  const hitos = [];
  if (libro.fechaInicioObra) hitos.push(`Inicio de Obra: ${fmtDate(libro.fechaInicioObra)}`);
  if (libro.fechaEntregaTerreno) hitos.push(`Entrega de Terreno: ${fmtDate(libro.fechaEntregaTerreno)}`);
  if (hitos.length > 0) {
    doc.setFontSize(9);
    doc.setTextColor(...C.muted);
    doc.text(hitos.join('   |   '), margin, y);
    y += 8;
  }

  y += 4;
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(margin, y, W - margin, y);
  y += 6;

  // Partes intervinientes
  doc.setFillColor(...C.light);
  doc.rect(margin, y - 2, contentW, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.primary);
  doc.text('PARTES INTERVINIENTES', margin + 3, y + 4);
  y += 12;

  const partes = [
    { rol: 'Propietario', nombre: libro.nombrePropietario, rut: libro.rutPropietario },
    { rol: 'Arquitecto', nombre: libro.nombreArquitecto, rut: libro.rutArquitecto },
    { rol: 'Calculista', nombre: libro.nombreCalculista || '—', rut: libro.rutCalculista || '' },
    { rol: 'Constructor', nombre: libro.nombreConstructor, rut: libro.rutConstructor },
    { rol: 'Inspector Técnico (ITO)', nombre: libro.nombreITO || '—', rut: libro.rutITO || '' },
    { rol: 'Revisor Independiente', nombre: libro.nombreRevisorIndependiente || '—', rut: libro.rutRevisorIndependiente || '' },
  ];

  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: contentW,
    head: [['Rol', 'Nombre', 'RUT']],
    body: partes.map(p => [p.rol, p.nombre, p.rut]),
    headStyles: {
      fillColor: C.primary,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 9, textColor: C.dark },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: contentW - 55 - 35 },
      2: { cellWidth: 35 },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Resumen de asientos
  doc.setFillColor(...C.light);
  doc.rect(margin, y - 2, contentW, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.primary);
  doc.text('RESUMEN DE ASIENTOS', margin + 3, y + 4);
  y += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.dark);
  doc.text(`Total de asientos: ${asientos.length}`, margin, y);
  doc.text(`Asientos firmados: ${asientos.filter(a => a.firmado).length}`, margin + 55, y);
  doc.text(`Sin firma: ${asientos.filter(a => !a.firmado).length}`, margin + 115, y);
  y += 12;

  // ── PÁGINAS SIGUIENTES: ASIENTOS ──────────────────────────────────────────
  for (const asiento of asientos) {
    doc.addPage();
    y = margin;

    // Header de asiento
    doc.setFillColor(...C.primary);
    doc.rect(0, 0, W, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...C.white);
    doc.text(`Asiento N° ${asiento.numero}`, margin, 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(libro.nombreProyecto, W / 2, 11, { align: 'center' });
    doc.text(fmtDate(asiento.fecha), W - margin, 11, { align: 'right' });
    y = 26;

    // Tipo badge
    const tipoLabel = TIPO_LABELS[asiento.tipo] || asiento.tipo;
    doc.setFillColor(...C.light);
    doc.roundedRect(margin, y - 3, 70, 9, 2, 2, 'F');
    doc.setDrawColor(...C.border);
    doc.roundedRect(margin, y - 3, 70, 9, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.primary);
    doc.text(tipoLabel.toUpperCase(), margin + 35, y + 3, { align: 'center' });
    y += 12;

    // Línea separadora
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(margin, y, W - margin, y);
    y += 6;

    // Contenido
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.muted);
    doc.text('CONTENIDO DEL ASIENTO:', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...C.dark);
    const lines = doc.splitTextToSize(asiento.contenido, contentW);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 10;

    // Autor info
    doc.setFillColor(...C.light);
    doc.rect(margin, y - 2, contentW, 20, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.muted);
    doc.text('Redactado por:', margin + 3, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.dark);
    doc.setFontSize(10);
    doc.text(asiento.autorNombre, margin + 3, y + 12);
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text(ROL_LABELS[asiento.autorRol] || asiento.autorRol, margin + 3, y + 17);
    y += 26;

    // Firma
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(margin, y, W - margin, y);
    y += 6;

    if (asiento.firmado && asiento.firmaDigital) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.muted);
      doc.text('FIRMA DIGITAL:', margin, y);
      y += 4;

      try {
        doc.addImage(asiento.firmaDigital, 'PNG', margin, y, 70, 25);
      } catch (_) {
        doc.setTextColor(...C.muted);
        doc.setFontSize(8);
        doc.text('[Firma digital registrada]', margin, y + 10);
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...C.muted);
      if (asiento.firmadoAt) {
        doc.text(
          `Firmado digitalmente el ${fmtDate(asiento.firmadoAt)} por ${asiento.autorNombre}`,
          margin,
          y + 30
        );
      }
    } else {
      // Espacio para firma física
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...C.muted);
      doc.text('PENDIENTE DE FIRMA', margin, y + 5);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.rect(margin, y + 10, 70, 22);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('Firma del responsable', margin + 35, y + 34, { align: 'center' });
    }

    // Número de página
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text(`Asiento N°${asiento.numero} — ${libro.nombreProyecto}`, W / 2, 290, { align: 'center' });
  }

  const safeName = libro.nombreProyecto.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`Libro_Obra_${safeName}.pdf`);
}
