import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { correoBienvenida } from '@/lib/email-templates';
import { trySendMail } from '@/lib/mailer';

const VALID_PLANS = ['basic', 'professional', 'enterprise'];

/**
 * Plan con el que nace toda cuenta nueva. El registro es público y no hay cobro
 * en el flujo, así que el plan NO puede venir del cliente: con un POST directo
 * cualquiera se daría `enterprise` gratis. El super-admin sube el plan después
 * desde Suscripciones. Si algún día hay una prueba gratis de un plan superior,
 * se cambia acá, no en el navegador.
 */
const PLAN_INICIAL = 'basic';

const PASSWORD_MIN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Máximo de registros permitidos por IP dentro de la ventana.
const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MS = 10 * 60 * 1000; // 10 minutos

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limit = rateLimit(`register:${ip}`, REGISTER_LIMIT, REGISTER_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Demasiados intentos de registro. Inténtalo de nuevo en unos minutos.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  const {
    email,
    password,
    plan: planPedido = PLAN_INICIAL,
    isDemo = false,
    companyName,
    companyRut,
    adminName,
  } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email y contraseña son requeridos.' }, { status: 400 });
  }

  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return NextResponse.json({ error: 'Ingresa un correo válido.' }, { status: 400 });
  }

  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return NextResponse.json(
      { error: `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.` },
      { status: 400 }
    );
  }

  // El plan que llega del cliente solo se valida (para rechazar basura); no se
  // respeta: ver PLAN_INICIAL.
  if (!VALID_PLANS.includes(planPedido)) {
    return NextResponse.json({ error: 'Plan inválido.' }, { status: 400 });
  }
  const plan = PLAN_INICIAL;

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
      ? 'Este correo ya tiene una cuenta activa.'
      : authErr.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const uid = authData.user.id;
  const userName = isDemo ? 'Usuario Demo' : (adminName || email.split('@')[0]);

  const { error: userErr } = await adminSb.from('users').insert({
    id: uid,
    name: userName,
    email,
    role: 'admin',
    tenantId: uid,
    qrCode: `USER-${uid}`,
    isDemoUser: isDemo,
  });
  if (userErr) {
    await adminSb.auth.admin.deleteUser(uid);
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }

  let tenantName: string;
  if (isDemo) {
    tenantName = 'Empresa Demo';
  } else if (companyName) {
    tenantName = companyName;
  } else {
    tenantName = `${userName}'s Company`;
  }

  const { error: tenantErr } = await adminSb.from('tenants').insert({
    id: uid,
    tenantId: uid,
    name: tenantName,
    // El RUT tiene su propia columna desde la migración 016; antes se
    // concatenaba al nombre como «Razón Social · RUT».
    rut: isDemo ? null : (companyRut || null),
    plan: isDemo ? 'professional' : plan,
    createdAt: new Date().toISOString(),
  });
  if (tenantErr) {
    // Compensación completa: revertir también la fila `users` insertada arriba,
    // no solo el usuario de Auth, para no dejar un perfil huérfano.
    await adminSb.from('users').delete().eq('id', uid);
    await adminSb.auth.admin.deleteUser(uid);
    return NextResponse.json({ error: tenantErr.message }, { status: 500 });
  }

  /* ── Bienvenida ───────────────────────────────────────────────────────
     No lleva credenciales: la persona acaba de elegir su contraseña, así que
     repetírsela por correo la expondría sin ninguna ganancia. Al usuario demo
     tampoco se le manda: su correo es de mentira. ─────────────────────── */
  if (!isDemo) {
    const correo = correoBienvenida({
      nombre: userName,
      empresa: tenantName,
      plan,
    });
    // El registro NO falla si el correo falla: la cuenta ya está creada y la
    // persona puede entrar igual.
    await trySendMail({
      to: email,
      subject: correo.subject,
      text: correo.text,
      html: correo.html,
    });
  }

  return NextResponse.json({ success: true });
}
