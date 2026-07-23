-- Libro de Obra Digital
CREATE TABLE IF NOT EXISTS public."libroObra" (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                  TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  "projectId"                 TEXT,

  -- Carátula
  "nombreProyecto"            TEXT NOT NULL,
  "direccionObra"             TEXT NOT NULL,
  "comunaObra"                TEXT NOT NULL,
  "numeroPermiso"             TEXT NOT NULL,
  "fechaPermiso"              DATE,

  -- Partes intervinientes
  "nombrePropietario"         TEXT NOT NULL DEFAULT '',
  "rutPropietario"            TEXT NOT NULL DEFAULT '',
  "nombreArquitecto"          TEXT NOT NULL DEFAULT '',
  "rutArquitecto"             TEXT NOT NULL DEFAULT '',
  "nombreCalculista"          TEXT,
  "rutCalculista"             TEXT,
  "nombreConstructor"         TEXT NOT NULL DEFAULT '',
  "rutConstructor"            TEXT NOT NULL DEFAULT '',
  "nombreITO"                 TEXT,
  "rutITO"                    TEXT,
  "nombreRevisorIndependiente" TEXT,
  "rutRevisorIndependiente"   TEXT,

  -- Hitos
  "fechaInicioObra"           DATE,
  "fechaEntregaTerreno"       DATE,
  estado                      TEXT NOT NULL DEFAULT 'vigente',

  "createdAt"                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdBy"                 TEXT NOT NULL
);

-- Asientos del Libro de Obra
CREATE TABLE IF NOT EXISTS public."libroObraAsientos" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "libroId"     UUID NOT NULL REFERENCES public."libroObra"(id) ON DELETE CASCADE,
  "tenantId"    TEXT NOT NULL,
  numero        INT NOT NULL,
  fecha         DATE NOT NULL,
  tipo          TEXT NOT NULL,
  contenido     TEXT NOT NULL,
  "autorId"     TEXT NOT NULL,
  "autorNombre" TEXT NOT NULL,
  "autorRol"    TEXT NOT NULL,
  firmado       BOOLEAN NOT NULL DEFAULT FALSE,
  "firmaDigital" TEXT,
  "firmadoAt"   TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_libro_obra_asientos_libro ON public."libroObraAsientos"("libroId");
CREATE INDEX IF NOT EXISTS idx_libro_obra_tenant ON public."libroObra"("tenantId");
