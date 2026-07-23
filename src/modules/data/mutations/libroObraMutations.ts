import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { LibroObra, AsientoTipo } from '@/modules/core/lib/data';
import { format } from 'date-fns';

type Context = { user: any; tenantId: string | null | undefined; projectId: string | null };

export async function createLibroObra(
  data: Omit<LibroObra, 'id' | 'tenantId' | 'createdAt' | 'createdBy'>,
  { user, tenantId }: Context
): Promise<string> {
  if (!user || !tenantId) throw new Error('No autenticado.');
  const sb = getSupabaseBrowserClient();
  const { data: inserted, error } = await sb.from('libroObra').insert({
    ...data,
    tenantId,
    createdBy: user.id,
    fechaPermiso: data.fechaPermiso ? format(data.fechaPermiso, 'yyyy-MM-dd') : null,
    fechaInicioObra: data.fechaInicioObra ? format(data.fechaInicioObra, 'yyyy-MM-dd') : null,
    fechaEntregaTerreno: data.fechaEntregaTerreno ? format(data.fechaEntregaTerreno, 'yyyy-MM-dd') : null,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return inserted.id;
}

export async function updateLibroObra(
  libroId: string,
  data: Partial<Omit<LibroObra, 'id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
  _ctx: Context
) {
  const sb = getSupabaseBrowserClient();
  const patch: any = { ...data };
  if (data.fechaPermiso) patch.fechaPermiso = format(data.fechaPermiso, 'yyyy-MM-dd');
  if (data.fechaInicioObra) patch.fechaInicioObra = format(data.fechaInicioObra, 'yyyy-MM-dd');
  if (data.fechaEntregaTerreno) patch.fechaEntregaTerreno = format(data.fechaEntregaTerreno, 'yyyy-MM-dd');
  const { error } = await sb.from('libroObra').update(patch).eq('id', libroId);
  if (error) throw new Error(error.message);
}

export async function addAsiento(
  data: {
    libroId: string;
    fecha: Date;
    tipo: AsientoTipo;
    contenido: string;
    autorRol: string;
  },
  { user, tenantId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado.');
  const sb = getSupabaseBrowserClient();

  // Get next numero
  const { data: last } = await sb
    .from('libroObraAsientos')
    .select('numero')
    .eq('libroId', data.libroId)
    .order('numero', { ascending: false })
    .limit(1);
  const nextNumero = (last?.[0]?.numero ?? 0) + 1;

  const { error } = await sb.from('libroObraAsientos').insert({
    libroId: data.libroId,
    tenantId,
    numero: nextNumero,
    fecha: format(data.fecha, 'yyyy-MM-dd'),
    tipo: data.tipo,
    contenido: data.contenido,
    autorId: user.id,
    autorNombre: user.name,
    autorRol: data.autorRol,
    firmado: false,
  });
  if (error) throw new Error(error.message);
}

export async function signAsiento(
  asientoId: string,
  firmaDigital: string,
  _ctx: Context
) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('libroObraAsientos').update({
    firmado: true,
    firmaDigital,
    firmadoAt: new Date().toISOString(),
  }).eq('id', asientoId);
  if (error) throw new Error(error.message);
}
