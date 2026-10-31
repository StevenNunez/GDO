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
 * Se manda cuando un administrador crea la cuenta de otra persona. **No lleva
 * contraseña**: lleva un enlace de un solo uso para que la persona elija la
 * suya. Una contraseña en un correo queda guardada en bandejas, copias y
 * reenvíos; un enlace de un solo uso que vence no sirve de nada una vez usado.
 *
 * `enlace` es null si no se pudo generar: el correo igual avisa de la cuenta y
 * explica cómo pedir uno nuevo desde «¿Olvidaste tu contraseña?».
 */
export function correoInvitacion(datos: {
  nombre: string;
  email: string;
  enlace: string | null;
  empresa: string;
  rolLabel: string;
  invitadoPor?: string | null;
}): CorreoArmado {
  const urlLogin = `${SITE_URL}/login`;
  const quien = datos.invitadoPor ? ` por ${datos.invitadoPor}` : '';

  const lineas = [
    `Hola ${datos.nombre}:`,
    '',
    `Te crearon una cuenta${quien} en Gestión de Obras para trabajar en ${datos.empresa}.`,
    `Tu rol es: ${datos.rolLabel}.`,
    `Tu correo de acceso es: ${datos.email}`,
    '',
    ...(datos.enlace
      ? [
        'Crea tu contraseña con este enlace (sirve una sola vez y vence en poco tiempo):',
        datos.enlace,
        '',
        'Si el enlace venció, entra a la página de acceso y usa «¿Olvidaste tu contraseña?».',
      ]
      : [
        'Para crear tu contraseña, entra a la página de acceso y usa «¿Olvidaste tu contraseña?».',
      ]),
    '',
    `Página de acceso: ${urlLogin}`,
  ];

  const html = envolver(
    'Te invitaron a Gestión de Obras',
    [
      parrafo(`Hola ${datos.nombre}: te crearon una cuenta${quien} para trabajar en ${datos.empresa}.`),
      parrafo(`Tu rol es: ${datos.rolLabel}.`),
      parrafo(`Tu correo de acceso es: ${datos.email}`),
      datos.enlace
        ? boton('Crear mi contraseña', datos.enlace)
        : parrafo('Para crear tu contraseña, entra a la página de acceso y usa «¿Olvidaste tu contraseña?».'),
      parrafo('El enlace sirve una sola vez y vence en poco tiempo. Si venció, usa «¿Olvidaste tu contraseña?» en la página de acceso.'),
      `<p style="font-size:13px;color:#52606d">Página de acceso: <a href="${urlLogin}" style="color:#003F66">${urlLogin}</a></p>`,
    ].join('\n'),
    'Si no esperabas esta invitación, avísale a quien te la envió.',
  );

  return {
    subject: `Tu acceso a Gestión de Obras · ${datos.empresa}`,
    text: lineas.join('\n'),
    html,
  };
}

/* ── Contraseña restablecida por un administrador ──────────────────────── */

/**
 * Cuando un administrador le cambia la contraseña a alguien. Sin este correo,
 * la persona se entera cuando ya no puede entrar. No repite la contraseña: si
 * el administrador se la dio, la tiene; y si quiere una propia, usa el enlace.
 */
export function correoPasswordRestablecida(datos: {
  nombre: string;
  email: string;
  enlace: string | null;
  empresa: string;
}): CorreoArmado {
  const urlLogin = `${SITE_URL}/login`;

  const lineas = [
    `Hola ${datos.nombre}:`,
    '',
    `Un administrador cambió la contraseña de tu cuenta en Gestión de Obras (${datos.empresa}).`,
    `Tu correo de acceso es: ${datos.email}`,
    '',
    ...(datos.enlace
      ? [
        'Si prefieres elegir tú tu contraseña, usa este enlace (sirve una sola vez y vence en poco tiempo):',
        datos.enlace,
      ]
      : ['Si prefieres elegir tú tu contraseña, usa «¿Olvidaste tu contraseña?» en la página de acceso.']),
    '',
    `Página de acceso: ${urlLogin}`,
  ];

  const html = envolver(
    'Cambiaron tu contraseña',
    [
      parrafo(`Hola ${datos.nombre}: un administrador cambió la contraseña de tu cuenta en ${datos.empresa}.`),
      parrafo(`Tu correo de acceso es: ${datos.email}`),
      parrafo('Si prefieres elegir tú tu contraseña, puedes hacerlo ahora:'),
      datos.enlace
        ? boton('Elegir mi contraseña', datos.enlace)
        : parrafo('Usa «¿Olvidaste tu contraseña?» en la página de acceso.'),
      `<p style="font-size:13px;color:#52606d">Página de acceso: <a href="${urlLogin}" style="color:#003F66">${urlLogin}</a></p>`,
    ].join('\n'),
    'Si no esperabas este cambio, avísale de inmediato al administrador de tu empresa.',
  );

  return {
    subject: 'Cambiaron tu contraseña de Gestión de Obras',
    text: lineas.join('\n'),
    html,
  };
}

/* ── Recuperación: la persona dijo «olvidé mi contraseña» ──────────────── */

export function correoRecuperacion(datos: { enlace: string }): CorreoArmado {
  const lineas = [
    'Pediste restablecer tu contraseña de Gestión de Obras.',
    '',
    'Elige una nueva con este enlace (sirve una sola vez y vence en poco tiempo):',
    datos.enlace,
    '',
    'Si no fuiste tú, ignora este correo: tu contraseña actual sigue igual.',
  ];

  const html = envolver(
    'Restablece tu contraseña',
    [
      parrafo('Pediste restablecer tu contraseña de Gestión de Obras.'),
      boton('Elegir una contraseña nueva', datos.enlace),
      parrafo('El enlace sirve una sola vez y vence en poco tiempo.'),
    ].join('\n'),
    'Si no fuiste tú, ignora este correo: tu contraseña actual sigue igual.',
  );

  return { subject: 'Restablece tu contraseña · Gestión de Obras', text: lineas.join('\n'), html };
}
