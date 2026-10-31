import { describe, it, expect } from 'vitest';
import { evaluarCuota, LIMITE_POR_USUARIO_HORA, LIMITE_POR_EMPRESA_DIA } from './mail-quota';

describe('evaluarCuota', () => {
  it('deja pasar mientras haya cupo', () => {
    expect(evaluarCuota({ usuarioHora: 0, empresaDia: 0 }).allowed).toBe(true);
    expect(evaluarCuota({ usuarioHora: LIMITE_POR_USUARIO_HORA - 1, empresaDia: LIMITE_POR_EMPRESA_DIA - 1 }).allowed).toBe(true);
  });
  it('corta al llegar al tope por usuario', () => {
    expect(evaluarCuota({ usuarioHora: LIMITE_POR_USUARIO_HORA, empresaDia: 0 }).allowed).toBe(false);
  });
  it('corta al llegar al tope por empresa', () => {
    const r = evaluarCuota({ usuarioHora: 0, empresaDia: LIMITE_POR_EMPRESA_DIA });
    expect(r.allowed).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
