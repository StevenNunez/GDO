"use client";

/**
 * Flujos de aprobación — donde la empresa define SU cadena de visto bueno.
 *
 * Una tarjeta por tipo de documento. Cada una arma la cadena de pasos: quién
 * aprueba (por rol o por persona) y si ese paso pide firma. Es la plantilla;
 * lo que ya está en trámite corre con la fotografía que se le tomó al
 * presentarlo, así que cambiar esto no reescribe la historia.
 */

import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowUp, GitBranch, PenLine, Plus, Trash2,
} from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { PlanLocked } from '@/components/plan-locked';
import { DelegacionFirmaCard } from '@/components/oficina-tecnica/delegacion-firma-card';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/modules/core/hooks/use-toast';
import { ROLES } from '@/modules/core/lib/permissions';
import { TIPO_DOCUMENTO_LABEL, TIPOS_DOCUMENTO, validarFlujo } from '@/lib/approval';
import type {
  ApprovalDocumentType, ApprovalFlow, ApprovalFlowStep,
} from '@/modules/core/lib/data';

/** Para qué sirve la cadena en cada documento, en cristiano. */
const PARA_QUE: Record<ApprovalDocumentType, string> = {
  subcontract:
    'Antes de generar y firmar el contrato con el subcontratista. Acá es donde se revisa el cuadro comparativo y las cotizaciones.',
  subcontract_certificate:
    'Antes de emitir la orden de pago al subcontratista. Es el control de lo que sale de la caja.',
  payment_certificate:
    'Antes de presentarle el estado de pago al mandante. Un error acá se cobra caro y tarde.',
  amendment:
    'Antes de presentar un adicional o un aumento de plazo: cambia el monto y la fecha del contrato.',
};

export default function FlujosAprobacionPage() {
  const { approvalFlows, can, lockedFeature } = useAppState();

  // Delegar la propia firma NO se cierra: ni por plan ni por permiso. Si el
  // aprobador se va de vacaciones, tiene que poder dejar a alguien firmando
  // aunque no le corresponda tocar los flujos de la empresa.
  if (lockedFeature('approvals:configure')) {
    return (
      <div className="space-y-6">
        <DelegacionFirmaCard />
        <PlanLocked feature="approval_flows" />
      </div>
    );
  }
  if (!can('approvals:configure')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Aprobaciones" />
        <DelegacionFirmaCard />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Configurar los flujos de aprobación de la empresa requiere el permiso
          «Configurar Flujos de Aprobación».
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Flujos de aprobación"
        description="La cadena de visto bueno que usa tu empresa. Cada paso deja firma, y quien rechaza tiene que decir por qué."
      />

      <Card className="border-info/40">
        <CardContent className="flex items-start gap-3 p-5 text-sm">
          <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <p className="text-muted-foreground">
            Un documento sin flujo configurado se aprueba directo, como hasta ahora.
            Los que ya están en trámite siguen con la cadena que tenían al presentarse:
            cambiar esto no reescribe lo ya firmado.
          </p>
        </CardContent>
      </Card>

      <DelegacionFirmaCard />

      {TIPOS_DOCUMENTO.map((tipo) => (
        <FlujoDeDocumento
          key={tipo}
          documentType={tipo}
          flujo={approvalFlows.find((f) => f.documentType === tipo) ?? null}
        />
      ))}
    </div>
  );
}

/* ── Una tarjeta por tipo de documento ─────────────────────────────────── */

