import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { nanoid } from 'nanoid';
import { ROLES as ROLES_DEFAULT, Permission, PLANS } from '@/modules/core/lib/permissions';
import type { UserRole, Tenant, WorkItem, ProgressLog } from '@/modules/core/lib/data';
import { WORK_ITEMS_SEED } from '@/lib/work-items-seed';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId: string | null;
  db?: any;
};

// --- Tenant ---
export async function addTenant(
  { tenantName, tenantRut, adminName, adminEmail, adminPassword, plan = 'basic' }: any,
  _ctx: Context
) {
  const sb = getSupabaseBrowserClient();
  const { data: { session } } = await sb.auth.getSession();
  const token = session?.access_token;

  const res = await fetch('/api/admin/create-tenant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ tenantName, tenantRut, adminName, adminEmail, adminPassword, plan }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'No se pudo crear el suscriptor.');
}

export async function updateTenant(tenantId: string, data: Partial<Tenant>, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('tenants').update(data).eq('id', tenantId);
  if (error) throw new Error(error.message);
}

// --- User ---
export async function updateUser(userId: string, data: any, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const updateData = { ...data };
  // Remove undefined values (Supabase rejects them)
  Object.keys(updateData).forEach((key) => {
    if (updateData[key] === undefined) delete updateData[key];
  });
  if (updateData.fechaIngreso === null) updateData.fechaIngreso = null; // explicit null is fine
  const { error } = await sb.from('users').update(updateData).eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function deleteUser(userId: string, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch('/api/admin/delete-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ targetUserId: userId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'No se pudo eliminar el usuario.');
}

// --- Material ---
export async function addMaterial(data: any, { user, tenantId, projectId }: Context) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  if (!projectId) throw new Error('Debe seleccionar una obra antes de agregar materiales.');
  const sb = getSupabaseBrowserClient();
  const { justification, stock, ...materialData } = data;

  // Auto-register category if it doesn't exist in the materialCategories table
  if (materialData.category && !materialData.categoryId) {
    const { data: existingCat } = await sb
      .from('materialCategories')
      .select('id')
      .eq('tenantId', tenantId)
      .eq('name', materialData.category)
      .maybeSingle();
    if (!existingCat) {
      await sb.from('materialCategories').insert({ name: materialData.category, tenantId });
    }
  }

  // Auto-register unit if it doesn't exist in the units table
  if (materialData.unit) {
    const { data: existingUnit } = await sb
      .from('units')
      .select('id')
      .eq('tenantId', tenantId)
      .eq('name', materialData.unit)
      .maybeSingle();
    if (!existingUnit) {
      await sb.from('units').insert({ name: materialData.unit, tenantId });
    }
  }

  const { data: inserted, error } = await sb
    .from('materials')
    .insert({ ...materialData, tenantId, projectId, stock: stock ?? 0 })
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (stock > 0) {
    const { error: movErr } = await sb.rpc('add_manual_stock_entry', {
      p_material_id: inserted.id,
      p_quantity: stock,
      p_justification: justification || 'Stock inicial',
      p_user_id: user.id,
      p_user_name: user.name,
      p_tenant_id: tenantId,
      p_project_id: projectId,
    });
    if (movErr) throw new Error(movErr.message);
  }
}

export async function addManualStockEntry(
  materialId: string,
  quantity: number,
  justification: string,
  { user, tenantId, projectId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.rpc('add_manual_stock_entry', {
    p_material_id: materialId,
    p_quantity: quantity,
    p_justification: justification,
    p_user_id: user.id,
    p_user_name: user.name,
    p_tenant_id: tenantId,
    p_project_id: projectId,
  });
  if (error) throw new Error(error.message);
}

export async function updateMaterial(materialId: string, data: any, { user, tenantId, projectId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { stock, categoryId, ...otherData } = data;

  const updatePayload: any = { ...otherData };

  // Resolve category name if categoryId provided
  if (categoryId) {
    const { data: cat } = await sb.from('materialCategories').select('name').eq('id', categoryId).single();
    if (cat) updatePayload.category = cat.name;
    delete updatePayload.categoryId;
  }

  if (Object.keys(updatePayload).length > 0) {
    const { error } = await sb.from('materials').update(updatePayload).eq('id', materialId);
    if (error) throw new Error(error.message);
  }

  // Handle stock change separately via RPC
  const canEditStock = user?.role === 'super-admin' || user?.role === 'admin';
  if (canEditStock && stock !== undefined) {
    const { data: current } = await sb.from('materials').select('stock').eq('id', materialId).single();
    if (current && stock !== current.stock) {
      await addManualStockEntry(
        materialId,
        stock - current.stock,
        'Ajuste desde panel de edición',
        { user, tenantId, projectId, db: undefined }
      );
    }
  }
}

export async function deleteMaterial(materialId: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('materials').delete().eq('id', materialId);
  if (error) throw new Error(error.message);
}

// --- Categories & Units ---
export async function addMaterialCategory(name: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('materialCategories').insert({ name, tenantId });
  if (error) throw new Error(error.message);
}

export async function updateMaterialCategory(id: string, name: string, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('materialCategories').update({ name }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteMaterialCategory(id: string, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('materialCategories').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function addUnit(name: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('units').insert({ name, tenantId });
  if (error) throw new Error(error.message);
}

export async function deleteUnit(id: string, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('units').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// --- Suppliers ---
export async function addSupplier(data: any, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('suppliers').insert({ ...data, tenantId });
  if (error) throw new Error(error.message);
}

export async function updateSupplier(id: string, data: any, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('suppliers').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSupplier(id: string, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('suppliers').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// --- Lots ---
export async function createLot(name: string, { user, tenantId }: Context) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('purchaseLots').insert({
    name,
    creatorId: user.id,
    creatorName: user.name,
    status: 'open',
    tenantId,
  });
  if (error) throw new Error(error.message);
}

export async function addRequestToLot(requestId: string, lotId: string, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb
    .from('purchaseRequests')
    .update({ lotId, status: 'batched' })
    .eq('id', requestId);
  if (error) throw new Error(error.message);
}

export async function removeRequestFromLot(requestId: string, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb
    .from('purchaseRequests')
    .update({ lotId: null, status: 'approved' })
    .eq('id', requestId);
  if (error) throw new Error(error.message);
}

export async function deleteLot(lotId: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.rpc('delete_lot', { p_lot_id: lotId, p_tenant_id: tenantId });
  if (error) throw new Error(error.message);
}

// --- Permissions ---
export async function updateRolePermissions(
  role: UserRole,
  permission: any,
  checked: any,
  { tenantId }: Context
) {
  if (!tenantId) throw new Error('Selecciona una empresa para editar sus permisos.');
  const sb = getSupabaseBrowserClient();
  // Override de ESTA empresa. Si aún no existe, se parte del default del código.
  const { data: existing } = await sb
    .from('roles')
    .select('permissions')
    .eq('tenantId', tenantId)
    .eq('id', role)
    .single();
  const currentPermissions: string[] = existing?.permissions ?? ROLES_DEFAULT[role]?.permissions ?? [];

  const newPermissions = checked
    ? [...new Set([...currentPermissions, permission])]
    : currentPermissions.filter((p: string) => p !== permission);

  const { error } = await sb.from('roles').upsert(
    {
      id: role,
      tenantId,
      permissions: newPermissions,
      description: ROLES_DEFAULT[role]?.description,
    },
    { onConflict: 'tenantId,id' },
  );
  if (error) throw new Error(error.message);
}

export async function updatePlanPermissions(planId: string, permissions: Permission[], _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb
    .from('subscriptionPlans')
    .update({ allowedPermissions: permissions })
    .eq('id', planId);
  if (error) throw new Error(error.message);
}

// --- Work Items ---
export async function addWorkItem(
  data: Omit<WorkItem, 'id' | 'tenantId' | 'progress' | 'path'>,
  { tenantId, user, projectId }: Context
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!user) throw new Error('Usuario no autenticado.');
  const sb = getSupabaseBrowserClient();

  let path = '';
  if (data.parentId) {
    const { data: parent } = await sb
      .from('workItems')
      .select('path')
      .eq('id', data.parentId)
      .single();
    if (!parent) throw new Error('El ítem padre no existe.');

    const { count } = await sb
      .from('workItems')
      .select('id', { count: 'exact', head: true })
      .eq('tenantId', tenantId)
      .eq('parentId', data.parentId);
    path = `${parent.path}/${String((count ?? 0) + 1).padStart(2, '0')}`;
  } else {
    const { count } = await sb
      .from('workItems')
      .select('id', { count: 'exact', head: true })
      .eq('tenantId', tenantId)
      .is('parentId', null);
    path = String((count ?? 0) + 1).padStart(2, '0');
  }

  const { error } = await sb.from('workItems').insert({
    ...data,
    status: 'in-progress',
    tenantId,
    projectId: projectId || tenantId,
    progress: 0,
    path,
    createdBy: user.id,
  });
  if (error) throw new Error(error.message);
}

// Bulk-imports the example WBS template (WORK_ITEMS_SEED) into the tenant's
// workItems. The seed uses local string ids ("1".."39") for parent references,
// so we insert level-by-level, remapping each old id to the DB-generated id.
// Correlation between the seed rows and the inserted rows is done by `path`,
// which is unique within the template.
export async function importWorkItemsTemplate({ tenantId, user, projectId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!user) throw new Error('Usuario no autenticado.');
  const sb = getSupabaseBrowserClient();

  // Only allow importing into an empty structure — never mix with existing data.
  const { count } = await sb
    .from('workItems')
    .select('id', { count: 'exact', head: true })
    .eq('tenantId', tenantId);
  if ((count ?? 0) > 0) {
    throw new Error('Ya existen partidas de obra; la plantilla solo puede importarse en una obra vacía.');
  }

  const resolvedProjectId = projectId || tenantId;
  const idMap = new Map<string, string>(); // seed id -> new DB id
  let pending = [...WORK_ITEMS_SEED];

  while (pending.length) {
    // A seed item is ready to insert once its parent (if any) already exists.
    const wave = pending.filter(it => it.parentId === null || idMap.has(it.parentId));
    if (wave.length === 0) {
      throw new Error('La plantilla tiene referencias de partidas inconsistentes.');
    }

    const rows = wave.map(it => ({
      name: it.name,
      type: it.type,
      parentId: it.parentId ? idMap.get(it.parentId)! : null,
      path: it.path,
      unit: it.unit,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      status: 'in-progress',
      progress: 0,
      tenantId,
      projectId: resolvedProjectId,
      createdBy: user.id,
    }));

    const { data: inserted, error } = await sb.from('workItems').insert(rows).select('id, path');
    if (error) throw new Error(error.message);

    for (const it of wave) {
      const match = inserted?.find((r: { id: string; path: string }) => r.path === it.path);
      if (!match) throw new Error('Fallo al mapear una partida importada.');
      idMap.set(it.id, match.id);
    }

    const done = new Set(wave.map(it => it.id));
    pending = pending.filter(it => !done.has(it.id));
  }
}

export async function updateWorkItem(id: string, data: Partial<WorkItem>, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('workItems').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteWorkItem(id: string, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('workItems').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function addWorkItemProgress(
  workItemId: string,
  quantity: number,
  date: Date,
  observations: string | undefined,
  { user, tenantId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.rpc('add_work_item_progress', {
    p_work_item_id: workItemId,
    p_quantity: quantity,
    p_date: date.toISOString(),
    p_observations: observations || '',
    p_user_id: user.id,
    p_user_name: user.name,
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(error.message);
}

export async function submitForQualityReview(workItemId: string, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb
    .from('workItems')
    .update({ status: 'pending-quality-review', actualEndDate: new Date().toISOString() })
    .eq('id', workItemId);
  if (error) throw new Error(error.message);
}

export async function approveWorkItem(workItemId: string, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('workItems').update({ status: 'completed' }).eq('id', workItemId);
  if (error) throw new Error(error.message);
}

export async function rejectWorkItem(workItemId: string, reason: string, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('workItems').update({
    status: 'rejected',
    rejectionReason: reason || null,
  }).eq('id', workItemId);
  if (error) throw new Error(error.message);
}
