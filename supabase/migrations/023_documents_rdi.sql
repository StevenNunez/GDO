-- ============================================================
-- 023 · Oficina Técnica — Almacenamiento de archivos, planos y RDI
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ AGREGA
--   1. El bucket `obra-docs` de Supabase Storage — hasta ahora la app NO tenía
--      almacenamiento de archivos: todo iba como base64 dentro de una columna
--      de Postgres. Eso sirve para una firma o una foto comprimida, pero un
--      plano o una EETT en PDF pesa megas: guardarlo así infla la base, hace
--      lentas TODAS las consultas de esa tabla y revienta el límite de fila.
--   2. `documents` + `documentRevisions` — control documental: un plano es un
--      documento con N revisiones (A, B, C…), y lo que importa es cuál es la
--      VIGENTE. Construir con una revisión superada es de los errores más caros
--      que existen en obra.
--   3. `rdis` — Requerimientos de Información: la consulta formal al mandante o
--      al proyectista, con plazo de respuesta. Una RDI sin responder es la
--      prueba de por qué una partida se atrasó, y su respuesta es lo que
--      justifica un adicional o un aumento de plazo (por eso puede quedar
--      enlazada al adicional que la origina).
--
-- POR QUÉ EL BUCKET ES PRIVADO
--   Los planos y contratos de una obra no son públicos. El bucket es privado y
--   la app pide una URL firmada de corta duración cada vez que alguien abre un
--   archivo. Un bucket público sería una URL eterna, adivinable y sin control
--   de quién la comparte.
--
-- CONVENCIÓN DE RUTAS (la RLS depende de ella)
--   {tenantId}/{projectId}/{carpeta}/{archivo}
--   La primera carpeta ES el tenant: así una empresa no puede leer ni escribir
--   los archivos de otra, y la regla se aplica en el servidor, no en la app.
-- ============================================================

-- ============================================================
-- 1. BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('obra-docs', 'obra-docs', false, 26214400)  -- 25 MB por archivo
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = 26214400;

-- Lectura: cualquiera de la empresa dueña de la carpeta. Los planos vigentes
-- tienen que poder verse en terreno, no solo en oficina técnica.
DROP POLICY IF EXISTS "obra_docs_select" ON storage.objects;
CREATE POLICY "obra_docs_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'obra-docs'
    AND (
      (storage.foldername(name))[1] = get_my_tenant_id()
      OR get_my_role() = 'super-admin'
    )
  );

-- Escritura y borrado: solo quien puede gestionar documentos o crear RDI, y
-- siempre dentro de la carpeta de su propia empresa.
DROP POLICY IF EXISTS "obra_docs_insert" ON storage.objects;
CREATE POLICY "obra_docs_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'obra-docs'
    AND (storage.foldername(name))[1] = get_my_tenant_id()
    AND (has_permission('documents:manage') OR has_permission('rdi:create'))
  );

DROP POLICY IF EXISTS "obra_docs_update" ON storage.objects;
CREATE POLICY "obra_docs_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'obra-docs'
    AND (storage.foldername(name))[1] = get_my_tenant_id()
    AND (has_permission('documents:manage') OR has_permission('rdi:create'))
  );

DROP POLICY IF EXISTS "obra_docs_delete" ON storage.objects;
CREATE POLICY "obra_docs_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'obra-docs'
    AND (storage.foldername(name))[1] = get_my_tenant_id()
    AND (has_permission('documents:manage') OR has_permission('rdi:create'))
  );

-- ============================================================
-- 2. DOCUMENTOS (planos, especificaciones, memorias)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    TEXT NOT NULL,
  "projectId"   UUID REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Código del plano tal como lo emite el proyectista: "A-01", "E-14".
  code          TEXT,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'plano'
                CHECK (type IN ('plano', 'especificacion', 'memoria', 'otro')),
  discipline    TEXT NOT NULL DEFAULT 'general'
                CHECK (discipline IN ('general', 'arquitectura', 'estructura',
                                      'sanitario', 'electrico', 'clima', 'gas',
                                      'urbanizacion', 'otro')),
  notes         TEXT,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documents_tenant_idx  ON public.documents ("tenantId");
