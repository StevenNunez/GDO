"use client";

/**
 * Botón «Enviar por correo» para cualquier documento de la app.
 *
 * Recibe una función que genera el PDF y se encarga del resto: destinatario,
 * asunto, mensaje y envío. Por eso agregar el envío a una pantalla nueva es
 * poner este componente, no escribir otra vez el diálogo y el fetch.
 *
 * El PDF se genera en el navegador (todos los generadores usan jsPDF) y viaja
 * en base64; el servidor solo lo adjunta.
 */

import { useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/modules/core/hooks/use-toast';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { isDemoMode } from '@/modules/core/lib/demo/demo-config';

interface Props {
  /** Genera el PDF. Se llama al enviar, no al abrir: si nadie envía, no se genera. */
  generarPdf: () => Promise<Blob>;
  /** Nombre del archivo adjunto, sin ruta. */
  fileName: string;
  /** Asunto sugerido. Editable. */
  asuntoSugerido: string;
  /** Correo de quien debería recibirlo, si lo sabemos (mandante, contratista…). */
  destinatarioSugerido?: string | null;
  /** Cómo se le llama a quien recibe, para explicarlo en el diálogo. */
  descripcionDestinatario?: string;
  mensajeSugerido?: string;
  /** Variante del botón, para encajar en cada pantalla. */
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm';
  label?: string;
}

export function EnviarDocumento({
  generarPdf, fileName, asuntoSugerido, destinatarioSugerido,
  descripcionDestinatario, mensajeSugerido,
  variant = 'outline', size = 'sm', label = 'Enviar por correo',
}: Props) {
  const { toast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [para, setPara] = useState(destinatarioSugerido ?? '');
  const [copia, setCopia] = useState('');
  const [asunto, setAsunto] = useState(asuntoSugerido);
  const [mensaje, setMensaje] = useState(mensajeSugerido ?? '');
  const [enviando, setEnviando] = useState(false);

  const demo = isDemoMode();

  async function enviar() {
    if (!para.trim()) {
      toast({ variant: 'destructive', title: 'Falta a quién enviarlo' });
      return;
    }

    setEnviando(true);
    try {
      const blob = await generarPdf();
      const pdfBase64 = await blobABase64(blob);

      const sb = getSupabaseBrowserClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) throw new Error('Sesión no válida.');

      const res = await fetch('/api/documents/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          to: para, cc: copia, subject: asunto, message: mensaje,
          fileName, pdfBase64,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo enviar.');

      toast({
        title: 'Documento enviado',
        description: `Se envió a ${(json.sentTo ?? [para]).join(', ')}.`,
      });
      setAbierto(false);
      setCopia('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo enviar', description: e.message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Button
        variant={variant} size={size}
        onClick={() => { setAsunto(asuntoSugerido); setPara(destinatarioSugerido ?? ''); setAbierto(true); }}
      >
        <Mail className="mr-2 h-4 w-4" /> {label}
      </Button>

      <Dialog open={abierto} onOpenChange={(o) => !o && setAbierto(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar por correo</DialogTitle>
            <DialogDescription>
              Se adjunta <span className="font-medium text-foreground">{fileName}</span>.
              Quien lo reciba puede responderte a tu correo, no a la casilla del sistema.
            </DialogDescription>
          </DialogHeader>

          {demo ? (
            <p className="rounded-md border border-warning/40 bg-warning-subtle p-3 text-sm text-muted-foreground">
              El modo demo funciona sobre el navegador, sin servidor: no envía correos.
              El documento sí se puede descargar.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="env-para">Para</Label>
                <Input
                  id="env-para" type="email" value={para}
                  onChange={(e) => setPara(e.target.value)}
                  placeholder="correo@empresa.cl"
                />
                {descripcionDestinatario && !destinatarioSugerido && (
                  <p className="text-xs text-warning">
                    No encontramos el correo de {descripcionDestinatario}: cárgalo en su ficha
                    para que venga puesto la próxima vez.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Puedes poner varios separados por coma.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="env-copia">Con copia (opcional)</Label>
                <Input
                  id="env-copia" value={copia}
                  onChange={(e) => setCopia(e.target.value)}
                  placeholder="jefatura@miempresa.cl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="env-asunto">Asunto</Label>
                <Input id="env-asunto" value={asunto}
                  onChange={(e) => setAsunto(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="env-mensaje">Mensaje</Label>
                <Textarea
                  id="env-mensaje" rows={4} value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  placeholder="Adjuntamos el documento solicitado."
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={enviar} disabled={enviando || demo}>
              <Send className="mr-2 h-4 w-4" />
              {enviando ? 'Enviando…' : 'Enviar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** El PDF viaja al servidor como base64: es lo que nodemailer adjunta. */
function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('No se pudo leer el documento.'));
    reader.readAsDataURL(blob);
  });
}
