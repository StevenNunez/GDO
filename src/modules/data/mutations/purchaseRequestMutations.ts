import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { PurchaseRequest, PurchaseOrder } from '@/modules/core/lib/data';
import { nanoid } from 'nanoid';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId: string | null;
  db?: any;
};

export async function addPurchaseRequest(
  data: Partial<Omit<PurchaseRequest, 'id' | 'status' | 'createdAt' | 'tenantId'>>,
  { user, tenantId, projectId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  if (!projectId) throw new Error('Debe seleccionar una obra.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('purchaseRequests').insert({
    ...data,
    status: 'pending',
    tenantId,
    projectId,
    requesterName: user.name,
    supervisorId: user.id,
  });
  if (error) throw new Error(error.message);
}

export async function updatePurchaseRequestStatus(
  requestId: string,
  status: PurchaseRequest['status'],
  data: Partial<PurchaseRequest>,
  { user, tenantId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();

  const { data: current, error: fetchErr } = await sb
    .from('purchaseRequests')
    .select('*')
    .eq('id', requestId)
    .single();
  if (fetchErr || !current) throw new Error('Solicitud no encontrada.');
  if (current.tenantId !== tenantId) throw new Error('No tienes permiso para modificar esta solicitud.');

  const updateData: any = { ...data, status };

  if (
    data.quantity !== undefined &&
    data.quantity !== current.quantity &&
    (current.originalQuantity === undefined || current.originalQuantity === null)
  ) {
    updateData.originalQuantity = current.quantity;
  }

  if (status === 'approved' && current.status !== 'approved') {
    updateData.approverId = user.id;
    updateData.approverName = user.name;
    updateData.approvalDate = new Date().toISOString();
  }

  if (status === 'ordered') {
    updateData.orderedAt = new Date().toISOString();
  }

  if (status === 'rejected') {
    updateData.rejectionDate = new Date().toISOString();
    updateData.rejectionReason = data.notes || 'Rechazado en gestión de OC';
  }

  const { error } = await sb.from('purchaseRequests').update(updateData).eq('id', requestId);
  if (error) throw new Error(error.message);
}

export async function receivePurchaseRequest(
  requestId: string,
  receivedQuantity: number,
  existingMaterialId: string | undefined,
  { user, tenantId, projectId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();

  const { data: request, error: reqErr } = await sb
    .from('purchaseRequests')
    .select('*')
    .eq('id', requestId)
    .single();
  if (reqErr || !request) throw new Error('Solicitud no encontrada.');

  // Resolve the material to update
  let materialId: string | null = existingMaterialId || null;
  if (!materialId || materialId === 'create_new') {
    const { data: mats } = await sb
      .from('materials')
      .select('id')
      .eq('tenantId', tenantId)
      .eq('name', request.materialName)
      .limit(1);
    materialId = mats?.[0]?.id || null;
  }

  const requestedQuantity = request.quantity;
  let materialNewStock: number;

  if (receivedQuantity < requestedQuantity) {
    const remaining = requestedQuantity - receivedQuantity;

    // Actualizar la solicitud original con la cantidad pendiente (status 'ordered' para que siga en lista de recepción)
    const { error: updateErr } = await sb.from('purchaseRequests').update({
      quantity: remaining,
      notes: `Recepción parcial: se recibieron ${receivedQuantity} ${request.unit}. Pendientes: ${remaining}. ${request.notes || ''}`.trim(),
    }).eq('id', requestId);
    if (updateErr) throw new Error(`Error al actualizar solicitud: ${updateErr.message}`);

    // Crear registro separado para la porción recibida (sin spread de request para evitar conflictos)
    const { error: insertErr } = await sb.from('purchaseRequests').insert({
      id: nanoid(),
      materialName: request.materialName,
      quantity: receivedQuantity,
      originalQuantity: requestedQuantity,
      unit: request.unit,
      justification: request.justification,
      category: request.category,
      area: request.area,
      phase: request.phase ?? null,
      activity: request.activity ?? null,
      workItemId: request.workItemId ?? null,
      lotId: null,
      purchaseOrderId: request.purchaseOrderId ?? null,
      supervisorId: request.supervisorId,
      requesterName: request.requesterName ?? null,
      approverId: request.approverId ?? null,
      approverName: request.approverName ?? null,
      approvalDate: request.approvalDate ?? null,
      status: 'received',
      receivedAt: new Date().toISOString(),
      notes: `Recepción parcial de la solicitud ${requestId}.`,
      tenantId: request.tenantId,
      projectId: request.projectId || projectId,
    });
    if (insertErr) throw new Error(`Error al registrar recepción parcial: ${insertErr.message}`);
  } else {
    const { error: updateErr } = await sb.from('purchaseRequests').update({
      status: 'received',
      receivedAt: new Date().toISOString(),
      quantity: receivedQuantity,
      originalQuantity: request.originalQuantity || requestedQuantity,
    }).eq('id', requestId);
    if (updateErr) throw new Error(`Error al marcar como recibido: ${updateErr.message}`);
  }

  // Update or create material
  if (materialId) {
    const { data: mat } = await sb.from('materials').select('stock').eq('id', materialId).single();
    materialNewStock = (mat?.stock || 0) + receivedQuantity;
    const { error: matUpdateErr } = await sb.from('materials').update({ stock: materialNewStock }).eq('id', materialId);
    if (matUpdateErr) throw new Error(`Error al actualizar stock: ${matUpdateErr.message}`);
  } else {
    const { data: newMat, error: matInsertErr } = await sb.from('materials').insert({
      name: request.materialName,
      stock: receivedQuantity,
      unit: request.unit,
      category: request.category,
      tenantId,
      projectId: request.projectId || projectId,
      supplierId: null,
      archived: false,
    }).select('id').single();
    if (matInsertErr) throw new Error(`Error al crear material: ${matInsertErr.message}`);
    materialId = newMat.id;
    materialNewStock = receivedQuantity;
  }

  const { error: movementErr } = await sb.from('stockMovements').insert({
    materialId,
    materialName: request.materialName,
    quantityChange: receivedQuantity,
    newStock: materialNewStock,
    type: 'request-delivery',
    justification: `Recepción de OC para solicitud ${requestId}`,
    userId: user.id,
    userName: user.name,
    relatedRequestId: requestId,
    tenantId,
    projectId: request.projectId || projectId,
  });
  if (movementErr) throw new Error(`Error al registrar movimiento: ${movementErr.message}`);
}

export async function deletePurchaseRequest(requestId: string, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('purchaseRequests').delete().eq('id', requestId);
  if (error) throw new Error(error.message);
}

/**
 * Obra a la que se imputa una orden de compra. Si las solicitudes mezclan obras
 * no se puede atribuir el gasto sin inventar, así que se deja en null y la OC
 * queda fuera del control por cliente hasta que alguien la corrija a mano.
 */
function resolveOrderProjectId(projectIds: (string | null | undefined)[]): string | null {
  const unique = new Set(projectIds.filter(Boolean) as string[]);
  return unique.size === 1 ? [...unique][0] : null;
}

export async function generatePurchaseOrder(
  requests: PurchaseRequest[],
  supplierId: string,
  { user, tenantId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  if (requests.length === 0) throw new Error('No hay solicitudes para procesar en esta orden.');
  const lotId = requests[0].lotId;
  if (!lotId) throw new Error('Las solicitudes seleccionadas no pertenecen a un lote.');

  const sb = getSupabaseBrowserClient();
  const { data: supplier } = await sb.from('suppliers').select('name').eq('id', supplierId).single();
  if (!supplier) throw new Error('Proveedor no encontrado.');

  const itemsMap = new Map<string, { id: string; name: string; unit: string; totalQuantity: number; category: string }>();
  for (const req of requests) {
    const key = req.materialName;
    if (itemsMap.has(key)) {
      itemsMap.get(key)!.totalQuantity += req.quantity;
    } else {
      itemsMap.set(key, { id: req.id, name: req.materialName, unit: req.unit, totalQuantity: req.quantity, category: req.category });
    }
  }

  const { data: order, error: orderErr } = await sb.from('purchaseOrders').insert({
    supplierId,
    supplierName: supplier.name,
    creatorId: user.id,
    creatorName: user.name,
    status: 'generated',
    requestIds: requests.map((r) => r.id),
    items: Array.from(itemsMap.values()),
    tenantId,
    lotId,
    projectId: resolveOrderProjectId(requests.map((r) => r.projectId)),
  }).select('id').single();
  if (orderErr) throw new Error(orderErr.message);

  // Mark requests as ordered and update lot
  for (const req of requests) {
    await sb.from('purchaseRequests').update({ status: 'ordered' }).eq('id', req.id);
  }
  await sb.from('purchaseLots').update({ supplierId }).eq('id', lotId);

  return order.id;
}

export async function createPurchaseOrder(
  { lotId, ocNumber, items, totalAmount }: {
    lotId: string;
    ocNumber: string;
    items: { requestId: string; price: number; quantity: number; name: string; unit: string }[];
    totalAmount: number;
  },
  { user, tenantId }: Context
): Promise<string> {
  if (!user || !tenantId) throw new Error('Autenticación requerida.');
  const sb = getSupabaseBrowserClient();

  const { data: lot } = await sb.from('purchaseLots').select('supplierId').eq('id', lotId).single();
  if (!lot) throw new Error('El lote especificado no existe.');
  if (!lot.supplierId) throw new Error(`El lote ${lotId} no tiene un proveedor asociado.`);

  const { data: supplier } = await sb.from('suppliers').select('name').eq('id', lot.supplierId).single();

  // La obra sale de las solicitudes que originaron la OC, no del contexto: la
  // OC se emite desde Finanzas, que puede estar parada en otra obra.
  const { data: sourceRequests } = await sb
    .from('purchaseRequests')
    .select('projectId')
    .in('id', items.map((i) => i.requestId));

  const { data: order, error: orderErr } = await sb.from('purchaseOrders').insert({
    officialOCId: ocNumber,
    lotId,
    supplierId: lot.supplierId,
    supplierName: supplier?.name || '',
    creatorId: user.id,
    creatorName: user.name,
    status: 'issued',
    items: items.map((i) => ({ id: i.requestId, name: i.name, unit: i.unit, totalQuantity: i.quantity, price: i.price })),
    totalAmount,
    tenantId,
    projectId: resolveOrderProjectId((sourceRequests ?? []).map((r: any) => r.projectId)),
  }).select('id').single();
  if (orderErr) throw new Error(orderErr.message);

  await sb.from('purchaseLots').update({ status: 'ordered' }).eq('id', lotId);
  for (const item of items) {
    await sb.from('purchaseRequests').update({
      status: 'ordered',
      purchaseOrderId: order.id,
      quantity: item.quantity,
    }).eq('id', item.requestId);
  }

  return order.id;
}

export async function returnToPool(requestIds: string[], { user, tenantId }: Context) {
  if (!user || !tenantId) throw new Error('Autenticación requerida.');
  const sb = getSupabaseBrowserClient();
  for (const reqId of requestIds) {
    await sb.from('purchaseRequests').update({
      status: 'approved',
      lotId: null,
      notes: 'Devuelto a pendientes por Finanzas. Proveedor no cotizó.',
    }).eq('id', reqId);
  }
}

export async function cancelPurchaseOrder(orderId: string, { user, tenantId }: Context) {
  if (!user || !tenantId) throw new Error('Autenticación requerida.');
  const sb = getSupabaseBrowserClient();

  const { data: order } = await sb.from('purchaseOrders').select('requestIds').eq('id', orderId).single();
  if (!order) throw new Error('La orden de cotización no existe.');

  if (order.requestIds?.length) {
    for (const reqId of order.requestIds) {
      await sb.from('purchaseRequests').update({ status: 'batched' }).eq('id', reqId);
    }
  }
  await sb.from('purchaseOrders').delete().eq('id', orderId);
}

export async function archiveLot(requestIds: string[], { user, tenantId }: Context) {
  if (!user || !tenantId) throw new Error('Autenticación requerida.');
  const sb = getSupabaseBrowserClient();
  for (const id of requestIds) {
    await sb.from('purchaseRequests').update({
      status: 'ordered',
      notes: 'Archivado manualmente desde gestión de lotes.',
    }).eq('id', id);
  }
}