CREATE INDEX IF NOT EXISTS documents_project_idx ON public.documents ("projectId");
-- El código identifica al plano dentro de la obra; dos "A-01" distintos en la
-- misma obra son la receta para construir con el plano equivocado.
CREATE UNIQUE INDEX IF NOT EXISTS documents_code_uniq
  ON public.documents ("projectId", code) WHERE code IS NOT NULL;

-- ============================================================
-- 3. REVISIONES
--    Cuál es la VIGENTE no se guarda como bandera: se deduce de la fecha de
--    emisión (la más nueva no anulada) en `src/lib/documents.ts`. Una bandera
--    "vigente" guardada a mano se desincroniza el día que alguien sube una
--    revisión y olvida bajar la anterior — y entonces hay dos vigentes, que es
--    peor que no tener ninguna.
-- ============================================================
CREATE TABLE IF NOT EXISTS public."documentRevisions" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    TEXT NOT NULL,
  "documentId"  UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,

  revision      TEXT NOT NULL,           -- 'A', 'B', '0', '1'…
  "issueDate"   DATE,                    -- fecha del proyectista
  "receivedAt"  DATE,                    -- cuándo llegó a la obra

  -- Ruta dentro del bucket `obra-docs`. Nullable: se puede registrar que existe
  -- una revisión aunque todavía no llegue el archivo.
  "filePath"    TEXT,
  "fileName"    TEXT,
  "fileSize"    BIGINT,
  "mimeType"    TEXT,

  -- Solo estados que alguien decide. "Vigente" y "superada" se derivan.
  status        TEXT NOT NULL DEFAULT 'activa'
                CHECK (status IN ('activa', 'anulada')),
  notes         TEXT,
  "uploadedBy"  TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_revisions_tenant_idx   ON public."documentRevisions" ("tenantId");
CREATE INDEX IF NOT EXISTS document_revisions_document_idx ON public."documentRevisions" ("documentId");
CREATE UNIQUE INDEX IF NOT EXISTS document_revisions_uniq
  ON public."documentRevisions" ("documentId", revision);

-- ============================================================
-- 4. RDI (Requerimientos de Información)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rdis (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    TEXT NOT NULL,
  "projectId"   UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  "contractId"  UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  -- Partida afectada y adicional que salió de la respuesta, si los hay.
  "workItemId"  UUID REFERENCES public."workItems"(id) ON DELETE SET NULL,
  "amendmentId" UUID REFERENCES public.amendments(id) ON DELETE SET NULL,
  "documentId"  UUID REFERENCES public.documents(id) ON DELETE SET NULL,

  number        INTEGER NOT NULL DEFAULT 1,
  subject       TEXT NOT NULL,
  question      TEXT NOT NULL,
  discipline    TEXT NOT NULL DEFAULT 'general'
                CHECK (discipline IN ('general', 'arquitectura', 'estructura',
                                      'sanitario', 'electrico', 'clima', 'gas',
                                      'urbanizacion', 'otro')),
  priority      TEXT NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('baja', 'normal', 'alta')),

  -- A quién se le pregunta. Texto libre: muchas veces es alguien externo
  -- (arquitecto, calculista) que no tiene cuenta en la app.
  "askedTo"     TEXT,
  "askedAt"     DATE,
  -- Plazo comprometido de respuesta. "Vencida" se deriva de acá, no se guarda.
  "dueDate"     DATE,

  status        TEXT NOT NULL DEFAULT 'abierta'
                CHECK (status IN ('abierta', 'respondida', 'cerrada', 'anulada')),
  answer        TEXT,
  "answeredAt"  TIMESTAMPTZ,
  "answeredBy"  TEXT,

  -- Lo que declara quien responde: si la respuesta trae obra o plazo extra.
  -- Es el puente a la Fase 4: de acá sale el adicional.
  "impactCost"  BOOLEAN NOT NULL DEFAULT FALSE,
  "impactTime"  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Adjuntos: el croquis que acompaña la pregunta y el que acompaña la respuesta.
  "filePath"    TEXT,
  "fileName"    TEXT,
  "answerFilePath" TEXT,
  "answerFileName" TEXT,

  notes         TEXT,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rdis_tenant_idx  ON public.rdis ("tenantId");
