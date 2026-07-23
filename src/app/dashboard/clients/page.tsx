'use client';

import React from 'react';
import Link from 'next/link';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { PageHeader } from '@/components/page-header';
import { formatCLP } from '@/lib/format';
import { PanelCard } from '@/components/ui/panel-card';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusBadge } from '@/components/ui/status-badge';
import { SurfaceCard } from '@/components/ui/surface-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/modules/core/hooks/use-toast';
import {
  Users, Plus, Edit, Trash2, Building2, Wallet, TrendingUp, AlertTriangle, HardHat,
} from 'lucide-react';
import type { Client } from '@/modules/core/lib/data';
import { computeClientCosts, type ClientCosts } from '@/lib/budget-costs';

const EMPTY_FORM = { name: '', rut: '', contactName: '', email: '', phone: '', address: '', notes: '' };

export default function ClientsPage() {
  const {
    clients, projects, budgets, workItems, purchaseOrders, supplierPayments,
    addClient, updateClient, deleteClient, can,
  } = useAppState();

  // Gasto que no está imputado a ninguna obra y por lo tanto NO aparece en
  // ningún cliente. Sin avisarlo, los totales de abajo parecen completos.
  const unattributed = React.useMemo(() => {
    const payments = supplierPayments.filter(p => !p.projectId);
    const orders = purchaseOrders.filter(o => !o.projectId && o.status !== 'cancelled');
    return {
      count: payments.length + orders.length,
      amount:
        payments.reduce((s, p) => s + (p.amount ?? 0), 0) +
        orders.reduce((s, o) => s + (o.totalAmount ?? 0), 0),
      payments: payments.length,
      orders: orders.length,
    };
  }, [supplierPayments, purchaseOrders]);

  const unassignedBudgets = React.useMemo(
    () => budgets.filter(b => !b.projectId).length,
    [budgets]
  );
  const { toast } = useToast();

  const canManage = can('clients:manage');
  const canViewCosts = can('clients:view_costs');

  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Client | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const costs = React.useMemo(
    () => computeClientCosts({ clients, projects, budgets, workItems, purchaseOrders, supplierPayments }),
    [clients, projects, budgets, workItems, purchaseOrders, supplierPayments]
  );

  // Totales de la empresa: la suma de todos los clientes más las obras sueltas.
  const company = React.useMemo(() => ({
    contracted: costs.reduce((s, c) => s + c.contracted, 0),
    adicionales: costs.reduce((s, c) => s + c.contractedAdicionales, 0),
    spent: costs.reduce((s, c) => s + c.spent, 0),
    unassignedProjects: projects.filter(p => !p.clientId).length,
  }), [costs, projects]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setIsFormOpen(true); };

  const openEdit = (client: Client) => {
    setEditing(client);
    setForm({
      name: client.name ?? '',
      rut: client.rut ?? '',
      contactName: client.contactName ?? '',
      email: client.email ?? '',
      phone: client.phone ?? '',
      address: client.address ?? '',
      notes: client.notes ?? '',
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setIsSubmitting(true);
    // Los opcionales vacíos van como null y no como '': así la base no queda
    // con cadenas vacías que después hay que limpiar al mostrar.
    const payload = {
      name: form.name.trim(),
      rut: form.rut.trim() || null,
      contactName: form.contactName.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (editing) {
        await updateClient(editing.id, payload);
        toast({ title: 'Cliente actualizado', description: `"${payload.name}" fue guardado.` });
      } else {
        await addClient(payload);
        toast({ title: 'Cliente creado', description: `"${payload.name}" ya puede recibir obras.` });
      }
      setIsFormOpen(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo guardar el cliente.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (client: Client) => {
    try {
      await deleteClient(client.id);
      toast({ title: 'Cliente eliminado', description: `"${client.name}" fue eliminado.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'No se pudo eliminar', description: err.message });
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        title="Clientes"
        description="Cada obra pertenece a un cliente. Aquí ves lo contratado y lo gastado por cada uno, y el consolidado de la empresa."
        actions={canManage && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo Cliente
          </Button>
        )}
      />

      {canViewCosts && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Contratado (empresa)" value={formatCLP(company.contracted)} icon={Wallet} />
          <StatTile label="Gastado a la fecha" value={formatCLP(company.spent)} icon={TrendingUp}
            tone={company.spent > company.contracted && company.contracted > 0 ? 'danger' : 'neutral'} />
          <StatTile label="En adicionales" value={formatCLP(company.adicionales)} icon={Plus} tone="info" />
          <StatTile label="Clientes activos" value={clients.length} icon={Users} tone="success"
            sub={company.unassignedProjects > 0 ? `${company.unassignedProjects} obra(s) sin asignar` : undefined} />
        </div>
      )}

      {canViewCosts && (unattributed.count > 0 || unassignedBudgets > 0) && (
        <SurfaceCard interactive={false} className="border-warning/40 bg-warning-subtle/30 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold tracking-tight">Los números de abajo están incompletos</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {unattributed.count > 0 && (
                  <li>
                    <span className="font-medium text-foreground">{formatCLP(unattributed.amount)}</span>{' '}
                    de gasto real no está imputado a ninguna obra
                    {unattributed.payments > 0 && ` · ${unattributed.payments} factura(s)`}
                    {unattributed.orders > 0 && ` · ${unattributed.orders} orden(es) de compra`}.{' '}
                    <Link href="/dashboard/payments" className="font-medium text-primary hover:underline">
                      Asignar facturas
                    </Link>
                  </li>
                )}
                {unassignedBudgets > 0 && (
                  <li>
                    <span className="font-medium text-foreground">{unassignedBudgets} presupuesto(s)</span>{' '}
                    sin obra asignada, así que su monto contratado no suma.{' '}
                    <Link href="/dashboard/construction-control/wbs" className="font-medium text-primary hover:underline">
                      Asignar presupuestos
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </SurfaceCard>
      )}

      {clients.length === 0 && company.unassignedProjects === 0 ? (
        <SurfaceCard interactive={false} className="items-center p-12 text-center">
          <Users className="mb-4 h-12 w-12 text-muted-foreground/40" strokeWidth={1.2} />
          <h3 className="text-lg font-bold tracking-tight">Aún no hay clientes</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Crea tu primer cliente y luego asígnale obras desde el módulo de Obras.
            El presupuesto de cada cliente se calcula con las partidas de la EDT.
          </p>
          {canManage && (
            <Button className="mt-6" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Crear el primer cliente
            </Button>
          )}
        </SurfaceCard>
      ) : (
        <div className="grid gap-6">
          {costs.map(c => (
            <ClientPanel
              key={c.client?.id ?? '__sin_asignar__'}
              data={c}
              canManage={canManage}
              canViewCosts={canViewCosts}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <Dialog open={isFormOpen} onOpenChange={o => { if (!isSubmitting) setIsFormOpen(o); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
            <DialogDescription>
              Solo el nombre es obligatorio. El resto son datos de contacto.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre del cliente *</Label>
              <Input id="name" value={form.name} required autoFocus
                placeholder="Ej: Inmobiliaria Aeropuerto S.A."
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rut">RUT</Label>
                <Input id="rut" value={form.rut} placeholder="76.123.456-7"
                  onChange={e => setForm(f => ({ ...f, rut: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contactName">Contacto</Label>
                <Input id="contactName" value={form.contactName} placeholder="Nombre de la contraparte"
                  onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Correo</Label>
                <Input id="email" type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Teléfono</Label>
                <Input id="phone" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Dirección</Label>
              <Input id="address" value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" rows={3} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || !form.name.trim()}>
                {isSubmitting ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear cliente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClientPanel({
  data, canManage, canViewCosts, onEdit, onDelete,
}: {
  data: ClientCosts;
  canManage: boolean;
  canViewCosts: boolean;
  onEdit: (c: Client) => void;
  onDelete: (c: Client) => void;
}) {
  const { client, projects } = data;
  const isUnassigned = client === null;
  const overBudget = data.contracted > 0 && data.spent > data.contracted;

  return (
    <PanelCard
      title={isUnassigned ? 'Obras sin cliente asignado' : client.name}
      icon={isUnassigned ? AlertTriangle : Building2}
      tone={isUnassigned ? 'warning' : 'neutral'}
      description={
        isUnassigned
          ? 'Asígnalas a un cliente desde el módulo de Obras para que sumen al control de gastos.'
          : [client.rut, client.contactName, client.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'
      }
      actions={!isUnassigned && canManage && (
        <>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(client)} aria-label="Editar cliente">
            <Edit className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Eliminar cliente">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar a &ldquo;{client.name}&rdquo;?</AlertDialogTitle>
                <AlertDialogDescription>
                  Solo se puede eliminar si no tiene obras asignadas. No se borra ningún gasto ni historial.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => onDelete(client)}>
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    >
      {canViewCosts && !isUnassigned && (
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <Figure label="Contratado" value={formatCLP(data.contracted)}
            hint={data.contractedAdicionales > 0 ? `incluye ${formatCLP(data.contractedAdicionales)} en adicionales` : undefined} />
          <Figure label="Gastado" value={formatCLP(data.spent)} tone={overBudget ? 'danger' : undefined} />
          <Figure label={overBudget ? 'Sobregiro' : 'Disponible'}
            value={formatCLP(Math.abs(data.available))}
            tone={overBudget ? 'danger' : 'success'} />
          <div className="sm:col-span-3">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Avance financiero</span>
              <span className="font-mono font-semibold">
                {data.contracted > 0 ? `${data.spentPercent.toFixed(1)}%` : 'Sin presupuesto cargado'}
              </span>
            </div>
            <Progress
              value={Math.min(data.spentPercent, 100)}
              className="h-2"
              indicatorClassName={overBudget ? 'bg-danger' : 'bg-primary'}
            />
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">Este cliente todavía no tiene obras asignadas.</p>
      ) : (
        <ul className="space-y-2">
          {projects.map(p => (
            <li key={p.project.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2.5">
                <HardHat className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.project.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.budgets.length === 0
                      ? 'Sin presupuestos'
                      : `${p.budgets.length} presupuesto${p.budgets.length === 1 ? '' : 's'}`}
                    {p.contractedAdicionales > 0 && ' · con adicionales'}
                  </p>
                </div>
              </div>
              {canViewCosts && (
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <span className="text-muted-foreground">
                    {formatCLP(p.spent)} <span className="opacity-60">de</span> {formatCLP(p.contracted)}
                  </span>
                  {p.contracted === 0 ? (
                    <StatusBadge tone="neutral">Sin EDT</StatusBadge>
                  ) : (
                    <StatusBadge tone={p.spent > p.contracted ? 'danger' : p.spentPercent > 85 ? 'warning' : 'success'}>
                      {p.spentPercent.toFixed(0)}%
                    </StatusBadge>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {isUnassigned && (
        <Link href="/dashboard/projects" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          Ir a Obras para asignarlas →
        </Link>
      )}
    </PanelCard>
  );
}

function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'danger' | 'success' }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={
        tone === 'danger' ? 'mt-0.5 text-lg font-bold tracking-tight text-danger'
          : tone === 'success' ? 'mt-0.5 text-lg font-bold tracking-tight text-success'
            : 'mt-0.5 text-lg font-bold tracking-tight'
      }>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
