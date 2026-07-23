import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { MaterialRequest, Material, ReturnRequest } from '@/modules/core/lib/data';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId: string | null;
  db?: any;
};

export async function addMaterialRequest(
  requestData: {
    items: { materialId: string; quantity: number }[];
    area: string;
    phase?: string;
    activity?: string;
    supervisorId: string;
  },
  { user, tenantId, projectId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  if (!projectId) throw new Error('Debe seleccionar una obra.');
  const sb = getSupabaseBrowserClient();
  const { items, area, phase, activity } = requestData;
  const payload: Record<string, any> = {
    items,
    area,
    status: 'pending',
    supervisorId: user.id,
    userName: user.name,
    tenantId,
    projectId,
  };
  if (phase) payload.phase = phase;
  if (activity) payload.activity = activity;
  const { error } = await sb.from('materialRequests').insert(payload);
  if (error) throw new Error(error.message);
}

export async function updateMaterialRequestStatus(
  requestId: string,
  status: 'approved' | 'rejected',
  { user, tenantId, projectId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();

  const { data: request, error: reqErr } = await sb
    .from('materialRequests')
    .select('*')
    .eq('id', requestId)
    .single();
  if (reqErr || !request) throw new Error('La solicitud no existe.');
  if (request.tenantId !== tenantId) throw new Error('No tienes permiso para modificar esta solicitud.');

  if (status === 'approved') {
    // Deduct stock for each item
    for (const item of request.items as { materialId: string; quantity: number }[]) {
      const { data: mat, error: matErr } = await sb
        .from('materials')
        .select('stock, name, tenantId')
        .eq('id', item.materialId)
        .single();
      if (matErr || !mat) throw new Error(`Material con ID ${item.materialId} no encontrado.`);
      if (mat.tenantId !== tenantId) throw new Error(`Sin permiso sobre el material ${mat.name}.`);
      if (mat.stock < item.quantity)
        throw new Error(`Stock insuficiente para ${mat.name}. Solicitado: ${item.quantity}, Disponible: ${mat.stock}.`);

      const newStock = mat.stock - item.quantity;
      await sb.from('materials').update({ stock: newStock }).eq('id', item.materialId);
      await sb.from('stockMovements').insert({
        materialId: item.materialId,
        materialName: mat.name,
        quantityChange: -item.quantity,
        newStock,
        type: 'request-delivery',
        justification: `Entrega para solicitud ${requestId}`,
        userId: request.supervisorId,
        userName: request.userName || user.name,
        relatedRequestId: requestId,
        tenantId,
        projectId: request.projectId,
      });
    }

    await sb.from('materialRequests').update({
      status: 'approved',
      approvalDate: new Date().toISOString(),
      approverId: user.id,
      approverName: user.name,
    }).eq('id', requestId);
  } else {
    await sb.from('materialRequests').update({
      status: 'rejected',
      rejectionDate: new Date().toISOString(),
      approverId: user.id,
      approverName: user.name,
    }).eq('id', requestId);
  }
}

export async function addReturnRequest(
  items: { materialId: string; quantity: number; materialName: string; unit: string }[],
  notes: string,
  { user, tenantId, projectId }: Context
) {
  if (!user || !tenantId || !projectId) throw new Error('No autenticado, sin inquilino o sin obra seleccionada.');
  const sb = getSupabaseBrowserClient();
  const rows = items.map((item) => ({
    supervisorId: user.id,
    supervisorName: user.name,
    materialId: item.materialId,
    materialName: item.materialName,
    quantity: item.quantity,
    unit: item.unit,
    status: 'pending',
    notes,
    tenantId,
    projectId,
  }));
  const { error } = await sb.from('returnRequests').insert(rows);
  if (error) throw new Error(error.message);
}

export async function updateReturnRequestStatus(
  requestId: string,
  status: 'completed' | 'rejected',
  { user, tenantId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();

  const { data: returnData, error: retErr } = await sb
    .from('returnRequests')
    .select('*')
    .eq('id', requestId)
    .single();
  if (retErr || !returnData) throw new Error('La solicitud de Devolución no existe.');
  if (returnData.tenantId !== tenantId) throw new Error('No tienes permiso para modificar esta solicitud.');

  if (status === 'completed') {
    const { data: mat, error: matErr } = await sb
      .from('materials')
      .select('stock, name')
      .eq('id', returnData.materialId)
      .single();
    if (matErr || !mat) throw new Error('El material a devolver no existe en el inventario.');

    const newStock = (mat.stock || 0) + returnData.quantity;
    await sb.from('materials').update({ stock: newStock }).eq('id', returnData.materialId);
    await sb.from('stockMovements').insert({
      materialId: returnData.materialId,
      materialName: returnData.materialName,
      quantityChange: returnData.quantity,
      newStock,
      type: 'return-reentry',
      justification: `Devolución de solicitud ${requestId}`,
      userId: returnData.supervisorId,
      userName: returnData.supervisorName,
      relatedRequestId: requestId,
      tenantId,
      projectId: returnData.projectId,
    });
  }

  await sb.from('returnRequests').update({
    status,
    completionDate: new Date().toISOString(),
    handlerId: user.id,
    handlerName: user.name,
  }).eq('id', requestId);
}
