import { describe, it, expect } from 'vitest';
import { domingoDePascua, feriadosDeChile } from './chile-holidays';

/** `YYYY-MM-DD` de un Date, para comparar sin arrastrar la hora. */
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buscar(anio: number, nombre: string) {
  return feriadosDeChile(anio).find((f) => f.name === nombre)?.date;
}

describe('domingoDePascua', () => {
  it('calcula la Pascua de años conocidos', () => {
    expect(iso(domingoDePascua(2023))).toBe('2023-04-09');
    expect(iso(domingoDePascua(2024))).toBe('2024-03-31');
    expect(iso(domingoDePascua(2025))).toBe('2025-04-20');
    expect(iso(domingoDePascua(2026))).toBe('2026-04-05');
  });

  it('siempre cae domingo', () => {
    for (let anio = 2020; anio <= 2040; anio++) {
      expect(domingoDePascua(anio).getDay()).toBe(0);
    }
  });
});

describe('feriadosDeChile', () => {
  it('pone Viernes y Sábado Santo pegados a la Pascua', () => {
    expect(buscar(2026, 'Viernes Santo')).toBe('2026-04-03');
    expect(buscar(2026, 'Sábado Santo')).toBe('2026-04-04');
  });

  it('deja los fijos en su fecha', () => {
    expect(buscar(2026, 'Día del Trabajo')).toBe('2026-05-01');
    expect(buscar(2026, 'Independencia Nacional')).toBe('2026-09-18');
    expect(buscar(2026, 'Navidad')).toBe('2026-12-25');
  });

  /* El traslado de la Ley 19.973: martes, miércoles y jueves se corren al lunes
   * anterior; el viernes, al lunes siguiente. */
  it('traslada San Pedro y San Pablo al lunes cuando corresponde', () => {
    // 2023: el 29 de junio fue jueves → lunes 26.
    expect(buscar(2023, 'San Pedro y San Pablo')).toBe('2023-06-26');
    // 2024: fue sábado → se queda donde está.
    expect(buscar(2024, 'San Pedro y San Pablo')).toBe('2024-06-29');
    // 2025: fue domingo → se queda.
    expect(buscar(2025, 'San Pedro y San Pablo')).toBe('2025-06-29');
  });

  it('traslada el Encuentro de Dos Mundos', () => {
    // 2022: el 12 de octubre fue miércoles → lunes 10.
    expect(buscar(2022, 'Encuentro de Dos Mundos')).toBe('2022-10-10');
    // 2023: fue jueves → lunes 9.
    expect(buscar(2023, 'Encuentro de Dos Mundos')).toBe('2023-10-09');
    // 2018: fue viernes → lunes SIGUIENTE, 15.
    expect(buscar(2018, 'Encuentro de Dos Mundos')).toBe('2018-10-15');
    // 2024: fue sábado → se queda.
    expect(buscar(2024, 'Encuentro de Dos Mundos')).toBe('2024-10-12');
  });

  /* El de las Iglesias Evangélicas usa la otra regla (Ley 20.299): arma el fin
   * de semana con el viernes, no con el lunes. */
  it('traslada el Día de las Iglesias Evangélicas al viernes', () => {
    // 2023: el 31 de octubre fue martes → viernes ANTERIOR, 27.
    expect(buscar(2023, 'Día de las Iglesias Evangélicas')).toBe('2023-10-27');
    // 2018: fue miércoles → viernes SIGUIENTE, 2 de noviembre.
    expect(buscar(2018, 'Día de las Iglesias Evangélicas')).toBe('2018-11-02');
    // 2024: fue jueves → se queda.
    expect(buscar(2024, 'Día de las Iglesias Evangélicas')).toBe('2024-10-31');
  });

  it('devuelve la lista ordenada y sin fechas repetidas', () => {
    for (const anio of [2024, 2025, 2026, 2027]) {
      const feriados = feriadosDeChile(anio);
      const fechas = feriados.map((f) => f.date);
      expect(fechas).toEqual([...fechas].sort());
      expect(new Set(fechas).size).toBe(fechas.length);
    }
  });

  it('trae los 16 feriados legales', () => {
    expect(feriadosDeChile(2026)).toHaveLength(16);
  });
});
