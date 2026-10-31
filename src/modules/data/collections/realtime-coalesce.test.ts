import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { coalesce } from './realtime-sync';

describe('coalesce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('convierte una ráfaga de eventos en una sola recarga', async () => {
    const fn = vi.fn();
    const c = coalesce(fn, 300, 2000);
    for (let i = 0; i < 100; i++) c();
    await vi.advanceTimersByTimeAsync(299);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('recarga igual si los eventos no paran (tope máximo)', async () => {
    const fn = vi.fn();
    const c = coalesce(fn, 300, 1000);
    for (let t = 0; t < 1500; t += 100) { c(); await vi.advanceTimersByTimeAsync(100); }
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('no corre dos recargas en paralelo y repite si llegó algo durante la primera', async () => {
    let active = 0; let maxActive = 0; let calls = 0;
    const fn = vi.fn(async () => {
      calls++; active++; maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 500));
      active--;
    });
    const c = coalesce(fn, 100, 2000);
    c();
    await vi.advanceTimersByTimeAsync(150); // empieza la recarga 1
    c();                                    // llega un evento mientras corre
    await vi.advanceTimersByTimeAsync(2000);
    expect(maxActive).toBe(1);
    expect(calls).toBe(2);
  });

  it('cancel() descarta lo pendiente', async () => {
    const fn = vi.fn();
    const c = coalesce(fn, 300);
    c();
    c.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).not.toHaveBeenCalled();
    c();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
