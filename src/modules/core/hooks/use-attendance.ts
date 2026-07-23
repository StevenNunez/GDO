"use client";
import { useMemo } from 'react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { computeMonthlyAttendance } from '@/lib/attendance';

export function useMonthlyAttendance(userId: string | null, year: number, month: number) {
  const { attendanceLogs } = useAppState();

  // El cálculo es puro y síncrono (ver `src/lib/attendance.ts`), así que se
  // deriva con useMemo; `loading` queda por compatibilidad con las pantallas.
  const report = useMemo(
    () => (userId ? computeMonthlyAttendance(attendanceLogs || [], userId, year, month) : null),
    [userId, year, month, attendanceLogs],
  );

  return { report, loading: false };
}
