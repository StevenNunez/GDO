# Descripción de Roles y Permisos

Este documento detalla las capacidades y responsabilidades de cada rol de usuario dentro de la plataforma de gestión de obra.

---

### 1. Super Administrador (`super-admin`)

**Visión:** El Dueño del Imperio.

Es el rol de más alto nivel, con control total sobre toda la plataforma y todos los suscriptores (inquilinos).

**Capacidades:**
- **Gestión Multi-Inquilino:** Puede crear, eliminar y cambiar entre los entornos de todos los suscriptores.
- **Control Total de Usuarios:** Puede gestionar usuarios de cualquier suscriptor, incluyendo la creación de otros `super-admin`.
- **Acceso Universal:** Tiene acceso a todas las funcionalidades de todos los demás roles combinados.
- **Configuración Maestra:** Controla todas las configuraciones globales, incluyendo los permisos para cada plan de suscripción.

---

### 2. Administrador de App (`admin`) & Administrador de Obra (`operations`)

**Visión:** El Gerente General de la Cuenta / El Gerente de Proyecto.

Estos dos roles tienen **exactamente los mismos permisos**. Son el nivel más alto *dentro de un suscriptor específico*. Se enfocan en la gestión estratégica, la supervisión de toda la operación y los ajustes de alto nivel.

**Capacidades:**
- **Gestión Total de Compras:** Aprueba "Solicitudes de Compra", crea "Lotes", genera "Solicitudes de Cotización" y visualiza las OC finales.
- **Gestión Total de Bodega:** Aprueba "Solicitudes de Materiales", confirma "Devoluciones" y puede realizar "Ingresos Manuales de Stock".
- **Gestión Total de Control de Obra:** Puede editar la estructura de partidas (EDT), registrar avances y revisar protocolos de calidad.
- **Gestión Financiera:** Accede al módulo de "Pagos" para ver, registrar y marcar facturas como pagadas. Gestiona proveedores.
- **Gestión de Usuarios:** Puede crear, editar, eliminar y cambiar contraseñas de todos los usuarios de su empresa.
- **Gestión de Permisos:** Puede ver el módulo de "Gestión de Permisos". *Nota:* la definición de permisos por rol es a nivel de plataforma y solo la edita el `super-admin` (la tabla `roles` es global).

---

### Soporte de App (`soporte`)

**Visión:** El equipo de soporte de la aplicación, dentro de una empresa.

Tiene **acceso total dentro de una empresa (tenant)**, exactamente igual que `admin`/`operations`, pensado para dar soporte al cliente. **Solo lo asigna el `super-admin`** ("el que da el alta al servicio"), no un administrador del propio tenant.

**Diferencia clave con el `super-admin`:** NO ve suscripciones ni la gestión de tenants — eso es exclusivo del `super-admin`, que es quien administra a los suscriptores. Un `soporte` opera solo sobre su empresa asignada.

---

### 3. Jefe de Oficina Técnica (`jefe-oficina-tecnica`)

**Visión:** El Arquitecto del Proyecto.

Es el responsable de la planificación técnica y presupuestaria de la obra. Su rol se centra en la configuración inicial y el seguimiento estratégico.

**Capacidades:**
- **Control de Obra:** Es el dueño de la **Estructura de Desglose del Trabajo (EDT)**. Puede crear, editar y eliminar partidas, fases y actividades.
- **Planificación Gantt:** Gestiona el cronograma maestro en la **Carta Gantt**, estableciendo fechas y dependencias.
- **Presupuesto:** Define las cantidades y precios unitarios de cada partida.
- **Seguimiento:** Visualiza todos los reportes de avance y la Curva S para controlar costos y plazos.

---

### 4. Jefe de Terreno (`jefe-terreno`)

**Visión:** El Comandante en el Campo.

Es el máximo responsable de la ejecución física de la obra. Se asegura de que el trabajo se realice según lo planificado.

