/**
 * Plantillas de los correos que manda la app.
 *
 * Son funciones puras (arman texto, no envían) para poder testearlas y para
 * que el contenido no quede escondido dentro de un route handler.
 *
 * REGLAS DE ESTOS CORREOS
 *  1. **Cada correo dice para qué llegó en la primera línea.** Un correo
 *     transaccional que empieza con «Estimado usuario» y explica en el tercer
 *     párrafo qué hay que hacer, no se lee.
 *  2. **Van en texto plano + HTML simple.** Nada de imágenes remotas ni CSS
 *     externo: los clientes de correo los bloquean y el correo llega roto o se
 *     va a spam.
 *  3. **Nunca se pone en copia a nadie que no sea el destinatario.** Estos
 *     correos llevan credenciales.
 */

import { SITE_URL } from '@/lib/site-url';

export interface CorreoArmado {
  subject: string;
  text: string;
  html: string;
}

/* ── Envoltura HTML ────────────────────────────────────────────────────── */

/**
 * HTML mínimo y con estilos en línea. Gmail y Outlook descartan las hojas de
 * estilo, así que todo va inline o no se ve.
 */
function envolver(titulo: string, cuerpo: string, pie?: string): string {
  return `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2933">
  <div style="border-bottom:3px solid #003F66;padding-bottom:12px;margin-bottom:20px">
    <span style="font-size:18px;font-weight:700;color:#003F66">Gestión de Obras</span>
  </div>
  <h1 style="font-size:18px;margin:0 0 16px;color:#003F66">${escapar(titulo)}</h1>
  ${cuerpo}
  <p style="margin-top:28px;padding-top:16px;border-top:1px solid #e4e7eb;font-size:12px;color:#7b8794">
    ${pie ?? 'Este correo se envió automáticamente desde Gestión de Obras. Si no esperabas recibirlo, puedes ignorarlo.'}
  </p>
</div>`.trim();
}

function boton(texto: string, url: string): string {
  return `<p style="margin:24px 0">
  <a href="${url}" style="background:#003F66;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;display:inline-block">${escapar(texto)}</a>
</p>
<p style="font-size:12px;color:#7b8794">Si el botón no funciona, copia esta dirección en tu navegador:<br>${url}</p>`;
}

