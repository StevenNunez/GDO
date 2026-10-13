import { describe, it, expect } from 'vitest';
import { toneForProgress, toneForPpc, paletaDeTipologias, CATEGORIAS } from './planner-tones';

describe('toneForProgress', () => {
  it('gris sin empezar, ámbar al comenzar, azul avanzado y verde terminado', () => {
    expect(toneForProgress(0)).toBe('neutral');
    expect(toneForProgress(0.2)).toBe('warning');
    expect(toneForProgress(0.49)).toBe('warning');
    expect(toneForProgress(0.5)).toBe('info');
    expect(toneForProgress(0.9)).toBe('info');
    expect(toneForProgress(1)).toBe('success');
  });

  it('tolera el error de coma flotante al llegar a 100 %', () => {
    expect(toneForProgress(0.9995)).toBe('success');
  });
});

describe('toneForPpc', () => {
  it('sin dato es neutro', () => {
    expect(toneForPpc(null)).toBe('neutral');
  });

  it('bajo 70 es alarma, hasta 85 atención y desde ahí va bien', () => {
    expect(toneForPpc(0)).toBe('danger');
    expect(toneForPpc(69.9)).toBe('danger');
    expect(toneForPpc(70)).toBe('warning');
    expect(toneForPpc(84)).toBe('warning');
    expect(toneForPpc(85)).toBe('success');
    expect(toneForPpc(100)).toBe('success');
  });
});

describe('paletaDeTipologias', () => {
  it('asigna colores por orden alfabético, sin depender del orden de carga', () => {
    const a = paletaDeTipologias(['SM3a', 'FV', 'SM2', 'FV']);
    const b = paletaDeTipologias(['FV', 'SM2', 'SM3a']);
    expect(Array.from(a.entries())).toEqual(Array.from(b.entries()));
    expect(a.get('FV')).toBe(0);
    expect(a.get('SM2')).toBe(1);
    expect(a.get('SM3a')).toBe(2);
  });

  it('ordena los números como números (SM2 antes que SM10)', () => {
    const p = paletaDeTipologias(['SM10', 'SM2']);
    expect(p.get('SM2')).toBe(0);
    expect(p.get('SM10')).toBe(1);
  });

  it('ignora vacías y nulas, y limpia espacios', () => {
    const p = paletaDeTipologias([null, undefined, '', '  ', ' FV ']);
    expect(Array.from(p.keys())).toEqual(['FV']);
  });

  it('repite colores cuando hay más tipologías que colores', () => {
    const muchas = Array.from({ length: CATEGORIAS + 2 }, (_, i) => `T${String(i).padStart(2, '0')}`);
    const p = paletaDeTipologias(muchas);
    expect(p.get('T00')).toBe(0);
    expect(p.get(`T${String(CATEGORIAS).padStart(2, '0')}`)).toBe(0);
    expect(Math.max(...Array.from(p.values()))).toBeLessThan(CATEGORIAS);
  });
});
