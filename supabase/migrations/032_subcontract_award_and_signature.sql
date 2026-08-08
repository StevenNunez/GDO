-- ============================================================
-- 032 · Bloque A2 — Cotizaciones, adjuntos y firma del contrato
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ CIERRA
--   La parte del proceso que va entre «tengo un contratista enrolado» y «tengo
--   un contrato vigente»: pedir cotizaciones, compararlas, adjudicar, generar
--   el documento y que lo firmen las dos partes.
--
-- POR QUÉ LAS COTIZACIONES SON FILAS Y NO UN PDF ADJUNTO
--   La pizarra pedía adjuntar «A) cuadro comparativo B) cotizaciones». Un
--   cuadro comparativo escaneado sirve para archivar, pero no para decidir ni
--   para auditar: nadie puede preguntarle nada. Con las ofertas como filas
--   (oferente, monto, plazo), el cuadro lo arma la app sola y —lo importante—
--   queda registrado POR QUÉ se eligió al que se eligió cuando no es el más
--   barato. Ese es el dato que nunca está cuando alguien pregunta seis meses
--   después. El archivo de cada oferta se adjunta igual.
--
-- POR QUÉ LA FIRMA DEL CONTRATO NO USA EL MOTOR DE APROBACIONES (029)
--   Son dos cosas distintas que se parecen. La cadena de aprobación es INTERNA
--   y secuencial: mi jefe de terreno, después mi oficina técnica, después mi
--   gerencia. La firma del contrato es entre DOS PARTES: mi empresa y el
--   contratista, que no es de mi empresa y muchas veces ni siquiera tiene
--   cuenta en la app. Meterlo como un paso más de la cadena obligaría a darle
--   usuario al contratista para que exista el paso, y a que su firma se vea
--   como un visto bueno interno. Primero se aprueba adentro, después se firma
--   entre las partes.
-- ============================================================

-- ============================================================
-- 1. COTIZACIONES RECIBIDAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public."subcontractQuotes" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     TEXT NOT NULL,
  "subcontractId" UUID NOT NULL REFERENCES public.subcontracts(id) ON DELETE CASCADE,

  -- El oferente suele estar cargado como proveedor, pero se permite texto libre
  -- para no obligar a crearle ficha a quien cotizó y no ganó.
  "supplierId"   UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  "supplierName" TEXT NOT NULL,

  "amountNet"    NUMERIC(18,4) NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'CLP' CHECK (currency IN ('CLP', 'UF')),
  "plazoDias"    INTEGER,
  "quoteDate"    DATE,
  "validUntil"   DATE,

  -- El PDF de la oferta.
  "filePath"     TEXT,
  "fileName"     TEXT,
  "fileSize"     BIGINT,

  notes          TEXT,
  -- La adjudicada. Una sola por subcontrato (índice único más abajo).
  awarded        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Por qué esta y no la más barata. Obligatorio cuando corresponde: lo exige
  -- un trigger, porque es exactamente el dato que nadie escribe si no se le
  -- obliga, y el único que sirve cuando alguien pregunta después.
  "awardReason"  TEXT,

  "createdBy"    TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subcontract_quotes_tenant_idx
  ON public."subcontractQuotes" ("tenantId");
CREATE INDEX IF NOT EXISTS subcontract_quotes_sub_idx
  ON public."subcontractQuotes" ("subcontractId");

-- Una sola oferta adjudicada por subcontrato: dos ganadores no es un empate,
-- es un dato roto.
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_quotes_awarded_uniq
  ON public."subcontractQuotes" ("subcontractId")
  WHERE awarded;

/**
 * Adjudicar una oferta que NO es la más barata exige decir por qué.
 * Va como trigger y no como CHECK porque la regla depende de las OTRAS filas
 * (cuál es la menor), y un CHECK solo ve la suya.
 */
CREATE OR REPLACE FUNCTION public.sq_guard_award_reason()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_menor NUMERIC;
BEGIN
  IF NOT NEW.awarded THEN
    RETURN NEW;
  END IF;

  -- Se comparan solo las de la misma moneda: una oferta en UF y otra en pesos
  -- no se pueden ordenar sin el valor del día, y adivinarlo sería peor.
  SELECT MIN("amountNet") INTO v_menor
  FROM public."subcontractQuotes"
  WHERE "subcontractId" = NEW."subcontractId"
    AND currency = NEW.currency
    AND "amountNet" > 0;

  IF v_menor IS NOT NULL AND NEW."amountNet" > v_menor
     AND (NEW."awardReason" IS NULL OR btrim(NEW."awardReason") = '') THEN
    RAISE EXCEPTION 'Adjudicaste una oferta que no es la más económica: indica por qué.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sq_award_reason ON public."subcontractQuotes";
CREATE TRIGGER trg_sq_award_reason
  BEFORE INSERT OR UPDATE ON public."subcontractQuotes"
  FOR EACH ROW EXECUTE FUNCTION public.sq_guard_award_reason();

-- ============================================================
-- 2. ADJUNTOS DEL SUBCONTRATO
--    El cuadro comparativo firmado, el contrato escaneado, anexos. Lo que la
--    app no genera pero igual es parte de la carpeta del contrato.
-- ============================================================
CREATE TABLE IF NOT EXISTS public."subcontractAttachments" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     TEXT NOT NULL,
  "subcontractId" UUID NOT NULL REFERENCES public.subcontracts(id) ON DELETE CASCADE,

  kind           TEXT NOT NULL DEFAULT 'otro'
                 CHECK (kind IN ('cuadro_comparativo', 'contrato', 'anexo', 'otro')),
  name           TEXT NOT NULL,
  "filePath"     TEXT NOT NULL,
  "fileName"     TEXT,
  "fileSize"     BIGINT,
  notes          TEXT,

  "uploadedBy"   TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subcontract_attachments_sub_idx
  ON public."subcontractAttachments" ("subcontractId");
