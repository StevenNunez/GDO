"use client";

/**
 * Orden de Pago de un estado de pago (migración 035).
 *
 * Es el último paso del proceso: el estado de pago está aprobado, y esto es el
 * documento con el que Finanzas transfiere. Las dos opciones de la pizarra:
 * mandarla al correo registrado o descargarla.
 */

import { useMemo, useState } from 'react';
import {
  Ban, Banknote, Download, Mail, Receipt, Send,
} from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/modules/core/hooks/use-toast';
import { formatCLP } from '@/lib/format';
import { formatDate } from '@/lib/date-utils';
import { descuentosDe } from '@/lib/deductions';
import {
  ESTADOS_OP, TONO_OP, datosDePago, ordenVigente, puedeEmitirseOP,
  vencimientoSugerido,
} from '@/lib/payment-order';
import {
  downloadOrdenDePagoPDF, generateOrdenDePagoPDF,
} from '@/lib/orden-de-pago-pdf';
import type {
  PaymentOrder, Subcontract, SubcontractCertificate,
} from '@/modules/core/lib/data';

interface Props {
  certificate: SubcontractCertificate;
  subcontract: Subcontract;
  projectName?: string | null;
  editable: boolean;
}

export function OrdenDePagoPanel({
  certificate, subcontract, projectName, editable,
}: Props) {
  const {
    paymentOrders, certificateDeductions, sendPaymentOrder,
  } = useAppState();
  const { toast } = useToast();

  const [emitiendo, setEmitiendo] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const propias = useMemo(
    () => paymentOrders.filter(
      (o) => o.certificateType === 'subcontract' && o.certificateId === certificate.id,
    ),
    [paymentOrders, certificate.id],
  );

  const orden = useMemo(
    () => ordenVigente(paymentOrders, 'subcontract', certificate.id),
    [paymentOrders, certificate.id],
  );

  const puerta = useMemo(
    () => puedeEmitirseOP(certificate, subcontract, propias),
    [certificate, subcontract, propias],
  );

  const deducciones = useMemo(
    () => descuentosDe(certificateDeductions, 'subcontract', certificate.id),
    [certificateDeductions, certificate.id],
  );

  // Sin orden y sin poder emitirla, el panel no aporta nada.
  if (!orden && !editable) return null;
  if (!orden && !puerta.puede && certificate.status === 'borrador') return null;

  async function descargar(o: PaymentOrder) {
    try {
      await downloadOrdenDePagoPDF({
        order: o,
        certificate,
        deductions: deducciones,
        subcontractName: subcontract.name,
        projectName,
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo generar', description: e.message });
    }
  }

  /** Genera el PDF en el navegador y lo manda al servidor para que lo envíe. */
  async function enviar(o: PaymentOrder) {
    setOcupado(true);
    try {
      const blob = await generateOrdenDePagoPDF({
        order: o,
        certificate,
        deductions: deducciones,
        subcontractName: subcontract.name,
        projectName,
      });
      const base64 = await blobABase64(blob);

      const r = await sendPaymentOrder({ orderId: o.id, pdfBase64: base64 });
      toast({
        title: 'Orden enviada',
        description: r.warning ?? `Se envió a ${r.sentTo}.`,
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo enviar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">
          <Receipt className="mr-2 inline h-4 w-4" />
          Orden de pago
          {orden && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              N° {orden.number}
            </span>
          )}
        </CardTitle>
        {orden && (
          <StatusBadge tone={TONO_OP[orden.status]}>{ESTADOS_OP[orden.status]}</StatusBadge>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {!orden ? (
          <>
            <p className="text-sm text-muted-foreground">
              Con la orden de pago emitida, Finanzas sabe a quién transferir, a qué cuenta
              y contra qué estado de pago.
            </p>
            {!puerta.puede && (
              <p className="text-sm text-warning">{puerta.motivo}</p>
            )}
            {editable && (
              <Button disabled={!puerta.puede} onClick={() => setEmitiendo(true)}>
                Emitir orden de pago
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <Dato label="Se le paga a" valor={orden.supplierName} />
              <Dato label="Monto" valor={formatCLP(orden.amount)} />
              <Dato
                label="Cuenta"
                valor={orden.accountNumber
                  ? `${orden.bank ?? ''} ${orden.accountType ?? ''} ${orden.accountNumber}`.trim()
                  : 'Sin datos bancarios'}
              />
              <Dato
                label="Vence"
                valor={orden.dueDate ? formatDate(orden.dueDate) : '—'}
              />
              {orden.sentAt && (
                <Dato label="Enviada" valor={`${formatDate(orden.sentAt)} a ${orden.sentTo}`} />
              )}
              {orden.paidAt && (
                <Dato
                  label="Pagada"
                  valor={`${formatDate(orden.paidAt)}${orden.paymentReference ? ` · ${orden.paymentReference}` : ''}`}
                />
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button variant="outline" size="sm" onClick={() => descargar(orden)}>
                <Download className="mr-2 h-4 w-4" /> Descargar
              </Button>

              {editable && orden.status !== 'pagada' && (
                <Button
                  variant="outline" size="sm" disabled={ocupado || !orden.email}
                  title={orden.email ? undefined : 'El contratista no tiene correo registrado.'}
                  onClick={() => enviar(orden)}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {orden.sentAt ? 'Reenviar por correo' : 'Enviar por correo'}
                </Button>
              )}

              {editable && orden.status !== 'pagada' && (
                <>
                  <Button size="sm" onClick={() => setPagando(true)}>
                    <Banknote className="mr-2 h-4 w-4" /> Marcar pagada
                  </Button>
                  <Button
                    variant="ghost" size="sm" className="ml-auto text-danger"
                    onClick={() => setAnulando(true)}
                  >
                    <Ban className="mr-2 h-4 w-4" /> Anular
                  </Button>
                </>
              )}
            </div>

            {!orden.email && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                Para poder enviarla, carga el correo del contratista en su ficha.
              </p>
            )}
          </>
        )}

        {/* Órdenes anuladas: el rastro de por qué se reemitió */}
        {propias.filter((o) => o.status === 'anulada').length > 0 && (
          <ul className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            {propias.filter((o) => o.status === 'anulada').map((o) => (
              <li key={o.id}>
                OP N° {o.number} anulada: {o.voidReason}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {emitiendo && (
        <DialogoEmitir
          certificate={certificate}
          subcontract={subcontract}
          onCerrar={() => setEmitiendo(false)}
        />
      )}
      {pagando && orden && (
        <DialogoPagar orden={orden} onCerrar={() => setPagando(false)} />
      )}
      {anulando && orden && (
        <DialogoAnular orden={orden} onCerrar={() => setAnulando(false)} />
      )}
    </Card>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-foreground">{valor}</div>
    </div>
  );
}

/* ── Emitir ────────────────────────────────────────────────────────────── */

function DialogoEmitir({
  certificate, subcontract, onCerrar,
}: {
  certificate: SubcontractCertificate;
  subcontract: Subcontract;
  onCerrar: () => void;
}) {
  const { addPaymentOrder, suppliers } = useAppState();
  const { toast } = useToast();

  const contratista = suppliers.find((s) => s.id === subcontract.supplierId) ?? null;
  const pago = datosDePago(contratista);

  const [emision] = useState(() => hoyISO());
  const [vence, setVence] = useState(() => {
    const v = vencimientoSugerido(new Date(), 30);
    return v ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : '';
  });
  const [factura, setFactura] = useState(certificate.invoiceNumber ?? '');
  const [notas, setNotas] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function emitir() {
    setOcupado(true);
    try {
      await addPaymentOrder({
        certificateType: 'subcontract',
        certificateId: certificate.id,
        projectId: certificate.projectId,
        supplierId: subcontract.supplierId,
        supplierName: contratista?.name ?? subcontract.supplierName ?? 'Contratista',
        supplierRut: contratista?.rut ?? null,
        // Los datos bancarios se COPIAN: si mañana cambia de banco, esta orden
        // tiene que seguir diciendo a dónde se transfirió de verdad.
        bank: pago.bank,
        accountType: pago.accountType,
        accountNumber: pago.accountNumber,
        email: pago.email,
        amount: certificate.totalAmount,
        currency: subcontract.currency,
        issueDate: emision as never,
        dueDate: (vence || null) as never,
        invoiceNumber: factura.trim() || null,
        notes: notas.trim() || null,
      });
      toast({ title: 'Orden de pago emitida', description: 'Ya puedes descargarla o enviarla.' });
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo emitir', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Emitir orden de pago</DialogTitle>
          <DialogDescription>
            Por {formatCLP(certificate.totalAmount)} a {contratista?.name ?? subcontract.supplierName}.
            El número lo asigna el sistema.
          </DialogDescription>
        </DialogHeader>

        {pago.faltantes.length > 0 && (
          <p className="rounded-md border border-warning/40 bg-warning-subtle p-3 text-sm text-muted-foreground">
            Le falta {pago.faltantes.join(', ')} en su ficha. Puedes emitirla igual, pero
            sin esos datos no se puede transferir ni enviar por correo.
          </p>
        )}

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="op-vence">Fecha de pago</Label>
              <Input id="op-vence" type="date" value={vence}
                onChange={(e) => setVence(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="op-factura">N° de factura</Label>
              <Input id="op-factura" value={factura}
                onChange={(e) => setFactura(e.target.value)} placeholder="Opcional" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="op-notas">Observaciones</Label>
            <Textarea id="op-notas" rows={2} value={notas}
              onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={emitir} disabled={ocupado}>Emitir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Pagar ─────────────────────────────────────────────────────────────── */

function DialogoPagar({ orden, onCerrar }: { orden: PaymentOrder; onCerrar: () => void }) {
  const { markPaymentOrderPaid } = useAppState();
  const { toast } = useToast();
  const [metodo, setMetodo] = useState('Transferencia');
  const [referencia, setReferencia] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function pagar() {
    setOcupado(true);
    try {
      await markPaymentOrderPaid(orden.id, {
        paymentMethod: metodo.trim() || null,
        paymentReference: referencia.trim() || null,
      });
      toast({
        title: 'Pago registrado',
        description: 'El estado de pago quedó marcado como pagado.',
      });
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo registrar', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar el pago</DialogTitle>
          <DialogDescription>
            OP N° {orden.number} por {formatCLP(orden.amount)}. El estado de pago queda
            pagado junto con la orden: son el mismo hecho.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pg-metodo">Medio de pago</Label>
            <Input id="pg-metodo" value={metodo} onChange={(e) => setMetodo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pg-ref">N° de operación</Label>
            <Input id="pg-ref" value={referencia}
              onChange={(e) => setReferencia(e.target.value)} placeholder="Comprobante" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={pagar} disabled={ocupado}>Confirmar pago</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Anular ────────────────────────────────────────────────────────────── */

function DialogoAnular({ orden, onCerrar }: { orden: PaymentOrder; onCerrar: () => void }) {
  const { voidPaymentOrder } = useAppState();
  const { toast } = useToast();
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Anular la OP N° {orden.number}</DialogTitle>
          <DialogDescription>
            El motivo es obligatorio: un hueco en el correlativo hay que poder explicarlo.
            Después podrás emitir una nueva.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
          placeholder="Ej: se emitió con la cuenta bancaria equivocada"
        />

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button
            variant="destructive" disabled={ocupado || !motivo.trim()}
            onClick={async () => {
              setOcupado(true);
              try {
                await voidPaymentOrder(orden.id, motivo);
                onCerrar();
              } catch (e: any) {
                toast({ variant: 'destructive', title: 'No se pudo anular', description: e.message });
              } finally {
                setOcupado(false);
              }
            }}
          >
            Anular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Utilidades ────────────────────────────────────────────────────────── */

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** El PDF viaja al servidor como base64: es lo que nodemailer adjunta. */
function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('No se pudo leer el documento.'));
    reader.readAsDataURL(blob);
  });
}
