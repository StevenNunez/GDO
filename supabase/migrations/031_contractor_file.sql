-- ============================================================
-- 031 · Bloque A — Expediente documental del contratista
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- POR QUÉ «EXPEDIENTE» Y NO «ENROLAMIENTO»
--   El enrolamiento no es una entidad: es el ESTADO de una carpeta de papeles.
--   Un contratista está enrolado cuando su carpeta está completa y vigente, y
--   deja de estarlo solo —sin que nadie toque nada— el día que se le vence el
--   F30-1. Por eso el estado NO se guarda en una columna: se calcula. Un
--   «enrolado = true» escrito hace ocho meses miente exactamente el día que
--   más caro cuesta (`contractor_enrollment_status`, más abajo).
--
-- POR QUÉ EL CATÁLOGO DE TIPOS ES POR EMPRESA Y NO ESTÁ FIJO EN EL CÓDIGO
--   Cada constructora exige papeles distintos, y mañana va a exigir uno más
--   (certificación ISO, carpeta laboral, adhesión a la mutual, Previred). Con
--   el catálogo en una tabla, agregar un requisito es una fila; con la lista
--   quemada en el código, es una migración cada vez. La lista estándar chilena
--   se ofrece como punto de partida desde la app, no se impone acá.
-- ============================================================

-- ============================================================
-- 1. TIPOS DE DOCUMENTO — qué papeles exige esta empresa
-- ============================================================
CREATE TABLE IF NOT EXISTS public."contractorDocumentTypes" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    TEXT NOT NULL,

  -- Identificador estable para los tipos estándar ('f30_1', 'mutual', …).
  -- Permite reconocerlos entre empresas sin comparar por nombre.
  code          TEXT,
  name          TEXT NOT NULL,
  description   TEXT,

  -- Sin este papel, el contratista no queda enrolado. Los opcionales suman
  -- pero no bloquean.
  required      BOOLEAN NOT NULL DEFAULT TRUE,

  -- Los que caducan exigen fecha de vencimiento al cargarlos. Una escritura de
  -- constitución no vence; un F30-1 sí, y de eso depende poder pagar.
  "hasExpiry"   BOOLEAN NOT NULL DEFAULT FALSE,

  -- Días antes del vencimiento en que empieza a avisar. NULL = 30.
  "warnDays"    INTEGER,

  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contractor_doc_types_tenant_idx
  ON public."contractorDocumentTypes" ("tenantId", "sortOrder");

-- Un mismo código no se repite dentro de la empresa: si no, «F30-1» existiría
-- dos veces y el expediente pediría el mismo papel dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS contractor_doc_types_code_uniq
  ON public."contractorDocumentTypes" ("tenantId", code)
  WHERE code IS NOT NULL;

-- ============================================================
-- 2. DOCUMENTOS DEL CONTRATISTA — la carpeta de cada uno
--    Cuelga de `suppliers`: el contratista YA existe ahí (tiene RUT, banco y
--    correo). Crear una tabla «contratistas» aparte obligaría a mantener dos
--    fichas de la misma empresa y a elegir cuál de las dos miente.
-- ============================================================
CREATE TABLE IF NOT EXISTS public."contractorDocuments" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"      TEXT NOT NULL,
  "supplierId"    UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  "documentTypeId" UUID REFERENCES public."contractorDocumentTypes"(id) ON DELETE SET NULL,

  number          TEXT,
  "issueDate"     DATE,
  "expiryDate"    DATE,

  -- El archivo vive en el bucket `obra-docs` (migración 023); acá solo la ruta.
  -- Ruta: {tenantId}/contratistas/{supplierId}/…  — la RLS del bucket compara
  -- la PRIMERA carpeta con la empresa, así que el tenant va siempre delante.
  "filePath"      TEXT,
  "fileName"      TEXT,
  "fileSize"      BIGINT,

  -- Revisión de oficina central. «observado» es el rechazo con motivo: el
  -- contratista sabe qué corregir sin que nadie lo llame por teléfono.
  status          TEXT NOT NULL DEFAULT 'en_revision'
                  CHECK (status IN ('en_revision', 'aprobado', 'observado')),
  observations    TEXT,

  "reviewedBy"    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  "reviewedAt"    TIMESTAMPTZ,
  "uploadedBy"    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un documento que vence sin fecha de vencimiento no se puede controlar.
  CONSTRAINT contractor_doc_expiry_after_issue
    CHECK ("expiryDate" IS NULL OR "issueDate" IS NULL OR "expiryDate" >= "issueDate"),
  -- Observar sin decir qué está mal deja al contratista adivinando.
  CONSTRAINT contractor_doc_observation_needs_reason
    CHECK (status <> 'observado' OR (observations IS NOT NULL AND length(btrim(observations)) > 0))
);

