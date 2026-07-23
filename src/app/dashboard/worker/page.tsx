"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PanelCard } from '@/components/ui/panel-card';
import { SurfaceCard } from '@/components/ui/surface-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { IconChip } from '@/components/ui/icon-chip';
import { Button } from '@/components/ui/button';
import { formatCLP } from '@/lib/format';
import { Progress } from '@/components/ui/progress';
import {
  Wallet,
  AlertCircle,
  Edit,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  Info,
  Wrench,
  CalendarCheck,
  FileBarChart,
  HandCoins,
  QrCode,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/modules/core/hooks/use-toast';
import { useAuth, useAppState } from '@/modules/core/contexts/app-provider';
import { startOfMonth, getDaysInMonth, isToday, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { toDate } from '@/lib/date-utils';
import { SalaryAdvance } from '@/modules/core/lib/data';

const formatRelative = (date: any) => {
  const d = toDate(date);
  if (!d) return 'N/A';
  if (isToday(d)) return 'Hoy';
  return formatDistanceToNow(d, { addSuffix: true, locale: es });
};

function AdvanceStatusBadge({ status }: { status: SalaryAdvance['status'] }) {
  if (status === 'pending') return (
    <StatusBadge tone="warning" icon={Clock} className="shrink-0">Pendiente</StatusBadge>
  );
  if (status === 'approved') return (
    <StatusBadge tone="success" icon={CheckCircle2} className="shrink-0">Aprobado</StatusBadge>
  );
  return (
    <StatusBadge tone="danger" icon={XCircle} className="shrink-0">Rechazado</StatusBadge>
  );
}

const QUICK_NAV = [
  { href: '/dashboard/worker/herramientas', icon: Wrench, label: 'Mis Herramientas', desc: 'Equipos asignados' },
  { href: '/dashboard/worker/asistencia', icon: CalendarCheck, label: 'Mi Asistencia', desc: 'Registro del mes' },
  { href: '/dashboard/worker/liquidacion', icon: FileBarChart, label: 'Mis Liquidaciones', desc: 'Desglose estimado' },
  { href: '/dashboard/worker/finiquito', icon: HandCoins, label: 'Mi Finiquito', desc: 'Estado del contrato' },
];

export default function WorkerDashboard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { attendanceLogs, addSalaryAdvanceRequest, dailyTalks, salaryAdvances } = useAppState();
  const [isAdvanceModalOpen, setAdvanceModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [dynamicQrValue, setDynamicQrValue] = useState('');
  const [qrSecondsLeft, setQrSecondsLeft] = useState(30);

  const buildQrValue = useCallback(() => {
    if (!user) return '';
    const win = Math.floor(Date.now() / 30000);
    return `gdo:${user.id}:${win}`;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const tick = () => {
      setDynamicQrValue(buildQrValue());
      setQrSecondsLeft(30 - (Math.floor(Date.now() / 1000) % 30));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [user, buildQrValue]);

  const workerData = useMemo(() => {
    if (!user) return { baseSalary: 0, daysWorked: 0, totalWorkingDays: 30, advancesTaken: 0 };

    const today = new Date();
    const start = startOfMonth(today);
    const totalWorkingDays = getDaysInMonth(today);

    const workedDaysSet = new Set<string>();
    (attendanceLogs ?? []).forEach(log => {
      if (log.userId === user.id) {
        const d = toDate(log.timestamp);
        if (d && d >= start && d <= today) workedDaysSet.add(d.toDateString());
      }
    });

    const advancesTaken = (salaryAdvances ?? [])
      .filter(adv => {
        if (adv.workerId !== user.id || adv.status === 'rejected') return false;
        const d = toDate(adv.requestedAt);
        return d && d >= start;
      })
      .reduce((sum, adv) => sum + adv.amount, 0);

    return {
      baseSalary: user.baseSalary ?? 0,
      daysWorked: workedDaysSet.size,
      totalWorkingDays,
      advancesTaken,
    };
  }, [user, attendanceLogs, salaryAdvances]);

  const { baseSalary, daysWorked, totalWorkingDays, advancesTaken } = workerData;

  const myAdvances = useMemo(() => {
    if (!user || !salaryAdvances) return [];
    return salaryAdvances
      .filter(adv => adv.workerId === user.id)
      .slice(0, 10);
  }, [salaryAdvances, user]);

  const hasPendingAdvance = myAdvances.some(a => a.status === 'pending');

  const pendingTalks = useMemo(() => {
    if (!user || !dailyTalks) return [];
    return dailyTalks
      .filter(t => t.asistentes.some(a => a.id === user.id && !a.signed))
      .sort((a, b) => (b.fecha as any) - (a.fecha as any));
  }, [dailyTalks, user]);

  const dailyRate = baseSalary / 30;
  const currentEarnings = Math.floor(dailyRate * daysWorked);
  const maxAdvanceLimit = Math.max(0, Math.floor(currentEarnings * 0.5) - advancesTaken);
  const canRequestAdvance = !hasPendingAdvance && baseSalary > 0 && maxAdvanceLimit >= 10000;

  const [requestedAmount, setRequestedAmount] = useState(10000);
  React.useEffect(() => {
    if (canRequestAdvance) setRequestedAmount(Math.min(50000, maxAdvanceLimit));
  }, [maxAdvanceLimit, canRequestAdvance]);

  const handleRequestAdvance = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await addSalaryAdvanceRequest({ workerId: user.id, workerName: user.name, amount: requestedAmount });
      toast({ title: "Solicitud enviada", description: `Adelanto de ${formatCLP(requestedAmount)} enviado. Recibirás confirmación pronto.` });
      setAdvanceModalOpen(false);
    } catch {
      toast({ variant: 'destructive', title: 'Error al solicitar', description: 'No se pudo procesar tu solicitud. Intenta de nuevo.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const initials = (user?.name ?? 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const advanceButtonLabel = () => {
    if (hasPendingAdvance) return 'Tienes una solicitud pendiente';
    if (baseSalary === 0) return 'Sin sueldo base configurado';
    if (!canRequestAdvance) return 'Saldo insuficiente para adelanto';
    return 'Solicitar adelanto';
  };

  return (
    <div className="max-w-md mx-auto space-y-5 pb-10">

      {/* ── Header ── */}
      <div className="flex justify-between items-center pt-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Hola, {user?.name?.split(' ')[0]}</h2>
          <p className="text-muted-foreground text-sm">{user?.cargo || 'Trabajador'}</p>
        </div>
        <div className="h-11 w-11 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
          {initials}
        </div>
      </div>

      {/* ── QR dinámico ── */}
      <PanelCard
        title="Mi código QR de asistencia"
        description="Muéstrale este QR al guardia o administrador para registrar tu entrada o salida."
        icon={QrCode}
        contentClassName="flex flex-col items-center gap-3"
      >
          {/* Fondo blanco fijo: el QR necesita blanco para escanear. */}
          <div className="relative rounded-xl border border-border bg-white p-3 shadow">
            {dynamicQrValue && (
              <QRCode value={dynamicQrValue} size={180} level="H" />
            )}
            <div className="absolute -bottom-2.5 -right-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground shadow">
              {qrSecondsLeft}s
            </div>
          </div>
          <p className="text-xs text-muted-foreground">QR dinámico · se renueva cada 30 s · no compartir capturas</p>
      </PanelCard>

      {/* ── Firmas pendientes ── */}
      {pendingTalks.length > 0 && (
        <PanelCard
          title={pendingTalks.length === 1 ? '1 firma pendiente' : `${pendingTalks.length} firmas pendientes`}
          description="Charlas de seguridad que debes confirmar"
          icon={Edit}
          tone="warning"
          contentClassName="space-y-2"
        >
            {pendingTalks.map(talk => (
              <Link key={talk.id} href={`/dashboard/worker/sign-talk/${talk.id}`}>
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3 transition-colors hover:bg-muted">
                  <div>
                    <p className="text-sm font-semibold">Charla del {formatRelative(talk.fecha)}</p>
                    <p className="max-w-[220px] truncate text-xs text-muted-foreground">{talk.temas}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </Link>
            ))}
        </PanelCard>
      )}

      {/* ── Billetera ── (tarjeta oscura Prussian, igual que la credencial;
             los verdes/ámbar fijos son correctos sobre este fondo azul) */}
      <div className="relative overflow-hidden rounded-3xl border border-cta/20 bg-gradient-to-br from-sidebar via-sidebar to-sidebar-hover p-6 text-sidebar-foreground shadow-lg">
        <div className="pointer-events-none absolute right-0 top-0 -mr-6 -mt-6 h-28 w-28 rounded-full bg-cta/20 blur-2xl" />

        <div className="relative">
          <p className="flex items-center gap-2 text-xs text-sidebar-muted">
            <Wallet className="h-3.5 w-3.5" /> Saldo acumulado estimado
          </p>
          {baseSalary > 0 ? (
            <div className="text-4xl font-extrabold tracking-tight">{formatCLP(currentEarnings)}</div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0 text-sidebar-muted" />
              <p className="text-sm text-sidebar-muted">Sin sueldo base configurado. Contacta a tu administrador.</p>
            </div>
          )}
        </div>

        {baseSalary > 0 && (
          <div className="relative mt-4">
            <div className="mb-2 flex justify-between text-xs text-sidebar-muted">
              <span>{daysWorked} días trabajados</span>
              <span>Meta: {totalWorkingDays} días</span>
            </div>
            <Progress value={(daysWorked / totalWorkingDays) * 100} className="h-2 bg-sidebar-hover [&>div]:bg-green-400" />

            <div className="mt-5 rounded-lg border border-white/10 bg-white/10 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-sidebar-foreground">Disponible para adelanto</span>
                {canRequestAdvance ? (
                  <span className="rounded-full bg-green-500/30 px-2 py-0.5 text-[10px] font-medium text-green-300">Disponible</span>
                ) : hasPendingAdvance ? (
                  <span className="rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-300">En revisión</span>
                ) : (
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-sidebar-muted">No disponible</span>
                )}
              </div>
              <div className="text-2xl font-bold text-green-400">{formatCLP(maxAdvanceLimit)}</div>
              <p className="mt-0.5 text-[11px] text-sidebar-muted">
                Solicitado este mes: {formatCLP(advancesTaken)}
                {hasPendingAdvance && ' · Solicitud en revisión'}
              </p>
            </div>
          </div>
        )}

        <Button
          onClick={() => setAdvanceModalOpen(true)}
          disabled={!canRequestAdvance}
          className="relative mt-5 w-full bg-cta font-semibold text-sidebar hover:bg-cta-hover disabled:opacity-60"
        >
          {advanceButtonLabel()}
        </Button>
      </div>

      {/* ── Historial de solicitudes de adelanto ── */}
      {myAdvances.length > 0 && (
        <PanelCard
          title="Mis solicitudes de adelanto"
          description="Estado de tus solicitudes enviadas"
          icon={Wallet}
          contentClassName="space-y-2"
        >
            {myAdvances.map(adv => (
              <div key={adv.id} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{formatCLP(adv.amount)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Solicitado {formatRelative(adv.requestedAt)}
                    {adv.processedAt && ` · Procesado ${formatRelative(adv.processedAt)}`}
                  </p>
                </div>
                <AdvanceStatusBadge status={adv.status} />
              </div>
            ))}
        </PanelCard>
      )}

      {/* ── Navegación rápida ── */}
      <div>
        <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Mi espacio de trabajo</p>
        <div className="grid grid-cols-2 gap-3">
          {QUICK_NAV.map(item => (
            <SurfaceCard key={item.href} href={item.href} decorIcon={item.icon} className="p-4">
              <div className="relative z-10">
                <IconChip icon={item.icon} size="sm" />
                <p className="mt-2.5 text-sm font-semibold leading-tight transition-colors group-hover:text-cta">{item.label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{item.desc}</p>
              </div>
            </SurfaceCard>
          ))}
        </div>
      </div>

      {/* ── Modal adelanto ── */}
      <Dialog open={isAdvanceModalOpen} onOpenChange={setAdvanceModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar adelanto de sueldo</DialogTitle>
            <DialogDescription>
              El monto se descontará de tu liquidación a fin de mes. Máximo 50% de lo ganado hasta hoy.
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 space-y-6">
            <div className="text-center">
              <span className="text-4xl font-bold text-primary">{formatCLP(requestedAmount)}</span>
              <p className="text-sm text-muted-foreground mt-1">Monto a solicitar</p>
            </div>

            <div className="space-y-3">
              <Slider
                value={[requestedAmount]}
                min={10000}
                max={maxAdvanceLimit}
                step={5000}
                onValueChange={val => setRequestedAmount(val[0])}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Mín: {formatCLP(10000)}</span>
                <span>Máx: {formatCLP(maxAdvanceLimit)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Ganado hasta hoy</p>
                <p className="font-bold">{formatCLP(currentEarnings)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Ya solicitado</p>
                <p className="font-bold">{formatCLP(advancesTaken)}</p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-subtle p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs text-warning">
                La transferencia puede tardar hasta 24 horas hábiles. Al confirmar autorizas el descuento en tu próxima liquidación.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvanceModalOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleRequestAdvance} disabled={isSubmitting}>
              {isSubmitting ? 'Enviando...' : 'Confirmar solicitud'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
