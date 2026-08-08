import type jsPDF from 'jspdf';

/**
 * Cómo entrega su resultado un generador de PDF.
 *
 * Antes cada generador terminaba con `doc.save(...)`: bajaba el archivo y no
 * había forma de obtener el PDF para hacer otra cosa con él —por ejemplo,
 * adjuntarlo a un correo—. Con esto el generador sigue descargando por defecto
 * (nadie tuvo que cambiar sus llamadas) pero además devuelve el Blob, así que
 * enviar un documento por correo no obliga a duplicar el generador.
 */
export type SalidaPdf = 'descargar' | 'blob';

export function entregarPdf(
  doc: jsPDF,
  fileName: string,
  salida: SalidaPdf = 'descargar',
): Blob {
  // El Blob se saca SIEMPRE, incluso al descargar: `doc.save()` deja el
  // documento en un estado desde el que volver a leerlo no es confiable.
  const blob = doc.output('blob');
  if (salida === 'descargar') doc.save(fileName);
  return blob;
}