**Capacidades:**
- **Registro de Avance:** Puede registrar el avance físico de **cualquier** partida de la obra.
- **Supervisión de Protocolos:** Tiene una visión global de las partidas enviadas a protocolo y puede intervenir en su gestión.
- **Solicitudes de Recursos:** Al igual que un supervisor, puede solicitar materiales a bodega y generar solicitudes de compra.
- **Gestión de Personal:** Supervisa el trabajo de los supervisores y sus equipos.

---

### 5. Jefe de Bodega (`bodega-admin`)

**Visión:** El Guardián del Inventario.

Es el responsable principal de la bodega. Su poder se centra en gestionar el flujo físico de entrada y salida de bienes.

**Capacidades:**
- **Aprueba Salidas y Devoluciones:** Autoriza las "Solicitudes de Materiales" y confirma las "Devoluciones", afectando el stock en tiempo real.
- **Recepción de Compras:** Recibe los materiales de las Órdenes de Compra, los ingresa al sistema y actualiza el inventario.
- **Gestión de Catálogo:** Puede crear y editar materiales, herramientas, categorías y unidades de medida.
- **Entrega y Devolución Rápida:** Usa el panel de checkout/return para entregar y recibir herramientas escaneando QRs.

---

### 6. Supervisor (`supervisor`)

**Visión:** El Líder en Terreno.

Es el jefe de equipo en la obra. Su función principal es ejecutar el trabajo, solicitar recursos y registrar el progreso.

**Capacidades:**
- **Registro de Avance:** Registra el avance diario de las partidas que tiene **asignadas**.
- **Finalización de Partidas:** Al llegar al 100%, envía la partida a "protocolo" para su revisión por Calidad.
- **Solicitud de Recursos:** Crea "Solicitudes de Materiales" (a bodega) y "Solicitudes de Compra" (materiales externos).
- **Gestión de Seguridad:** Completa los checklists e inspecciones de seguridad que le son asignados.

---

### 7. Finanzas (`finance`)

**Visión:** El Controlador Financiero.

Se enfoca en el ciclo final de compras y la gestión de pagos, asegurando la trazabilidad financiera.

**Capacidades:**
- **Procesamiento de Cotizaciones:** Recibe las cotizaciones de proveedores, sube los documentos, valida precios y genera la **Orden de Compra Oficial**.
- **Gestión de Pagos:** Accede al módulo de "Pagos" para ver el estado de las facturas, registrar pagos y gestionar datos de proveedores.

---

### 8. Calidad (`quality`)

**Visión:** El Inspector de Calidad.

Rol especializado en asegurar que los trabajos ejecutados cumplan con los estándares definidos.

**Capacidades:**
- **Revisión de Protocolos:** Es el responsable de revisar las partidas que los supervisores marcan como 100% completadas.
- **Aprobación/Rechazo:** Aprueba las partidas que cumplen con los estándares o las rechaza con observaciones para que sean corregidas.

---

### 9. Prevencionista de Riesgos (`apr`) / Comité Paritario (`cphs`)

**Visión:** El Guardián de la Seguridad.

Roles enfocados exclusivamente en la gestión de la seguridad y prevención de riesgos en la obra.

**Capacidades:**
- **Gestión de Seguridad Total:** Crea plantillas de checklist, asigna checklists a supervisores, y revisa los formularios completados para aprobarlos o rechazarlos.
- **Inspecciones y Observaciones:** Registra "Inspecciones de Seguridad" no planificadas y "Observaciones de Conducta", asignando tareas correctivas.

---

### 10. Guardia (`guardia`)

**Visión:** El Controlador de Acceso.

Rol especializado con una única función, optimizado para rapidez.

**Capacidades:**
- **Registro de Asistencia:** Accede directamente al módulo de asistencia para escanear los códigos QR de los trabajadores, registrando su entrada y salida.

---

### 11. Colaborador (`worker`)

**Visión:** El Motor de la Obra.

Es el rol más básico, enfocado en la responsabilidad sobre sus herramientas.

**Capacidades:**
- **Ver Mis Herramientas:** Puede consultar qué herramientas tiene actualmente bajo su responsabilidad. Su QR es escaneado por el Jefe de Bodega para el retiro y devolución.
