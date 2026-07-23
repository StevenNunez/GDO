
// src/modules/core/lib/permissions.ts

import type { UserRole } from "./data";

/* ===================================================================
   TODOS LOS PERMISOS DISPONIBLES EN LA PLATAFORMA
   =================================================================== */
export const ALL_PERMISSIONS = {
    // ── Acceso a Módulos ─────────────────────────────────────────────
    'module_warehouse:view': { label: 'Acceder a Bodega', group: 'Acceso a Módulos' },
    'module_purchasing:view': { label: 'Acceder a Compras', group: 'Acceso a Módulos' },
    'module_users:view': { label: 'Acceder a Usuarios', group: 'Acceso a Módulos' },
    'module_subscriptions:view': { label: 'Acceder a Suscripciones', group: 'Plataforma' },
    'module_safety:view': { label: 'Acceder a Prevención', group: 'Acceso a Módulos' },
    'module_attendance:view': { label: 'Acceder a Asistencia', group: 'Acceso a Módulos' },
    'module_payments:view': { label: 'Acceder a Pagos', group: 'Acceso a Módulos' },
    'module_reports:view': { label: 'Acceder a Reportes', group: 'Acceso a Módulos' },
    'module_permissions:view': { label: 'Ver Gestión de Permisos', group: 'Acceso a Módulos' },
    'module_construction_control:view': { label: 'Acceder a Control de Obra', group: 'Acceso a Módulos' },
    'module_projects:view': { label: 'Acceder a Módulo de Obras', group: 'Acceso a Módulos' },
    'module_clients:view': { label: 'Acceder a Clientes', group: 'Acceso a Módulos' },


    // ── Gestión de permisos (el permiso que realmente abre el módulo) ──
    'permissions:manage': { label: 'Gestionar Permisos de Roles', group: 'Plataforma' },

    // ── Plataforma (solo Super Admin) ───────────────────────────────
    'tenants:create': { label: 'Crear Nuevos Tenants', group: 'Plataforma' },
    'tenants:delete': { label: 'Eliminar Tenants', group: 'Plataforma' },
    'tenants:switch': { label: 'Cambiar entre Tenants', group: 'Plataforma' },

    'projects:view': { label: 'Ver Obras', group: 'Gestión de Obras' },
    'projects:create': { label: 'Crear Obras', group: 'Gestión de Obras' },
    'projects:edit': { label: 'Editar Obras', group: 'Gestión de Obras' },
    'projects:delete': { label: 'Eliminar Obras', group: 'Gestión de Obras' },
    'projects:manage': { label: 'Gestionar Obras', group: 'Gestión de Obras' },
    'clients:view': { label: 'Ver Clientes', group: 'Clientes y Presupuestos' },
    'clients:manage': { label: 'Crear y Editar Clientes', group: 'Clientes y Presupuestos' },
    'clients:view_costs': { label: 'Ver Control de Gastos por Cliente', group: 'Clientes y Presupuestos' },
    'tools:create': { label: 'Crear Herramientas', group: 'Herramientas' },
    'tools:view_all': { label: 'Ver Todas las Herramientas', group: 'Herramientas' },
    'tools:edit': { label: 'Editar Herramientas', group: 'Herramientas' },
    'tools:delete': { label: 'Eliminar Herramientas', group: 'Herramientas' },
    'tools:checkout': { label: 'Entregar Herramientas', group: 'Herramientas' },
    'tools:return': { label: 'Recibir Herramientas', group: 'Herramientas' },
    'tools:view_own': { label: 'Ver Mis Herramientas', group: 'Herramientas' },

    'materials:create': { label: 'Crear Materiales', group: 'Materiales y Stock' },
    'materials:view_all': { label: 'Ver Todos los Materiales', group: 'Materiales y Stock' },
    'materials:edit': { label: 'Editar Materiales', group: 'Materiales y Stock' },
    'materials:delete': { label: 'Eliminar Materiales', group: 'Materiales y Stock' },
    'materials:archive': { label: 'Archivar Materiales', group: 'Materiales y Stock' },
    'stock:add_manual': { label: 'Ingresar Stock Manualmente', group: 'Materiales y Stock' },
    'stock:receive_order': { label: 'Recibir Material de Compra', group: 'Materiales y Stock' },

    'material_requests:create': { label: 'Crear Solicitudes de Material', group: 'Solicitudes Internas' },
    'material_requests:approve': { label: 'Aprobar Solicitudes de Material', group: 'Solicitudes Internas' },
    'material_requests:view_own': { label: 'Ver Mis Solicitudes', group: 'Solicitudes Internas' },
    'material_requests:view_all': { label: 'Ver Todas las Solicitudes', group: 'Solicitudes Internas' },

    'return_requests:create': { label: 'Crear Devoluciones', group: 'Devoluciones' },
    'return_requests:approve': { label: 'Aprobar Devoluciones', group: 'Devoluciones' },
    'return_requests:view_all': { label: 'Ver Todas las Devoluciones', group: 'Devoluciones' },

    'purchase_requests:create': { label: 'Crear Solicitudes de Compra', group: 'Compras' },
    'purchase_requests:approve': { label: 'Aprobar Solicitudes de Compra', group: 'Compras' },
    'purchase_requests:view_all': { label: 'Ver Solicitudes de Compra', group: 'Compras' },
    'purchase_requests:delete': { label: 'Eliminar Solicitudes de Compra', group: 'Compras' },
    'lots:create': { label: 'Crear Lotes de Compra', group: 'Compras' },
    'lots:assign': { label: 'Asignar Solicitudes a Lotes', group: 'Compras' },
    'lots:delete': { label: 'Eliminar Lotes', group: 'Compras' },
    'orders:create': { label: 'Generar Cotizaciones', group: 'Compras' },
    'orders:view_all': { label: 'Ver Cotizaciones', group: 'Compras' },
    'orders:cancel': { label: 'Anular Cotizaciones', group: 'Compras' },

    'finance:manage_purchase_orders': { label: 'Generar OC Oficiales', group: 'Finanzas' },

    'users:create': { label: 'Crear Usuarios', group: 'Usuarios' },
    'users:view': { label: 'Ver Usuarios', group: 'Usuarios' },
    'users:edit': { label: 'Editar Usuarios', group: 'Usuarios' },
    'users:delete': { label: 'Eliminar Usuarios', group: 'Usuarios' },
    'users:change_password': { label: 'Cambiar Contraseña de Otros', group: 'Usuarios' },
    'users:print_qr': { label: 'Imprimir Credenciales', group: 'Usuarios' },

    'suppliers:create': { label: 'Crear Proveedores', group: 'Configuración' },
    'suppliers:view': { label: 'Ver Proveedores', group: 'Configuración' },
    'suppliers:edit': { label: 'Editar Proveedores', group: 'Configuración' },
    'suppliers:delete': { label: 'Eliminar Proveedores', group: 'Configuración' },
    'categories:create': { label: 'Crear Categorías', group: 'Configuración' },
    'categories:view': { label: 'Ver Categorías', group: 'Configuración' },
    'categories:edit': { label: 'Editar Categorías', group: 'Configuración' },
    'categories:delete': { label: 'Eliminar Categorías', group: 'Configuración' },
    'units:create': { label: 'Crear Unidades', group: 'Configuración' },
    'units:view': { label: 'Ver Unidades', group: 'Configuración' },
    'units:delete': { label: 'Eliminar Unidades', group: 'Configuración' },

    'payments:create': { label: 'Ingresar Facturas', group: 'Pagos' },
    'payments:view': { label: 'Ver Pagos', group: 'Pagos' },
    'payments:mark_as_paid': { label: 'Marcar Facturas como Pagadas', group: 'Pagos' },
    'payments:delete': { label: 'Eliminar Facturas', group: 'Pagos' },
    'payments:edit': { label: 'Editar Facturas', group: 'Pagos' },

    'attendance:register': { label: 'Registrar Asistencia (QR)', group: 'Asistencia' },
    'attendance:edit': { label: 'Editar Registros de Asistencia', group: 'Asistencia' },
    'attendance:view': { label: 'Ver Asistencia', group: 'Asistencia' },

    'reports:view': { label: 'Ver Reportes', group: 'Reportes' },

    'safety_templates:create': { label: 'Crear Plantillas de Seguridad', group: 'Prevención de Riesgos' },
    'safety_templates:assign': { label: 'Asignar Checklists/Inspecciones', group: 'Prevención de Riesgos' },
    'safety_checklists:complete': { label: 'Completar Mis Checklists', group: 'Prevención de Riesgos' },
    'safety_checklists:review': { label: 'Revisar Checklists', group: 'Prevención de Riesgos' },
    'safety_inspections:create': { label: 'Crear Inspecciones', group: 'Prevención de Riesgos' },
    'safety_inspections:complete': { label: 'Completar Mis Inspecciones', group: 'Prevención de Riesgos' },
    'safety_inspections:review': { label: 'Revisar Inspecciones', group: 'Prevención de Riesgos' },
    'safety_observations:create': { label: 'Crear Observaciones', group: 'Prevención de Riesgos' },
    'safety_observations:review': { label: 'Revisar Observaciones', group: 'Prevención de Riesgos' },

    'construction_control:register_progress': { label: 'Registrar Avance Diario', group: 'Control de Obra' },
    'construction_control:edit_structure': { label: 'Editar Estructura de Partidas', group: 'Control de Obra' },
    'construction_control:view_reports': { label: 'Ver Reportes de Avance', group: 'Control de Obra' },
    'construction_control:review_protocols': { label: 'Revisar y Aprobar Protocolos', group: 'Control de Obra' },


} as const;

