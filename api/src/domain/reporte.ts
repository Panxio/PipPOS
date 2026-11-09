import type { CardBrand, PaymentMethod, ReportGroupBy, TransactionStatus } from '@pippos/shared';

// Reglas puras de reportería (R3, R4, R5, R7). Sin E/S, sin Date ni azar: el día civil sale de aritmética de enteros.
// agruparPor y kpis no filtran por rango (L3): lo hace el repositorio en SQL; el rango solo enumera los días.

const DIA_MS = 86_400_000;
const HORA_MS = 3_600_000;
const MINUTO_MS = 60_000;
const PUNTOS_BASE = 10_000;
const ESTADOS_VENTA: readonly TransactionStatus[] = ['approved', 'partially_refunded', 'refunded'];
const HORAS: readonly string[] = Array.from({ length: 24 }, (_, hora) => String(hora).padStart(2, '0'));
const INICIOS_CON_APOSTROFE = ['=', '+', '-', '@', '\t', '\r'];
const CABECERA_CSV = 'key,label,sales,totalNet';

export interface FilaVenta {
  createdAtMs: number;
  terminalId: string;
  cashierId: string;
  amount: bigint;
  refunded: bigint;
  method: PaymentMethod;
  brand: CardBrand;
  status: TransactionStatus;
}

// Nombres actuales del comercio: alias de terminal y nombre de usuario.
export interface NombresReporte {
  terminal: Record<string, string>;
  cashier: Record<string, string>;
}

export interface RangoMs {
  from: number;
  to: number;
}

export interface Kpis {
  totalNet: bigint;
  sales: number;
  avgTicket: bigint;
  attempts: number;
  approvalBp: number;
  voidedCount: number;
  voidedAmount: bigint;
}

export interface ItemAgrupado {
  key: string;
  label: string;
  sales: number;
  totalNet: bigint;
}

export function esVenta(estado: TransactionStatus): boolean {
  return ESTADOS_VENTA.includes(estado);
}

export function neto(amount: bigint, refunded: bigint): bigint {
  return amount - refunded;
}

// R4: solo las ventas suman; las anuladas van aparte; todas las filas cuentan como intentos.
export function kpis(filas: readonly FilaVenta[]): Kpis {
  const ventas = filas.filter((fila) => esVenta(fila.status));
  const anuladas = filas.filter((fila) => fila.status === 'voided');
  const totalNet = ventas.reduce((suma, fila) => suma + neto(fila.amount, fila.refunded), 0n);
  const sales = ventas.length;
  return {
    totalNet,
    sales,
    avgTicket: sales === 0 ? 0n : totalNet / BigInt(sales),
    attempts: filas.length,
    approvalBp: filas.length === 0 ? 0 : Math.floor(((sales + anuladas.length) * PUNTOS_BASE) / filas.length),
    voidedCount: anuladas.length,
    voidedAmount: anuladas.reduce((suma, fila) => suma + fila.amount, 0n),
  };
}

// R4: el período inmediatamente anterior, de igual largo.
export function periodoAnterior(from: number, to: number): RangoMs {
  const largo = to - from + 1;
  return { from: from - largo, to: from - 1 };
}

// Algoritmo de H. Hinnant (civil_from_days) con enteros: días desde 1970-01-01, negativos incluidos.
function fechaCivil(dias: number): { anio: number; mes: number; dia: number } {
  const z = dias + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const dia = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const mes = mp < 10 ? mp + 3 : mp - 9;
  const anio = yoe + era * 400;
  return { anio: mes <= 2 ? anio + 1 : anio, mes, dia };
}

