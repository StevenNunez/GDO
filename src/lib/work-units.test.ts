import { describe, it, expect } from 'vitest';
import {
  generarUnidades, parsearUnidadesPegadas, unidadesDeObra, unidadesActivas,
  agruparUnidades, siguienteOrden, validarTanda,
} from './work-units';
import type { WorkUnit } from '@/modules/core/lib/data';

function unidad(over: Partial<WorkUnit> & { id: string; name: string }): WorkUnit {
  return {
    tenantId: 't1', projectId: 'p1', groupName: 'PISO 1', typology: null,
    sortOrder: 0, area: null, status: 'activa', createdAt: new Date(),
    ...over,
  } as WorkUnit;
}

describe('generarUnidades', () => {
  it('arma el edificio completo: 16 pisos por 15 deptos', () => {
    const unidades = generarUnidades({
      grupoEtiqueta: 'PISO', grupoDesde: 1, grupoHasta: 16,
      unidadesPorGrupo: 15, formato: 'piso-numero',
    });
    expect(unidades).toHaveLength(240);
    expect(unidades[0]).toMatchObject({ name: '101', groupName: 'PISO 1', sortOrder: 0 });
    expect(unidades[14]).toMatchObject({ name: '115', groupName: 'PISO 1' });
    expect(unidades[15]).toMatchObject({ name: '201', groupName: 'PISO 2' });
    expect(unidades[239]).toMatchObject({ name: '1615', groupName: 'PISO 16' });
  });

  it('rellena a dos dígitos para que 101 y 110 ordenen bien', () => {
    const unidades = generarUnidades({
      grupoEtiqueta: 'PISO', grupoDesde: 3, grupoHasta: 3,
      unidadesPorGrupo: 12, formato: 'piso-numero',
    });
    expect(unidades.map((u) => u.name)).toContain('301');
    expect(unidades.map((u) => u.name)).toContain('312');
  });

  it('agrega los extras al final de cada grupo', () => {
    const unidades = generarUnidades({
      grupoEtiqueta: 'PISO', grupoDesde: 1, grupoHasta: 2,
      unidadesPorGrupo: 2, formato: 'piso-numero', extras: ['pasillo'],
    });
    expect(unidades.map((u) => u.name)).toEqual(['101', '102', 'PASILLO', '201', '202', 'PASILLO']);
    // El sortOrder no se repite aunque el nombre sí.
    expect(unidades.map((u) => u.sortOrder)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('numera correlativo a lo largo de todos los grupos', () => {
    const unidades = generarUnidades({
      grupoEtiqueta: 'TORRE', grupoDesde: 1, grupoHasta: 2,
      unidadesPorGrupo: 3, formato: 'correlativo',
    });
    expect(unidades.map((u) => u.name)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('usa letras y sigue con AA después de la Z', () => {
    const unidades = generarUnidades({
      grupoEtiqueta: 'PISO', grupoDesde: 2, grupoHasta: 2,
      unidadesPorGrupo: 28, formato: 'letra',
    });
    expect(unidades[0].name).toBe('2-A');
    expect(unidades[25].name).toBe('2-Z');
    expect(unidades[26].name).toBe('2-AA');
  });

  it('respeta desde qué número parte la numeración', () => {
    const unidades = generarUnidades({
      grupoEtiqueta: 'PISO', grupoDesde: 1, grupoHasta: 1,
      unidadesPorGrupo: 3, formato: 'piso-numero', desdeNumero: 8,
    });
    expect(unidades.map((u) => u.name)).toEqual(['108', '109', '110']);
  });

  it('devuelve vacío ante un rango imposible en vez de reventar', () => {
    expect(generarUnidades({
      grupoEtiqueta: 'PISO', grupoDesde: 5, grupoHasta: 2,
      unidadesPorGrupo: 3, formato: 'piso-numero',
    })).toEqual([]);
    expect(generarUnidades({
      grupoEtiqueta: 'PISO', grupoDesde: NaN, grupoHasta: 2,
      unidadesPorGrupo: 3, formato: 'piso-numero',
    })).toEqual([]);
  });
});

describe('parsearUnidadesPegadas', () => {
  it('lee una sola columna de nombres', () => {
    const unidades = parsearUnidadesPegadas('112\n113\n114');
    expect(unidades.map((u) => u.name)).toEqual(['112', '113', '114']);
    expect(unidades.map((u) => u.sortOrder)).toEqual([0, 1, 2]);
    expect(unidades[0].groupName).toBeNull();
  });

  it('lee las cuatro columnas separadas por tabulación', () => {
    const unidades = parsearUnidadesPegadas('112\tpiso 1\tSM3b\t42,5');
    expect(unidades[0]).toMatchObject({
      name: '112', groupName: 'PISO 1', typology: 'SM3b', area: 42.5,
    });
  });

  it('acepta punto y coma o barra para el que arma la lista a mano', () => {
    expect(parsearUnidadesPegadas('112;PISO 1')[0].groupName).toBe('PISO 1');
    expect(parsearUnidadesPegadas('112|PISO 1')[0].groupName).toBe('PISO 1');
  });

  it('NO parte por coma: es el separador decimal de la superficie', () => {
    const unidades = parsearUnidadesPegadas('112\tPISO 1\tSM3b\t1.234,56');
    expect(unidades[0].area).toBe(1234.56);
  });

  it('entiende la superficie escrita a la inglesa y con unidad pegada', () => {
    expect(parsearUnidadesPegadas('a\t\t\t42.5')[0].area).toBe(42.5);
    expect(parsearUnidadesPegadas('b\t\t\t42,5 m2')[0].area).toBe(42.5);
    expect(parsearUnidadesPegadas('c\t\t\tsin dato')[0].area).toBeNull();
  });

  it('descarta líneas en blanco', () => {
    expect(parsearUnidadesPegadas('112\n\n  \n113')).toHaveLength(2);
  });

  it('se queda con el primero cuando se pega dos veces lo mismo', () => {
    const unidades = parsearUnidadesPegadas('112\tPISO 1\n112\tPISO 1\n112\tPISO 2');
    expect(unidades).toHaveLength(2);
    expect(unidades[1].groupName).toBe('PISO 2');
  });

  it('devuelve vacío ante texto vacío', () => {
    expect(parsearUnidadesPegadas('')).toEqual([]);
    expect(parsearUnidadesPegadas('   \n  ')).toEqual([]);
  });
});

describe('unidadesDeObra', () => {
  const unidades = [
    unidad({ id: 'b', name: '102', sortOrder: 1 }),
    unidad({ id: 'a', name: '101', sortOrder: 0 }),
    unidad({ id: 'c', name: '201', sortOrder: 2, projectId: 'p2' }),
  ];

  it('filtra por obra y respeta el orden del recorrido', () => {
    expect(unidadesDeObra(unidades, 'p1').map((u) => u.id)).toEqual(['a', 'b']);
  });

  it('sin obra seleccionada devuelve vacío', () => {
    expect(unidadesDeObra(unidades, null)).toEqual([]);
  });
});

describe('unidadesActivas', () => {
  it('deja fuera las excluidas', () => {
    const lista = [
      unidad({ id: 'a', name: '101' }),
      unidad({ id: 'b', name: '102', status: 'excluida' }),
    ];
    expect(unidadesActivas(lista).map((u) => u.id)).toEqual(['a']);
  });
});

describe('agruparUnidades', () => {
  it('agrupa en el orden del recorrido, no en orden alfabético', () => {
    // Si ordenara por nombre, "PISO 10" iría antes que "PISO 2".
    const grupos = agruparUnidades([
      unidad({ id: 'a', name: '201', groupName: 'PISO 2', sortOrder: 0 }),
      unidad({ id: 'b', name: '1001', groupName: 'PISO 10', sortOrder: 1 }),
    ]);
    expect(grupos.map((g) => g.groupName)).toEqual(['PISO 2', 'PISO 10']);
  });

  it('junta las que no tienen grupo bajo "Sin grupo"', () => {
    const grupos = agruparUnidades([
      unidad({ id: 'a', name: 'X', groupName: null }),
      unidad({ id: 'b', name: 'Y', groupName: '  ', sortOrder: 1 }),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].groupName).toBe('Sin grupo');
    expect(grupos[0].unidades).toHaveLength(2);
  });
});

describe('siguienteOrden', () => {
  it('parte en 0 con la obra vacía', () => {
    expect(siguienteOrden([])).toBe(0);
  });
  it('va después de la última, sin pisar el orden existente', () => {
    expect(siguienteOrden([
      unidad({ id: 'a', name: '101', sortOrder: 0 }),
      unidad({ id: 'b', name: '102', sortOrder: 7 }),
    ])).toBe(8);
  });
});

describe('validarTanda', () => {
  const existentes = [unidad({ id: 'a', name: '112', groupName: 'PISO 1' })];

  it('acepta una tanda nueva', () => {
    const nuevas = parsearUnidadesPegadas('113\tPISO 1');
    expect(validarTanda(nuevas, existentes)).toEqual([]);
  });

  it('avisa antes de que la base rechace un duplicado', () => {
    const nuevas = parsearUnidadesPegadas('112\tPISO 1');
    const errores = validarTanda(nuevas, existentes);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('112');
  });

  it('compara sin distinguir mayúsculas ni espacios, igual que el índice único', () => {
    const nuevas = parsearUnidadesPegadas(' 112 \tpiso 1');
    expect(validarTanda(nuevas, existentes)).toHaveLength(1);
  });

  it('el mismo nombre en otro piso no es duplicado', () => {
    const nuevas = parsearUnidadesPegadas('112\tPISO 2');
    expect(validarTanda(nuevas, existentes)).toEqual([]);
  });

  it('una tanda vacía no se guarda', () => {
    expect(validarTanda([], existentes)).toEqual(['No hay unidades que agregar.']);
  });
});