function FlujoDeDocumento({
  documentType, flujo,
}: {
  documentType: ApprovalDocumentType;
  flujo: ApprovalFlow | null;
}) {
  const {
    approvalFlowSteps, addApprovalFlow, updateApprovalFlow,
    deleteApprovalFlowStep, reorderApprovalFlowSteps,
  } = useAppState();
  const { toast } = useToast();
  const [editando, setEditando] = useState<ApprovalFlowStep | null | 'nuevo'>(null);

  const pasos = useMemo(
    () => (flujo ? approvalFlowSteps.filter((s) => s.flowId === flujo.id) : [])
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [approvalFlowSteps, flujo],
  );

  const problemas = useMemo(
    () => (flujo && pasos.length > 0 ? validarFlujo(pasos) : []),
    [flujo, pasos],
  );

  async function crear() {
    try {
      await addApprovalFlow({
        documentType,
        name: TIPO_DOCUMENTO_LABEL[documentType],
        active: false, // nace apagado: sin pasos no aprobaría nada
      });
      toast({ title: 'Flujo creado', description: 'Ahora agrégale los pasos y actívalo.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo crear', description: e.message });
    }
  }

  async function activar(valor: boolean) {
    if (!flujo) return;
    if (valor && pasos.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Falta armar la cadena',
        description: 'Un flujo activo sin pasos dejaría los documentos trabados.',
      });
      return;
    }
    try {
      await updateApprovalFlow(flujo.id, { active: valor });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo cambiar', description: e.message });
    }
  }

  async function mover(index: number, delta: number) {
    const destino = index + delta;
    if (destino < 0 || destino >= pasos.length) return;
    const ids = pasos.map((p) => p.id);
    [ids[index], ids[destino]] = [ids[destino], ids[index]];
    try {
      await reorderApprovalFlowSteps(ids);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo reordenar', description: e.message });
    }
  }

  async function borrar(id: string) {
    try {
      await deleteApprovalFlowStep(id);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo borrar', description: e.message });
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">
                {TIPO_DOCUMENTO_LABEL[documentType]}
              </span>
              {flujo && (
                <StatusBadge tone={flujo.active ? 'success' : 'neutral'}>
                  {flujo.active ? 'Activo' : 'Apagado'}
                </StatusBadge>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {PARA_QUE[documentType]}
            </p>
          </div>

          {flujo ? (
            <div className="flex items-center gap-2">
              <Label htmlFor={`activo-${documentType}`} className="text-sm text-muted-foreground">
                Aplicar
              </Label>
              <Switch
                id={`activo-${documentType}`}
                checked={flujo.active}
                onCheckedChange={activar}
              />
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={crear}>
              <Plus className="mr-2 h-4 w-4" /> Configurar
            </Button>
          )}
        </div>

        {flujo && (
          <>
            {problemas.length > 0 && (
              <div className="space-y-1 rounded-md border border-warning/40 bg-warning-subtle p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <AlertTriangle className="h-4 w-4 text-warning" /> Revisa la cadena
                </div>
                <ul className="ml-6 list-disc text-muted-foreground">
                  {problemas.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            )}

            {pasos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no tiene pasos. Agrega el primero: quién revisa antes que nadie.
              </p>
            ) : (
              <ol className="divide-y divide-border rounded-md border border-border">
                {pasos.map((p, i) => (
                  <PasoFila
                    key={p.id}
                    paso={p}
                    numero={i + 1}
                    primero={i === 0}
                    ultimo={i === pasos.length - 1}
                    onSubir={() => mover(i, -1)}
                    onBajar={() => mover(i, 1)}
                    onEditar={() => setEditando(p)}
                    onBorrar={() => borrar(p.id)}
                  />
                ))}
              </ol>
            )}

            <Button variant="outline" size="sm" onClick={() => setEditando('nuevo')}>
              <Plus className="mr-2 h-4 w-4" /> Agregar paso
            </Button>
          </>
        )}
      </CardContent>

      {flujo && editando !== null && (
        <DialogoPaso
          flowId={flujo.id}
          paso={editando === 'nuevo' ? null : editando}
          siguienteOrden={pasos.length}
          onCerrar={() => setEditando(null)}
        />
      )}
    </Card>
  );
}

/* ── Fila de un paso ───────────────────────────────────────────────────── */

function PasoFila({
  paso, numero, primero, ultimo, onSubir, onBajar, onEditar, onBorrar,
}: {
  paso: ApprovalFlowStep;
  numero: number;
  primero: boolean;
  ultimo: boolean;
  onSubir: () => void;
  onBajar: () => void;
  onEditar: () => void;
  onBorrar: () => void;
}) {
  const { users } = useAppState();
  const persona = paso.approverUserId
    ? users.find((u) => u.id === paso.approverUserId)?.name
    : null;

  return (
    <li className="flex flex-wrap items-center gap-3 p-3 text-sm">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
        {numero}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground">{paso.name}</div>
        <div className="text-xs text-muted-foreground">
          {persona
            ? `Firma ${persona}`
            : `Aprueba el rol: ${ROLES[paso.approverRole as keyof typeof ROLES]?.label ?? paso.approverRole}`}
          {paso.requiresSignature ? ' · con firma' : ' · sin firma'}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onSubir} disabled={primero} aria-label="Subir">
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onBajar} disabled={ultimo} aria-label="Bajar">
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onEditar} aria-label="Editar">
          <PenLine className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onBorrar} aria-label="Borrar">
          <Trash2 className="h-4 w-4 text-danger" />
        </Button>
      </div>
    </li>
  );
}

