/**
 * Feriados legales de Chile, calculados para cualquier año.
 *
 * Sirven para precargar el calendario de la obra (migración 037) y, con eso,
 * para que las fechas del tren de actividades se calculen solas en vez de
 * escribirse celda por celda.
 *
 * Lógica pura, sin React ni base de datos, para poder cubrirla con tests
 * (`chile-holidays.test.ts`).
 *
 * TRES CLASES DE FERIADO, Y POR QUÉ IMPORTA
 *
 * 1. **Fijos.** Caen siempre el mismo día (1 de mayo, 18 de septiembre).
 * 2. **De Pascua.** Viernes y Sábado Santo dependen del Domingo de
 *    Resurrección, que se calcula con el algoritmo gregoriano.
 * 3. **Trasladables.** San Pedro y San Pablo, el Encuentro de Dos Mundos y el
 *    Día de las Iglesias Evangélicas se corren de día por ley para armar fin
 *    de semana largo. Un calendario que los deja en su fecha nominal cuenta mal
 *    los días hábiles justo en las semanas en que la obra para.
 *
 * Lo que se carga en la app queda EDITABLE: si un año el traslado no coincide
 * con el calendario oficial, se corrige la fecha a mano sin tocar código.
 */

export interface Feriado {
  /** `YYYY-MM-DD`, que es como viaja una columna DATE de Supabase. */
  date: string;
  name: string;
}

/** `YYYY-MM-DD` de una fecha, leída por sus campos locales. */
function iso(fecha: Date): string {
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mm}-${dd}`;
}

/**
 * Domingo de Resurrección por el algoritmo gregoriano anónimo (Meeus/Butcher).
 * No es una aproximación: da la fecha exacta para cualquier año del calendario
 * gregoriano.
 */
export function domingoDePascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia);
}

/**
 * Traslado de la Ley 19.973 (San Pedro y San Pablo, y el Encuentro de Dos
 * Mundos): si el feriado cae martes, miércoles o jueves se celebra el lunes
 * anterior; si cae viernes, el lunes siguiente. Lunes, sábado y domingo se
 * quedan donde están.
 */
function trasladarALunes(fecha: Date): Date {
  const dia = fecha.getDay(); // 0 = domingo
  if (dia >= 2 && dia <= 4) {
    return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - (dia - 1));
  }
  if (dia === 5) {
    return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + 3);
  }
  return fecha;
}

/**
 * Traslado de la Ley 20.299 (Día de las Iglesias Evangélicas, 31 de octubre):
 * si cae martes se corre al viernes anterior; si cae miércoles, al viernes
 * siguiente. Es una regla distinta de la anterior —arma el fin de semana con
 * el viernes, no con el lunes— y por eso va aparte.
 */
function trasladarAViernes(fecha: Date): Date {
  const dia = fecha.getDay();
  if (dia === 2) {
    return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - 4);
  }
  if (dia === 3) {
    return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + 2);
  }
  return fecha;
}

/**
 * Todos los feriados legales de un año, ya trasladados, ordenados por fecha.
 *
 * No incluye los feriados regionales (Arica, Chiloé) ni los de elecciones, que
 * cambian año a año: esos se agregan a mano en el calendario de la obra.
 */
export function feriadosDeChile(anio: number): Feriado[] {
  const pascua = domingoDePascua(anio);
  const viernesSanto = new Date(anio, pascua.getMonth(), pascua.getDate() - 2);
  const sabadoSanto = new Date(anio, pascua.getMonth(), pascua.getDate() - 1);

  const feriados: Feriado[] = [
    { date: iso(new Date(anio, 0, 1)), name: 'Año Nuevo' },
    { date: iso(viernesSanto), name: 'Viernes Santo' },
    { date: iso(sabadoSanto), name: 'Sábado Santo' },
    { date: iso(new Date(anio, 4, 1)), name: 'Día del Trabajo' },
    { date: iso(new Date(anio, 4, 21)), name: 'Día de las Glorias Navales' },
    { date: iso(new Date(anio, 5, 20)), name: 'Día Nacional de los Pueblos Indígenas' },
    { date: iso(trasladarALunes(new Date(anio, 5, 29))), name: 'San Pedro y San Pablo' },
    { date: iso(new Date(anio, 6, 16)), name: 'Virgen del Carmen' },
    { date: iso(new Date(anio, 7, 15)), name: 'Asunción de la Virgen' },
    { date: iso(new Date(anio, 8, 18)), name: 'Independencia Nacional' },
    { date: iso(new Date(anio, 8, 19)), name: 'Día de las Glorias del Ejército' },
    { date: iso(trasladarALunes(new Date(anio, 9, 12))), name: 'Encuentro de Dos Mundos' },
    { date: iso(trasladarAViernes(new Date(anio, 9, 31))), name: 'Día de las Iglesias Evangélicas' },
    { date: iso(new Date(anio, 10, 1)), name: 'Día de Todos los Santos' },
    { date: iso(new Date(anio, 11, 8)), name: 'Inmaculada Concepción' },
    { date: iso(new Date(anio, 11, 25)), name: 'Navidad' },
  ];

  return feriados.sort((a, b) => a.date.localeCompare(b.date));
}
