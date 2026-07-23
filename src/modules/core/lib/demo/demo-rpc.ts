/**
 * Equivalentes en JS de las 6 funciones de Postgres que la app llama por `.rpc()`.
 * Replican el efecto de las definiciones SQL de `supabase/migrations/001_...` sobre
 * el store local. Devuelven `{ data, error }` como el cliente real.
 */
import { getRows, insertRows, updateRows, deleteRows } from './demo-store';

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

    default:
      return fail(`Función demo no implementada: ${name}`);
  }
}
