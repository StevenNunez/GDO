import { describe, it, expect, vi } from 'vitest';
import { createProxy, isChanged } from 'proxy-compare';
import {
  expandDemand, withDemandGetters, createDemandTracker, LAZY_KEYS, ALWAYS_ON,
} from './lazy-collections';

describe('carga por demanda', () => {
  it('leer una colección perezosa avisa; leer otra clave no', () => {
    const onRead = vi.fn();
    const v = withDemandGetters({ materials: [1], can: () => true, projects: [2] }, new Set(['materials']), onRead);
    expect(v.can()).toBe(true);
    expect(v.projects).toEqual([2]);
    expect(onRead).not.toHaveBeenCalled();
    expect(v.materials).toEqual([1]);
    expect(onRead).toHaveBeenCalledWith('materials');
  });

  it('funciona a través del proxy de react-tracked (proxy-compare)', () => {
    const onRead = vi.fn();
    const lazy = new Set(['materials', 'tools']);
    const mats = [1];
    const tools = [3];
    const state = withDemandGetters({ materials: mats, tools, x: 1 }, lazy, onRead);
    const affected = new WeakMap();
    const proxied = createProxy(state, affected);
    void proxied.materials; // una pantalla lee solo materiales
    expect(onRead).toHaveBeenCalledTimes(1);
    expect(onRead).toHaveBeenCalledWith('materials');
    // El seguimiento de cambios sigue andando: tools no se leyó, así que no cuenta.
    const sinCambioRelevante = withDemandGetters({ materials: mats, tools: [9], x: 1 }, lazy, vi.fn());
    expect(isChanged(state, sinCambioRelevante, affected)).toBe(false);
    const conCambio = withDemandGetters({ materials: [7], tools, x: 1 }, lazy, vi.fn());
    expect(isChanged(state, conCambio, affected)).toBe(true);
  });

  it('expandDemand arrastra las dependencias', () => {
    expect([...expandDemand(['libroObraAsientos'])].sort()).toEqual(['libroObra', 'libroObraAsientos']);
    expect([...expandDemand(['materials'])]).toEqual(['materials']);
  });

  it('las siempre-activas no son perezosas', () => {
    for (const k of ALWAYS_ON) expect(LAZY_KEYS.has(k)).toBe(false);
  });

  it('junta varios pedidos del mismo render en un solo aviso', async () => {
    const onChange = vi.fn();
    const t = createDemandTracker(onChange);
    t.request('a'); t.request('b'); t.request('a');
    expect(onChange).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect([...onChange.mock.calls[0][0]].sort()).toEqual(['a', 'b']);
    t.request('b'); // ya pedida: no vuelve a avisar
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('después de dispose no avisa', async () => {
    const onChange = vi.fn();
    const t = createDemandTracker(onChange);
    t.request('a');
    t.dispose();
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });
});
