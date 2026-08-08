/**
 * Mutaciones del flujo de aprobación (migración 029).
 *
 * Dos mundos distintos conviven acá:
 *
 * - **La plantilla** (flujos y pasos) se escribe directo, como cualquier
 *   catálogo. La protege la RLS con `approvals:configure`.
 * - **El trámite** avanza SOLO por el RPC `approval_act`. Firmar es registrar
 *   la acción, mover el paso y —si era el último— cerrar el documento: tres
 *   cosas que tienen que pasar juntas. Desde el navegador serían tres viajes,
 *   y el segundo puede no llegar nunca.
 */

import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { congelarPasos, validarDelegacion } from '@/lib/approval';
import type {
  ApprovalDelegation, ApprovalDocumentType, ApprovalFlow, ApprovalFlowStep,
} from '@/modules/core/lib/data';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId?: string | null;
  db?: any;
};

/* ── Plantilla: flujos ─────────────────────────────────────────────────── */

export async function addApprovalFlow(
  data: Partial<ApprovalFlow>,
  { user, tenantId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.documentType) throw new Error('Falta indicar a qué documento aplica el flujo.');

  const sb = getSupabaseBrowserClient();
  const { data: row, error } = await sb.from('approvalFlows').insert({
    active: true,
    ...data,
    createdBy: user?.id ?? null,
    tenantId,
  }).select('id').single();

  if (error) throw new Error(traducir(error.message));
  return row.id as string;
}

export async function updateApprovalFlow(
  id: string,
  data: Partial<ApprovalFlow>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('approvalFlows').update(data).eq('id', id);
  if (error) throw new Error(traducir(error.message));
}

/** Borra el flujo y, en cascada, sus pasos. Los trámites ya abiertos siguen
 *  su curso: se rigen por la fotografía, no por la plantilla. */
export async function deleteApprovalFlow(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('approvalFlows').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Plantilla: pasos ──────────────────────────────────────────────────── */

export async function addApprovalFlowStep(
  data: Partial<ApprovalFlowStep>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.flowId) throw new Error('El paso debe pertenecer a un flujo.');
  if (!data.approverRole && !data.approverUserId) {
    throw new Error('El paso necesita un aprobador: sin él, el documento queda trabado.');
  }

  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('approvalFlowSteps').insert({
    sortOrder: 0,
    requiresSignature: true,
    ...data,
    tenantId,
  });
  if (error) throw new Error(error.message);
}

export async function updateApprovalFlowStep(
  id: string,
  data: Partial<ApprovalFlowStep>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('approvalFlowSteps').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteApprovalFlowStep(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('approvalFlowSteps').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Reordena la cadena completa de una vez, después de arrastrar un paso. */
export async function reorderApprovalFlowSteps(
  idsEnOrden: string[],
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  for (let i = 0; i < idsEnOrden.length; i++) {
    const { error } = await sb.from('approvalFlowSteps')
      .update({ sortOrder: i }).eq('id', idsEnOrden[i]);
    if (error) throw new Error(error.message);
  }
}

/* ── Trámite ───────────────────────────────────────────────────────────── */

/**
 * Presenta un documento a aprobación.
 *
 * Congela los pasos del flujo activo de la empresa. Si no hay flujo
 * configurado, no inventa uno: devuelve `null` y quien llama sigue con el
 * comportamiento de siempre (aprobación directa). Así la migración no rompe a
 * las empresas que todavía no configuraron nada.
 */
export async function submitForApproval(
  data: {
    documentType: ApprovalDocumentType;
    documentId: string;
    projectId?: string | null;
    /** Huella del documento al presentarlo (ver `huellaDocumento`). */
    documentHash?: string | null;
  },
  { user, tenantId, projectId }: Context,
): Promise<string | null> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();

  const { data: flujos, error: flowErr } = await sb
    .from('approvalFlows').select('id')
    .eq('tenantId', tenantId)
    .eq('documentType', data.documentType)
    .eq('active', true)
    .limit(1);
  if (flowErr) throw new Error(flowErr.message);

  const flowId = flujos?.[0]?.id as string | undefined;
  if (!flowId) return null;

  const { data: pasos, error: stepsErr } = await sb
    .from('approvalFlowSteps').select('*')
    .eq('flowId', flowId)
    .order('sortOrder', { ascending: true });
  if (stepsErr) throw new Error(stepsErr.message);

  const snapshot = congelarPasos((pasos ?? []) as ApprovalFlowStep[]);
  if (snapshot.length === 0) {
    throw new Error(
      'El flujo de aprobación configurado no tiene pasos. Agrégalos en Oficina Técnica → Flujos de aprobación.',
    );
  }

  const { data: row, error } = await sb.from('approvalRequests').insert({
    tenantId,
    documentType: data.documentType,
    documentId: data.documentId,
    projectId: data.projectId ?? projectId ?? null,
    flowId,
    stepsSnapshot: snapshot,
    status: 'pendiente',
    currentStep: 0,
    documentHash: data.documentHash ?? null,
    submittedBy: user?.id ?? null,
  }).select('id').single();

  if (error) throw new Error(traducir(error.message));
  return row.id as string;
}

/**
 * Firma o rechaza el paso en curso. Quién puede hacerlo lo decide la base:
 * acá no se repite la regla, solo se traduce el error que devuelve.
 */
export async function actOnApproval(
  data: {
    requestId: string;
    action: 'aprobado' | 'rechazado';
    /** Obligatorio al rechazar. */
    comment?: string | null;
    signature?: string | null;
    documentHash?: string | null;
  },
  { tenantId }: Context,
): Promise<{ status: string; currentStep: number; totalSteps: number }> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (data.action === 'rechazado' && !data.comment?.trim()) {
    throw new Error('Para rechazar hay que indicar el motivo.');
  }

  const sb = getSupabaseBrowserClient();
  const { data: result, error } = await sb.rpc('approval_act', {
    p_request_id: data.requestId,
    p_action: data.action,
    p_comment: data.comment ?? null,
    p_signature: data.signature ?? null,
    p_document_hash: data.documentHash ?? null,
  });

  if (error) throw new Error(traducir(error.message));
  return result as { status: string; currentStep: number; totalSteps: number };
}

