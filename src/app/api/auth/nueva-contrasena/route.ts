/**
 * Canjea el enlace de «elegir contraseña» y guarda la contraseña nueva.
 *
 * Se hace en el servidor y en UN solo paso (verificar el token + cambiar la
 * clave) por dos razones:
 *  - El token se gasta al verificarse. Si la página lo verificara al abrirse,
 *    los antivirus y las vistas previas de correo que «visitan» los enlaces lo
 *    consumirían antes que la persona. Acá solo se gasta al enviar el formulario.
 *  - Así no depende de cookies ni de la configuración de redirección de Supabase.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

const PASSWORD_MIN = 8;
const VENCIDO = 'Este enlace ya no sirve (venció o ya se usó). Pide uno nuevo desde «¿Olvidaste tu contraseña?».';

export async function POST(req: NextRequest) {
  const limite = rateLimit(`nueva-clave:${getClientIp(req)}`, 10, 10 * 60 * 1000);
  if (!limite.allowed) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Vuelve a intentar en unos minutos.' },
      { status: 429, headers: { 'Retry-After': String(limite.retryAfterSeconds) } },
    );
  }

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!token || token.length > 512) {
    return NextResponse.json({ error: VENCIDO }, { status: 400 });
  }
  if (password.length < PASSWORD_MIN) {
    return NextResponse.json(
      { error: `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.` },
      { status: 400 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const sinSesion = { auth: { autoRefreshToken: false, persistSession: false } };

  // 1) Verificar el token (con la clave pública: el token es la prueba).
  const publico = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, sinSesion);
  const { data: verificado, error: errToken } = await publico.auth.verifyOtp({
    token_hash: token,
    type: 'recovery',
  });
  const usuario = verificado?.user;
  if (errToken || !usuario?.email) {
    return NextResponse.json({ error: VENCIDO }, { status: 400 });
  }

  // 2) Guardar la contraseña nueva.
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, sinSesion);
  const { error: errClave } = await admin.auth.admin.updateUserById(usuario.id, { password });
  if (errClave) {
    return NextResponse.json({ error: errClave.message }, { status: 400 });
  }

  // El correo vuelve para que la pantalla pueda iniciar sesión sola.
  return NextResponse.json({ ok: true, email: usuario.email });
}
