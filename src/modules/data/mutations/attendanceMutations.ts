import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { format } from 'date-fns';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  db?: any;
};

type Coords = { lat: number; lng: number } | null | undefined;

// Dynamic QR format: "gdo:{userId}:{timeWindow}"
// timeWindow = Math.floor(Date.now() / 30000) — changes every 30 seconds
// Valid window: ±1 (up to 30s grace period)
function parseDynamicQR(qrCode: string): { userId: string } | null {
  if (!qrCode.startsWith('gdo:')) return null;
  const parts = qrCode.split(':');
  if (parts.length !== 3) return null;
  const userId = parts[1];
  const timeWindow = parseInt(parts[2], 10);
  if (isNaN(timeWindow)) return null;
  const currentWindow = Math.floor(Date.now() / 30000);
  if (Math.abs(currentWindow - timeWindow) > 1) {
    throw new Error('QR expirado. El trabajador debe mostrar su QR actualizado.');
  }
  return { userId };
}

export async function handleAttendanceScan(
  qrCode: string,
  coords: Coords,
  { user, tenantId }: Context
): Promise<{ userName: string; type: 'in' | 'out' }> {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  if (user.role !== 'guardia' && user.role !== 'admin' && user.role !== 'super-admin') {
    throw new Error('No tienes permiso para registrar asistencia.');
  }
  const sb = getSupabaseBrowserClient();

  let scannedUser: { id: string; name: string } | null = null;

  const dynamic = parseDynamicQR(qrCode);
  if (dynamic) {
    // Dynamic QR — look up by userId directly
    const { data, error } = await sb
      .from('users')
      .select('id, name')
      .eq('id', dynamic.userId)
      .eq('tenantId', tenantId)
      .single();
    if (error || !data) throw new Error('Trabajador no encontrado en esta empresa.');
    scannedUser = data;
  } else {
    // Legacy static QR — look up by qrCode field
    const { data, error } = await sb
      .from('users')
      .select('id, name')
      .eq('tenantId', tenantId)
      .eq('qrCode', qrCode)
      .limit(1);
    if (error || !data?.length) throw new Error('Código QR no válido o trabajador no encontrado.');
    scannedUser = data[0];
  }

  if (!scannedUser) throw new Error('Trabajador no encontrado en esta empresa.');

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const { data: lastLogs } = await sb
    .from('attendanceLogs')
    .select('type')
    .eq('userId', scannedUser.id)
    .eq('date', todayStr)
    .order('timestamp', { ascending: false })
    .limit(1);

  const newLogType: 'in' | 'out' = lastLogs?.[0]?.type === 'in' ? 'out' : 'in';

  const { error } = await sb.from('attendanceLogs').insert({
    userId: scannedUser.id,
    userName: scannedUser.name,
    type: newLogType,
    method: 'qr',
    registrarId: user.id,
    registrarName: user.name,
    date: todayStr,
    tenantId,
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
  });
  if (error) throw new Error(error.message);

  return { userName: scannedUser.name, type: newLogType };
}

export async function addManualAttendance(
  userId: string,
  date: Date,
  time: string,
  type: 'in' | 'out',
  coords: Coords,
  { user, tenantId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();

  const [hours, minutes] = time.split(':').map(Number);
  const timestamp = new Date(date);
  timestamp.setHours(hours, minutes, 0, 0);

  const { data: userRow } = await sb.from('users').select('name').eq('id', userId).single();

  const { error } = await sb.from('attendanceLogs').insert({
    userId,
    userName: userRow?.name || 'Desconocido',
    timestamp: timestamp.toISOString(),
    type,
    method: 'manual',
    registrarId: user.id,
    registrarName: user.name,
    date: format(date, 'yyyy-MM-dd'),
    tenantId,
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function updateAttendanceLog(
  logId: string,
  newTimestamp: Date,
  newType: 'in' | 'out',
  originalTimestamp: Date,
  { user, tenantId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('attendanceLogs').update({
    timestamp: newTimestamp.toISOString(),
    type: newType,
    originalTimestamp: originalTimestamp.toISOString(),
    modifiedAt: new Date().toISOString(),
    modifiedBy: user.id,
  }).eq('id', logId);
  if (error) throw new Error(error.message);
}

export async function deleteAttendanceLog(logId: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('attendanceLogs').delete().eq('id', logId);
  if (error) throw new Error(error.message);
}
