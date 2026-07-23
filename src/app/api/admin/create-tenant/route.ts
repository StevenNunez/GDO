import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const adminSb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Verify the caller is a super-admin
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const { data: { user: caller }, error: authCheckErr } = await adminSb.auth.getUser(token);
  if (authCheckErr || !caller) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const { data: callerRecord } = await adminSb
    .from('users')
    .select('role')
    .eq('id', caller.id)
    .single();

  if (!callerRecord || callerRecord.role !== 'super-admin') {
    return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 });
  }

  const { tenantName, tenantRut, adminName, adminEmail, adminPassword, plan = 'basic' } = await req.json();

  if (!tenantName || !adminEmail || !adminPassword) {
    return NextResponse.json(
      { error: 'Nombre de empresa, correo y contraseña son requeridos.' },
      { status: 400 }
    );
  }

  const { data: authData, error: authErr } = await adminSb.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  });
  if (authErr) {
    const msg = authErr.message.includes('already registered')
      ? 'Este correo ya tiene una cuenta activa.'
      : authErr.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const uid = authData.user.id;

  const { error: userErr } = await adminSb.from('users').insert({
    id: uid,
    name: adminName || adminEmail.split('@')[0],
    email: adminEmail,
    role: 'admin',
    tenantId: uid,
    qrCode: `USER-${uid}`,
    isDemoUser: false,
  });

  if (userErr) {
    await adminSb.auth.admin.deleteUser(uid);
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }

  const { error: tenantErr } = await adminSb.from('tenants').insert({
    id: uid,
    tenantId: uid,
    name: tenantRut ? `${tenantName} · ${tenantRut}` : tenantName,
    plan,
    createdAt: new Date().toISOString(),
  });

  if (tenantErr) {
    await adminSb.auth.admin.deleteUser(uid);
    return NextResponse.json({ error: tenantErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
