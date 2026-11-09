import type { ImportRowCode, ImportResult } from '@pippos/shared';
import { CABECERA_IMPORTACION, type FilaCsv } from './terminal-csv';
import { type CamposTerminal, validarCampos } from './terminal';

export type ResultadoFila = { ok: true; campos: CamposTerminal } | { ok: false; code: ImportRowCode };

export interface PlanImportacion {
  crear: CamposTerminal[];
  invalidas: ImportResult['invalid'];
}

// Fórmulas de hoja de cálculo: un valor que empieza por = + - @ podría ejecutarse al exportarlo.
const INICIO_DE_FORMULA = /^[=+\-@]/;

function evaluarFila(celdas: readonly string[]): ResultadoFila {
  const [serial = '', alias = '', model = '', branch = '', till = ''] = celdas;
  const base = validarCampos({ serial, alias, model, branch, till });
  if (!base.ok) return { ok: false, code: base.error };
  if (celdas.length > CABECERA_IMPORTACION.length) return { ok: false, code: 'INVALID_FIELD' };
  const campos = base.campos;
  if ([campos.alias, campos.model, campos.branch, campos.till].some((valor) => INICIO_DE_FORMULA.test(valor))) {
    return { ok: false, code: 'UNSAFE_VALUE' };
  }
  return { ok: true, campos };
}

// Las filas válidas y no repetidas se crean; las demás se reportan con su número de línea.
// Un serial cuenta como ocupado solo si su fila fue aceptada (las rechazadas no crean nada).
export function planificarImportacion(filas: readonly FilaCsv[], seriesExistentes: ReadonlySet<string>): PlanImportacion {
  const ocupadas = new Set(seriesExistentes);
  const crear: CamposTerminal[] = [];
  const invalidas: ImportResult['invalid'] = [];
  for (const fila of filas) {
    const resultado = evaluarFila(fila.campos);
    if (!resultado.ok) {
      invalidas.push({ row: fila.linea, code: resultado.code });
    } else if (ocupadas.has(resultado.campos.serial)) {
      invalidas.push({ row: fila.linea, code: 'DUPLICATE_SERIAL' });
    } else {
      ocupadas.add(resultado.campos.serial);
      crear.push(resultado.campos);
    }
  }
  return { crear, invalidas };
}