/**
 * Retira el documento del trámite. Lo usa quien lo presentó cuando se dio
 * cuenta de un error antes de que le firmaran: deja el historial visible en
 * vez de borrar el intento.
 */
export async function cancelApprovalRequest(
  id: string,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('approvalRequests')
    .update({ status: 'anulado', closedAt: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pendiente');
  if (error) throw new Error(error.message);
}

/* ── Delegación de firma (migración 030) ───────────────────────────────── */

/**
 * Delega la propia firma en otra persona, por un período con fecha de término.
 *
 * `fromUserId` se fija acá con el usuario de la sesión y NO se acepta del
 * formulario: delegar en nombre de un tercero sería asignarse su firma. La RLS
 * lo exige igual, esto es para que el error salga antes y con nombre.
 */
export async function addApprovalDelegation(
  data: Partial<ApprovalDelegation>,
  { user, tenantId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!user?.id) throw new Error('Sesión no válida.');

  const errores = validarDelegacion({
    fromUserId: user.id,
    toUserId: data.toUserId ?? '',
    startDate: data.startDate as Date,
    endDate: data.endDate as Date,
  });
  if (errores.length > 0) throw new Error(errores[0]);

  const sb = getSupabaseBrowserClient();
  const { data: row, error } = await sb.from('approvalDelegations').insert({
    active: true,
    documentType: null,
    ...data,
    fromUserId: user.id,
    createdBy: user.id,
    tenantId,
  }).select('id').single();

  if (error) throw new Error(traducir(error.message));
  return row.id as string;
}

/** Corta o reactiva una delegación. Cortarla surte efecto en el acto. */
export async function updateApprovalDelegation(
  id: string,
  data: Partial<ApprovalDelegation>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  // `fromUserId` nunca se reasigna: cambiaría de quién es la firma delegada.
  const { fromUserId: _ignorado, ...resto } = data;
  const { error } = await sb.from('approvalDelegations').update(resto).eq('id', id);
  if (error) throw new Error(traducir(error.message));
}

export async function deleteApprovalDelegation(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('approvalDelegations').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Mensajes ──────────────────────────────────────────────────────────── */

/** Los errores de Postgres son ilegibles para quien está usando la app. */
function traducir(mensaje: string): string {
  if (mensaje.includes('approval_requests_open_uniq')) {
    return 'Este documento ya está en trámite de aprobación.';
  }
  if (mensaje.includes('approval_flows_active_uniq')) {
    return 'Ya hay un flujo activo para este tipo de documento. Desactiva el otro primero.';
  }
  if (mensaje.includes('approval_rejection_needs_reason')) {
    return 'Para rechazar hay que indicar el motivo.';
  }
  if (mensaje.includes('approval_step_has_approver')) {
    return 'El paso necesita un aprobador: sin él, el documento queda trabado.';
  }
  if (mensaje.includes('approval_delegation_distinct')) {
    return 'No puedes delegar tu firma en ti mismo.';
  }
  if (mensaje.includes('approval_delegation_range')) {
    return 'La fecha de término no puede ser anterior a la de inicio.';
  }
  return mensaje;
}
