import 'server-only';

/**
 * Envío de correo por SMTP genérico.
 *
 * POR QUÉ SMTP Y NO UN PROVEEDOR CONCRETO
 *   SendGrid, Mailgun, Brevo, Zoho y el correo corporativo de cualquier empresa
 *   hablan SMTP. Atarse a la API de uno solo obligaría a reescribir esto el día
 *   que la empresa cambie de proveedor —o a mantener una integración por
 *   cliente—, y no aporta nada a cambio para el volumen de esta app.
 *
 * FALLA CERRADO Y EN CRISTIANO
 *   Sin configuración no intenta enviar ni finge que envió: devuelve un error
 *   que dice qué variable falta. Un "enviado" mentiroso es peor que no enviar,
 *   porque nadie vuelve a revisar.
 *
 * Variables de entorno (todas del servidor, nunca `NEXT_PUBLIC_`):
 *   SMTP_HOST      · smtp.sendgrid.net, smtp.mailgun.org, smtp.tuempresa.cl…
 *   SMTP_PORT      · 587 (STARTTLS, lo habitual) o 465 (SSL)
 *   SMTP_USER      · usuario. En SendGrid es literalmente «apikey»
 *   SMTP_PASS      · contraseña o API key
 *   SMTP_FROM      · remitente: "Constructora <no-reply@tuempresa.cl>"
 *   SMTP_SECURE    · 'true' solo si usas el puerto 465
 */

import nodemailer from 'nodemailer';

export interface MailAttachment {
  filename: string;
  /** Contenido en base64 (sin el prefijo `data:`). */
  content: string;
  contentType?: string;
}

export interface MailInput {
  to: string;
  /** Copia. Ojo: quienes van en copia se ven entre sí. */
  cc?: string;
  subject: string;
  /** Cuerpo en texto plano. Siempre va: hay clientes que no muestran HTML. */
  text: string;
  /** HTML propio. Sin él se arma uno mínimo a partir del texto. */
  html?: string;
  attachments?: MailAttachment[];
}

export function mailerConfigurado(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER
    && process.env.SMTP_PASS && process.env.SMTP_FROM,
  );
}

/** Qué falta configurar, para poder decirlo en pantalla. */
export function faltaConfigurarMailer(): string[] {
  const faltan: string[] = [];
  for (const v of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']) {
    if (!process.env[v]) faltan.push(v);
  }
  return faltan;
}

/**
 * Envía sin dejar que un fallo de correo tumbe la operación que lo disparó.
 *
 * Crear un usuario y que falle el correo NO puede deshacer el usuario: el
 * administrador ya lo creó y la persona ya existe. Devuelve el error para
 * poder avisarlo en pantalla, en vez de tirarlo.
 */
export async function trySendMail(mail: MailInput): Promise<{ ok: boolean; error?: string }> {
  if (!mailerConfigurado()) {
    return {
      ok: false,
      error: `El envío de correo no está configurado (falta ${faltaConfigurarMailer().join(', ')}).`,
    };
  }
  try {
    await sendMail(mail);
    return { ok: true };
  } catch (e: any) {
    // Se registra en el servidor: si nadie mira la respuesta, al menos queda
    // el rastro de por qué no llegó el correo.
    console.error('[mailer] no se pudo enviar:', e?.message ?? e);
    return { ok: false, error: e?.message ?? 'No se pudo enviar el correo.' };
  }
}

export async function sendMail(mail: MailInput): Promise<void> {
  if (!mailerConfigurado()) {
    throw new Error(
      `El envío de correo no está configurado. Falta: ${faltaConfigurarMailer().join(', ')}.`,
    );
  }

  const puerto = Number(process.env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: puerto,
    // 465 va con SSL directo; 587 negocia STARTTLS. Deducirlo del puerto evita
    // el error de configuración más común, sin quitar la opción de forzarlo.
    secure: process.env.SMTP_SECURE === 'true' || puerto === 465,
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: mail.to,
    ...(mail.cc ? { cc: mail.cc } : {}),
    subject: mail.subject,
    text: mail.text,
    html: mail.html
      ?? `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapar(mail.text)}</pre>`,
    attachments: mail.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content, 'base64'),
      contentType: a.contentType ?? 'application/pdf',
    })),
  });
}

function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
