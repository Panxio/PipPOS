import type { DatabaseSync } from 'node:sqlite';
import type { CardBrand, PaymentMethod, TransactionStatus } from '@pippos/shared';
import type { IdGenerator } from '../application/ports';
import { codigoDeAutorizacion } from '../domain/transaccion';
import { DEMO_USERS, MERCHANT_ID, TERMINALES_DEMO } from './demo';

// Semilla de demo (R8): 400 transacciones deterministas para probar la reportería. Solo se llama al arrancar con BD vacía.
const SEMILLA = 20_241_101;
const VENTANA_SEGUNDOS = 30 * 24 * 60 * 60;
const UNIDAD_CLP = 100;

// Reparto exacto por estado: suma 400, con más de 200 aprobadas.
const REPARTO: ReadonlyArray<readonly [TransactionStatus, number]> = [
  ['approved', 240],
  ['partially_refunded', 40],
  ['refunded', 20],
  ['voided', 30],
  ['declined', 50],
  ['timeout', 20],
];

const METODOS: readonly PaymentMethod[] = ['card', 'wallet'];
const MARCAS: readonly CardBrand[] = ['visa', 'mastercard', 'amex'];
const TERMINALES = TERMINALES_DEMO.map((terminal) => terminal.id);
const CAJEROS = DEMO_USERS.map((usuario) => usuario.id);

interface Cierre {
  last4: string;
  responseCode: string | null;
  authCode: string | null;
}

interface Borrador extends Cierre {
  id: string;
  terminalId: string;
  cashierId: string;
  amount: number;
  refunded: number;
  method: PaymentMethod;
  brand: CardBrand;
  status: TransactionStatus;
  createdAtMs: number;
  voidedAtMs: number | null;
}

// Park-Miller: generador lineal de semilla fija; la misma semilla da siempre la misma secuencia.
function generadorAleatorio(semilla: number): (maximo: number) => number {
  let estado = semilla;
  return (maximo) => {
    estado = (estado * 48_271) % 2_147_483_647;
    return estado % maximo;
  };
}

function estadosDelReparto(): TransactionStatus[] {
  return REPARTO.flatMap(([estado, cantidad]) => Array.from({ length: cantidad }, () => estado));
}

// C3/C4: el switch decide por los últimos 4 dígitos; los rechazos y el timeout usan los de su código.
function cierreDe(estado: TransactionStatus, id: string, azar: (maximo: number) => number): Cierre {
  if (estado === 'timeout') return { last4: '0408', responseCode: null, authCode: null };
  if (estado === 'declined') {
    const codigo = azar(2) === 0 ? '51' : '05';
    return { last4: codigo === '51' ? '0051' : '0005', responseCode: codigo, authCode: null };
  }
  // Los últimos 4 de las aprobadas empiezan por 1-9, así que nunca coinciden con un rechazo ni con el timeout.
  return { last4: String(1000 + azar(9000)), responseCode: '00', authCode: codigoDeAutorizacion(id) };
}

function devueltoDe(estado: TransactionStatus, importe: number, azar: (maximo: number) => number): number {
  if (estado === 'refunded') return importe;
  if (estado === 'partially_refunded') return UNIDAD_CLP * (1 + azar(importe / UNIDAD_CLP - 1));
  return 0;
}

function borrador(estado: TransactionStatus, nowMs: number, azar: (maximo: number) => number, ids: IdGenerator): Borrador {
  const id = ids.id();
  const amount = UNIDAD_CLP * (5 + azar(5000));
  const createdAtMs = nowMs - azar(VENTANA_SEGUNDOS) * 1000;
  return {
    id,
    terminalId: TERMINALES[azar(TERMINALES.length)]!,
    cashierId: CAJEROS[azar(CAJEROS.length)]!,
    amount,
    refunded: devueltoDe(estado, amount, azar),
    method: METODOS[azar(METODOS.length)]!,
    brand: MARCAS[azar(MARCAS.length)]!,
    status: estado,
    createdAtMs,
    voidedAtMs: estado === 'voided' ? createdAtMs : null,
    ...cierreDe(estado, id, azar),
  };
}

const INSERTAR_TRANSACCION = `INSERT INTO transactions (id, merchant_id, folio, request_id, terminal_id, cashier_id, amount,
  refunded, method, brand, last4, status, response_code, auth_code, created_at_ms, voided_at_ms)
  VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const INSERTAR_EVENTO = `INSERT INTO transaction_events (id, transaction_id, kind, amount, at_ms, by_user_id)
  VALUES (?, ?, ?, ?, ?, ?)`;

// Un created por transacción; voided si está anulada; refunded por lo devuelto (su suma es refunded).
function insertar(db: DatabaseSync, b: Borrador, folio: number, ids: IdGenerator): void {
  db.prepare(INSERTAR_TRANSACCION).run(
    b.id, MERCHANT_ID, folio, b.terminalId, b.cashierId, b.amount, b.refunded, b.method, b.brand, b.last4,
    b.status, b.responseCode, b.authCode, b.createdAtMs, b.voidedAtMs,
  );
  const evento = db.prepare(INSERTAR_EVENTO);
  evento.run(ids.id(), b.id, 'created', b.amount, b.createdAtMs, b.cashierId);
  if (b.voidedAtMs !== null) evento.run(ids.id(), b.id, 'voided', b.amount, b.voidedAtMs, b.cashierId);
  if (b.refunded > 0) evento.run(ids.id(), b.id, 'refunded', b.refunded, b.createdAtMs, b.cashierId);
}

// Devuelve cuántas insertó: 400, o 0 y sin tocar nada si ya hay transacciones.
export function sembrarTransacciones(db: DatabaseSync, ids: IdGenerator, nowMs: number): number {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number };
  if (n > 0) return 0;
  const azar = generadorAleatorio(SEMILLA);
  // Orden por instante: los folios crecen con el tiempo, como en un comercio real. El sort es estable: el desempate es el orden de generación.
  const borradores = estadosDelReparto()
    .map((estado) => borrador(estado, nowMs, azar, ids))
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
  db.exec('BEGIN');
  try {
    borradores.forEach((b, indice) => insertar(db, b, indice + 1, ids));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return borradores.length;
}
