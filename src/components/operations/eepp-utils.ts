/**
 * Puentes entre las filas que vienen de la base y el motor puro de
 * `payment-certificate.ts`. Se mantienen fuera del lib para que ese archivo no
 * dependa de la forma de las tablas.
 */

import type { PaymentCertificate } from '@/modules/core/lib/data';
import {
  acumuladosAnteriores as acumuladosPuro,
  esFirme,
} from '@/lib/payment-certificate';

export { esFirme };

/** Acumulados de los EEPP firmes de un contrato. */
export function acumuladosAnteriores(eepps: PaymentCertificate[]) {
  return acumuladosPuro(eepps.map((e) => ({
    status: e.status,
    periodAmount: e.periodAmount,
    feeAmount: e.feeAmount,
    advanceAmortization: e.advanceAmortization,
    retentionAmount: e.retentionAmount,
  })));
}

/**
 * Retención acumulada (la plata que el mandante todavía tiene retenida). Es la
 * misma suma que `acumuladosAnteriores.previousRetention`, expuesta aparte
 * porque en pantalla es un dato por derecho propio: es lo que hay que recuperar
 * en la recepción de la obra.
 */
export function montoRetencionAcumulada(eepps: PaymentCertificate[]): number {
  return acumuladosAnteriores(eepps).previousRetention;
}
