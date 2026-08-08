/**
 * Envía la Orden de Pago al correo del contratista (opción 1 de la pizarra).
 *
 * Va por route handler y no desde el navegador por tres razones que no son
 * negociables: las credenciales SMTP no pueden salir del servidor, el permiso
 * hay que verificarlo contra la base y no contra lo que diga el cliente, y el
 * `sentAt` tiene que escribirlo quien realmente mandó el correo.
 *
 * El PDF llega ya generado desde el cliente (el generador usa jsPDF, que es de
 * navegador). El servidor no lo interpreta: solo lo adjunta.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { faltaConfigurarMailer, mailerConfigurado, sendMail } from '@/lib/mailer';

export async function POST(req: NextRequest) {
  if (!mailerConfigurado()) {
    return NextResponse.json({
      error: 'El envío de correo no está configurado en el servidor. '
        + `Falta definir: ${faltaConfigurarMailer().join(', ')}. `
        + 'Mientras tanto puedes descargar la orden y enviarla tú.',
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
    .from('users').select('role, "tenantId", name').eq('id', caller.id).single();
  if (!perfil) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const { orderId, pdfBase64, mensaje } = await req.json();
  if (!orderId || !pdfBase64) {
    return NextResponse.json({ error: 'Falta la orden o el documento.' }, { status: 400 });
  }

  const { data: order, error: orderErr } = await adminSb
    .from('paymentOrders').select('*').eq('id', orderId).single();
  if (orderErr || !order) {
    return NextResponse.json({ error: 'La orden de pago no existe.' }, { status: 404 });
  }

  // La orden tiene que ser de la empresa de quien pide. Sin esto, un usuario
  // podría mandar por correo la orden de otra compañía con solo saber su id.
  if (perfil.role !== 'super-admin' && order.tenantId !== perfil.tenantId) {
    return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 });
  }

  if (order.status === 'anulada') {
    return NextResponse.json({ error: 'Esta orden está anulada.' }, { status: 400 });
  }

  const destino = (order.email ?? '').trim();
  if (!destino) {
    return NextResponse.json({
      error: 'El contratista no tiene correo registrado. Cárgalo en su ficha y vuelve a intentar.',
    }, { status: 400 });
  }

  const { data: empresa } = await adminSb
    .from('tenants').select('name').eq('id', order.tenantId).single();

  const cuerpo = [
    `Estimados ${order.supplierName}:`,
    '',
    mensaje?.trim()
      || `Adjuntamos la Orden de Pago N° ${order.number} correspondiente a su estado de pago.`,
    '',
    `Monto: ${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(order.amount)}`,
    order.dueDate ? `Fecha de pago: ${order.dueDate}` : '',
    '',
    'Saludos cordiales,',
    empresa?.name ?? '',
  ].filter(Boolean).join('\n');

  try {
    await sendMail({
      to: destino,
      subject: `Orden de Pago N° ${order.number}${empresa?.name ? ` · ${empresa.name}` : ''}`,
      text: cuerpo,
      attachments: [{
        filename: `OP-${String(order.number).padStart(4, '0')}.pdf`,
        content: pdfBase64,
      }],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `No se pudo enviar el correo: ${e.message}` },
      { status: 502 },
    );
  }

  // El `sentAt` lo escribe quien mandó el correo de verdad, no el navegador.
  // Si el correo salió pero esto falla, la orden queda como no enviada: es el
  // error menos malo — reenviarla molesta, creer que se envió deja al
  // contratista esperando.
  const { error: updErr } = await adminSb.from('paymentOrders').update({
    status: order.status === 'pagada' ? 'pagada' : 'enviada',
    sentAt: new Date().toISOString(),
    sentTo: destino,
  }).eq('id', orderId);

  if (updErr) {
    return NextResponse.json({
      ok: true,
      warning: 'El correo se envió, pero no se pudo registrar el envío en la orden.',
      sentTo: destino,
    });
  }

  return NextResponse.json({ ok: true, sentTo: destino });
}
