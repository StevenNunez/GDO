import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/modules/core/lib/supabase-server';
import { correoPasswordRestablecida } from '@/lib/email-templates';
import { trySendMail } from '@/lib/mailer';

export async function POST(req: NextRequest) {
  const serverSb = await getSupabaseServerClient();
  const { data: { user } } = await serverSb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { data: callerProfile } = await serverSb
    .from('users')
    .select('role, tenantId')
    .eq('id', user.id)
    .single();

  if (!callerProfile || !['admin', 'super-admin', 'soporte'].includes(callerProfile.role)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const { targetUserId, newPassword } = await req.json();

  if (!targetUserId || !newPassword) {
    return NextResponse.json({ error: 'Faltan campos requeridos.' }, { status: 400 });
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, { status: 400 });
  }

  // Verify target user belongs to the same tenant (unless super-admin)
  if (callerProfile.role !== 'super-admin') {
    const { data: targetProfile } = await serverSb
      .from('users')
      .select('tenantId')
      .eq('id', targetUserId)
      .single();

    if (!targetProfile || targetProfile.tenantId !== callerProfile.tenantId) {
      return NextResponse.json({ error: 'No autorizado para modificar este usuario.' }, { status: 403 });
    }
  }

  const adminSb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await adminSb.auth.admin.updateUserById(targetUserId, { password: newPassword });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /* ── Avisarle a la persona ────────────────────────────────────────────
     Sin este correo se entera cuando ya no puede entrar. La contraseña ya
     está cambiada: si el correo falla, no se deshace nada — se avisa para
     que el administrador se la pase a mano. ──────────────────────────── */
  const { data: destinatario } = await adminSb
    .from('users').select('name, email, "tenantId"').eq('id', targetUserId).single();

  let envio: { ok: boolean; error?: string } = {
    ok: false, error: 'No se encontró el correo del usuario.',
  };
  if (destinatario?.email) {
    const { data: empresa } = await adminSb
      .from('tenants').select('name').eq('id', destinatario.tenantId).single();

    const correo = correoPasswordRestablecida({
      nombre: destinatario.name ?? 'Hola',
      email: destinatario.email,
      password: newPassword,
      empresa: empresa?.name ?? 'tu empresa',
    });

    envio = await trySendMail({
      to: destinatario.email,
      subject: correo.subject,
      text: correo.text,
      html: correo.html,
    });
  }

  return NextResponse.json({
    success: true,
    emailSent: envio.ok,
    ...(envio.ok ? {} : {
      warning: `La contraseña se cambió, pero no se pudo avisar por correo (${envio.error}). Pásasela tú.`,
    }),
  });
}
