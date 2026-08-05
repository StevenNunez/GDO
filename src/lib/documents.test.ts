import { describe, it, expect } from 'vitest';
import {
  revisionVigente,
  revisionesOrdenadas,
  estadoRevision,
  revisionesDe,
  resumenDocumentos,
} from './documents';
import type { DocumentRevision, ProjectDocument } from '@/modules/core/lib/data';

function rev(over: Partial<DocumentRevision> & { id: string }): DocumentRevision {
  return {
    tenantId: 't1', documentId: 'd1', revision: 'A',
    status: 'activa', createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  } as DocumentRevision;
}

function doc(over: Partial<ProjectDocument> & { id: string }): ProjectDocument {
  return {
    tenantId: 't1', projectId: 'p1', name: 'Plano', type: 'plano',
    discipline: 'arquitectura', createdAt: new Date(),
    ...over,
  } as ProjectDocument;
}

describe('revisionVigente', () => {
  it('la vigente es la de fecha de emisión más nueva', () => {
    const revs = [
      rev({ id: 'a', revision: 'A', issueDate: '2026-03-01' as unknown as Date }),
      rev({ id: 'c', revision: 'C', issueDate: '2026-05-10' as unknown as Date }),
      rev({ id: 'b', revision: 'B', issueDate: '2026-04-02' as unknown as Date }),
    ];
    expect(revisionVigente(revs)?.id).toBe('c');
  });

  it('no compara los nombres de revisión: "10" es posterior a "9"', () => {
    // Como texto "10" < "9"; lo que manda es la fecha de emisión.
    const revs = [
      rev({ id: 'nueve', revision: '9', issueDate: '2026-03-01' as unknown as Date }),
      rev({ id: 'diez', revision: '10', issueDate: '2026-06-01' as unknown as Date }),
    ];
    expect(revisionVigente(revs)?.id).toBe('diez');
  });

  it('una revisión anulada nunca queda vigente', () => {
    const revs = [
      rev({ id: 'b', revision: 'B', issueDate: '2026-04-02' as unknown as Date }),
      rev({ id: 'c', revision: 'C', issueDate: '2026-05-10' as unknown as Date, status: 'anulada' }),
    ];
    expect(revisionVigente(revs)?.id).toBe('b');
  });

  it('con la misma fecha de emisión manda la cargada después', () => {
    const revs = [
      rev({
        id: 'primera', revision: 'B', issueDate: '2026-04-02' as unknown as Date,
        createdAt: new Date('2026-04-03T10:00:00Z'),
      }),
      rev({
        id: 'segunda', revision: 'B1', issueDate: '2026-04-02' as unknown as Date,
        createdAt: new Date('2026-04-05T10:00:00Z'),
      }),
    ];
    expect(revisionVigente(revs)?.id).toBe('segunda');
  });

  it('una revisión sin fecha de emisión no desplaza a una que sí la tiene', () => {
    const revs = [
      rev({ id: 'con-fecha', issueDate: '2026-04-02' as unknown as Date }),
      rev({ id: 'sin-fecha', createdAt: new Date('2026-12-31T00:00:00Z') }),
    ];
    expect(revisionVigente(revs)?.id).toBe('con-fecha');
  });

  it('sin revisiones utilizables devuelve null', () => {
    expect(revisionVigente([])).toBeNull();
    expect(revisionVigente([rev({ id: 'a', status: 'anulada' })])).toBeNull();
  });
});

describe('revisionesOrdenadas', () => {
  it('van de la más nueva a la más antigua', () => {
    const revs = [
      rev({ id: 'a', issueDate: '2026-03-01' as unknown as Date }),
      rev({ id: 'c', issueDate: '2026-05-10' as unknown as Date }),
      rev({ id: 'b', issueDate: '2026-04-02' as unknown as Date }),
    ];
    expect(revisionesOrdenadas(revs).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('no muta el arreglo que recibe', () => {
    const revs = [
      rev({ id: 'a', issueDate: '2026-03-01' as unknown as Date }),
      rev({ id: 'b', issueDate: '2026-04-02' as unknown as Date }),
    ];
    revisionesOrdenadas(revs);
    expect(revs.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('estadoRevision', () => {
  const vigente = rev({ id: 'c', issueDate: '2026-05-10' as unknown as Date });

  it('la vigente se marca vigente y el resto, superada', () => {
    expect(estadoRevision(vigente, vigente)).toBe('vigente');
    expect(estadoRevision(rev({ id: 'b' }), vigente)).toBe('superada');
  });

  it('la anulada manda sobre todo lo demás', () => {
    expect(estadoRevision(rev({ id: 'x', status: 'anulada' }), vigente)).toBe('anulada');
  });

  it('sin vigente ninguna aparece como vigente', () => {
    expect(estadoRevision(rev({ id: 'b' }), null)).toBe('superada');
  });
});

describe('revisionesDe', () => {
  it('filtra por documento', () => {
    const revs = [
      rev({ id: 'a', documentId: 'd1' }),
      rev({ id: 'b', documentId: 'd2' }),
    ];
    expect(revisionesDe(revs, 'd1').map((r) => r.id)).toEqual(['a']);
  });
});

describe('resumenDocumentos', () => {
  it('separa los que tienen vigente, los sin revisión y los sin archivo', () => {
    const documentos = [
      doc({ id: 'd1' }),
      doc({ id: 'd2' }),
      doc({ id: 'd3' }),
    ];
    const revs = [
      // d1: vigente con archivo
      rev({ id: 'r1', documentId: 'd1', issueDate: '2026-03-01' as unknown as Date, filePath: 'x/y.pdf' }),
      // d2: vigente SIN archivo (anunciada, no llegó)
      rev({ id: 'r2', documentId: 'd2', issueDate: '2026-03-01' as unknown as Date }),
      // d3: sin ninguna revisión
    ];
    expect(resumenDocumentos(documentos, revs)).toEqual({
      documentos: 3,
      conVigente: 2,
      sinRevision: 1,
      sinArchivo: 1,
    });
  });

  it('un documento cuyas revisiones están todas anuladas cuenta como sin revisión', () => {
    const r = resumenDocumentos(
      [doc({ id: 'd1' })],
      [rev({ id: 'r1', documentId: 'd1', status: 'anulada' })],
    );
    expect(r.sinRevision).toBe(1);
    expect(r.conVigente).toBe(0);
  });

  it('sin documentos todo queda en cero', () => {
    expect(resumenDocumentos([], [])).toEqual({
      documentos: 0, conVigente: 0, sinRevision: 0, sinArchivo: 0,
    });
  });
});