CREATE INDEX IF NOT EXISTS contractor_docs_tenant_idx
  ON public."contractorDocuments" ("tenantId");
CREATE INDEX IF NOT EXISTS contractor_docs_supplier_idx
  ON public."contractorDocuments" ("supplierId");
CREATE INDEX IF NOT EXISTS contractor_docs_expiry_idx
  ON public."contractorDocuments" ("expiryDate") WHERE "expiryDate" IS NOT NULL;

-- Un tipo de documento, un documento vigente por contratista. Cargar el F30-1
-- nuevo REEMPLAZA al anterior (se actualiza la fila): así el expediente dice
-- siempre cuál es el papel que vale hoy, sin que nadie tenga que elegir entre
-- cinco versiones.
CREATE UNIQUE INDEX IF NOT EXISTS contractor_docs_type_uniq
  ON public."contractorDocuments" ("supplierId", "documentTypeId")
  WHERE "documentTypeId" IS NOT NULL;

-- ============================================================
-- 3. DATOS DE LA EMPRESA CONTRATISTA
--    Lo que hace falta para redactar y firmar un contrato, y que `suppliers`
--    todavía no tenía.
-- ============================================================
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS "legalName"          TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS giro                 TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS "representativeName" TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS "representativeRut"  TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS "representativeEmail" TEXT;
-- Marca a los proveedores que además son contratistas: son los que necesitan
-- expediente. Un proveedor de áridos no tiene por qué aparecer «incompleto».
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS "isContractor" BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- 4. ESTADO DE ENROLAMIENTO — calculado, nunca guardado
--
--    Se calcula acá además de en el frontend porque la base tiene que poder
--    responder la misma pregunta sin confiar en el navegador. Devuelve:
--      'sin_expediente' · no se le ha pedido ningún papel
--      'incompleto'     · falta al menos un documento obligatorio
--      'observado'      · hay un obligatorio devuelto con observaciones
--      'vencido'        · hay un obligatorio con la fecha pasada
--      'enrolado'       · todos los obligatorios cargados, aprobados y vigentes
-- ============================================================
CREATE OR REPLACE FUNCTION public.contractor_enrollment_status(p_supplier_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant     TEXT;
  v_requeridos INTEGER;
  v_faltantes  INTEGER;
  v_observados INTEGER;
  v_vencidos   INTEGER;
BEGIN
  SELECT "tenantId" INTO v_tenant FROM public.suppliers WHERE id = p_supplier_id;
  IF v_tenant IS NULL THEN
    RETURN 'sin_expediente';
  END IF;

  SELECT COUNT(*) INTO v_requeridos
  FROM public."contractorDocumentTypes"
  WHERE "tenantId" = v_tenant AND active AND required;

  IF v_requeridos = 0 THEN
    RETURN 'sin_expediente';
  END IF;

  -- Obligatorios sin documento cargado.
  SELECT COUNT(*) INTO v_faltantes
  FROM public."contractorDocumentTypes" ty
  WHERE ty."tenantId" = v_tenant AND ty.active AND ty.required
    AND NOT EXISTS (
      SELECT 1 FROM public."contractorDocuments" d
      WHERE d."supplierId" = p_supplier_id AND d."documentTypeId" = ty.id
    );

  SELECT
    COUNT(*) FILTER (WHERE d.status = 'observado'),
    COUNT(*) FILTER (WHERE d."expiryDate" IS NOT NULL AND d."expiryDate" < CURRENT_DATE)
  INTO v_observados, v_vencidos
  FROM public."contractorDocuments" d
  JOIN public."contractorDocumentTypes" ty ON ty.id = d."documentTypeId"
  WHERE d."supplierId" = p_supplier_id AND ty.active AND ty.required;

  -- El orden importa: vencido pesa más que observado, y ambos más que faltante.
  -- Lo que se muestra es el problema MÁS grave, no el primero encontrado.
  IF v_vencidos   > 0 THEN RETURN 'vencido';    END IF;
  IF v_observados > 0 THEN RETURN 'observado';  END IF;
  IF v_faltantes  > 0 THEN RETURN 'incompleto'; END IF;

  -- Falta que alguien de oficina central los haya revisado.
  IF EXISTS (
    SELECT 1 FROM public."contractorDocuments" d
    JOIN public."contractorDocumentTypes" ty ON ty.id = d."documentTypeId"
    WHERE d."supplierId" = p_supplier_id AND ty.active AND ty.required
      AND d.status <> 'aprobado'
  ) THEN
    RETURN 'incompleto';
  END IF;

  RETURN 'enrolado';
END;
$$;

-- ============================================================
-- 5. LISTA ESTÁNDAR CHILENA — se ofrece, no se impone
--    La app la carga con un botón la primera vez. Se salta los códigos que la
--    empresa ya tenga, así que llamarla dos veces no duplica nada.
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_contractor_document_types(p_tenant_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_insertados INTEGER := 0;
BEGIN
  IF p_tenant_id IS DISTINCT FROM get_my_tenant_id()
     AND get_my_role() <> 'super-admin' THEN
    RAISE EXCEPTION 'No puedes cargar el catálogo de otra empresa.';
  END IF;

  WITH estandar(code, name, description, required, has_expiry, sort_order) AS (
    VALUES
      ('e_rut',        'e-RUT de la empresa',                'Rol Único Tributario de la sociedad contratista.', TRUE,  FALSE, 10),
      ('constitucion', 'Escritura de constitución',          'Estatutos o escritura pública de la sociedad.',     TRUE,  FALSE, 20),
      ('vigencia',     'Certificado de vigencia',            'Vigencia de la sociedad en el Registro de Comercio.', TRUE, TRUE, 30),
      ('poder',        'Poder del representante legal',      'Acredita quién puede firmar el contrato.',          TRUE,  TRUE,  40),
      ('cedula_rep',   'Cédula del representante legal',     'Documento de identidad de quien firma.',            TRUE,  FALSE, 50),
      ('mutual',       'Adhesión a mutual',                  'Certificado de afiliación al organismo administrador (Ley 16.744).', TRUE, TRUE, 60),
      ('f30',          'F30 · Antecedentes laborales',       'Certificado de antecedentes laborales y previsionales de la Dirección del Trabajo.', TRUE, TRUE, 70),
      ('f30_1',        'F30-1 · Cumplimiento de obligaciones', 'Certificado de cumplimiento de obligaciones laborales y previsionales (Ley 20.123). Sin él no se paga un estado de pago.', TRUE, TRUE, 80),
      ('poliza',       'Póliza de responsabilidad civil',    'Seguro vigente por daños a terceros.',              TRUE,  TRUE,  90),
      ('riohs',        'Reglamento interno (RIOHS)',         'Reglamento Interno de Orden, Higiene y Seguridad.', FALSE, FALSE, 100),
      ('prevencion',   'Programa de prevención de riesgos',  'Programa y, si corresponde, prevencionista asignado a la obra.', FALSE, FALSE, 110),
      ('banco',        'Certificado de cuenta bancaria',     'Para transferir los estados de pago a la cuenta correcta.', TRUE, FALSE, 120),
      ('previred',     'Certificado Previred',               'Pago de cotizaciones del período.',                 FALSE, TRUE,  130)
  )
  INSERT INTO public."contractorDocumentTypes"
    ("tenantId", code, name, description, required, "hasExpiry", "sortOrder")
  SELECT p_tenant_id, e.code, e.name, e.description, e.required, e.has_expiry, e.sort_order
  FROM estandar e
  WHERE NOT EXISTS (
    SELECT 1 FROM public."contractorDocumentTypes" ty
    WHERE ty."tenantId" = p_tenant_id AND ty.code = e.code
  );

  GET DIAGNOSTICS v_insertados = ROW_COUNT;
  RETURN v_insertados;
END;
$$;

-- ============================================================
-- 6. RLS
-- ============================================================
ALTER TABLE public."contractorDocumentTypes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contractorDocuments"     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contractor_doc_types_select" ON public."contractorDocumentTypes";
CREATE POLICY "contractor_doc_types_select" ON public."contractorDocumentTypes"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "contractor_doc_types_write" ON public."contractorDocumentTypes";
CREATE POLICY "contractor_doc_types_write" ON public."contractorDocumentTypes"
  FOR ALL USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('contractors:manage'))
    OR get_my_role() = 'super-admin'
  ) WITH CHECK (
    ("tenantId" = get_my_tenant_id() AND has_permission('contractors:manage'))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "contractor_docs_select" ON public."contractorDocuments";
CREATE POLICY "contractor_docs_select" ON public."contractorDocuments"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "contractor_docs_write" ON public."contractorDocuments";
CREATE POLICY "contractor_docs_write" ON public."contractorDocuments"
  FOR ALL USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('contractors:manage'))
    OR get_my_role() = 'super-admin'
  ) WITH CHECK (
    ("tenantId" = get_my_tenant_id() AND has_permission('contractors:manage'))
    OR get_my_role() = 'super-admin'
  );

-- ============================================================
-- 7. REALTIME
-- ============================================================
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."contractorDocumentTypes"; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."contractorDocuments";     EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
