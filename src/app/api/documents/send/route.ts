/**
 * Envía cualquier documento de la app por correo.
 *
 * Es genérico a propósito: el PDF ya lo sabe generar el navegador (todos los
 * generadores usan jsPDF), así que el servidor no necesita conocer el
 * documento — solo lo adjunta. Con eso, agregar «enviar por correo» a una
 * pantalla nueva es enchufar un componente, no escribir otra ruta.
 *
 * POR QUÉ PASA POR EL SERVIDOR
 *   Las credenciales SMTP no pueden salir de acá. Y el remitente es la casilla
 *   de la plataforma: si esto se pudiera llamar sin control, sería un relay de
 *   spam con nuestro dominio, y el dominio se quema para todos los clientes.
 *   De ahí el rate-limit y la verificación de sesión.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { faltaConfigurarMailer, mailerConfigurado, sendMail } from '@/lib/mailer';

/** Tope por usuario. Suficiente para un día de trabajo, no para una campaña. */
const LIMITE = 30;
const VENTANA_MS = 60 * 60 * 1000; // 1 hora

/** 8 MB en base64 ≈ 6 MB de PDF. Más que eso lo rebota el correo del que recibe. */
const MAX_BASE64 = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!mailerConfigurado()) {
    return NextResponse.json({
      error: 'El envío de correo no está configurado en el servidor. '
        + `Falta definir: ${faltaConfigurarMailer().join(', ')}. `
        + 'Mientras tanto puedes descargar el documento y enviarlo tú.',
    }, { status: 503 });
  }

  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const adminSb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: { user: caller }, error: authErr } = await adminSb.auth.getUser(token);
  if (authErr || !caller) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const { data: perfil } = await adminSb
    .from('users').select('name, email, "tenantId"').eq('id', caller.id).single();
  if (!perfil) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  // El límite va por usuario Y por IP: por usuario para que una cuenta
  // comprometida no dispare sin freno, por IP para que crear cuentas nuevas no
  // sea la forma de saltárselo.
  const porUsuario = rateLimit(`docmail:u:${caller.id}`, LIMITE, VENTANA_MS);
  const porIp = rateLimit(`docmail:ip:${getClientIp(req)}`, LIMITE * 2, VENTANA_MS);
  if (!porUsuario.allowed || !porIp.allowed) {
    const espera = Math.max(porUsuario.retryAfterSeconds, porIp.retryAfterSeconds);
    return NextResponse.json({
      error: `Enviaste demasiados documentos seguidos. Vuelve a intentar en ${Math.ceil(espera / 60)} minuto(s).`,
    }, { status: 429 });
  }

  const { to, cc, subject, message, fileName, pdfBase64 } = await req.json();

  const destinatarios = normalizarCorreos(to);
  if (destinatarios.length === 0) {
    return NextResponse.json(
      { error: 'Falta a quién enviarle el documento.' },
      { status: 400 },
    );
  }
  const invalido = destinatarios.find((d) => !esCorreoValido(d));
  if (invalido) {
    return NextResponse.json(
      { error: `«${invalido}» no parece un correo válido.` },
      { status: 400 },
    );
  }

  if (!subject?.trim()) {
    return NextResponse.json({ error: 'El correo necesita un asunto.' }, { status: 400 });
  }
  if (!pdfBase64 || !fileName) {
    return NextResponse.json({ error: 'Falta el documento a adjuntar.' }, { status: 400 });
  }
  if (pdfBase64.length > MAX_BASE64) {
    return NextResponse.json({
      error: 'El documento pesa demasiado para enviarlo por correo. Descárgalo y compártelo por otro medio.',
    }, { status: 413 });
  }

  const { data: empresa } = await adminSb
    .from('tenants').select('name').eq('id', perfil.tenantId).single();

  const cuerpo = [
    message?.trim() || 'Adjuntamos el documento solicitado.',
    '',
    '—',
    // Quien recibe tiene que poder responderle a una persona, no a una casilla
    // de sistema que nadie lee.
    [perfil.name, empresa?.name].filter(Boolean).join(' · '),
    perfil.email ? `Responder a: ${perfil.email}` : '',
  ].filter(Boolean).join('\n');

  try {
    await sendMail({
      to: destinatarios.join(', '),
      subject: subject.trim(),
      text: cuerpo,
      attachments: [{
        filename: String(fileName).endsWith('.pdf') ? fileName : `${fileName}.pdf`,
        content: pdfBase64,
      }],
      ...(normalizarCorreos(cc).length > 0
        ? { cc: normalizarCorreos(cc).join(', ') }
        : {}),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `No se pudo enviar: ${e.message}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, sentTo: destinatarios });
}

/** Acepta "a@b.cl, c@d.cl" o un arreglo, y limpia vacíos y repetidos. */
function normalizarCorreos(v: unknown): string[] {
  const bruto = Array.isArray(v) ? v : String(v ?? '').split(/[,;]/);
  const limpios = bruto.map((s) => String(s).trim()).filter(Boolean);
  return [...new Set(limpios)];
}

function esCorreoValido(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}
