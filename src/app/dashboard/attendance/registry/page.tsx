"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { useAppState } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Loader2, UserCheck, UserX, ClipboardCheck, ScanLine, Users } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AttendanceLog, User } from "@/modules/core/lib/data";
import { Pie, PieChart, Cell } from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
} from "@/components/ui/chart";
import { useToast } from "@/modules/core/hooks/use-toast";
import { toDate } from "@/lib/date-utils";
import { QrScannerDialog } from "@/components/qr-scanner-dialog";

export default function AttendanceRegistryPage() {
  const { attendanceLogs, handleAttendanceScan, addManualAttendance, isLoading, users } = useAppState();
  const [today, setToday] = useState('');
  const [todayDate, setTodayDate] = useState<Date>(new Date());
  const { toast } = useToast();

  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualWorkerId, setManualWorkerId] = useState<string>('');
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    const now = new Date();
    setTodayDate(now);
    setToday(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
  }, []);

  const userMap = useMemo(() => new Map<string, string>((users || []).map((u: User) => [u.id, u.name])), [users]);

  const registrableUsers = useMemo(() =>
    (users || []).filter((u: User) => u.role !== 'guardia' && u.role !== 'super-admin'),
    [users]
  );

  const todaysLogsGrouped = useMemo(() => {
    if (!attendanceLogs) return new Map<string, AttendanceLog[]>();
    const grouped = new Map<string, AttendanceLog[]>();
    attendanceLogs
      .filter((log: AttendanceLog) => log.date === today)
      .forEach((log: AttendanceLog) => {
        if (!grouped.has(log.userId)) grouped.set(log.userId, []);
        grouped.get(log.userId)!.push(log);
      });
    grouped.forEach((logs: AttendanceLog[]) =>
      // `timestamp` llega como ISO string; normalizar con toDate antes de ordenar.
      logs.sort((a, b) => (toDate(a.timestamp)?.getTime() ?? 0) - (toDate(b.timestamp)?.getTime() ?? 0))
    );
    return grouped;
  }, [attendanceLogs, today]);

  const attendanceStats = useMemo(() => {
    const totalUsers = registrableUsers.length;
    const totalAttendees = todaysLogsGrouped.size;
    let currentlyPresent = 0;
    let leftForDay = 0;
    todaysLogsGrouped.forEach((logs: AttendanceLog[]) => {
      if (!logs.length) return;
      if (logs[logs.length - 1].type === 'in') currentlyPresent++;
      else leftForDay++;
    });
    return { totalUsers, totalAttendees, currentlyPresent, leftForDay, absentUsers: totalUsers - totalAttendees };
  }, [registrableUsers, todaysLogsGrouped]);

  const chartConfig = {
    value: { label: "Trabajadores" },
    Asistentes: { label: "Asistentes", icon: UserCheck },
    Ausentes: { label: "Ausentes", icon: UserX },
    Presentes: { label: "Presentes", icon: UserCheck },
    "Fuera de Obra": { label: "Fuera de Obra", icon: UserX },
  };

  const getNextType = useCallback((userId: string): 'in' | 'out' => {
    const logs = todaysLogsGrouped.get(userId) || [];
    return logs.length && logs[logs.length - 1].type === 'in' ? 'out' : 'in';
  }, [todaysLogsGrouped]);

  // Called by the QrScannerDialog — must return { userName, type } or throw
  const handleScan = useCallback(async (
    qrCode: string,
    coords: { lat: number; lng: number } | null
  ): Promise<{ userName: string; type: 'in' | 'out' }> => {
    return await handleAttendanceScan(qrCode, coords) as { userName: string; type: 'in' | 'out' };
  }, [handleAttendanceScan]);

  const handleManualRegister = async () => {
    if (!manualWorkerId) {
      toast({ variant: 'destructive', title: 'Selecciona un trabajador' });
      return;
    }
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const type = getNextType(manualWorkerId);
    const workerName = userMap.get(manualWorkerId) || 'Trabajador';

    setIsRegistering(true);
    try {
      await addManualAttendance(manualWorkerId, todayDate, time, type, null);
      toast({
        title: type === 'in' ? 'Entrada registrada' : 'Salida registrada',
        description: `${workerName} — ${time}`,
      });
      setManualWorkerId('');
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo registrar la asistencia.' });
    } finally {
      setIsRegistering(false);
    }
  };

  const formatTime = (date: Date): string => {
    const jsDate = toDate(date) || date;
    return jsDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusBadge = (logs: AttendanceLog[] | undefined) => {
    if (!logs?.length) return <StatusBadge tone="neutral">Ausente</StatusBadge>;
    const last = logs[logs.length - 1];
    if (last.type === 'in') return <StatusBadge tone="success">En obra</StatusBadge>;
    return <StatusBadge tone="neutral">Salió</StatusBadge>;
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const attendanceChartData = [
    { name: "Asistentes", value: attendanceStats.totalAttendees, fill: "hsl(var(--chart-2))" },
    { name: "Ausentes", value: attendanceStats.absentUsers, fill: "hsl(var(--destructive))" },
  ];
  const statusChartData = [
    { name: "Presentes", value: attendanceStats.currentlyPresent, fill: "hsl(var(--chart-2))" },
    { name: "Fuera de Obra", value: attendanceStats.leftForDay, fill: "hsl(var(--chart-4))" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <QrScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={handleScan}
        title="Escanear QR del trabajador"
        description="Apunta la cámara al código QR dinámico del trabajador. Cada escaneo alterna entre entrada y salida."
      />

      <PageHeader
        title="Registro de Asistencia"
        description={`${new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
      />

      {/* Stat pills */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total personal" value={attendanceStats.totalUsers} icon={Users} />
        <StatTile label="Asistieron hoy" value={attendanceStats.totalAttendees} icon={UserCheck} tone="info" />
        <StatTile label="En obra ahora" value={attendanceStats.currentlyPresent} icon={LogIn} tone="success" />
        <StatTile label="Ausentes" value={attendanceStats.absentUsers} icon={UserX} tone="danger" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Charts */}
        <div className="lg:col-span-1 space-y-6">
          <PanelCard title="Asistencia general" icon={Users}>
              <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[180px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie data={attendanceChartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={70}>
                    {attendanceChartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <ChartLegend content={<ChartLegendContent />} className="-translate-y-1 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center" />
                </PieChart>
              </ChartContainer>
          </PanelCard>

          <PanelCard title="Estado actual en obra" icon={UserCheck} tone="success">
              <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[180px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie data={statusChartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={70}>
                    {statusChartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <ChartLegend content={<ChartLegendContent />} className="-translate-y-1 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center" />
                </PieChart>
              </ChartContainer>
          </PanelCard>
        </div>

        {/* Right column: scanner + manual + table */}
        <div className="lg:col-span-2 space-y-6">
          {/* Primary action: QR scanner */}
          <PanelCard
            title="Escanear QR del trabajador"
            description="El trabajador muestra su QR dinámico; el sistema registra entrada o salida y captura tu ubicación GPS."
            icon={ScanLine}
            className="border-primary/30"
          >
              <Button size="lg" className="w-full" onClick={() => setScannerOpen(true)}>
                <ScanLine className="mr-2 h-5 w-5" />
                Abrir escáner de cámara
              </Button>
          </PanelCard>

          {/* Fallback: manual registration */}
          <PanelCard
            title="Registro manual"
            description="Usa esto como alternativa cuando el QR no esté disponible."
            icon={ClipboardCheck}
          >
              <div className="flex flex-col sm:flex-row gap-3">
                <Select value={manualWorkerId} onValueChange={setManualWorkerId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecciona un trabajador..." />
                  </SelectTrigger>
                  <SelectContent>
                    {registrableUsers.map((u: User) => {
                      const next = getNextType(u.id);
                      return (
                        <SelectItem key={u.id} value={u.id}>
                          <span>{u.name}</span>
                          <span className={`ml-2 text-xs ${next === 'in' ? 'text-success' : 'text-warning'}`}>
                            → {next === 'in' ? 'Entrada' : 'Salida'}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleManualRegister}
                  disabled={isRegistering || !manualWorkerId}
                  variant="outline"
                >
                  {isRegistering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> :
                    manualWorkerId && getNextType(manualWorkerId) === 'out'
                      ? <LogOut className="mr-2 h-4 w-4" />
                      : <LogIn className="mr-2 h-4 w-4" />
                  }
                  {manualWorkerId && getNextType(manualWorkerId) === 'out' ? 'Registrar Salida' : 'Registrar Entrada'}
                </Button>
              </div>
          </PanelCard>

          {/* Today's movement table */}
          <PanelCard
            title="Movimientos del día"
            description="Detalle de entradas y salidas registradas hoy."
            icon={LogIn}
            contentClassName="px-0 pb-0"
          >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trabajador</TableHead>
                    <TableHead>Registros</TableHead>
                    <TableHead className="text-right">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todaysLogsGrouped.size > 0
                    ? Array.from(todaysLogsGrouped.entries()).map(([userId, logs]) => (
                      <TableRow key={userId}>
                        <TableCell className="font-medium py-3">{userMap.get(userId) || 'Desconocido'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            {logs.map((log: AttendanceLog) => (
                              <span key={log.id} className="flex items-center gap-1 text-xs font-mono">
                                {log.type === 'in'
                                  ? <LogIn className="h-3 w-3 text-success" />
                                  : <LogOut className="h-3 w-3 text-danger" />}
                                {formatTime(log.timestamp)}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{getStatusBadge(logs)}</TableCell>
                      </TableRow>
                    ))
                    : (
                      <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                          Sin registros por ahora. Escanea el QR del primer trabajador.
                        </TableCell>
                      </TableRow>
                    )}
                </TableBody>
              </Table>
          </PanelCard>
        </div>
      </div>
    </div>
  );
}
