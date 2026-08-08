"use client";

/**
 * «Estoy de vacaciones, que firme Juan por mí» (migración 030).
 *
 * Delegar es un acto PERSONAL: no lleva permiso de configuración, cada quien
 * decide quién firma por él. Por eso esta tarjeta se muestra a cualquiera que
 * llegue a la pantalla, aunque no pueda tocar los flujos de la empresa.
 *
 * Lo que NO se puede hacer desde acá, a propósito:
 *  - delegar en nombre de otro (el titular es siempre uno mismo);
 *  - delegar sin fecha de término (sería cambiar quién aprueba, de por vida);
 *  - encadenar delegaciones (el delegado de tu delegado no firma por ti).
 */

import { useMemo, useState } from 'react';
import { CalendarClock, Plus, Trash2, UserCheck } from 'lucide-react';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/modules/core/hooks/use-toast';
import { formatDate } from '@/lib/date-utils';
import {
  TIPO_DOCUMENTO_LABEL, TIPOS_DOCUMENTO, delegacionVigente, validarDelegacion,
} from '@/lib/approval';
import type { ApprovalDocumentType } from '@/modules/core/lib/data';

const TODOS = '__todos__';

export function DelegacionFirmaCard() {
  const {
    approvalDelegations, users,
    addApprovalDelegation, updateApprovalDelegation, deleteApprovalDelegation,
  } = useAppState();
  const { user } = useAuth();
  const { toast } = useToast();

  const [abierto, setAbierto] = useState(false);
  const [toUserId, setToUserId] = useState('');
  const [documentType, setDocumentType] = useState<string>(TODOS);
  const [startDate, setStartDate] = useState(hoyISO());
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [guardando, setGuardando] = useState(false);

  /** Las que YO otorgué. */
  const mias = useMemo(
    () => approvalDelegations
      .filter((d) => d.fromUserId === user?.id)
      .sort((a, b) => Number(b.active) - Number(a.active)),
    [approvalDelegations, user?.id],
  );

  /** Las que me dieron a MÍ, para saber por quién estoy firmando. */
  const recibidas = useMemo(
    () => approvalDelegations.filter(
      (d) => d.toUserId === user?.id
        && TIPOS_DOCUMENTO.some((t) => delegacionVigente(d, t)),
    ),
    [approvalDelegations, user?.id],
  );

  const nombreDe = (id: string) => users.find((u) => u.id === id)?.name ?? 'Alguien';

  async function guardar() {
    const errores = validarDelegacion({
      fromUserId: user?.id ?? '',
      toUserId,
      startDate: startDate as unknown as Date,
      endDate: endDate as unknown as Date,
    });
    if (errores.length > 0) {
      toast({ variant: 'destructive', title: 'Revisa la delegación', description: errores[0] });
      return;
    }

    setGuardando(true);
    try {
      await addApprovalDelegation({
        toUserId,
        documentType: documentType === TODOS
          ? null
          : (documentType as ApprovalDocumentType),
        startDate: startDate as unknown as Date,
        endDate: endDate as unknown as Date,
        reason: reason.trim() || null,
      });
      setAbierto(false);
      setToUserId(''); setEndDate(''); setReason(''); setDocumentType(TODOS);
      toast({ title: 'Delegación creada', description: 'Tus documentos pendientes ya aparecen en su bandeja.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo delegar', description: e.message });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <UserCheck className="h-4 w-4" />
              Mi delegación de firma
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Si te vas de vacaciones o de licencia, deja a alguien firmando por ti. Queda
              registrado como «lo firmó Juan, por cuenta tuya»: la firma no cambia de dueño.
            </p>
          </div>
          {!abierto && (
            <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
              <Plus className="mr-2 h-4 w-4" /> Delegar mi firma
            </Button>
          )}
        </div>

        {recibidas.length > 0 && (
          <div className="rounded-md border border-info/40 bg-info-subtle p-3 text-sm">
            <span className="font-medium text-foreground">Estás firmando por: </span>
            <span className="text-muted-foreground">
              {recibidas.map((d) => nombreDe(d.fromUserId)).join(', ')}
            </span>
          </div>
        )}

        {abierto && (
          <div className="space-y-4 rounded-md border border-border p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>¿Quién firma por ti?</Label>
                <Select value={toUserId} onValueChange={setToUserId}>
                  <SelectTrigger><SelectValue placeholder="Elige a la persona" /></SelectTrigger>
                  <SelectContent>
                    {users.filter((u) => u.id !== user?.id).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}{u.cargo ? ` · ${u.cargo}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>¿Para qué documentos?</Label>
                <Select value={documentType} onValueChange={setDocumentType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Todos</SelectItem>
                    {TIPOS_DOCUMENTO.map((t) => (
                      <SelectItem key={t} value={t}>{TIPO_DOCUMENTO_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="del-desde">Desde</Label>
                <Input id="del-desde" type="date" value={startDate}
                  onChange={(e) => setStartDate(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="del-hasta">Hasta</Label>
                <Input id="del-hasta" type="date" value={endDate}
                  onChange={(e) => setEndDate(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Obligatorio: una delegación sin fin cambia para siempre quién aprueba.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="del-motivo">Motivo (opcional)</Label>
              <Input id="del-motivo" value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej: vacaciones del 1 al 15" />
            </div>

            <div className="flex gap-2">
              <Button onClick={guardar} disabled={guardando}>Delegar</Button>
              <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
            </div>
          </div>
        )}

        {mias.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tienes delegaciones. Tus documentos los firmas tú.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {mias.map((d) => {
              const vigente = TIPOS_DOCUMENTO.some((t) => delegacionVigente(d, t));
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">
                      {nombreDe(d.toUserId)}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarClock className="h-3 w-3" />
                      {formatDate(d.startDate)} — {formatDate(d.endDate)}
                      {' · '}
                      {d.documentType ? TIPO_DOCUMENTO_LABEL[d.documentType] : 'Todos los documentos'}
                      {d.reason ? ` · ${d.reason}` : ''}
                    </div>
                  </div>
                  <StatusBadge tone={vigente ? 'success' : 'neutral'}>
                    {vigente ? 'Vigente' : (d.active ? 'Fuera de fecha' : 'Cortada')}
                  </StatusBadge>
                  {d.active && vigente && (
                    <Button
                      variant="outline" size="sm"
                      onClick={() => updateApprovalDelegation(d.id, { active: false })}
                    >
                      Cortar ahora
                    </Button>
                  )}
                  <Button
                    variant="ghost" size="icon" aria-label="Borrar"
                    onClick={() => deleteApprovalDelegation(d.id)}
                  >
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Hoy en `YYYY-MM-DD` local, que es lo que espera un `<input type="date">`. */
function hoyISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