CREATE INDEX IF NOT EXISTS rdis_project_idx ON public.rdis ("projectId");
CREATE INDEX IF NOT EXISTS rdis_status_idx  ON public.rdis (status);
CREATE UNIQUE INDEX IF NOT EXISTS rdis_number_uniq
  ON public.rdis ("projectId", number);

-- Responder es una decisión distinta de preguntar: la toma el mandante o el
-- proyectista, y queda registrada con fecha y autor. Va en un trigger porque
-- esconder el botón no es seguridad.
CREATE OR REPLACE FUNCTION public.rdi_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.answer IS DISTINCT FROM OLD.answer
      OR (NEW.status = 'respondida' AND OLD.status IS DISTINCT FROM 'respondida'))
     AND NOT has_permission('rdi:answer') THEN
    RAISE EXCEPTION 'No tienes permiso para responder requerimientos de información.';
  END IF;

  -- Una RDI ya respondida conserva su respuesta: se puede cerrar o anular, no
  -- reescribir lo que se contestó (si cambia el criterio, va una RDI nueva).
  IF OLD.status IN ('respondida', 'cerrada')
     AND NEW.answer IS DISTINCT FROM OLD.answer
     AND NOT has_permission('rdi:answer') THEN
    RAISE EXCEPTION 'La respuesta de una RDI cerrada no se puede cambiar.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rdis_guard ON public.rdis;
CREATE TRIGGER rdis_guard
  BEFORE UPDATE ON public.rdis
  FOR EACH ROW EXECUTE FUNCTION public.rdi_guard();

-- ============================================================
-- 5. RLS
--    Planos y RDI se LEEN sin permiso especial dentro de la empresa: el plano
--    vigente y la respuesta a una consulta le sirven a todo el mundo en obra.
--    Escribir sí exige permiso.
-- ============================================================
ALTER TABLE public.documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."documentRevisions"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rdis                 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documents_select" ON public.documents;
CREATE POLICY "documents_select" ON public.documents
  FOR SELECT USING (
    "tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "documents_write" ON public.documents;
CREATE POLICY "documents_write" ON public.documents
  FOR ALL
  USING      ("tenantId" = get_my_tenant_id() AND has_permission('documents:manage'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('documents:manage'));

DROP POLICY IF EXISTS "document_revisions_select" ON public."documentRevisions";
CREATE POLICY "document_revisions_select" ON public."documentRevisions"
  FOR SELECT USING (
    "tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "document_revisions_write" ON public."documentRevisions";
CREATE POLICY "document_revisions_write" ON public."documentRevisions"
  FOR ALL
  USING      ("tenantId" = get_my_tenant_id() AND has_permission('documents:manage'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('documents:manage'));

DROP POLICY IF EXISTS "rdis_select" ON public.rdis;
CREATE POLICY "rdis_select" ON public.rdis
  FOR SELECT USING (
    "tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin'
  );

-- Crear y editar exige `rdi:create`; responder lo filtra además el trigger.
DROP POLICY IF EXISTS "rdis_write" ON public.rdis;
CREATE POLICY "rdis_write" ON public.rdis
  FOR ALL
  USING      ("tenantId" = get_my_tenant_id()
              AND (has_permission('rdi:create') OR has_permission('rdi:answer')))
  WITH CHECK ("tenantId" = get_my_tenant_id()
              AND (has_permission('rdi:create') OR has_permission('rdi:answer')));

-- ============================================================
-- 6. PERMISOS
--    Sin esto has_permission() devuelve FALSE y la base rechaza todo aunque la
--    UI muestre los botones. admin/operations/soporte/super-admin se resuelven
--    por código dentro de has_permission y no necesitan fila.
-- ============================================================
UPDATE public.roles
SET permissions = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      permissions || ARRAY[
        'rdi:create',
        'rdi:answer',
        'documents:manage'
      ]
    )
  )
)
WHERE id = 'jefe-oficina-tecnica' AND "tenantId" = '__default__';

-- El jefe de terreno pregunta (es quien detecta la falta de información en la
-- obra), pero no responde: eso es del proyectista o del mandante.
UPDATE public.roles
SET permissions = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(permissions || ARRAY['rdi:create'])
  )
)
WHERE id = 'jefe-terreno' AND "tenantId" = '__default__';
