<div align="center">

# GESTIÓN DE OBRAS

**El control de la obra, de la oficina técnica al terreno**

Software de gestión para constructoras, contratistas y subcontratistas chilenos.

Un producto de **[Teo Labs](https://www.teolabs.app)** ®

[www.gestiondeobras.app](https://www.gestiondeobras.app)

</div>

---

## De qué se trata

Una obra se administra, casi siempre, con una carpeta de Excel por cada pregunta: uno para el
presupuesto, otro para el programa de terminaciones, otro para las compras, otro para los
estados de pago. Cada planilla la mantiene una sola persona, y ninguna sabe lo que dice la
otra.

El problema no son las planillas. Es lo que ninguna de ellas puede responder sola:

> ¿Cuánto nos falta por cobrarle al mandante este mes, y qué respalda ese número?
> ¿Qué departamento del piso 7 quedó atrasado, y por qué causa?
> ¿Lo que compramos para esta partida está dentro del presupuesto meta?
> ¿Quién aprobó este adicional, cuándo, y con qué firma?
> ¿Mi subcontratista ya entregó el F30-1 de este mes?

**Gestión de Obras responde esas preguntas.** Es un SaaS multi-empresa que sigue la obra de
punta a punta: el presupuesto y el contrato, las compras y la bodega, el avance físico día a
día desde el celular, los estados de pago, los subcontratos y la recepción final. Cada dato
tiene autor, fecha y obra.

No es un inventario con login. Es el hilo que une lo que se presupuestó, lo que se compró,
lo que se avanzó y lo que se cobró.

---

## Las ideas que sostienen el sistema

Si vas a tocar este código, esto es lo que conviene entender antes que la carpeta `src/`.

**1. El aislamiento entre empresas vive en la base de datos.**
Cada tabla lleva el `tenantId` de su empresa y Postgres aplica RLS (seguridad por fila). Un
`where` olvidado en una consulta no entrega filas ajenas: la protección no depende de que
cada pantalla se acuerde de filtrar. Los roles también son **por empresa**: una constructora
puede ajustar los permisos de un rol sin tocar a las demás.

**2. El plan decide qué módulos existen; el rol decide quién los usa.**
`can()` aplica los dos filtros a la vez y ambos cierran por defecto. El plan viene de
`tenants.plan`, y el super-administrador puede encender o apagar un módulo para **una**
empresa: solo se guarda la diferencia con el plan, así que si mañana cambia qué trae cada
plan, quien no fue tocado a mano lo hereda solo. Esto es visibilidad de producto, no
seguridad: quien protege los datos sigue siendo la RLS.

**3. Los números viven en funciones puras, con pruebas.**
Presupuesto, APU, sueldos, asistencia, contrato, estados de pago, control de costos, el tren
de actividades, el PPC… todo cálculo de plata o de tiempo está en `src/lib/`, separado de
React y de Supabase, y cubierto por **891 pruebas en 33 archivos**. Cuando una cifra sale
mal, se arregla y se prueba en un solo lugar.

**4. Lo que se puede calcular no se guarda.**
La matriz del tren de actividades de una obra grande son miles de celdas con fechas. No
están en la base: salen de la fecha de inicio de cada actividad, su ritmo y el calendario
laboral. Una celda guardada y un avance guardado siempre terminan discrepando; una celda
calculada, nunca.

**5. El sistema propone, una persona decide.**
El avance del tren puede llevarse a la partida de la EDT, los compromisos de la semana
pueden armarse desde el tren y el día de terreno puede pasar a la bitácora. Ninguno ocurre
solo: el sistema deja el borrador y alguien aprieta el botón. La EDT es lo que se le cobra
al mandante y la bitácora se firma; un dato que aparece sin que nadie lo mire no sirve en
ninguno de los dos.

---

## Un recorrido: del programa de terminaciones a la bitácora firmada

Así viaja el trabajo de un piso a través de Last Planner:

```
  Unidades de obra ──► Calendario laboral ──► Tren de actividades
  (deptos, pisos)      (días y feriados)       (las fechas se calculan)
                                                       │
                                                       ▼
                         Parte diario desde el celular, o por enlace al capataz
                         (avance ACUMULADO de cada unidad · causa si no avanzó)
                                                       │
              ┌───────────────────┬────────────────────┼──────────────────┐
              ▼                   ▼                    ▼                  ▼
       Avance de la          Compromisos de      Cierre de la        Bitácora y
       partida (EDT)         la semana           semana (PPC)        libro de obra
              └──────── el sistema propone · una persona aprieta el botón ┘
                                                       │
                                                       ▼
                         Análisis: curva programado vs. real, rendimiento
                         por cuadrilla y qué es lo que más frena la obra
```

---

## Módulos

### Oficina Técnica
Todo lo que hace un jefe de oficina técnica alrededor del contrato.

| Área | Qué hace |
|---|---|
| **Contrato** | Contrato con el mandante, garantías y reajustes con indicadores UF / UTM / IPC |
| **Presupuesto, APU y Recursos** | Catálogo de recursos, biblioteca de análisis de precio unitario y la cascada costo directo → gastos generales → imprevistos → utilidad → IVA |
| **Estados de pago** | Estado de pago al mandante con descuentos y certificado en PDF |
| **Adicionales y adendas** | Obras extraordinarias y modificaciones del contrato, con su propio flujo de aprobación |
| **Control de costos** | Costo real por partida contra el presupuesto meta, y el margen de la obra |
| **Curva S** | Avance programado contra real sobre la EDT |
| **RDI y Planos** | Requerimientos de información con plazo, y planos por revisión con la vigente a la vista |
| **Subcontratos** | Contratos a terceros, licitación y firma, adendas, retención, estados de pago y expediente del contratista (F30-1, Ley 20.123) |
| **Recepción de obra** | Recepción provisoria y definitiva, observaciones y devolución de la retención |
| **Equipos y arriendos** | Maquinaria arrendada y su control |
| **Flujos de aprobación** | La cadena de visto bueno de cada empresa, con firma, motivo de rechazo y delegación |
| **Agenda** | Término del contrato, vencimiento de garantías y del F30-1 y fechas de pago en una sola lista; se calcula desde cada documento, no se copia |
| **Orden de pago y cierre** | El documento con el que Finanzas paga un estado de pago aprobado (se emite, se envía por correo, se anula y se reemite) y la liquidación final del contrato |

### Last Planner
Programación de obra por unidades, pensada para el supervisor que reporta desde un piso.

| Pantalla | Qué hace |
|---|---|
| **Resumen** | PPC de la semana con su tendencia, lo que necesita atención hoy y el estado de la configuración |
| **Unidades de obra** | Departamentos, pisos y frentes; generador por patrón o pegado desde Excel; cada tipología con su color |
| **Calendario laboral** | Días de trabajo de la obra, feriados legales de Chile calculados y excepciones; el mes visual con cada día en su color |
| **Tren de actividades** | La matriz: actividades en filas, unidades en columnas, cada celda con el día que le toca |
| **Programa semanal** | Lookahead de seis semanas, restricciones, compromisos, PPC y causas de no cumplimiento |
| **Parte diario** | Seis botones de avance, pensado para una mano; enlace por WhatsApp para el capataz sin cuenta; PDF del día |
| **Análisis** | Curva programado vs. real, rendimiento por cuadrilla, Pareto de causas y pulso de los últimos 14 días |

### Control de Obra
EDT (proyecto → fases → partidas) con avance diario, protocolos de calidad por partida, Carta
Gantt, **bitácora** y **libro de obra** foliado con firmas y PDF.

### Bodega
Catálogo de materiales y herramientas con stock y códigos QR. Entrega y devolución por
escaneo, solicitudes con aprobación y actualización automática del stock.

### Compras
Solicitud de compra, aprobación y agrupación en **lotes** por proveedor, cotizaciones y
**órdenes de compra** en PDF, y recepción en bodega con ingreso al stock.

### Finanzas
Facturas de proveedor ligadas a la orden de compra y a la obra, con su estado (por pagar,
por vencer, vencida, pagada) y adelantos de sueldo.

### Seguridad (HSEC)
Plantillas, checklists, inspecciones, observaciones de conducta, charlas de cinco minutos y
Comité Paritario, con su revisión y sus PDF.

### Asistencia y RRHH
Asistencia por **QR dinámico** (se renueva cada 30 segundos, así una captura no sirve),
reportes de horas, atrasos y horas extra, **liquidaciones de sueldo** y **finiquitos** con
normativa chilena.

### Mi Billetera (trabajador)
Autoservicio móvil: QR de asistencia, saldo estimado del mes, solicitud de adelantos, firma
de charlas y acceso a su liquidación y finiquito.

### Empresas, obras y clientes
Jerarquía **Empresa → Cliente → Obra → Presupuesto → Partidas**, control de gastos por
cliente y **vínculos entre empresas**: el subcontratista trabaja desde su propia cuenta y
prepara el estado de pago, que vive una sola vez, en la cuenta de quien paga.

### Administración
Usuarios y credenciales con QR, permisos por rol y por empresa, planes de suscripción y el
interruptor de módulos por empresa para el super-administrador.

### Asistente GDO
Asistente de consulta integrado al panel. Responde sobre la obra activa —stock crítico,
solicitudes pendientes, avance por fase, equipo— a partir de un resumen compacto del
proyecto. Es solo de lectura.

---

## Stack

| Capa | Tecnología |
|---|---|
| Aplicación | Next.js 16 (App Router) + React 19 + TypeScript |
| Datos y acceso | Supabase: autenticación, Postgres con RLS y realtime |
| Interfaz | Tailwind CSS + shadcn/ui (Radix), recharts para los gráficos |
| Tipografía | Manrope en la app; Inter y JetBrains Mono en Last Planner |
| Documentos | jsPDF (órdenes de compra, estados de pago, libro de obra, parte diario…), exceljs |
| Correo | nodemailer por SMTP, solo desde el servidor |
| Asistente | Google Gemini, solo desde el servidor |
| Escaneo | html5-qrcode |
| Pruebas | Vitest: lógica de negocio, 891 pruebas |

Es una app instalable en el teléfono (manifiesto PWA), con tema claro por defecto y oscuro.

---

## Puesta en marcha

### Requisitos
- Node.js 20 o superior y npm
- Un proyecto de Supabase

### Instalación

```bash
npm install
```

El repositorio incluye un `.npmrc` con `legacy-peer-deps=true`; sin él, `npm install` se
detiene por conflictos de dependencias entre pares.

### Variables de entorno

Copia `.env.example` a `.env.local` y completa los valores:

```bash
NEXT_PUBLIC_SUPABASE_URL=        # Supabase → Project Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # SOLO servidor: salta la RLS
GEMINI_API_KEY=                  # Asistente GDO (solo servidor)
SMTP_HOST= SMTP_PORT= SMTP_USER= SMTP_PASS= SMTP_FROM= SMTP_SECURE=   # correo (opcional)
```

Sin las variables SMTP la app no intenta enviar correos: avisa que falta configurarlas y deja
descargar el documento para mandarlo a mano.

### Base de datos

Las migraciones están en `supabase/migrations/`, numeradas de `001` a `041`. Se aplican **en
orden** y a mano en el SQL Editor de Supabase; no hay CLI conectada. La mayoría están escritas para poder correrse de nuevo sin duplicar nada.

### Comandos

```bash
npm run dev        # servidor de desarrollo (webpack, sin parpadeo de estilos)
npm run dev:turbo  # desarrollo con Turbopack (recarga más rápida)
npm run build      # build de producción
npm run start      # sirve el build
npm run lint       # ESLint
npm test           # pruebas (Vitest)
```

### Modo demo

La pantalla de acceso tiene un botón **«Probar Demo»**: entra a un entorno de demostración
**local, sin cuenta**. Los datos viven solo en el navegador (localStorage) y cada vez que se
pulsa, la demo parte de una obra de ejemplo limpia. No toca Supabase.

---

## Estructura

```
src/
├── app/                  rutas (App Router)
│   ├── dashboard/        un directorio por módulo (last-planner, oficina-tecnica, bodega…)
│   ├── api/              rutas de servidor: admin, registro, correo, índices, parte público
│   ├── login/            acceso y modo demo
│   └── parte/[token]/    parte diario por enlace, sin cuenta
├── components/           ui/ (shadcn), operations/, oficina-tecnica/, safety/, admin/, layout/
├── modules/
│   ├── auth/             sesión, perfil, empresas y plan
│   ├── data/             DataProvider, hooks por tabla y mutaciones
│   └── core/             permisos, tipos, cliente de Supabase y el modo demo local
├── lib/                  lógica pura y generadores de PDF — lo que tiene pruebas
├── actions/              server actions (Asistente GDO)
└── proxy.ts              refresca la sesión de Supabase en /dashboard y /api/admin

supabase/migrations/      001 … 041
public/                   manifiesto, íconos y sonidos
design/                   ícono de la app y su script de generación
ROLES.md                  qué puede hacer cada rol
```

---

## Deploy

La app corre en **Vercel**, con el repositorio conectado a la rama principal. Las mismas
variables de `.env.local` se cargan en el panel de Vercel. El build usa webpack
(`next build --webpack`) a propósito, y el `.npmrc` del repositorio es el que permite que la
instalación termine.

---

## Seguridad

- **RLS en Postgres**: el aislamiento entre empresas no depende de la aplicación.
- **La clave de servicio nunca llega al navegador.** Crear o borrar usuarios, resetear
  contraseñas, crear empresas y registrarse pasan por rutas de servidor que primero verifican
  la sesión y el rol de quien llama.
- **Límite de uso** en las rutas que podrían abusarse: registro, envío de correo e indicadores.
  Sin eso, el envío de correo sería un relé de spam con el dominio de la plataforma.
- **Enlace de parte diario sin cuenta**: token generado por la app, atado a una actividad y a
  un solo día, y validado en el servidor; la fecha la fija el token y no el cliente.
- **Cabeceras de seguridad** en todas las rutas: sin incrustación en otros sitios, tipo de
  contenido fijo, política de referencia, permisos de cámara y ubicación solo para el propio
  sitio y HSTS.
- **Datos de prueba aislados**: el modo demo funciona íntegramente en el navegador y no
  comparte nada con la base real.

---

<div align="center">

### Construido por Teo Labs

*Menos planillas, más obra.*

**[teolabs.app](https://www.teolabs.app)** ®

</div>
