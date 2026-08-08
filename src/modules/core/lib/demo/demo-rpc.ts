/**
 * Equivalentes en JS de las 8 funciones de Postgres que la app llama por `.rpc()`.
 * Replican el efecto de las definiciones SQL de `supabase/migrations/001_...` sobre
 * el store local. Devuelven `{ data, error }` como el cliente real.
 */
import { getRows, insertRows, updateRows, deleteRows } from './demo-store';
import { DEMO_USER_ID } from './demo-seed';

type RpcResult = { data: any; error: { message: string } | null };
const ok = (): RpcResult => ({ data: null, error: null });
const fail = (message: string): RpcResult => ({ data: null, error: { message } });

export function runDemoRpc(name: string, args: Record<string, any>): RpcResult {
  switch (name) {
    case 'add_manual_stock_entry': {
      const mat = getRows('materials').find((m) => m.id === args.p_material_id);
      if (!mat) return fail('Material no encontrado.');
      const newStock = (mat.stock ?? 0) + args.p_quantity;
      updateRows('materials', (m) => m.id === args.p_material_id, { stock: newStock });
      insertRows('stockMovements', [{
        materialId: args.p_material_id,
        materialName: mat.name,
        quantityChange: args.p_quantity,
        newStock,
        type: 'manual-entry',
        date: new Date().toISOString(),
        justification: args.p_justification,
        userId: args.p_user_id,
        userName: args.p_user_name,
        tenantId: args.p_tenant_id,
        projectId: args.p_project_id ?? null,
      }]);
      return ok();
    }

    case 'add_work_item_progress': {
      const wi = getRows('workItems').find((w) => w.id === args.p_work_item_id);
      if (!wi) return fail('La partida de trabajo no existe.');
      const existing = getRows('progressLogs')
        .filter((p) => p.workItemId === args.p_work_item_id)
        .reduce((acc, p) => acc + (p.quantity ?? 0), 0);
      const total = existing + args.p_quantity;
      if (wi.quantity && total > wi.quantity) {
        return fail(`La cantidad total avanzada (${total}) no puede exceder la cantidad total (${wi.quantity}).`);
      }
      const newProgress = wi.quantity ? (total / wi.quantity) * 100 : 0;
      insertRows('progressLogs', [{
        tenantId: args.p_tenant_id,
        workItemId: args.p_work_item_id,
        date: args.p_date,
        quantity: args.p_quantity,
        userId: args.p_user_id,
        userName: args.p_user_name,
        observations: args.p_observations,
      }]);
      updateRows('workItems', (w) => w.id === args.p_work_item_id, { progress: newProgress });
      return ok();
    }

    case 'checkout_tool': {
      const t = getRows('tools').find((x) => x.id === args.p_tool_id);
      if (!t) return fail('Herramienta no encontrada.');
      updateRows('tools', (x) => x.id === args.p_tool_id, { status: 'in-use' });
      insertRows('toolLogs', [{
        toolId: args.p_tool_id,
        toolName: t.name,
        userId: args.p_user_id,
        userName: args.p_user_name,
        checkoutDate: new Date().toISOString(),
        returnDate: null,
        checkoutSupervisorId: args.p_supervisor_id,
        checkoutSupervisorName: args.p_supervisor_name,
        tenantId: args.p_tenant_id,
      }]);
      return ok();
    }

    case 'return_tool': {
      const log = getRows('toolLogs').find((l) => l.id === args.p_log_id);
      if (!log) return fail('Registro de herramienta no encontrado.');
      updateRows('tools', (x) => x.id === log.toolId, {
        status: args.p_status === 'ok' ? 'available' : 'maintenance',
      });
      updateRows('toolLogs', (l) => l.id === args.p_log_id, {
        returnDate: new Date().toISOString(),
        returnStatus: args.p_status,
        returnNotes: args.p_notes,
        returnSupervisorId: args.p_user_id,
        returnSupervisorName: args.p_user_name,
      });
      return ok();
    }

    case 'delete_lot': {
      updateRows(
        'purchaseRequests',
        (r) => r.lotId === args.p_lot_id && r.tenantId === args.p_tenant_id,
        { lotId: null, status: 'approved' },
      );
      deleteRows('purchaseLots', (l) => l.id === args.p_lot_id);
      return ok();
    }

    case 'sign_daily_talk': {
      const talk = getRows('dailyTalks').find((d) => d.id === args.p_talk_id);
      if (!talk) return fail('La charla no existe.');
      const asistentes: any[] = Array.isArray(talk.asistentes) ? talk.asistentes : [];
      const idx = asistentes.findIndex((a) => String(a.id) === String(args.p_user_id));
      if (idx === -1) return fail('No estás en la lista de asistentes de esta charla.');
      const next = asistentes.map((a, i) =>
        i === idx ? { ...a, signed: true, signedAt: new Date().toISOString(), signature: args.p_signature } : a,
      );
      updateRows('dailyTalks', (d) => d.id === args.p_talk_id, { asistentes: next });
      return ok();
    }

    /**
     * Firmar o rechazar un paso del flujo de aprobación (migración 029).
     * Mismas tres cosas que hace la versión de Postgres: registrar la acción,
     * mover el paso y cerrar el trámite si era el último. En demo no hay dos
     * pestañas peleando, así que no hace falta el bloqueo de fila.
     */
    case 'approval_act': {
      const req = getRows('approvalRequests').find((r) => r.id === args.p_request_id);
      if (!req) return fail('El trámite no existe.');
      if (req.status !== 'pendiente') return fail('El trámite ya está cerrado.');
      if (args.p_action !== 'aprobado' && args.p_action !== 'rechazado') {
        return fail(`Acción no válida: ${args.p_action}`);
      }
      if (args.p_action === 'rechazado' && !String(args.p_comment ?? '').trim()) {
        return fail('Para rechazar hay que indicar el motivo.');
      }

      const pasos: any[] = Array.isArray(req.stepsSnapshot) ? req.stepsSnapshot : [];
      const paso = pasos[req.currentStep];
      const user = getRows('users').find((u) => u.id === DEMO_USER_ID);

      insertRows('approvalActions', [{
        tenantId: req.tenantId,
        requestId: req.id,
        stepOrder: req.currentStep,
        stepName: paso?.name ?? null,
        action: args.p_action,
        comment: String(args.p_comment ?? '').trim() || null,
        actedBy: DEMO_USER_ID,
        actorName: user?.name ?? 'Usuario Demo',
        actorRut: user?.rut ?? null,
        actorCargo: user?.cargo ?? null,
        actorRole: user?.role ?? null,
        signature: args.p_signature ?? null,
        documentHash: args.p_document_hash ?? req.documentHash ?? null,
        actedAt: new Date().toISOString(),
      }]);

      const total = pasos.length;
      let status = 'pendiente';
      let next = req.currentStep;
      if (args.p_action === 'rechazado') {
        status = 'rechazado';
      } else if (req.currentStep + 1 >= total) {
        status = 'aprobado';
        next = total;
      } else {
        next = req.currentStep + 1;
      }

      updateRows('approvalRequests', (r) => r.id === req.id, {
        status,
        currentStep: next,
        closedAt: status === 'pendiente' ? null : new Date().toISOString(),
      });

      return { data: { status, currentStep: next, totalSteps: total }, error: null };
    }

    /**
     * Listado estándar chileno de documentos del contratista (migración 031).
     * Se salta los códigos ya existentes, igual que la versión de Postgres, así
     * que llamarla dos veces no duplica nada.
     */
    case 'seed_contractor_document_types': {
      const t = args.p_tenant_id;
      const existentes = new Set(
        getRows('contractorDocumentTypes')
          .filter((r) => r.tenantId === t)
          .map((r) => r.code),
      );

      const estandar: [string, string, boolean, boolean, number][] = [
        ['e_rut', 'e-RUT de la empresa', true, false, 10],
        ['constitucion', 'Escritura de constitución', true, false, 20],
        ['vigencia', 'Certificado de vigencia', true, true, 30],
        ['poder', 'Poder del representante legal', true, true, 40],
        ['cedula_rep', 'Cédula del representante legal', true, false, 50],
        ['mutual', 'Adhesión a mutual', true, true, 60],
        ['f30', 'F30 · Antecedentes laborales', true, true, 70],
        ['f30_1', 'F30-1 · Cumplimiento de obligaciones', true, true, 80],
        ['poliza', 'Póliza de responsabilidad civil', true, true, 90],
        ['riohs', 'Reglamento interno (RIOHS)', false, false, 100],
        ['prevencion', 'Programa de prevención de riesgos', false, false, 110],
        ['banco', 'Certificado de cuenta bancaria', true, false, 120],
        ['previred', 'Certificado Previred', false, true, 130],
      ];

      const nuevos = estandar
        .filter(([code]) => !existentes.has(code))
        .map(([code, nombre, required, hasExpiry, sortOrder]) => ({
          tenantId: t,
          code,
          name: nombre,
          description: null,
          required,
          hasExpiry,
          warnDays: null,
          sortOrder,
          active: true,
          createdAt: new Date().toISOString(),
        }));

      if (nuevos.length > 0) insertRows('contractorDocumentTypes', nuevos);
      return { data: nuevos.length, error: null };
    }

    default:
      return fail(`Función demo no implementada: ${name}`);
  }
}
