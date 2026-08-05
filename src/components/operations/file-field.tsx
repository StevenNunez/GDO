"use client";

import { useRef, useState } from 'react';
import { Paperclip, X, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAppState, useAuth } from '@/modules/core/contexts/app-provider';
import {
  uploadObraFile, openObraFile, removeObraFile, formatFileSize, MAX_FILE_BYTES,
} from '@/lib/storage';

export interface ArchivoAdjunto {
  path: string;
  name: string;
  size?: number | null;
  mimeType?: string | null;
}

/**
 * Campo de archivo sobre el bucket `obra-docs`. Lo comparten planos y RDI para
 * no tener dos implementaciones de lo mismo.
 *
 * Sube **al momento de elegir el archivo**, no al guardar el formulario: así,
 * si la subida falla (archivo muy pesado, sin conexión), la persona se entera
 * antes de escribir todo lo demás.
 *
 * Al reemplazar un archivo se borra el anterior del bucket, salvo que sea uno
 * ya guardado en la fila —ese lo limpia la mutación al eliminar—, para no
 * dejar basura acumulada por cada intento.
 */
export function FileField({
  label = 'Archivo adjunto',
  carpeta,
  value,
  onChange,
  disabled,
  hint,
}: {
  label?: string;
  /** Subcarpeta dentro de la obra: 'planos', 'rdi'… */
  carpeta: string;
  value: ArchivoAdjunto | null;
  onChange: (archivo: ArchivoAdjunto | null) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const { currentProjectId, notify } = useAppState();
  const { getTenantId } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  /** Rutas subidas en esta sesión del formulario, para poder limpiarlas. */
  const [reciente, setReciente] = useState<string | null>(null);

  const tenantId = getTenantId() ?? null;

  const elegir = async (file: File | undefined) => {
    if (!file) return;
    if (!tenantId) {
      notify('No se pudo determinar la empresa para guardar el archivo.', 'destructive');
      return;
    }

    setSubiendo(true);
    try {
      const subido = await uploadObraFile(file, {
        tenantId,
        projectId: currentProjectId,
        carpeta,
      });
      // El anterior solo se borra si lo había subido este mismo formulario.
      if (reciente) await removeObraFile(reciente);
      setReciente(subido.path);
      onChange({
        path: subido.path,
        name: subido.fileName,
        size: subido.fileSize,
        mimeType: subido.mimeType,
      });
    } catch (e: any) {
      notify(e.message ?? 'No se pudo subir el archivo.', 'destructive');
    } finally {
      setSubiendo(false);
      if (input.current) input.current.value = '';
    }
  };

  const quitar = async () => {
    if (reciente) {
      await removeObraFile(reciente);
      setReciente(null);
    }
    onChange(null);
  };

  const abrir = async () => {
    if (!value) return;
    try {
      await openObraFile(value.path);
    } catch (e: any) {
      notify(e.message ?? 'No se pudo abrir el archivo.', 'destructive');
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>

      {value ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-3">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{value.name}</span>
          {value.size ? (
            <span className="text-xs text-muted-foreground">{formatFileSize(value.size)}</span>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={abrir}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Abrir
          </Button>
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" onClick={quitar}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            className="hidden"
            onChange={(e) => elegir(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || subiendo}
            onClick={() => input.current?.click()}
          >
            {subiendo
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Subiendo…</>
              : <><Paperclip className="mr-2 h-4 w-4" /> Elegir archivo</>}
          </Button>
          <span className="text-xs text-muted-foreground">
            {hint ?? `PDF, imagen o DWG. Máximo ${formatFileSize(MAX_FILE_BYTES)}.`}
          </span>
        </div>
      )}
    </div>
  );
}
