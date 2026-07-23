import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/modules/core/lib/supabase-server';

export async function POST(req: NextRequest) {
  const serverSb = await getSupabaseServerClient();
  const { data: { user } } = await serverSb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { data: callerProfile } = await serverSb
    .from('users')
    .select('role, tenantId')
    .eq('id', user.id)
    .single();

  if (!callerProfile || !['admin', 'super-admin', 'soporte'].includes(callerProfile.role)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const { targetUserId } = await req.json();
  if (!targetUserId) return NextResponse.json({ error: 'Falta el ID del usuario.' }, { status: 400 });

  if (targetUserId === user.id) {
    return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta.' }, { status: 400 });
  }

  // Verify target belongs to same tenant (unless super-admin)
  if (callerProfile.role !== 'super-admin') {
    const { data: targetProfile } = await serverSb
      .from('users')
      .select('tenantId')
      .eq('id', targetUserId)
      .single();

    if (!targetProfile || targetProfile.tenantId !== callerProfile.tenantId) {
      return NextResponse.json({ error: 'No autorizado para eliminar este usuario.' }, { status: 403 });
    }
  }

  const adminSb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Delete profile first, then auth user
  const { error: profileErr } = await adminSb.from('users').delete().eq('id', targetUserId);
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

  const { error: authErr } = await adminSb.auth.admin.deleteUser(targetUserId);
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
