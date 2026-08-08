"use client";

/**
 * Adendas de un subcontrato (migración 033).
 *
 * «Aumentamos 40 millones» o «se amplía el plazo 30 días». Es la misma tabla y
 * el mismo cálculo que los adicionales del contrato con el mandante: cambia el
 * monto, cambia el plazo, y **solo cuenta cuando está aprobada**. El contrato
 * original nunca se sobrescribe — de ahí sale el «monto vigente».
 */

import { useMemo, useState } from 'react';
import {
  CalendarPlus, FilePlus2, Trash2, TrendingDown, TrendingUp,
} from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/modules/core/hooks/use-toast';
import { formatCLP } from '@/lib/format';
import { formatDate } from '@/lib/date-utils';
import {
  CAUSAS_ADICIONAL, ESTADOS_ADICIONAL, TIPOS_ADICIONAL,
  adendasDeSubcontrato, impactoSubcontrato, puedeEditar,
  siguienteNumeroAdicional, siguientesEstados, validarAdenda,
} from '@/lib/amendment';
import type {
  Amendment, AmendmentStatus, AmendmentType, Subcontract,
} from '@/modules/core/lib/data';

const TONO: Record<AmendmentStatus, 'neutral' | 'warning' | 'success' | 'danger'> = {
  borrador: 'neutral',
  presentado: 'warning',
  aprobado: 'success',
  rechazado: 'danger',
  anulado: 'neutral',
};