export type Permission = keyof typeof ALL_PERMISSIONS;
export const PERMISSIONS = ALL_PERMISSIONS;

const fullTenantAdminPermissions: Permission[] = Object.keys(ALL_PERMISSIONS)
    .filter(p => !['tenants:create', 'tenants:delete', 'tenants:switch', 'module_subscriptions:view'].includes(p)) as Permission[];

export const ROLES: Record<UserRole, { label: string; description: string; permissions: Permission[] }> = {
    'super-admin': {
        label: 'Super Admin',
        description: 'Control total de la plataforma y todos los tenants/suscriptores.',
        permissions: Object.keys(ALL_PERMISSIONS) as Permission[],
    },
    'admin': {
        label: 'Administrador de App',
        description: 'Gestión completa del tenant (usuarios, permisos, configuración, todo).',
        permissions: fullTenantAdminPermissions,
    },
    'operations': {
        label: 'Administrador de Obra',
        description: 'Mismos privilegios que Administrador de App.',
        permissions: fullTenantAdminPermissions,
    },
    'soporte': {
        label: 'Soporte de App',
        description: 'Acceso total a la empresa para dar soporte. No ve suscripciones ni gestión de tenants (eso es solo del Super Admin). Lo asigna el Super Admin.',
        permissions: fullTenantAdminPermissions,
    },
    'jefe-oficina-tecnica': {
        label: 'Jefe de Oficina Técnica',
        description: 'Planifica la Carta Gantt, presupuestos y supervisa el avance técnico y financiero de la obra.',
        permissions: [
            'module_construction_control:view', 'construction_control:edit_structure', 'construction_control:register_progress', 'construction_control:view_reports', 'construction_control:review_protocols',
            'module_purchasing:view', 'purchase_requests:create', 'purchase_requests:view_all',
            'module_warehouse:view', 'materials:view_all', 'material_requests:create',
        ],
    },
    'jefe-terreno': {
        label: 'Jefe de Terreno',
        description: 'Gestiona el avance físico de la obra y a los supervisores.',
        permissions: [
            'module_construction_control:view',
            'construction_control:register_progress',
            'construction_control:view_reports',
            'construction_control:review_protocols',
            'module_warehouse:view',
            'material_requests:create',
            'purchase_requests:create',
            'return_requests:create',
            'tools:view_own',
        ]
    },
    'bodega-admin': {
        label: 'Jefe de Bodega',
        description: 'Responsable del inventario físico y ciclo básico de compras.',
        permissions: [
            'module_warehouse:view', 'module_purchasing:view',
            'material_requests:create', 'material_requests:approve', 'material_requests:view_all',
            'return_requests:approve', 'return_requests:view_all',
            'tools:view_all', 'tools:create', 'tools:edit', 'tools:delete', 'tools:checkout', 'tools:return',
            'materials:view_all', 'materials:create', 'materials:edit', 'materials:delete', 'materials:archive',
            'stock:add_manual', 'stock:receive_order',
            'purchase_requests:create', 'purchase_requests:view_all',
            'suppliers:create', 'suppliers:view', 'suppliers:edit',
            'categories:view', 'categories:create', 'categories:edit',
            'units:create', 'units:view', 'units:delete',
        ],
    },
    'finance': {
        label: 'Jefe de Finanzas',
        description: 'Gestiona facturas y pagos a proveedores.',
        permissions: [
            'module_payments:view',
            'payments:create', 'payments:view', 'payments:mark_as_paid', 'payments:edit', 'payments:delete',
            'suppliers:view', 'suppliers:edit', 'suppliers:create',
            'module_purchasing:view', 'orders:view_all',
            'finance:manage_purchase_orders',
        ],
    },
    'supervisor': {
        label: 'Supervisor',
        description: 'Líder en terreno: solicita materiales, compras y registra seguridad.',
        permissions: [
            'module_warehouse:view', 'module_safety:view', 'module_reports:view', 'module_purchasing:view', 'module_construction_control:view',
            'construction_control:register_progress', // El supervisor reporta avance
            'tools:view_own', 'materials:view_all',
            'material_requests:create', 'material_requests:view_own',
            'purchase_requests:create',
            'return_requests:create',
            'safety_checklists:complete',
            'safety_inspections:complete'
        ],
    },
    'apr': {
        label: 'APR',
        description: 'Prevencionista de Riesgos: gestiona checklists, inspecciones y observaciones de seguridad.',
        permissions: [
            'module_safety:view', 'module_users:view', 'module_warehouse:view', 'module_reports:view',
            'safety_templates:create', 'safety_templates:assign',
            'safety_checklists:complete', 'safety_checklists:review',
            'safety_inspections:create', 'safety_inspections:complete', 'safety_inspections:review',
            'safety_observations:create', 'safety_observations:review',
            'material_requests:create', 'purchase_requests:create', 'return_requests:create',
        ],
    },
    'cphs': {
        label: 'Comité Paritario',
        description: 'Comité Paritario de Higiene y Seguridad (CPHS)',
        permissions: [
            'module_safety:view', 'module_warehouse:view', 'tools:view_own',
            'safety_templates:create', 'safety_templates:assign',
            'safety_checklists:review', 'safety_checklists:complete',
            'safety_inspections:create', 'safety_inspections:review', 'safety_inspections:complete',
            'safety_observations:create', 'safety_observations:review',
        ],
    },
    'quality': {
        label: 'Calidad',
        description: 'Verifica la correcta ejecución de las partidas de obra.',
        permissions: [
            'module_construction_control:view',
            'construction_control:view_reports',
            'construction_control:review_protocols',
        ],
    },
    'guardia': {
        label: 'Guardia',
        description: 'Registra asistencia con QR.',
        permissions: ['module_attendance:view', 'attendance:register'],
    },
    'worker': {
        label: 'Trabajador',
        description: 'Solo ve sus herramientas asignadas.',
        permissions: ['tools:view_own'],
    },
};

export const ROLES_ORDER: UserRole[] = [
    'super-admin',
    'soporte',
    'admin',
    'operations',
    'jefe-oficina-tecnica',
    'jefe-terreno',
    'bodega-admin',
    'finance',
    'supervisor',
    'apr',
    'cphs',
    'quality',
    'guardia',
    'worker',
];

export const PLANS = {
    basic: {
        plan: 'basic',
        features: { basic: true, pro: false, enterprise: false },
        allowedRoles: ['soporte', 'bodega-admin', 'supervisor', 'worker', 'guardia'] as UserRole[],
    },
    professional: {
        plan: 'pro',
        features: { basic: true, pro: true, enterprise: false },
        allowedRoles: [
            'soporte',
            'admin',
            'bodega-admin',
            'operations',
            'jefe-oficina-tecnica',
            'jefe-terreno',
            'supervisor',
            'apr',
            'finance',
            'guardia',
            'worker',
            'cphs',
            'quality',
        ] as UserRole[],
    },
    enterprise: {
        plan: 'enterprise',
        features: { basic: true, pro: true, enterprise: true },
        allowedRoles: Object.keys(ROLES) as UserRole[],
    },
};