function escapar(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parrafo(s: string): string {
  return `<p style="margin:0 0 12px;line-height:1.55">${escapar(s)}</p>`;
}

/* ── Bienvenida: alguien creó su empresa en la app ─────────────────────── */

/**
 * Se manda cuando una empresa se registra sola. No lleva credenciales: la
 * persona acaba de elegir su contraseña, así que repetírsela por correo sería
 * exponerla sin ninguna ganancia.
 */
export function correoBienvenida(datos: {
  nombre: string;
  empresa: string;
  plan?: string | null;
}): CorreoArmado {
  const url = `${SITE_URL}/dashboard`;

  const lineas = [
    `Hola ${datos.nombre}:`,
    '',
    `Tu cuenta de ${datos.empresa} ya está creada y lista para usar.`,
    '',
    'Para partir, lo más rápido es:',
    '  1. Crear tu primera obra.',
    '  2. Cargar el contrato y su presupuesto.',
    '  3. Invitar a tu equipo desde Usuarios.',
    '',
    `Entra en: ${url}`,
    '',
    'Cualquier duda, responde este correo.',
  ];

  const html = envolver(
    `Bienvenido a Gestión de Obras, ${datos.nombre}`,
    [
      parrafo(`Tu cuenta de ${datos.empresa} ya está creada y lista para usar.`),
      parrafo('Para partir, lo más rápido es:'),
      `<ol style="margin:0 0 12px;padding-left:20px;line-height:1.7">
        <li>Crear tu primera obra.</li>
        <li>Cargar el contrato y su presupuesto.</li>
        <li>Invitar a tu equipo desde Usuarios.</li>
      </ol>`,
      boton('Entrar a la plataforma', url),
      parrafo('Cualquier duda, responde este correo.'),
    ].join('\n'),
  );

  return {
    subject: `Bienvenido a Gestión de Obras · ${datos.empresa}`,
    text: lineas.join('\n'),
    html,
  };
}

/* ── Invitación: el administrador creó una cuenta para alguien ─────────── */

/**
 * Se manda cuando un administrador crea la cuenta de otra persona. **Sí lleva
 * la contraseña**, porque el administrador la eligió y de otro modo se la
 * mandaría por WhatsApp — que es peor. Lo que sí hace el correo es decirle a la
 * persona, en grande, que la cambie al entrar.
 *
 * (Si algún día se quiere evitar la contraseña en el correo, el camino es un
 * enlace de un solo uso para que la persona la fije ella. Es más trabajo y
 * depende de la configuración de correo de Supabase; queda anotado, no hecho.)
 */
export function correoInvitacion(datos: {
  nombre: string;
  email: string;
  password: string;
  empresa: string;
  rolLabel: string;
  invitadoPor?: string | null;
}): CorreoArmado {
  const url = `${SITE_URL}/login`;
  const quien = datos.invitadoPor ? ` por ${datos.invitadoPor}` : '';

  const lineas = [
    `Hola ${datos.nombre}:`,
    '',
    `Te crearon una cuenta${quien} en Gestión de Obras para trabajar en ${datos.empresa}.`,
    `Tu rol es: ${datos.rolLabel}.`,
    '',
    'Estos son tus datos para entrar:',
    `  Correo:     ${datos.email}`,
    `  Contraseña: ${datos.password}`,
    '',
    'IMPORTANTE: cambia esa contraseña la primera vez que entres, en Mi Perfil.',
    '',
    `Entra en: ${url}`,
  ];

  const html = envolver(
    `Te invitaron a Gestión de Obras`,
    [
      parrafo(`Hola ${datos.nombre}: te crearon una cuenta${quien} para trabajar en ${datos.empresa}.`),
      parrafo(`Tu rol es: ${datos.rolLabel}.`),
      `<div style="background:#f5f7fa;border:1px solid #e4e7eb;border-radius:8px;padding:16px;margin:16px 0">
        <div style="font-size:12px;color:#7b8794;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Tus datos para entrar</div>
        <div style="margin-bottom:6px"><strong>Correo:</strong> ${escapar(datos.email)}</div>
        <div><strong>Contraseña:</strong> <code style="background:#fff;border:1px solid #e4e7eb;border-radius:4px;padding:2px 6px">${escapar(datos.password)}</code></div>
      </div>`,
      `<p style="margin:0 0 12px;padding:12px;background:#FFF6E5;border-left:3px solid #FFB915;line-height:1.55">
        <strong>Cambia esa contraseña la primera vez que entres</strong>, desde Mi Perfil. Mientras no lo hagas, la conoce también quien te creó la cuenta.
      </p>`,
      boton('Entrar a la plataforma', url),
    ].join('\n'),
    'Si no esperabas esta invitación, avísale a quien te la envió y no uses la contraseña.',
  );

  return {
    subject: `Tu acceso a Gestión de Obras · ${datos.empresa}`,
    text: lineas.join('\n'),
    html,
  };
}

/* ── Aviso de contraseña restablecida ──────────────────────────────────── */

/**
 * Cuando un administrador le restablece la contraseña a alguien. Sin este
 * correo, la persona se entera cuando ya no puede entrar.
 */
export function correoPasswordRestablecida(datos: {
  nombre: string;
  email: string;
  password: string;
  empresa: string;
}): CorreoArmado {
  const url = `${SITE_URL}/login`;

  const lineas = [
    `Hola ${datos.nombre}:`,
    '',
    `Se restableció la contraseña de tu cuenta en Gestión de Obras (${datos.empresa}).`,
    '',
    `  Correo:            ${datos.email}`,
    `  Contraseña nueva:  ${datos.password}`,
    '',
    'Cámbiala apenas entres, en Mi Perfil.',
    '',
    `Entra en: ${url}`,
  ];

  const html = envolver(
    'Se restableció tu contraseña',
    [
      parrafo(`Hola ${datos.nombre}: se restableció la contraseña de tu cuenta en ${datos.empresa}.`),
      `<div style="background:#f5f7fa;border:1px solid #e4e7eb;border-radius:8px;padding:16px;margin:16px 0">
        <div style="margin-bottom:6px"><strong>Correo:</strong> ${escapar(datos.email)}</div>
        <div><strong>Contraseña nueva:</strong> <code style="background:#fff;border:1px solid #e4e7eb;border-radius:4px;padding:2px 6px">${escapar(datos.password)}</code></div>
      </div>`,
      parrafo('Cámbiala apenas entres, en Mi Perfil.'),
      boton('Entrar a la plataforma', url),
    ].join('\n'),
    'Si no pediste este cambio, avísale de inmediato al administrador de tu empresa.',
  );

  return {
    subject: 'Tu contraseña de Gestión de Obras fue restablecida',
    text: lineas.join('\n'),
    html,
  };
}