/* ── Alta / edición de un paso ─────────────────────────────────────────── */

const SIN_PERSONA = '__rol__';

function DialogoPaso({
  flowId, paso, siguienteOrden, onCerrar,
}: {
  flowId: string;
  paso: ApprovalFlowStep | null;
  siguienteOrden: number;
  onCerrar: () => void;
}) {
  const { users, addApprovalFlowStep, updateApprovalFlowStep } = useAppState();
  const { toast } = useToast();

  const [name, setName] = useState(paso?.name ?? '');
  const [approverRole, setApproverRole] = useState(paso?.approverRole ?? 'operations');
  const [approverUserId, setApproverUserId] = useState(paso?.approverUserId ?? SIN_PERSONA);
  const [requiresSignature, setRequiresSignature] = useState(paso?.requiresSignature ?? true);
  const [guardando, setGuardando] = useState(false);

  // El super-admin no es de la empresa: no puede ser el aprobador de nadie.
  const rolesElegibles = Object.entries(ROLES).filter(([id]) => id !== 'super-admin');

  async function guardar() {
    if (!name.trim()) {
      toast({ variant: 'destructive', title: 'Falta el nombre del paso' });
      return;
    }
    const nominativo = approverUserId !== SIN_PERSONA;
    setGuardando(true);
    try {
      const datos = {
        flowId,
        name: name.trim(),
        approverRole: nominativo ? null : approverRole,
        approverUserId: nominativo ? approverUserId : null,
        requiresSignature,
      };
      if (paso) await updateApprovalFlowStep(paso.id, datos);
      else await addApprovalFlowStep({ ...datos, sortOrder: siguienteOrden });
      onCerrar();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{paso ? 'Editar paso' : 'Nuevo paso'}</DialogTitle>
          <DialogDescription>
            Quién tiene que dar el visto bueno en esta parte de la cadena.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="paso-nombre">Nombre del paso</Label>
            <Input
              id="paso-nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Visto bueno de Oficina Técnica"
            />
          </div>

          <div className="space-y-2">
            <Label>Aprueba</Label>
            <Select value={approverUserId} onValueChange={setApproverUserId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_PERSONA}>Cualquiera con un rol (abajo)</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}{u.cargo ? ` · ${u.cargo}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Por rol es lo normal: si esa persona se va o está de vacaciones, el
              documento no queda esperando a alguien que no está.
            </p>
          </div>

          {approverUserId === SIN_PERSONA && (
            <div className="space-y-2">
              <Label>Rol que aprueba</Label>
              <Select value={approverRole ?? ''} onValueChange={setApproverRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {rolesElegibles.map(([id, r]) => (
                    <SelectItem key={id} value={id}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label htmlFor="paso-firma">Pedir firma</Label>
              <p className="text-xs text-muted-foreground">
                Si lo apagas, basta con el clic de aprobación.
              </p>
            </div>
            <Switch
              id="paso-firma"
              checked={requiresSignature}
              onCheckedChange={setRequiresSignature}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
