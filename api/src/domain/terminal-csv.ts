export interface FilaCsv {
  linea: number;
  campos: string[];
}

export const CABECERA_IMPORTACION: readonly string[] = ['serial', 'alias', 'model', 'branch', 'till'];
export const MAX_FILAS_IMPORTACION = 500;

// Parser CSV: comillas, comas y saltos dentro de comillas, "" escapada, CRLF o LF y BOM inicial.
// El número de línea es el de inicio de cada registro. Las líneas vacías al final se ignoran.
export function parsearCsv(texto: string): FilaCsv[] {
  const entrada = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const filas: FilaCsv[] = [];
  let campos: string[] = [];
  let campo = '';
  let citado = false;
  let inicioCampo = true;
  let linea = 1;
  let inicioFila = 1;

  const cerrarCampo = (): void => {
    campos.push(campo);
    campo = '';
    inicioCampo = true;
  };
  const cerrarFila = (): void => {
    cerrarCampo();
    filas.push({ linea: inicioFila, campos });
    campos = [];
  };

  for (let i = 0; i < entrada.length; i++) {
    const c = entrada[i];
    if (citado) {
      if (c === '"' && entrada[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        citado = false;
      } else {
        campo += c;
        if (c === '\n') linea++;
      }
    } else if (c === '"' && inicioCampo) {
      citado = true;
      inicioCampo = false;
    } else if (c === ',') {
      cerrarCampo();
    } else if (c === '\n') {
      cerrarFila();
      linea++;
      inicioFila = linea;
    } else {
      campo += c;
      inicioCampo = false;
    }
  }
  if (campos.length > 0 || campo !== '' || !inicioCampo) cerrarFila();

  while (filas.length > 0 && esLineaVacia(filas[filas.length - 1])) filas.pop();
  return filas;
}

function esLineaVacia(fila: FilaCsv): boolean {
  return fila.campos.length === 1 && fila.campos[0] === '';
}

// Solo las filas de datos. Null si no hay cabecera, la cabecera no es exacta o hay más de 500 filas.
export function filasDeImportacion(texto: string): FilaCsv[] | null {
  const [cabecera, ...datos] = parsearCsv(texto);
  if (cabecera === undefined || !sonIguales(cabecera.campos, CABECERA_IMPORTACION)) return null;
  return datos.length <= MAX_FILAS_IMPORTACION ? datos : null;
}

function sonIguales(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((valor, i) => valor === b[i]);
}
