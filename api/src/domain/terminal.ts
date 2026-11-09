import type { CreateTerminalInput, Terminal, TerminalStatus } from '@pippos/shared';

export const LARGO_MAXIMO_CAMPO = 60;
export const FIRMWARE_DE_ALTA = '1.4.2';
export const BATERIA_DE_ALTA = 100;

const PATRON_SERIAL = /^[A-Z0-9-]{6,20}$/;

export type CamposTerminal = CreateTerminalInput;

export type CambiosTerminal = { alias?: string; branch?: string; till?: string; status?: TerminalStatus };

export type ErrorCampo = 'INVALID_SERIAL' | 'MISSING_FIELD' | 'INVALID_FIELD';

export type ResultadoCampos = { ok: true; campos: CamposTerminal } | { ok: false; error: ErrorCampo };

export function normalizarSerial(serial: string): string {
  return serial.trim().toUpperCase();
}

function normalizarCampos(entrada: CamposTerminal): CamposTerminal {
  return {
    serial: normalizarSerial(entrada.serial),
    alias: entrada.alias.trim(),
    model: entrada.model.trim(),
    branch: entrada.branch.trim(),
    till: entrada.till.trim(),
  };
}

function errorDeTexto(valor: string): ErrorCampo | null {
  if (valor === '') return 'MISSING_FIELD';
  return [...valor].length > LARGO_MAXIMO_CAMPO ? 'INVALID_FIELD' : null;
}

function errorDeCampos(campos: CamposTerminal): ErrorCampo | null {
  if (!PATRON_SERIAL.test(campos.serial)) return 'INVALID_SERIAL';
  for (const valor of [campos.alias, campos.model, campos.branch, campos.till]) {
    const error = errorDeTexto(valor);
    if (error !== null) return error;
  }
  return null;
}

// Alta y filas de importación: el serial se normaliza antes de validarlo.
export function validarCampos(entrada: CamposTerminal): ResultadoCampos {
  const campos = normalizarCampos(entrada);
  const error = errorDeCampos(campos);
  return error === null ? { ok: true, campos } : { ok: false, error };
}

// Edición parcial: solo se revisan los textos presentes; devuelve null si alguno no cumple.
export function validarCambios(cambios: CambiosTerminal): CambiosTerminal | null {
  const normales: CambiosTerminal = { ...cambios };
  for (const clave of ['alias', 'branch', 'till'] as const) {
    const valor = cambios[clave];
    if (valor === undefined) continue;
    const texto = valor.trim();
    if (errorDeTexto(texto) !== null) return null;
    normales[clave] = texto;
  }
  return normales;
}

export function crearTerminal(campos: CamposTerminal, datos: { id: string; createdAt: number }): Terminal {
  return {
    id: datos.id,
    serial: campos.serial,
    alias: campos.alias,
    model: campos.model,
    branch: campos.branch,
    till: campos.till,
    status: 'active',
    firmware: FIRMWARE_DE_ALTA,
    batteryPct: BATERIA_DE_ALTA,
    connection: 'offline',
    createdAt: datos.createdAt,
  };
}
