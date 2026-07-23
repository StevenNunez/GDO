import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { BitacoraWeather } from '@/modules/core/lib/data';
import { format } from 'date-fns';

type Context = { user: any; tenantId: string | null | undefined; projectId: string | null };

export async function addBitacoraEntry(
  data: {
    date: Date;
    weather: BitacoraWeather;
    workerCount: number;
    workPerformed: string;
    equipment?: string;
    incidents?: string;
    observations?: string;
  },
  { user, tenantId, projectId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('bitacoraEntries').insert({
    tenantId,
    projectId: projectId || null,
    date: format(data.date, 'yyyy-MM-dd'),
    weather: data.weather,
    workerCount: data.workerCount,
    workPerformed: data.workPerformed,
    equipment: data.equipment || null,
    incidents: data.incidents || null,
    observations: data.observations || null,
    authorId: user.id,
    authorName: user.name,
  });
  if (error) throw new Error(error.message);
}

export async function deleteBitacoraEntry(entryId: string, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('bitacoraEntries').delete().eq('id', entryId);
  if (error) throw new Error(error.message);
}
