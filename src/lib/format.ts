/**
 * Formatos compartidos de la app.
 *
 * `formatCLP` vivía copiada en 16 archivos con dos nombres (`formatCurrency` y
 * `formatCLP`) y cuatro variantes escritas a mano. Todas producían exactamente
 * la misma salida — el peso chileno no usa decimales, así que `Intl` ya
 * redondea solo — pero cada copia era una oportunidad de que una pantalla
 * mostrara los montos distinto que otra.
 */

const CLP = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

/**
 * Monto en pesos chilenos: `1234567` → `"$1.234.567"`.
 *
 * Tolera `null`/`undefined`/`NaN` y los muestra como `$0`: los montos vienen de
 * sumas sobre datos parciales y un `$NaN` en pantalla es peor que un cero.
 */
export function formatCLP(value: number | null | undefined): string {
  return CLP.format(Number.isFinite(value as number) ? (value as number) : 0);
}