CREATE INDEX IF NOT EXISTS subcontract_attachments_tenant_idx
  ON public."subcontractAttachments" ("tenantId");

-- ============================================================
-- 3. FIRMA DE DOCUMENTOS ENTRE PARTES
--    Genérica desde el día uno: el mismo mecanismo va a servir para el acta de
--    recepción y para las adendas. Lo que cambia es `documentType`.
-- ============================================================
CREATE TABLE IF NOT EXISTS public."documentSignatures" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     TEXT NOT NULL,

  "documentType" TEXT NOT NULL
                 CHECK ("documentType" IN ('subcontract', 'reception', 'amendment')),
  -- Sin FK: apunta a varias tablas. El borrado se limpia por trigger.
  "documentId"   UUID NOT NULL,

  -- Quién firma: mi empresa o la contraparte. No es lo mismo que un paso de
  -- aprobación interna (ver la nota de cabecera).
  party          TEXT NOT NULL CHECK (party IN ('empresa', 'contraparte')),

  -- Identidad congelada. La contraparte muchas veces NO tiene usuario en la
  -- app: por eso el nombre y el RUT se guardan como texto y `signedBy` es
  -- nullable. Sin eso, firmar exigiría crearle cuenta al contratista.
  "signerName"   TEXT NOT NULL,
  "signerRut"    TEXT,
  "signerRole"   TEXT,
  "signedBy"     UUID REFERENCES public.users(id) ON DELETE SET NULL,

  signature      TEXT,
  -- Huella del documento al firmar: delata que se editó después.
  "documentHash" TEXT,

  "signedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_signatures_doc_idx
  ON public."documentSignatures" ("documentType", "documentId");
CREATE INDEX IF NOT EXISTS document_signatures_tenant_idx
  ON public."documentSignatures" ("tenantId");

-- Cada parte firma una vez. Volver a firmar reemplaza la firma anterior, no
-- agrega una segunda: dos firmas de la misma parte no se sabe cuál vale.
CREATE UNIQUE INDEX IF NOT EXISTS document_signatures_party_uniq
  ON public."documentSignatures" ("documentType", "documentId", party);

CREATE OR REPLACE FUNCTION public.docsig_cleanup_orphans()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public."documentSignatures"
  WHERE "documentType" = TG_ARGV[0] AND "documentId" = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_docsig_cleanup ON public.subcontracts;
CREATE TRIGGER trg_docsig_cleanup
  AFTER DELETE ON public.subcontracts
  FOR EACH ROW EXECUTE FUNCTION public.docsig_cleanup_orphans('subcontract');

DROP TRIGGER IF EXISTS trg_docsig_cleanup ON public.receptions;
CREATE TRIGGER trg_docsig_cleanup
  AFTER DELETE ON public.receptions
  FOR EACH ROW EXECUTE FUNCTION public.docsig_cleanup_orphans('reception');

DROP TRIGGER IF EXISTS trg_docsig_cleanup ON public.amendments;
CREATE TRIGGER trg_docsig_cleanup
  AFTER DELETE ON public.amendments
  FOR EACH ROW EXECUTE FUNCTION public.docsig_cleanup_orphans('amendment');

-- ============================================================
-- 4. RLS
-- ============================================================
ALTER TABLE public."subcontractQuotes"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."subcontractAttachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."documentSignatures"     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subcontract_quotes_select" ON public."subcontractQuotes";
CREATE POLICY "subcontract_quotes_select" ON public."subcontractQuotes"
  FOR SELECT USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:view'))
    OR get_my_role() = 'super-admin'
  );

-- Las ofertas de la competencia NO las ve el subcontratista: es su propio
-- cuadro comparativo. Por eso acá no hay excepción de portal, a diferencia de
-- los estados de pago (migración 026).
DROP POLICY IF EXISTS "subcontract_quotes_write" ON public."subcontractQuotes";
CREATE POLICY "subcontract_quotes_write" ON public."subcontractQuotes"
  FOR ALL USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:manage'))
    OR get_my_role() = 'super-admin'
  ) WITH CHECK (
    ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:manage'))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "subcontract_attachments_select" ON public."subcontractAttachments";
CREATE POLICY "subcontract_attachments_select" ON public."subcontractAttachments"
  FOR SELECT USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:view'))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "subcontract_attachments_write" ON public."subcontractAttachments";
CREATE POLICY "subcontract_attachments_write" ON public."subcontractAttachments"
  FOR ALL USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:manage'))
    OR get_my_role() = 'super-admin'
  ) WITH CHECK (
    ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:manage'))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "document_signatures_select" ON public."documentSignatures";
CREATE POLICY "document_signatures_select" ON public."documentSignatures"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "document_signatures_write" ON public."documentSignatures";
CREATE POLICY "document_signatures_write" ON public."documentSignatures"
  FOR ALL USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:manage'))
    OR get_my_role() = 'super-admin'
  ) WITH CHECK (
    ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:manage'))
    OR get_my_role() = 'super-admin'
  );

-- ============================================================
-- 5. REALTIME
-- ============================================================
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."subcontractQuotes";      EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."subcontractAttachments"; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."documentSignatures";     EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