function textoDeDia(dias: number): string {
  const { anio, mes, dia } = fechaCivil(dias);
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

// Milisegundos de reloj local: el desfase es fijo en todo el rango (R2).
function msLocales(ms: number, tzOffsetMin: number): number {
  return ms + tzOffsetMin * MINUTO_MS;
}

export function claveDia(ms: number, tzOffsetMin: number): string {
  return textoDeDia(Math.floor(msLocales(ms, tzOffsetMin) / DIA_MS));
}

export function claveHora(ms: number, tzOffsetMin: number): string {
  const enElDia = ((msLocales(ms, tzOffsetMin) % DIA_MS) + DIA_MS) % DIA_MS;
  return String(Math.floor(enElDia / HORA_MS)).padStart(2, '0');
}

// Todos los días locales desde el de `from` hasta el de `to`, en orden cronológico.
function diasDelRango(rango: RangoMs, tzOffsetMin: number): string[] {
  const primero = Math.floor(msLocales(rango.from, tzOffsetMin) / DIA_MS);
  const ultimo = Math.floor(msLocales(rango.to, tzOffsetMin) / DIA_MS);
  const claves: string[] = [];
  for (let dia = primero; dia <= ultimo; dia++) claves.push(textoDeDia(dia));
  return claves;
}

function claveDeGrupo(fila: FilaVenta, groupBy: ReportGroupBy, tzOffsetMin: number): string {
  switch (groupBy) {
    case 'day':
      return claveDia(fila.createdAtMs, tzOffsetMin);
    case 'hour':
      return claveHora(fila.createdAtMs, tzOffsetMin);
    case 'terminal':
      return fila.terminalId;
    case 'cashier':
      return fila.cashierId;
    case 'method':
      return fila.method;
    case 'brand':
      return fila.brand;
  }
}

// El nombre actual si el id sigue existiendo en el comercio; vacío si ya no.
function nombreDe(diccionario: Record<string, string>, id: string): string {
  return Object.hasOwn(diccionario, id) ? diccionario[id]! : '';
}

function etiquetaDe(groupBy: ReportGroupBy, key: string, nombres: NombresReporte): string {
  if (groupBy === 'terminal') return nombreDe(nombres.terminal, key);
  if (groupBy === 'cashier') return nombreDe(nombres.cashier, key);
  return key;
}

// Mayor total primero; a igual total, por clave ascendente.
function porTotalYClave(a: ItemAgrupado, b: ItemAgrupado): number {
  if (a.totalNet !== b.totalNet) return a.totalNet > b.totalNet ? -1 : 1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

// R5: solo cuentan las ventas (R3). day enumera todos los días del rango y hour las 24 horas; el resto solo los grupos con ventas.
export function agruparPor(
  filas: readonly FilaVenta[],
  groupBy: ReportGroupBy,
  tzOffsetMin: number,
  rango: RangoMs,
  nombres: NombresReporte,
): ItemAgrupado[] {
  const acumulados = new Map<string, { sales: number; totalNet: bigint }>();
  for (const fila of filas.filter((f) => esVenta(f.status))) {
    const clave = claveDeGrupo(fila, groupBy, tzOffsetMin);
    const previo = acumulados.get(clave) ?? { sales: 0, totalNet: 0n };
    acumulados.set(clave, { sales: previo.sales + 1, totalNet: previo.totalNet + neto(fila.amount, fila.refunded) });
  }
  if (groupBy === 'day' || groupBy === 'hour') {
    const claves = groupBy === 'day' ? diasDelRango(rango, tzOffsetMin) : HORAS;
    return claves.map((key) => {
      const acumulado = acumulados.get(key) ?? { sales: 0, totalNet: 0n };
      return { key, label: key, sales: acumulado.sales, totalNet: acumulado.totalNet };
    });
  }
  return [...acumulados.entries()]
    .map(([key, acumulado]) => ({ key, label: etiquetaDe(groupBy, key, nombres), sales: acumulado.sales, totalNet: acumulado.totalNet }))
    .sort(porTotalYClave);
}

// R7: una celda que empieza por fórmula lleva un apóstrofe delante; las que contienen coma, comilla o salto van entre comillas.
export function celdaCsv(texto: string): string {
  const neutral = INICIOS_CON_APOSTROFE.some((inicio) => texto.startsWith(inicio)) ? `'${texto}` : texto;
  return /[",\r\n]/.test(neutral) ? `"${neutral.replace(/"/g, '""')}"` : neutral;
}

// RFC 4180 con \r\n tras cada línea, cabecera incluida.
export function aCsv(items: readonly ItemAgrupado[]): string {
  const lineas = [CABECERA_CSV, ...items.map((item) => [celdaCsv(item.key), celdaCsv(item.label), String(item.sales), String(item.totalNet)].join(','))];
  return lineas.map((linea) => `${linea}\r\n`).join('');
}
