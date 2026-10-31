import { describe, it, expect } from 'vitest';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Humo del motor de PDF: si una actualización de jspdf / jspdf-autotable
 * rompe la API que usan los ~20 generadores (texto, tablas, finalY, imágenes,
 * salida en blob/arraybuffer), esto falla antes de llegar a producción.
 */
describe('motor de PDF (jspdf + autotable)', () => {
  it('arma un documento con texto y tabla, y expone finalY', () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Orden de compra', 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [['Material', 'Cantidad']],
      body: [['Cemento', '10'], ['Fierro 8mm', '25']],
    });
    const finalY = (doc as any).lastAutoTable?.finalY;
    expect(typeof finalY).toBe('number');
    expect(finalY).toBeGreaterThan(30);

    const bytes = new Uint8Array(doc.output('arraybuffer'));
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('acepta una imagen PNG en data URI', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const doc = new jsPDF();
    expect(() => doc.addImage(png, 'PNG', 10, 10, 20, 20)).not.toThrow();
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(500);
  });
});
