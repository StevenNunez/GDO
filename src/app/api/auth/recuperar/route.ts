/**
 * «Olvidé mi contraseña»: manda un enlace de un solo uso por NUESTRO correo.
 *
 * Por qué no el correo de Supabase: su plantilla es genérica, tiene un límite de
 * envíos muy bajo y el enlace depende del «Site URL» configurado allá (si
 * quedó en localhost, la persona aterriza en localhost). Acá el correo sale con
 * la marca, desde la casilla de la plataforma, y el enlace apunta siempre a
 * nuestro dominio.
 *
 * Responde SIEMPRE lo mismo, exista o no el correo: si dijera «ese correo no
 * existe», cualquiera podría averiguar quién tiene cuenta.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { correoRecuperacion } from '@/lib/email-templates';
import { trySendMail } from '@/lib/mailer';
import { crearEnlaceClave } from '@/lib/password-link';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESPUESTA = { ok: true, message: 'Si el correo tiene una cuenta, te enviamos un enlace para elegir una contraseña nueva.' };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Ingresa un correo válido.' }, { status: 400 });
  }

  // Freno por IP y por correo: sin él, esta ruta sirve para llenarle la bandeja
  // a cualquiera o para gastar el cupo de envío de la plataforma.
  const porIp = rateLimit(`recuperar:ip:${getClientIp(req)}`, 8, 10 * 60 * 1000);
  const porCorreo = rateLimit(`recuperar:mail:${email}`, 3, 60 * 60 * 1000);
  if (!porIp.allowed || !porCorreo.allowed) {
    const espera = Math.max(porIp.retryAfterSeconds, porCorreo.retryAfterSeconds);
    return NextResponse.json(
      { error: 'Demasiados intentos. Vuelve a intentar en unos minutos.' },
      { status: 429, headers: { 'Retry-After': String(espera) } },
    );
  }

  const adminSb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Si no existe, `crearEnlaceClave` devuelve null y no se manda nada; la
  // respuesta es idéntica en ambos casos.
  const enlace = await crearEnlaceClave(adminSb, email);
  if (enlace) {
    const correo = correoRecuperacion({ enlace });
    await trySendMail({ to: email, subject: correo.subject, text: correo.text, html: correo.html });
  }

  return NextResponse.json(RESPUESTA);
}
