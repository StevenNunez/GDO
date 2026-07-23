"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/modules/auth/useAuth';
import QRCode from "react-qr-code";
import { ROLES } from '@/modules/core/lib/permissions';
import { UserRole } from '@/modules/core/lib/data';
import { CalendarCheck, Wrench, RefreshCw, Building2 } from 'lucide-react';

export function UserCredentialCard() {
  const { user } = useAuth();
  const [dynamicQrValue, setDynamicQrValue] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(30);

  const buildQrValue = useCallback(() => {
    if (!user) return '';
    const win = Math.floor(Date.now() / 30000);
    return `gdo:${user.id}:${win}`;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const tick = () => {
      setDynamicQrValue(buildQrValue());
      setSecondsLeft(30 - (Math.floor(Date.now() / 1000) % 30));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [user, buildQrValue]);

  if (!user) return null;

  const roleLabel = ROLES[user.role as UserRole]?.label || user.role;
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-cta" />
          <span className="truncate text-[11px] font-bold uppercase tracking-[0.2em] text-sidebar-muted">Credencial Digital</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-sidebar-muted">
          <RefreshCw className="h-3 w-3" />
          <span>Renueva en <span className="text-cta font-bold tabular-nums">{secondsLeft}s</span></span>
        </div>
      </div>

      {/* Body — apilado en móvil, lado a lado desde sm */}
      <div className="flex min-h-0 flex-1 flex-col items-center gap-5 sm:flex-row sm:items-stretch">
        {/* QR */}
        <div className="relative shrink-0 self-center">
          <div className="rounded-2xl border-2 border-cta/25 bg-white p-3 shadow-[0_0_30px_hsl(var(--cta)/0.18)]">
            {/* Alto y ancho fijos: el QR solo existe después del primer efecto y
                sin espacio reservado la caja colapsa y la credencial entera da
                un salto al cargar la página. */}
            <div className="h-[150px] w-[150px] sm:h-[172px] sm:w-[172px]">
              {dynamicQrValue && (
                <QRCode value={dynamicQrValue} size={172} level="H" style={{ width: '100%', height: '100%' }} />
              )}
            </div>
          </div>
          {/* Countdown ring */}
          <div
            className="absolute -bottom-3 -right-3 h-8 w-8 rounded-full bg-cta flex items-center justify-center shadow-lg border-2 border-sidebar"
            title={`Se renueva en ${secondsLeft} segundos`}
          >
            <span className="text-[11px] font-extrabold text-cta-foreground tabular-nums leading-none">{secondsLeft}</span>
          </div>
        </div>

        {/* Info */}
        <div className="flex w-full min-w-0 flex-1 flex-col justify-between py-1">
          {/* Identity */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-11 w-11 rounded-full bg-cta/25 border border-cta/40 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-cta">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sidebar-foreground text-base leading-tight truncate">{user.name}</p>
                <p className="text-xs text-sidebar-muted truncate">{user.cargo || roleLabel}</p>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cta/15 border border-cta/30 text-cta text-[11px] font-semibold">
              {roleLabel}
            </span>
          </div>

          {/* Divider */}
          <div className="border-t border-sidebar-border my-2" />

          {/* Usages */}
          <div>
            <p className="text-[10px] text-sidebar-muted uppercase tracking-widest mb-2 font-semibold">Habilitado para</p>
            {/* Verde y azul fijos a propósito: esta card vive siempre sobre el
                azul Prussian, donde los tokens `success`/`info` del tema claro
                (tonos oscuros) quedarían ilegibles. */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-md bg-green-500/15 flex items-center justify-center shrink-0">
                  <CalendarCheck className="h-3 w-3 text-green-400" />
                </div>
                <span className="text-xs text-sidebar-muted">Registro de asistencia</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-md bg-blue-500/15 flex items-center justify-center shrink-0">
                  <Wrench className="h-3 w-3 text-blue-400" />
                </div>
                <span className="text-xs text-sidebar-muted">Entrega y devolución de herramientas</span>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <p className="text-[10px] text-sidebar-muted/70 mt-2">No compartas capturas · el QR expira cada 30 s</p>
        </div>
      </div>
    </div>
  );
}
