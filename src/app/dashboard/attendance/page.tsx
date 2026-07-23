"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PanelCard } from "@/components/ui/panel-card";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Clock, AlertCircle, Users, UserCheck, UserX, LogIn, LogOut, ScanLine, CalendarCheck,
} from "lucide-react";
import { useAppState } from "@/modules/core/contexts/app-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { User, AttendanceLog } from "@/modules/core/lib/data";
import { toDate } from "@/lib/date-utils";

export default function AttendanceDashboardPage() {
  const { users, attendanceLogs, can } = useAppState();

  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const { stats, currentlyIn, absentUsers, recentLogs } = useMemo(() => {
    const safeUsers: User[] = users || [];
    const safeLogs: AttendanceLog[] = attendanceLogs || [];

    const relevantUsers = safeUsers.filter(
      (u) => u.role !== "guardia" && u.role !== "super-admin"
    );

    const todaysLogs = safeLogs.filter((log) => log.date === todayStr);
    const attendees = new Set(todaysLogs.map((log) => log.userId));

    // Quién está dentro ahora (última marca = 'in')
    const lastLogByUser = new Map<string, 'in' | 'out'>();
    todaysLogs.forEach((log) => { lastLogByUser.set(log.userId, log.type); });

    const presentNow = relevantUsers.filter((u) => lastLogByUser.get(u.id) === 'in');
    const absent = relevantUsers.filter((u) => !attendees.has(u.id));

    // `timestamp` llega como ISO string (Supabase / demo), no como Date: se
    // normaliza con toDate antes de ordenar.
    const sortedRecentLogs = [...todaysLogs]
      .sort((a, b) => (toDate(b.timestamp)?.getTime() ?? 0) - (toDate(a.timestamp)?.getTime() ?? 0))
      .slice(0, 8);

    return {
      stats: {
        totalWorkers: relevantUsers.length,
        presentToday: attendees.size,
        absentToday: absent.length,
        currentlyIn: presentNow.length,
      },
      currentlyIn: presentNow,
      absentUsers: absent,
      recentLogs: sortedRecentLogs,
    };
  }, [users, attendanceLogs, todayStr]);

  const userMap = useMemo(
    () => new Map((users || []).map((u: User) => [u.id, u.name])),
    [users]
  );

  const formatTime = (ts: Date | string) => {
    const d = toDate(ts);
    return d ? d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "--:--";
  };

  if (!can("module_attendance:view")) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Acceso Denegado</AlertTitle>
        <AlertDescription>No tienes los permisos necesarios para acceder a este módulo.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        title="Asistencia"
        description="Control de asistencia del día, presencia en obra y movimientos."
        actions={
          can("attendance:register") ? (
            <Button asChild variant="cta">
              <Link href="/dashboard/attendance/registry">
                <CalendarCheck className="mr-2 h-4 w-4" />
                Registrar Asistencia
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Personal activo" value={stats.totalWorkers} icon={Users} />
        <StatTile label="Asistencia hoy" value={stats.presentToday} icon={UserCheck} tone="info" />
        <StatTile label="En obra ahora" value={stats.currentlyIn} icon={LogIn} tone="success" />
        <StatTile label="Ausentes hoy" value={stats.absentToday} icon={UserX} tone="danger" />
      </div>

      {/* Presencia: en obra + ausentes */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PanelCard
          title="Actualmente en obra"
          icon={UserCheck}
          tone="success"
          description={
            currentlyIn.length === 0
              ? "Nadie ha registrado entrada aún hoy."
              : `${currentlyIn.length} ${currentlyIn.length === 1 ? 'trabajador dentro' : 'trabajadores dentro'} del recinto.`
          }
        >
          {currentlyIn.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {currentlyIn.map((u) => (
                <StatusBadge key={u.id} tone="success" icon={UserCheck}>{u.name}</StatusBadge>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-muted-foreground">Sin presencia registrada.</p>
          )}
        </PanelCard>

        <PanelCard
          title="Ausentes hoy"
          icon={UserX}
          tone={absentUsers.length > 0 ? "warning" : "success"}
          description={
            absentUsers.length === 0
              ? "Todo el personal registró asistencia."
              : `${absentUsers.length} ${absentUsers.length === 1 ? 'persona sin marcar' : 'personas sin marcar'} entrada hoy.`
          }
        >
          {absentUsers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {absentUsers.map((u) => (
                <StatusBadge key={u.id} tone="neutral" icon={UserX}>{u.name}</StatusBadge>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-muted-foreground">Nadie ausente.</p>
          )}
        </PanelCard>
      </div>

      {/* Movimientos recientes */}
      <PanelCard
        title="Movimientos recientes"
        description="Últimas entradas y salidas del día."
        icon={Clock}
        contentClassName="px-0 pb-0"
      >
        <Table>
          <TableHeader className="border-t border-border bg-muted">
            <TableRow>
              <TableHead>Hora</TableHead>
              <TableHead>Trabajador</TableHead>
              <TableHead className="text-right">Movimiento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentLogs.length > 0 ? (
              recentLogs.map((log: AttendanceLog) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-sm">{formatTime(log.timestamp)}</TableCell>
                  <TableCell className="font-medium">{userMap.get(log.userId) || "Desconocido"}</TableCell>
                  <TableCell className="text-right">
                    {log.type === "in" ? (
                      <StatusBadge tone="success" icon={LogIn}>Entrada</StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral" icon={LogOut}>Salida</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                  No hay movimientos registrados hoy.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </PanelCard>

      {/* Nota informativa del QR dinámico (no es navegación) */}
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-card p-4">
        <ScanLine className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-medium">QR Dinámico</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cada trabajador tiene un QR que cambia cada 30 segundos, imposible de compartir por captura de pantalla.
          </p>
        </div>
      </div>
    </div>
  );
}
