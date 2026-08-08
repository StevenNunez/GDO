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
  subject: string;
  /** Cuerpo en texto plano. Se envía también como HTML simple. */
  text: string;
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
    subject: mail.subject,
    text: mail.text,
    html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapar(mail.text)}</pre>`,
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
