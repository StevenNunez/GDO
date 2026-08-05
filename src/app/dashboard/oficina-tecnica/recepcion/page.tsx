"use client";

import { useMemo, useState } from 'react';
import { Plus, ClipboardCheck, Check, Trash2, AlertTriangle, Camera } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatCLP } from '@/lib/format';
import { formatDate } from '@/lib/date-utils';
import { openObraFile } from '@/lib/storage';
import {
  observacionesDe, observacionesPendientes, resumenRecepcion, estadoRecepcion,
  puedeRecepcionDefinitiva, finDeGarantia, diasDeGarantia,
  TIPOS_RECEPCION, SEVERIDADES, ESTADOS_OBSERVACION, type EstadoRecepcion,
} from '@/lib/reception';
import { saldoRetencion } from '@/lib/subcontract';
import { FileField, type ArchivoAdjunto } from '@/components/operations/file-field';
import type { Reception, ReceptionObservation } from '@/modules/core/lib/data';

const TONO_RECEPCION: Record<EstadoRecepcion, StatusTone> = {
  borrador: 'neutral',
  con_observaciones: 'warning',
  subsanada: 'info',
  aceptada: 'success',
  rechazada: 'danger',
};

const ETIQUETA_RECEPCION: Record<EstadoRecepcion, string> = {
  borrador: 'Borrador',
  con_observaciones: 'Con observaciones',
  subsanada: 'Subsanada, falta aceptar',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
};

const TONO_SEVERIDAD: Record<ReceptionObservation['severity'], StatusTone> = {
  menor: 'neutral',
  mayor: 'warning',
  critica: 'danger',
};

function hoyISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function RecepcionPage() {
  const {
    receptions, receptionObservations, contracts, subcontracts,
    subcontractCertificates, currentProjectId, can, notify,
    addReception, updateReception, deleteReception,
    addReceptionObservation, updateReceptionObservation, deleteReceptionObservation,
  } = useAppState();

  const [creando, setCreando] = useState(false);
  const [nueva, setNueva] = useState({
    tipo: 'provisoria' as Reception['type'],
    objetivo: 'obra',
    receptionDate: hoyISO(),
    receivedBy: '',
    warrantyDays: 365,
  });
  const [ocupado, setOcupado] = useState(false);

  const contrato = useMemo(
    () => contracts.find((c) => c.projectId === currentProjectId) ?? null,
    [contracts, currentProjectId],
  );

  const subsDeLaObra = useMemo(
    () => subcontracts.filter((s) => s.projectId === currentProjectId),
    [subcontracts, currentProjectId],
  );

  const deLaObra = useMemo(
    () => receptions
      .filter((r) => r.projectId === currentProjectId)
      .sort((a, b) => {
        const ta = new Date(a.createdAt as unknown as string).getTime();
        const tb = new Date(b.createdAt as unknown as string).getTime();
        return tb - ta;
      }),
    [receptions, currentProjectId],
  );

  const editable = can('receptions:manage');

  const crear = async () => {
    const esSub = nueva.objetivo !== 'obra';
    if (!esSub && !contrato) {
      notify('Esta obra no tiene contrato cargado: la recepción cuelga del contrato.', 'destructive');
      return;
    }

    // La definitiva solo tiene sentido si ya hubo provisoria y no quedan
    // observaciones abiertas del mismo destinatario.
    if (nueva.tipo === 'definitiva') {
      const previas = deLaObra.filter((r) => (esSub
        ? r.subcontractId === nueva.objetivo
        : !!r.contractId));
      const obsPrevias = previas.flatMap((r) => observacionesDe(receptionObservations, r.id));
      const check = puedeRecepcionDefinitiva(previas, obsPrevias);
      if (!check.puede) {
        notify(check.motivo ?? 'No se puede recibir definitivamente todavía.', 'destructive');
        return;
      }
    }

    setOcupado(true);
    try {
      await addReception({
        projectId: currentProjectId,
        contractId: esSub ? null : contrato!.id,
        subcontractId: esSub ? nueva.objetivo : null,
        type: nueva.tipo,
        receptionDate: (nueva.receptionDate || null) as never,
        receivedBy: nueva.receivedBy.trim() || null,
        warrantyDays: nueva.tipo === 'provisoria' ? nueva.warrantyDays : null,
        status: 'borrador',
      });
      notify('Recepción creada. Levanta las observaciones que correspondan.', 'success');
      setCreando(false);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo crear la recepción.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  if (!currentProjectId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Recepción de obra" />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Selecciona una obra para ver sus recepciones.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recepción de obra"
        description="Provisoria y definitiva, con su lista de observaciones y la devolución de la retención."
        actions={editable && (
          <Button onClick={() => setCreando((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" /> Nueva recepción
          </Button>
        )}
      />

      {creando && editable && (
        <Card>
          <CardHeader><CardTitle className="text-base">Nueva recepción</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Tipo</Label>
                <Select
                  value={nueva.tipo}
                  onValueChange={(v) => setNueva((n) => ({ ...n, tipo: v as Reception['type'] }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPOS_RECEPCION).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">De qué</Label>
                <Select
                  value={nueva.objetivo}
                  onValueChange={(v) => setNueva((n) => ({ ...n, objetivo: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="obra">La obra (contrato con el mandante)</SelectItem>
                    {subsDeLaObra.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Fecha</Label>
                <Input
                  type="date" value={nueva.receptionDate}
                  onChange={(e) => setNueva((n) => ({ ...n, receptionDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Recibe</Label>
                <Input
                  value={nueva.receivedBy}
                  placeholder="ITO, mandante…"
                  onChange={(e) => setNueva((n) => ({ ...n, receivedBy: e.target.value }))}
                />
              </div>
              {nueva.tipo === 'provisoria' && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Garantía (días)</Label>
                  <Input
                    type="number" value={nueva.warrantyDays}
                    onChange={(e) => setNueva((n) => ({ ...n, warrantyDays: Number(e.target.value) }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    El plazo de garantía empieza a correr con la recepción provisoria.
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={crear} disabled={ocupado}>Crear recepción</Button>
              <Button variant="ghost" onClick={() => setCreando(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {deLaObra.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ClipboardCheck className="h-4 w-4" />
              Todavía no hay recepciones
            </div>
            <p className="text-sm text-muted-foreground">
              La recepción es lo que cierra la obra: fija la lista de lo que falta, arranca el plazo
              de garantía y libera la retención.
            </p>
          </CardContent>
        </Card>
      ) : (
        deLaObra.map((r) => (
          <RecepcionCard
            key={r.id}
            reception={r}
            observations={observacionesDe(receptionObservations, r.id)}
            subcontractName={r.subcontractId
              ? subcontracts.find((s) => s.id === r.subcontractId)?.name ?? 'Subcontrato'
              : null}
            saldoRetencionSub={r.subcontractId
              ? saldoRetencion(
                subcontractCertificates.filter((c) => c.subcontractId === r.subcontractId),
                receptions.filter((x) => x.subcontractId === r.subcontractId && x.id !== r.id),
              ).saldo
              : null}
            editable={editable}
            notify={notify}
            onUpdate={updateReception}
            onDelete={deleteReception}
            onAddObs={addReceptionObservation}
            onUpdateObs={updateReceptionObservation}
            onDeleteObs={deleteReceptionObservation}
          />
        ))
      )}
    </div>
  );
}

function RecepcionCard({
  reception, observations, subcontractName, saldoRetencionSub, editable, notify,
  onUpdate, onDelete, onAddObs, onUpdateObs, onDeleteObs,
}: {
  reception: Reception;
  observations: ReceptionObservation[];
  subcontractName: string | null;
  saldoRetencionSub: number | null;
  editable: boolean;
  notify: (m: string, v?: 'default' | 'destructive' | 'success') => void;
  onUpdate: (id: string, data: Partial<Reception>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddObs: (data: Partial<ReceptionObservation>) => Promise<void>;
  onUpdateObs: (id: string, data: Partial<ReceptionObservation>) => Promise<void>;
  onDeleteObs: (id: string, photoPath?: string | null) => Promise<void>;
}) {
  const [nueva, setNueva] = useState({
    description: '', location: '', responsibleName: '',
    dueDate: '', severity: 'menor' as ReceptionObservation['severity'],
  });
  const [foto, setFoto] = useState<ArchivoAdjunto | null>(null);
  const [devolucion, setDevolucion] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const estado = estadoRecepcion(reception, observations);
  const resumen = resumenRecepcion(observations);
  const pendientes = observacionesPendientes(observations);
  const finGarantia = finDeGarantia(reception);
  const diasGarantia = diasDeGarantia(reception);

  const agregar = async () => {
    if (!nueva.description.trim()) {
      notify('Describe la observación.', 'destructive');
      return;
    }
    setOcupado(true);
    try {
      await onAddObs({
        receptionId: reception.id,
        description: nueva.description.trim(),
        location: nueva.location.trim() || null,
        responsibleName: nueva.responsibleName.trim() || null,
        dueDate: (nueva.dueDate || null) as never,
        severity: nueva.severity,
        photoPath: foto?.path ?? null,
        photoName: foto?.name ?? null,
      });
      setNueva({ description: '', location: '', responsibleName: '', dueDate: '', severity: 'menor' });
      setFoto(null);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo agregar la observación.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const aceptar = async () => {
    if (pendientes.length > 0) {
      notify(
        `Quedan ${pendientes.length} observación(es) pendientes. Acéptala solo si las das por resueltas.`,
        'destructive',
      );
      return;
    }
    setOcupado(true);
    try {
      await onUpdate(reception.id, {
        status: 'aceptada',
        ...(devolucion !== null ? { retentionReleased: devolucion } : {}),
      });
      notify('Recepción aceptada.', 'success');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo aceptar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const abrirFoto = async (path: string) => {
    try {
      await openObraFile(path);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo abrir la foto.', 'destructive');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
          <span>
            {TIPOS_RECEPCION[reception.type]}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {subcontractName ? `${subcontractName} · ` : 'Obra · '}
              {reception.receptionDate ? formatDate(reception.receptionDate) : 'sin fecha'}
              {reception.receivedBy ? ` · recibe ${reception.receivedBy}` : ''}
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={TONO_RECEPCION[estado]}>{ETIQUETA_RECEPCION[estado]}</StatusBadge>
            {resumen.criticas > 0 && (
              <StatusBadge tone="danger">{resumen.criticas} grave(s)</StatusBadge>
            )}
            {resumen.vencidas > 0 && (
              <StatusBadge tone="warning">{resumen.vencidas} vencida(s)</StatusBadge>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-muted-foreground">
            {resumen.observaciones === 0
              ? 'Sin observaciones registradas'
              : `${resumen.pendientes} pendiente(s) de ${resumen.observaciones}`}
            {resumen.avanceSubsanacion !== null
              ? ` · ${resumen.avanceSubsanacion.toFixed(0)}% subsanado`
              : ''}
          </span>
          {finGarantia && (
            <span className={diasGarantia !== null && diasGarantia < 0 ? 'text-muted-foreground' : 'text-foreground'}>
              Garantía hasta {formatDate(finGarantia)}
              {diasGarantia !== null && (diasGarantia >= 0
                ? ` (${diasGarantia} días)`
                : ' (vencida)')}
            </span>
          )}
          {reception.retentionReleased > 0 && (
            <span className="font-medium text-success">
              Retención devuelta: {formatCLP(reception.retentionReleased)}
            </span>
          )}
        </div>

        {/* Observaciones */}
        {observations.length > 0 && (
          <ul className="space-y-2">
            {observations.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-muted/40 p-3 text-sm"
              >
                <span className="min-w-0 flex-1 text-foreground">{o.description}</span>
                {o.location && <span className="text-xs text-muted-foreground">{o.location}</span>}
                {o.responsibleName && (
                  <span className="text-xs text-muted-foreground">{o.responsibleName}</span>
                )}
                {o.dueDate && (
                  <span className="text-xs text-muted-foreground">{formatDate(o.dueDate)}</span>
                )}
                <StatusBadge tone={TONO_SEVERIDAD[o.severity]}>{SEVERIDADES[o.severity]}</StatusBadge>
                <StatusBadge tone={o.status === 'pendiente' ? 'warning' : 'success'}>
                  {ESTADOS_OBSERVACION[o.status]}
                </StatusBadge>
                {o.photoPath && (
                  <Button variant="ghost" size="sm" onClick={() => abrirFoto(o.photoPath as string)}>
                    <Camera className="h-3.5 w-3.5" />
                  </Button>
                )}
                {editable && o.status === 'pendiente' && (
                  <Button
                    variant="ghost" size="sm" disabled={ocupado}
                    onClick={() => onUpdateObs(o.id, { status: 'subsanada' })}
                  >
                    <Check className="mr-1.5 h-3.5 w-3.5" /> Subsanada
                  </Button>
                )}
                {editable && (
                  <Button
                    variant="ghost" size="sm" disabled={ocupado}
                    onClick={() => onDeleteObs(o.id, o.photoPath)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1 lg:col-span-2">
                <Label className="text-xs text-muted-foreground">Observación</Label>
                <Input
                  className="h-8"
                  value={nueva.description}
                  placeholder="Qué está mal o falta"
                  onChange={(e) => setNueva((n) => ({ ...n, description: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Ubicación</Label>
                <Input
                  className="h-8"
                  value={nueva.location}
                  placeholder="Piso 3, depto 302"
                  onChange={(e) => setNueva((n) => ({ ...n, location: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Responsable</Label>
                <Input
                  className="h-8"
                  value={nueva.responsibleName}
                  onChange={(e) => setNueva((n) => ({ ...n, responsibleName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Plazo</Label>
                <Input
                  className="h-8" type="date"
                  value={nueva.dueDate}
                  onChange={(e) => setNueva((n) => ({ ...n, dueDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Gravedad</Label>
                <Select
                  value={nueva.severity}
                  onValueChange={(v) => setNueva((n) => ({
                    ...n, severity: v as ReceptionObservation['severity'],
                  }))}
                >
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SEVERIDADES).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <FileField
              label="Foto (opcional)"
              carpeta="recepcion"
              value={foto}
              onChange={setFoto}
              hint="Una foto evita discutir después si la observación estaba o no."
            />

            <Button size="sm" disabled={ocupado} onClick={agregar}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Agregar observación
            </Button>
          </div>
        )}

        {/* Cierre y devolución de retención */}
        {editable && reception.status !== 'aceptada' && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/40 p-3">
            {saldoRetencionSub !== null && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Retención a devolver ($)
                </Label>
                <Input
                  className="h-8 w-40"
                  type="number"
                  value={devolucion ?? ''}
                  placeholder={String(Math.round(saldoRetencionSub))}
                  onChange={(e) => setDevolucion(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Saldo retenido: {formatCLP(saldoRetencionSub)}
                </p>
              </div>
            )}
            <Button size="sm" disabled={ocupado} onClick={aceptar}>
              <Check className="mr-1.5 h-3.5 w-3.5" /> Aceptar recepción
            </Button>
            {pendientes.length > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-warning">
                <AlertTriangle className="h-3.5 w-3.5" />
                Quedan observaciones pendientes
              </span>
            )}
            <Button
              size="sm" variant="ghost" disabled={ocupado}
              onClick={() => onDelete(reception.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {reception.notes && (
          <Textarea readOnly rows={2} value={reception.notes} className="text-sm" />
        )}
      </CardContent>
    </Card>
  );
}
