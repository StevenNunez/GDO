"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, VideoOff, ScanLine, LogIn, LogOut, MapPin, MapPinOff } from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";

type ScanState = 'scanning' | 'processing' | 'success' | 'error';

interface ScanFeedback {
  state: ScanState;
  workerName?: string;
  logType?: 'in' | 'out';
  message?: string;
}

interface QrScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Returns worker name and type on success, throws on error
  onScan: (qrCode: string, coords: { lat: number; lng: number } | null) => Promise<{ userName: string; type: 'in' | 'out' }>;
  title?: string;
  description?: string;
}

async function getGeolocation(): Promise<{ lat: number; lng: number } | null> {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 4000, enableHighAccuracy: false }
    );
  });
}

export function QrScannerDialog({
  open,
  onOpenChange,
  onScan,
  title = "Escanear QR",
  description = "Apunta la cámara al código QR del trabajador.",
}: QrScannerDialogProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const [feedback, setFeedback] = useState<ScanFeedback>({ state: 'scanning' });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [hasLocation, setHasLocation] = useState<boolean | null>(null);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const videoContainerId = "gdo-qr-reader";

  // Get geolocation once when dialog opens
  useEffect(() => {
    if (!open) return;
    getGeolocation().then((coords) => {
      coordsRef.current = coords;
      setHasLocation(coords !== null);
    });
  }, [open]);

  const handleQRDetected = useCallback(async (decodedText: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setFeedback({ state: 'processing' });

    try {
      const result = await onScan(decodedText, coordsRef.current);
      setFeedback({ state: 'success', workerName: result.userName, logType: result.type });
      setScanCount((c) => c + 1);
    } catch (err: any) {
      setFeedback({ state: 'error', message: err.message || 'Error al registrar asistencia.' });
    }

    // Resume scanning after 2.5 seconds
    setTimeout(() => {
      processingRef.current = false;
      setFeedback({ state: 'scanning' });
    }, 2500);
  }, [onScan]);

  const safeStop = async () => {
    const scanner = scannerRef.current;
    if (scanner && scanner.isScanning) {
      try { await scanner.stop(); } catch (_) { /* ignore */ }
    }
    scannerRef.current = null;
  };

  useEffect(() => {
    if (!open) return;

    let unmounted = false;

    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (unmounted) return;
      setCameraError(null);
      setFeedback({ state: 'scanning' });
      processingRef.current = false;

      const scanner = new Html5Qrcode(videoContainerId);
      scannerRef.current = scanner;

      Html5Qrcode.getCameras()
        .then((cameras) => {
          if (unmounted) return;
          if (!cameras?.length) {
            setCameraError("No se encontraron cámaras en este dispositivo.");
            return;
          }
          const qrboxFn = (w: number, h: number) => {
            const side = Math.floor(Math.min(w, h) * 0.85);
            return { width: side, height: side };
          };
          scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: qrboxFn, aspectRatio: 1 },
            handleQRDetected,
            () => {}
          ).catch((err: any) => {
            if (unmounted) return;
            if (err?.name === 'NotAllowedError') {
              setCameraError("Permiso de cámara denegado. Habilita el acceso en tu navegador.");
            } else {
              setCameraError("No se pudo iniciar la cámara.");
            }
          });
        })
        .catch(() => { if (!unmounted) setCameraError("Error al acceder a las cámaras."); });
    });

    return () => {
      unmounted = true;
      processingRef.current = false;
      safeStop();
    };
   
  }, [open, handleQRDetected]);

  const handleClose = () => {
    safeStop();
    setScanCount(0);
    setHasLocation(null);
    coordsRef.current = null;
    setCameraError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className="sm:max-w-sm p-0 overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-5 pt-5 pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" />
              {title}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {hasLocation === true && (
                <Badge variant="outline" className="border-success/40 text-success text-xs gap-1">
                  <MapPin className="h-3 w-3" /> GPS
                </Badge>
              )}
              {hasLocation === false && (
                <Badge variant="outline" className="border-warning/40 text-warning text-xs gap-1">
                  <MapPinOff className="h-3 w-3" /> Sin GPS
                </Badge>
              )}
              {scanCount > 0 && (
                <Badge className="bg-primary/20 text-primary text-xs">
                  {scanCount} {scanCount === 1 ? 'registro' : 'registros'}
                </Badge>
              )}
            </div>
          </div>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Camera viewport */}
        <div className="relative bg-black aspect-square w-full overflow-hidden">
          <div id={videoContainerId} className="w-full h-full" />

          {/* Corner brackets overlay */}
          {!cameraError && feedback.state === 'scanning' && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-[20%]">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-sm" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-sm" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-sm" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-sm" />
              </div>
            </div>
          )}

          {/* Camera error */}
          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white bg-zinc-900 p-6">
              <VideoOff className="h-14 w-14 text-destructive mb-3" />
              <p className="font-semibold text-sm">Error de cámara</p>
              <p className="text-xs text-zinc-400 mt-1">{cameraError}</p>
            </div>
          )}

          {/* Success overlay */}
          {feedback.state === 'success' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-900/90 text-white">
              <CheckCircle2 className="h-16 w-16 text-green-400 mb-3" />
              <p className="font-bold text-lg">{feedback.workerName}</p>
              <div className="flex items-center gap-2 mt-2">
                {feedback.logType === 'in'
                  ? <><LogIn className="h-4 w-4 text-green-300" /><span className="text-green-300 text-sm font-medium">Entrada registrada</span></>
                  : <><LogOut className="h-4 w-4 text-amber-300" /><span className="text-amber-300 text-sm font-medium">Salida registrada</span></>
                }
              </div>
            </div>
          )}

          {/* Error overlay */}
          {feedback.state === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/90 text-white p-4">
              <XCircle className="h-14 w-14 text-red-400 mb-3" />
              <p className="font-bold text-sm text-center">{feedback.message}</p>
            </div>
          )}

          {/* Processing overlay */}
          {feedback.state === 'processing' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        <div className="px-5 py-4">
          <Button variant="outline" className="w-full" onClick={handleClose}>
            Cerrar escáner
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