export function AdendasSubcontrato({
  subcontract: sc, editable,
}: {
  subcontract: Subcontract;
  editable: boolean;
}) {
  const { amendments, setAmendmentStatus, deleteAmendment } = useAppState();
  const { toast } = useToast();
  const [creando, setCreando] = useState(false);

  const adendas = useMemo(
    () => adendasDeSubcontrato(amendments, sc.id).sort((a, b) => a.number - b.number),
    [amendments, sc.id],
  );

  const impacto = useMemo(
    () => impactoSubcontrato(sc, adendas),
    [sc, adendas],
  );

  const hayCambios = impacto.montoAdicionales !== 0 || impacto.diasAumento > 0;

  async function cambiarEstado(a: Amendment, status: AmendmentStatus) {
    try {
      await setAmendmentStatus(a.id, status, {});
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo actualizar', description: e.message });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">
          Adendas
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            Aumentos, disminuciones y ampliaciones de plazo. El contrato original no se toca.
          </span>
        </CardTitle>
        {editable && (
          <Button size="sm" variant="outline" onClick={() => setCreando(true)}>
            <FilePlus2 className="mr-2 h-4 w-4" /> Nueva adenda
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Monto y plazo vigentes: la cifra contra la que se mide todo lo demás */}
        {hayCambios && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Dato
              icon={impacto.montoAdicionales >= 0 ? TrendingUp : TrendingDown}
              label="Monto vigente"
              valor={formatCLP(impacto.montoVigente)}
              detalle={`Original ${formatCLP(impacto.montoOriginal)} ${
                impacto.montoAdicionales >= 0 ? '+' : '−'
              } ${formatCLP(Math.abs(impacto.montoAdicionales))}`}
            />
            <Dato
              icon={CalendarPlus}
              label="Plazo vigente"
              valor={impacto.plazoVigente !== null ? `${impacto.plazoVigente} días` : '—'}
              detalle={impacto.diasAumento > 0
                ? `+${impacto.diasAumento} días aprobados`
                : 'Sin ampliaciones'}
            />
            <Dato
              icon={CalendarPlus}
              label="Término vigente"
              valor={impacto.fechaTerminoVigente
                ? formatDate(impacto.fechaTerminoVigente)
                : '—'}
              detalle="Contra esta fecha se calcula la multa"
            />
          </div>
        )}

        {(impacto.montoEnTramite !== 0 || impacto.diasEnTramite > 0) && (
          <p className="rounded-md border border-info/40 bg-info-subtle p-3 text-sm text-muted-foreground">
            Presentadas sin resolver:{' '}
            {impacto.montoEnTramite !== 0 && (
              <span className="font-medium text-foreground">
                {formatCLP(impacto.montoEnTramite)}
              </span>
            )}
            {impacto.montoEnTramite !== 0 && impacto.diasEnTramite > 0 ? ' y ' : ''}
            {impacto.diasEnTramite > 0 && (
              <span className="font-medium text-foreground">
                {impacto.diasEnTramite} días
              </span>
            )}
            . Todavía no cambian el contrato.
          </p>
        )}

        {adendas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin adendas. Cuando el subcontrato cambie de monto o de plazo, regístralo acá
            en vez de editar el contrato: así queda claro de dónde salió la diferencia.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {adendas.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      N° {a.number} · {a.name}
                    </span>
                    <StatusBadge tone={TONO[a.status]}>{ESTADOS_ADICIONAL[a.status]}</StatusBadge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {TIPOS_ADICIONAL[a.type]} · {CAUSAS_ADICIONAL[a.cause]}
                    {a.amountNet > 0 && ` · ${formatCLP(a.amountNet)}`}
                    {a.extraDays > 0 && ` · +${a.extraDays} días`}
                  </div>
                  {a.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
                  )}
                </div>

                {editable && (
                  <div className="flex flex-wrap items-center gap-1">
                    {siguientesEstados(a.status).map((s) => (
                      <Button
                        key={s} size="sm"
                        variant={s === 'aprobado' ? 'default' : 'outline'}
                        onClick={() => cambiarEstado(a, s)}
                      >
                        {ESTADOS_ADICIONAL[s]}
                      </Button>
                    ))}
                    {puedeEditar(a) && (
                      <Button
                        variant="ghost" size="icon" aria-label="Borrar"
                        onClick={() => deleteAmendment(a.id)}
                      >
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {creando && (
        <DialogoAdenda
          subcontract={sc}
          adendas={adendas}
          onCerrar={() => setCreando(false)}
        />
      )}
    </Card>
  );
}

function Dato({
  icon: Icon, label, valor, detalle,
}: {
  icon: React.ElementType;
  label: string;
  valor: string;
  detalle?: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 font-semibold text-foreground">{valor}</div>
      {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}

/* ── Alta de una adenda ────────────────────────────────────────────────── */

function DialogoAdenda({
  subcontract: sc, adendas, onCerrar,
}: {
  subcontract: Subcontract;
  adendas: Amendment[];
  onCerrar: () => void;
}) {
  const { addAmendment } = useAppState();
  const { toast } = useToast();

  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<AmendmentType>('aumento_obra');
  const [causa, setCausa] = useState<Amendment['cause']>('solicitud_mandante');
  const [monto, setMonto] = useState(0);
  const [dias, setDias] = useState(0);
  const [descripcion, setDescripcion] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const soloPlazo = tipo === 'aumento_plazo';

  async function guardar() {
    if (!nombre.trim()) {
      toast({ variant: 'destructive', title: 'Ponle un nombre a la adenda' });
      return;
    }

    const errores = validarAdenda(
      { type: tipo, amountNet: monto, extraDays: dias },
      sc,
      adendas.filter((a) => a.status === 'aprobado'),
    );
    if (errores.length > 0) {
      toast({ variant: 'destructive', title: 'Revisa la adenda', description: errores[0] });
      return;
    }

    setOcupado(true);
    try {
      await addAmendment({
        subcontractId: sc.id,
        contractId: null,
        projectId: sc.projectId,
        number: siguienteNumeroAdicional(adendas),
        name: nombre.trim(),
        type: tipo,
        cause: causa,
        // Siempre positivo: el signo lo pone el tipo, no quien escribe.
        amountNet: soloPlazo ? 0 : Math.abs(monto),
        currency: sc.currency,
        extraDays: dias,
        description: descripcion.trim() || null,
        status: 'borrador',
      });
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo crear', description: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva adenda · N° {siguienteNumeroAdicional(adendas)}</DialogTitle>
          <DialogDescription>
            Nace en borrador. Solo cuando la apruebes cambia el monto y el plazo vigentes
            del subcontrato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ad-nombre">Nombre</Label>
            <Input id="ad-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Refuerzo adicional de pilares eje 4" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as AmendmentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPOS_ADICIONAL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Causa</Label>
              <Select value={causa} onValueChange={(v) => setCausa(v as Amendment['cause'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CAUSAS_ADICIONAL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {!soloPlazo && (
              <div className="space-y-2">
                <Label htmlFor="ad-monto">Monto ({sc.currency})</Label>
                <Input id="ad-monto" type="number" min={0} value={monto || ''}
                  onChange={(e) => setMonto(Number(e.target.value) || 0)} />
                <p className="text-xs text-muted-foreground">
                  Siempre positivo. Si es una disminución, el tipo se encarga de restarlo.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="ad-dias">Días de aumento de plazo</Label>
              <Input id="ad-dias" type="number" min={0} value={dias || ''}
                onChange={(e) => setDias(Number(e.target.value) || 0)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ad-desc">Descripción</Label>
            <Textarea id="ad-desc" rows={3} value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Qué se agrega, quita o amplía, y por qué." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={ocupado}>Crear adenda</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
