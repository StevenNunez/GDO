"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Check, Trash2, AlertTriangle } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/lib/date-utils';
import {
  restriccionesDe, diasParaLevantar, TIPOS_RESTRICCION,
} from '@/lib/last-planner';
import type { TaskConstraintType } from '@/modules/core/lib/data';

function isoMasDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Restricciones de una tarea: lo que impide ejecutarla. Lo comparten la vista
 * semanal y el lookahead, que es donde se hace el trabajo de verdad —
 * detectarlas con semanas de anticipación y levantarlas antes de que la tarea
 * llegue a su semana.
 */
export function RestriccionesTarea({ taskId, editable }: {
  taskId: string;
  editable: boolean;
}) {
  const { taskConstraints, rdis, notify, addTaskConstraint, updateTaskConstraint, deleteTaskConstraint } = useAppState();

  const [abierto, setAbierto] = useState(false);
  const [nueva, setNueva] = useState({
    description: '',
    type: 'materiales' as TaskConstraintType,
    responsibleName: '',
    dueDate: isoMasDias(7),
    rdiId: 'ninguna',
  });
  const [ocupado, setOcupado] = useState(false);

  const propias = useMemo(
    () => restriccionesDe(taskConstraints, taskId),
    [taskConstraints, taskId],
  );
  const pendientes = propias.filter((c) => c.status === 'pendiente');

  const rdisAbiertas = useMemo(
    () => rdis.filter((r) => r.status === 'abierta'),
    [rdis],
  );

  const agregar = async () => {
    if (!nueva.description.trim()) {
      notify('Describe la restricción.', 'destructive');
      return;
    }
    setOcupado(true);
    try {
      await addTaskConstraint({
        taskId,
        description: nueva.description.trim(),
        type: nueva.type,
        responsibleName: nueva.responsibleName.trim() || null,
        dueDate: (nueva.dueDate || null) as never,
        rdiId: nueva.rdiId === 'ninguna' ? null : nueva.rdiId,
      });
      notify('Restricción registrada.', 'success');
      setNueva({
        description: '', type: 'materiales', responsibleName: '',
        dueDate: isoMasDias(7), rdiId: 'ninguna',
      });
    } catch (e: any) {
      notify(e.message ?? 'No se pudo registrar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const liberar = async (id: string) => {
    setOcupado(true);
    try {
      await updateTaskConstraint(id, { status: 'liberada' });
      notify('Restricción levantada.', 'success');
    } catch (e: any) {
      notify(e.message ?? 'No se pudo actualizar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async (id: string) => {
    setOcupado(true);
    try {
      await deleteTaskConstraint(id);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo eliminar.', 'destructive');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {pendientes.length > 0 ? (
          <StatusBadge tone="warning">
            {pendientes.length} restricción{pendientes.length === 1 ? '' : 'es'} pendiente{pendientes.length === 1 ? '' : 's'}
          </StatusBadge>
        ) : (
          <StatusBadge tone="success">Liberada</StatusBadge>
        )}
        <span>{abierto ? 'Ocultar' : 'Ver restricciones'}</span>
      </button>

      {abierto && (
        <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
          {propias.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Sin restricciones registradas. Si la tarea no se puede ejecutar por algo, anótalo acá
              con responsable y fecha: una restricción sin dueño no se levanta nunca.
            </p>
          ) : (
            <ul className="space-y-2">
              {propias.map((c) => {
                const dias = diasParaLevantar(c);
                const vencida = c.status === 'pendiente' && dias !== null && dias < 0;
                const rdi = c.rdiId ? rdis.find((r) => r.id === c.rdiId) : null;
                return (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card p-2.5 text-sm"
                  >
                    {vencida && <AlertTriangle className="h-3.5 w-3.5 text-danger" />}
                    <span className="min-w-0 flex-1 text-foreground">{c.description}</span>
                    <span className="text-xs text-muted-foreground">
                      {TIPOS_RESTRICCION[c.type]}
                    </span>
                    {c.responsibleName && (
                      <span className="text-xs text-muted-foreground">{c.responsibleName}</span>
                    )}
                    {c.dueDate && (
                      <span className={`text-xs ${vencida ? 'text-danger' : 'text-muted-foreground'}`}>
                        {formatDate(c.dueDate)}
                      </span>
                    )}
                    {rdi && (
                      <Link
                        href={`/dashboard/oficina-tecnica/rdi/${rdi.id}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        RDI N° {rdi.number}
                      </Link>
                    )}
                    <StatusBadge tone={c.status === 'liberada' ? 'success' : vencida ? 'danger' : 'warning'}>
                      {c.status === 'liberada' ? 'Liberada' : c.status === 'anulada' ? 'Anulada' : 'Pendiente'}
                    </StatusBadge>
                    {editable && c.status === 'pendiente' && (
                      <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => liberar(c.id)}>
                        <Check className="mr-1.5 h-3.5 w-3.5" /> Levantar
                      </Button>
                    )}
                    {editable && (
                      <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => borrar(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {editable && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1 lg:col-span-2">
                <Label className="text-xs text-muted-foreground">Qué falta</Label>
                <Input
                  className="h-8"
                  value={nueva.description}
                  placeholder="Ej: falta detalle de anclaje"
                  onChange={(e) => setNueva((n) => ({ ...n, description: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Tipo</Label>
                <Select
                  value={nueva.type}
                  onValueChange={(v) => setNueva((n) => ({ ...n, type: v as TaskConstraintType }))}
                >
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPOS_RESTRICCION).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Label className="text-xs text-muted-foreground">Comprometida para</Label>
                <Input
                  className="h-8"
                  type="date"
                  value={nueva.dueDate}
                  onChange={(e) => setNueva((n) => ({ ...n, dueDate: e.target.value }))}
                />
              </div>

              {nueva.type === 'informacion' && rdisAbiertas.length > 0 && (
                <div className="space-y-1 lg:col-span-2">
                  <Label className="text-xs text-muted-foreground">RDI relacionada</Label>
                  <Select
                    value={nueva.rdiId}
                    onValueChange={(v) => setNueva((n) => ({ ...n, rdiId: v }))}
                  >
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ninguna">Ninguna</SelectItem>
                      {rdisAbiertas.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          RDI N° {r.number} · {r.subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-end">
                <Button size="sm" disabled={ocupado} onClick={agregar}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Agregar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
