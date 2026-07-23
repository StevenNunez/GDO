import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/modules/core/lib/supabase-server';
import type { UserRole } from '@/modules/core/lib/data';

const VALID_ROLES: UserRole[] = [
  'admin', 'supervisor', 'worker', 'operations', 'apr', 'guardia', 'finance',
  'super-admin', 'bodega-admin', 'cphs', 'jefe-terreno', 'quality',
  'jefe-oficina-tecnica', 'soporte',
];

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

  const { name, email, password, role, phone, tenantId, assignedProjectIds } = await req.json();

  if (!name || !email || !password || !role || !tenantId) {
    return NextResponse.json({ error: 'Faltan campos requeridos.' }, { status: 400 });
  }

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Rol inválido.' }, { status: 400 });
  }

  // El `tenantId` y el `role` llegan del cliente, así que no se pueden usar tal
  // cual: un admin podría crear usuarios dentro de otro suscriptor, o darse a sí
  // mismo un super-admin. Solo el super-admin puede elegir tenant y otorgar ese
  // rol; para un admin normal el tenant se fuerza al suyo.
  const isSuperAdmin = callerProfile.role === 'super-admin';

  // `soporte` es un rol de soporte de la app (acceso total al tenant): solo el
  // super-admin puede otorgarlo, igual que super-admin.
  if (!isSuperAdmin && (role === 'super-admin' || role === 'soporte')) {
    return NextResponse.json(
      { error: 'No autorizado para crear usuarios con ese rol.' },
      { status: 403 }
    );
  }

  const targetTenantId = isSuperAdmin ? tenantId : callerProfile.tenantId;

  if (!targetTenantId) {
    return NextResponse.json({ error: 'No se pudo determinar el suscriptor.' }, { status: 400 });
  }

  const adminSb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: authData, error: authErr } = await adminSb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr) {
    const msg = authErr.message.includes('already registered')
      ? 'El correo electrónico ya está registrado.'
      : authErr.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const uid = authData.user.id;

  const { error: profileErr } = await adminSb.from('users').insert({
    id: uid,
    name,
    email,
    role,
    phone: phone || null,
    tenantId: targetTenantId,
    qrCode: `USER-${uid}`,
    assignedProjectIds: assignedProjectIds || [],
  });
  if (profileErr) {
    // Compensación: sin esto queda un usuario de Auth sin perfil, que puede
    // iniciar sesión pero no tiene tenant ni rol.
    await adminSb.auth.admin.deleteUser(uid);
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId: uid });
}
