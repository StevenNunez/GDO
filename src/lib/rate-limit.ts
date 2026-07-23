/**
 * Rate-limit en memoria, best-effort.
 *
 * Limitación conocida: en un entorno serverless (Vercel) la memoria NO se
 * comparte entre instancias ni sobrevive a un cold start, así que esto frena
 * abuso básico desde una misma IP contra una misma instancia, pero no es un
 * blindaje total. Para protección fuerte, migrar a un store compartido
 * (Upstash Redis) o a Vercel BotID / Vercel Firewall.
 *
 * Ventana deslizante: se guardan los timestamps de los intentos recientes por
 * clave y se descartan los que caen fuera de la ventana.
 */

type Attempt = number[];

const store = new Map<string, Attempt>();

// Barrido perezoso para que el Map no crezca sin límite.
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function sweep(windowMs: number) {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, timestamps] of store) {
    const fresh = timestamps.filter((t) => now - t < windowMs);
    if (fresh.length === 0) store.delete(key);
    else store.set(key, fresh);
  }
}

export interface RateLimitResult {
  /** true si el intento está permitido (dentro del límite). */
  allowed: boolean;
  /** intentos restantes en la ventana actual. */
  remaining: number;
  /** segundos hasta que se libere un cupo, si `allowed` es false. */
  retryAfterSeconds: number;
}

/**
 * Registra un intento para `key` y devuelve si está permitido.
 *
 * @param key    identificador (típicamente la IP del cliente).
 * @param limit  máximo de intentos permitidos dentro de la ventana.
 * @param windowMs tamaño de la ventana en milisegundos.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  sweep(windowMs);

  const now = Date.now();
  const timestamps = (store.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= limit) {
    const oldest = timestamps[0];
    const retryAfterSeconds = Math.ceil((windowMs - (now - oldest)) / 1000);
    store.set(key, timestamps);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return {
    allowed: true,
    remaining: limit - timestamps.length,
    retryAfterSeconds: 0,
  };
}

/**
 * Extrae la IP del cliente de las cabeceras de proxy (Vercel usa
 * `x-forwarded-for`). Cae a un valor genérico si no hay cabecera, para que el
 * límite siga aplicando (aunque de forma compartida) en vez de deshabilitarse.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}
