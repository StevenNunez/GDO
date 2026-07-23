# Gestión de Obras (GDO)

**Gestión de Obras** es una aplicación web progresiva (PWA) multi-empresa (*multi-tenant*) para la **gestión y control de obras de construcción en tiempo real**, pensada para el mercado chileno. Centraliza inventario, compras, finanzas, avance físico (EDT/Gantt), estados de pago, seguridad (HSEC), asistencia y liquidaciones, con un asistente de IA integrado (**Asistente GDO**).

La interfaz está en **español**.

---

## Stack tecnológico

- **Next.js 16** (App Router) + **React 19**
- **Supabase** — autenticación, base de datos Postgres y realtime
- **Tailwind CSS** + **shadcn/ui**
- **Google Gemini** — Asistente GDO (server-side)
- **jsPDF** — generación de documentos (órdenes de compra, estados de pago, liquidaciones, libro de obra, etc.)
- **Vitest** — tests de la lógica de negocio (dinero, presupuesto, sueldos, asistencia)

Es una PWA instalable, con tema claro (principal) y oscuro.

---

## Puesta en marcha

### Requisitos
- Node.js 20+ y npm
- Un proyecto de Supabase

### Instalación

```bash
npm install
```

### Variables de entorno

Copia `.env.example` a `.env.local` y completa los valores:

```bash
NEXT_PUBLIC_SUPABASE_URL=        # Supabase → Project Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # SOLO servidor — nunca exponer al cliente
GEMINI_API_KEY=                  # Asistente GDO (https://aistudio.google.com/apikey)
```

> `SUPABASE_SERVICE_ROLE_KEY` la usan las rutas `/api/admin/*` y `/api/auth/register`. Nunca se envía al navegador.

### Base de datos

Las migraciones SQL están en `supabase/migrations/` con prefijo numérico (`001_…`, `002_…`). Aplícalas **en orden** en tu proyecto de Supabase (SQL Editor).

### Comandos

```bash
npm run dev       # servidor de desarrollo (webpack)
npm run dev:turbo # servidor de desarrollo con Turbopack (HMR más rápido)
npm run build     # build de producción
npm run lint      # ESLint
npm test          # tests (Vitest)
```

---

## Modo Demo

La pantalla de acceso incluye un botón **"Probar Demo"**: entra a un entorno de demostración **local, sin crear cuenta**. Los datos se guardan solo en el navegador del visitante (localStorage) y cada nueva sesión de demo arranca desde una obra de ejemplo limpia. No toca Supabase ni requiere credenciales.

---

## Arquitectura

- **Multi-tenant:** cada registro pertenece a un `tenantId` (empresa). Dentro de una empresa, la mayoría de los datos se filtran además por la obra activa.
- **Capa de datos:** un `DataProvider` central instancia ~30 hooks de colección (uno por tabla de Supabase), cada uno con suscripción realtime; las mutaciones son funciones que reciben el contexto `{ user, tenantId, projectId }`. Los componentes consumen todo vía `useAppState()`.
- **Roles y permisos:** sistema granular por rol, desde `super-admin` hasta `worker`, con gating por plan de suscripción.
- **Operaciones privilegiadas:** crear/eliminar usuarios, resetear contraseñas o crear empresas pasan por rutas `/api/admin/*` que validan al llamante en el servidor con la *service role key*.

---

## Módulos y funcionalidades

### Asistente GDO (IA)
Asistente conversacional (solo consulta) integrado en el panel, potenciado por Google Gemini. Responde preguntas del día a día sobre la obra activa —stock crítico, solicitudes pendientes, avance por fase, equipo— usando únicamente los datos del sistema. Recibe un resumen compacto del proyecto para responder rápido y con bajo consumo de tokens.

### Control de Obra (EDT y avance físico)
Centro de planificación y seguimiento del proyecto.
- **Estructura de Desglose del Trabajo (EDT):** jerarquía completa de la obra (proyecto → fases → partidas) con unidades, cantidades y precios unitarios.
- **Registro de avance diario** por partida, con observaciones.
- **Protocolos de calidad:** las partidas al 100% se envían a revisión; Calidad aprueba o rechaza.
- **Carta Gantt** interactiva y **Curva S** (avance programado vs. real).
- **Bitácora y Libro de Obra Digital** con firma y exportación a PDF.
- **Presupuesto, APU** (Análisis de Precio Unitario) y catálogo de **recursos**.

### Bodega (inventario)
- Catálogo de **materiales y herramientas** con stock, categorías y códigos QR.
- Entrega y devolución de herramientas/materiales por escaneo de QR.
- Flujo de aprobación de solicitudes y devoluciones con actualización automática de stock.

### Compras
- Solicitud de compra de materiales sin stock.
- Aprobación y agrupación en **lotes** por proveedor.
- Generación de **cotizaciones** y **órdenes de compra** en PDF.
- **Recepción en bodega** con ingreso al stock.

### Finanzas
- Registro de facturas de proveedores asociadas a OC y obra.
- Panel de estado de las facturas: por pagar, por vencer, vencidas y pagadas.
- Gestión de adelantos e historial de órdenes de compra.

### Estado de Pago (contratistas)
Valor contratado, avance ponderado y **generación de estados de pago** en PDF para su aprobación y facturación.

### Seguridad (HSEC / APR)
- Plantillas de inspección, checklists y su revisión.
- Inspecciones, observaciones de conducta y charlas de seguridad de 5 minutos.
- Comité Paritario (CPHS).

### Asistencia y RRHH
- **Registro por QR dinámico** (renovación cada 30 s, imposible de compartir por captura).
- Reportes de horas, atrasos y horas extra.
- **Liquidaciones de sueldo** y **generador de finiquitos** según normativa chilena.

### Mi Billetera Digital (trabajador)
Autoservicio móvil para el trabajador: QR de asistencia, saldo estimado del mes, **solicitud de adelantos**, firma de charlas y acceso a sus liquidaciones y finiquito.

### Usuarios y permisos
- Gestión de usuarios y credenciales con QR.
- Panel visual para activar/desactivar permisos por rol.

---

*Proyecto de TeoLabs.*
