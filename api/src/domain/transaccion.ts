import type { CardBrand, PaymentMethod, TransactionEventKind, TransactionStatus } from '@pippos/shared';

// Reglas puras de cobro y transacciones (C3, C4, C8, C9). Sin E/S: el reloj y el azar llegan desde fuera.

export const VENTANA_ANULACION_MS = 24 * 60 * 60 * 1000;

const PATRON_IMPORTE = /^[1-9][0-9]{0,7}$/;
const PATRON_ULTIMOS_4 = /^[0-9]{4}$/;
const ESTADOS_CON_DEVOLUCION: readonly TransactionStatus[] = ['approved', 'partially_refunded'];
const ESTADOS_SIN_COMPROBANTE: readonly TransactionStatus[] = ['declined', 'timeout'];

// C3: el switch simulado decide solo por los últimos 4 dígitos.
export type ResultadoSwitch =
  | { resultado: 'approved' }
  | { resultado: 'declined'; codigo: '51' | '05' }
  | { resultado: 'timeout' };

// Respuesta del switch tal como la recibe la aplicación. El authCode lo genera el adaptador.
export type RespuestaSwitch = { code: '00'; authCode: string } | { code: '51' | '05' } | { timeout: true };

export interface Cierre {
  status: TransactionStatus;
  responseCode: string | null;
  authCode: string | null;
}

export interface EventoTransaccion {
  kind: TransactionEventKind;
  amount: bigint;
  atMs: number;
  byUserId: string;
}

export interface TransaccionRegistro {
  id: string;
  folio: number;
  merchantId: string;
  requestId: string | null;
  terminalId: string;
  cashierId: string;
  amount: bigint;
  refunded: bigint;
  method: PaymentMethod;
  brand: CardBrand;
  last4: string;
  status: TransactionStatus;
  responseCode: string | null;
  authCode: string | null;
  createdAtMs: number;
  voidedAtMs: number | null;
}

export interface PeticionCobro {
  terminalId: string;
  amount: bigint;
  method: PaymentMethod;
  brand: CardBrand;
  last4: string;
}

export type ResultadoDevolucion = { ok: true; estado: 'partially_refunded' | 'refunded'; devuelto: bigint } | { ok: false };

export function respuestaDelSwitch(last4: string): ResultadoSwitch {
  if (last4 === '0051') return { resultado: 'declined', codigo: '51' };
  if (last4 === '0005') return { resultado: 'declined', codigo: '05' };
  if (last4 === '0408') return { resultado: 'timeout' };
  return { resultado: 'approved' };
}

// C2: entero de 1 a 99 999 999 como bigint; cualquier otra forma es null.
export function parseMonto(texto: string): bigint | null {
  return PATRON_IMPORTE.test(texto) ? BigInt(texto) : null;
}

export function esUltimos4(texto: string): boolean {
  return PATRON_ULTIMOS_4.test(texto);
}

// C8: solo una aprobada, sin devoluciones y con menos de 24 h desde su creación.
export function puedeAnular(estado: TransactionStatus, devuelto: bigint, creadoMs: number, ahoraMs: number): boolean {
  return estado === 'approved' && devuelto === 0n && ahoraMs < creadoMs + VENTANA_ANULACION_MS;
}

// Límite exclusivo para la sentencia SQL: creadoMs > inicio equivale a ahoraMs < creadoMs + 24 h.
export function inicioVentanaAnulacion(ahoraMs: number): number {
  return ahoraMs - VENTANA_ANULACION_MS;
}

// C8/C9: la devolución suma al total devuelto y nunca supera el importe.
export function calcularDevolucion(estado: TransactionStatus, monto: bigint, devuelto: bigint, pedido: bigint): ResultadoDevolucion {
  if (!ESTADOS_CON_DEVOLUCION.includes(estado) || pedido <= 0n) return { ok: false };
  const total = devuelto + pedido;
  if (total > monto) return { ok: false };
  return { ok: true, estado: total === monto ? 'refunded' : 'partially_refunded', devuelto: total };
}

// C10: declined y timeout no tienen comprobante.
export function tieneComprobante(estado: TransactionStatus): boolean {
  return !ESTADOS_SIN_COMPROBANTE.includes(estado);
}

// C4: lo que queda registrado según la respuesta del switch.
export function cierreDelCobro(respuesta: RespuestaSwitch): Cierre {
  if ('timeout' in respuesta) return { status: 'timeout', responseCode: null, authCode: null };
  if (respuesta.code === '00') return { status: 'approved', responseCode: '00', authCode: respuesta.authCode };
  return { status: 'declined', responseCode: respuesta.code, authCode: null };
}

// Costuras de prueba: el mismo cierre que daría el switch para ese estado final.
export function cierreDeEstado(estado: TransactionStatus, autorizacion: string): Cierre {
  if (estado === 'declined') return { status: 'declined', responseCode: '51', authCode: null };
  if (estado === 'timeout') return { status: 'timeout', responseCode: null, authCode: null };
  return { status: estado, responseCode: '00', authCode: autorizacion };
}

// Código de 6 dígitos determinista (FNV-1a de 32 bits sobre la semilla).
export function codigoDeAutorizacion(semilla: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < semilla.length; i++) {
    hash ^= semilla.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % 1_000_000).toString().padStart(6, '0');
}

// C5: un reintento es el mismo cobro solo si coinciden terminal, importe, método, marca y últimos 4.
export function mismoCobro(registro: Pick<TransaccionRegistro, 'terminalId' | 'amount' | 'method' | 'brand' | 'last4'>, peticion: PeticionCobro): boolean {
  return (
    registro.terminalId === peticion.terminalId &&
    registro.amount === peticion.amount &&
    registro.method === peticion.method &&
    registro.brand === peticion.brand &&
    registro.last4 === peticion.last4
  );
}
