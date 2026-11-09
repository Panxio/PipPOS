import type {
  CreateTransactionInput,
  InjectTransactionInput,
  ListPublicTransactionsQuery,
  ListTransactionsQuery,
  Receipt,
  RefundTransactionInput,
  Transaction,
  TransactionCursorPage,
  TransactionDetail,
  TransactionEvent,
  TransactionPage,
} from '@pippos/shared';
import { puedeAnularODevolver, puedeCobrar, puedeLeerTransacciones, veTodasLasTransacciones } from '../domain/access';
import { codificarCursor, decodificarCursor } from '../domain/apikey';
import {
  type EventoTransaccion,
  type PeticionCobro,
  type TransaccionRegistro,
  cierreDeEstado,
  cierreDelCobro,
  codigoDeAutorizacion,
  esUltimos4,
  inicioVentanaAnulacion,
  mismoCobro,
  parseMonto,
  tieneComprobante,
} from '../domain/transaccion';
import { alertarAnulacion } from './alerts';
import { AppError } from './errors';
import type { Acceso, SessionDeps } from './get-session';
import type {
  AlertRepository,
  AuditLog,
  EventoConId,
  FiltroTransacciones,
  IdGenerator,
  NuevaTransaccion,
  PosicionCursor,
  ResultadoInsercion,
  Switch,
  TerminalRepository,
  TransactionRepository,
  UserRecord,
} from './ports';
import { usuarioQue } from './terminal-deps';

export interface TransactionDeps extends SessionDeps {
  transactions: TransactionRepository;
  terminals: TerminalRepository;
  autorizador: Switch;
  ids: IdGenerator;
  audit: AuditLog;
  alerts: AlertRepository;
}

export interface ResultadoCobro {
  transaccion: Transaction;
  // true si se creó ahora (201); false si es una repetición del mismo cobro (200).
  creada: boolean;
}

export function aTransaccion(registro: TransaccionRegistro): Transaction {
  return {
    id: registro.id,
    folio: registro.folio,
    terminalId: registro.terminalId,
    cashierId: registro.cashierId,
    amount: registro.amount.toString(),
    refundedAmount: registro.refunded.toString(),
    method: registro.method,
    brand: registro.brand,
    last4: registro.last4,
    status: registro.status,
    responseCode: registro.responseCode,
    authCode: registro.authCode,
    createdAt: registro.createdAtMs,
  };
}

function aEvento(evento: EventoTransaccion): TransactionEvent {
  return { kind: evento.kind, amount: evento.amount.toString(), at: evento.atMs, byUserId: evento.byUserId };
}

// Un cajero no ve ni abre transacciones ajenas: para él son inexistentes (404).
function puedeVer(usuario: UserRecord, registro: TransaccionRegistro): boolean {
  return veTodasLasTransacciones(usuario.role) || registro.cashierId === usuario.id;
}

async function registroVisible(deps: TransactionDeps, usuario: UserRecord, id: string): Promise<TransaccionRegistro> {
  const registro = await deps.transactions.findInMerchant(usuario.merchantId, id);
  if (registro === null || !puedeVer(usuario, registro)) throw new AppError('NOT_FOUND');
  return registro;
}

type FiltrosDeConsulta = Pick<ListTransactionsQuery, 'status' | 'method' | 'brand' | 'terminalId' | 'from' | 'to' | 'min' | 'max'>;

// Los filtros de C6, iguales para la lista paginada y la de cursor. Admin y supervisor ven todo el comercio; el cajero, lo suyo.
function filtroDe(usuario: UserRecord, consulta: FiltrosDeConsulta): FiltroTransacciones {
  return {
    cashierId: veTodasLasTransacciones(usuario.role) ? undefined : usuario.id,
    status: consulta.status,
    method: consulta.method,
    brand: consulta.brand,
    terminalId: consulta.terminalId,
    desdeMs: consulta.from,
    hastaMs: consulta.to,
    minimo: consulta.min === undefined ? undefined : exigirMonto(consulta.min),
    maximo: consulta.max === undefined ? undefined : exigirMonto(consulta.max),
  };
}

function exigirMonto(texto: string): bigint {
  const monto = parseMonto(texto);
  if (monto === null) throw new AppError('VALIDATION_ERROR');
  return monto;
}

// Bitácora de anulaciones y devoluciones: folio e importe, como texto.
async function registrarTransaccion(
  deps: TransactionDeps,
  usuario: UserRecord,
  atMs: number,
  action: 'transaction.voided' | 'transaction.refunded',
  registro: TransaccionRegistro,
  importe: bigint,
): Promise<void> {
  await deps.audit.record({
    merchantId: usuario.merchantId,
    atMs,
    actorId: usuario.id,
    actorName: usuario.name,
    action,
    entityType: 'transaction',
    entityId: registro.id,
    detail: { folio: String(registro.folio), amount: importe.toString() },
  });
}

// Una anulación o devolución que no se aplicó: 404 si la transacción no existe en el comercio, 409 si existe pero no admite el cambio.
async function rechazarTransicion(deps: TransactionDeps, merchantId: string, id: string): Promise<never> {
  const existente = await deps.transactions.findInMerchant(merchantId, id);
  throw new AppError(existente === null ? 'NOT_FOUND' : 'CONFLICT');
}

export class CreateTransaction {
  private readonly deps: TransactionDeps;

  constructor(deps: TransactionDeps) {
    this.deps = deps;
  }

  async execute(acceso: Acceso, entrada: CreateTransactionInput): Promise<ResultadoCobro> {
    const usuario = await usuarioQue(this.deps, acceso, puedeCobrar);
    const cobro: PeticionCobro = {
      terminalId: entrada.terminalId,
      amount: exigirMonto(entrada.amount),
      method: entrada.method,
      brand: entrada.brand,
      last4: entrada.last4,
    };
    if (!esUltimos4(cobro.last4)) throw new AppError('VALIDATION_ERROR');

    // Un reintento con el mismo requestId devuelve el cobro original, aunque el terminal haya cambiado después.
    const previa = await this.deps.transactions.findByRequestId(usuario.merchantId, entrada.requestId);
    if (previa !== null) return this.repeticion(usuario, previa, cobro);

    const terminal = await this.deps.terminals.findById(usuario.merchantId, cobro.terminalId);
    if (terminal === null) throw new AppError('NOT_FOUND');
    if (terminal.status === 'inactive') throw new AppError('CONFLICT');

    const respuesta = await this.deps.autorizador.authorize({
      amount: cobro.amount,
      method: cobro.method,
      brand: cobro.brand,
      last4: cobro.last4,
    });
    const cierre = cierreDelCobro(respuesta);
    const ahora = this.deps.clock.nowMs();
    const nueva: NuevaTransaccion = {
      id: this.deps.ids.id(),
      requestId: entrada.requestId,
      terminalId: cobro.terminalId,
      cashierId: usuario.id,
      amount: cobro.amount,
      refunded: 0n,
      method: cobro.method,
      brand: cobro.brand,
      last4: cobro.last4,
      ...cierre,
      createdAtMs: ahora,
      voidedAtMs: null,
      eventos: [{ id: this.deps.ids.id(), kind: 'created', amount: cobro.amount, atMs: ahora, byUserId: usuario.id }],
    };
    const resultado: ResultadoInsercion = await this.deps.transactions.insert(usuario.merchantId, nueva);
    if (resultado.creada) return { transaccion: aTransaccion(resultado.registro), creada: true };
    return this.repeticion(usuario, resultado.existente, cobro);
  }

  // Mismo cuerpo y visible para quien reintenta: la original (200). Otro cuerpo, o de otro usuario: 409.
  private repeticion(usuario: UserRecord, existente: TransaccionRegistro, cobro: PeticionCobro): ResultadoCobro {
    if (!puedeVer(usuario, existente) || !mismoCobro(existente, cobro)) throw new AppError('CONFLICT');
    return { transaccion: aTransaccion(existente), creada: false };
  }
}

export class ListTransactions {
  private readonly deps: TransactionDeps;

  constructor(deps: TransactionDeps) {
    this.deps = deps;
  }

  async execute(acceso: Acceso, consulta: ListTransactionsQuery): Promise<TransactionPage> {
    const usuario = await usuarioQue(this.deps, acceso, puedeLeerTransacciones);
    const { items, total } = await this.deps.transactions.list(usuario.merchantId, filtroDe(usuario, consulta), {
      page: consulta.page,
      pageSize: consulta.pageSize,
    });
    return { items: items.map(aTransaccion), total, page: consulta.page, pageSize: consulta.pageSize };
  }
}

// API pública (K5): lista por cursor. Pide limit + 1 filas para saber si hay página siguiente.
export class ListPublicTransactions {
  private readonly deps: TransactionDeps;

  constructor(deps: TransactionDeps) {
    this.deps = deps;
  }

  async execute(acceso: Acceso, consulta: ListPublicTransactionsQuery): Promise<TransactionCursorPage> {
    const usuario = await usuarioQue(this.deps, acceso, puedeLeerTransacciones);
    const despuesDe = consulta.cursor === undefined ? null : await this.posicionDe(usuario.merchantId, consulta.cursor);
    const filas = await this.deps.transactions.listDespues(usuario.merchantId, filtroDe(usuario, consulta), {
      limite: consulta.limit + 1,
      despuesDe,
    });
    const pagina = filas.slice(0, consulta.limit);
    const ultima = pagina.at(-1);
    const hayMas = filas.length > consulta.limit && ultima !== undefined;
    return { items: pagina.map(aTransaccion), nextCursor: hayMas ? codificarCursor(ultima.folio) : null };
  }

  // Un cursor que no es un folio canónico, o que no es de este comercio, es un cursor inválido (400).
  private async posicionDe(merchantId: string, cursor: string): Promise<PosicionCursor> {
    const folio = decodificarCursor(cursor);
    if (folio === null) throw new AppError('VALIDATION_ERROR');
    const posicion = await this.deps.transactions.posicionDeFolio(merchantId, folio);
    if (posicion === null) throw new AppError('VALIDATION_ERROR');
    return posicion;
  }
}

export class GetTransaction {
  private readonly deps: TransactionDeps;

  constructor(deps: TransactionDeps) {
    this.deps = deps;
  }

  async execute(acceso: Acceso, id: string): Promise<TransactionDetail> {
    const usuario = await usuarioQue(this.deps, acceso, puedeLeerTransacciones);
    const registro = await registroVisible(this.deps, usuario, id);
    const eventos = await this.deps.transactions.events(registro.id);
    return { ...aTransaccion(registro), events: eventos.map(aEvento) };
  }
}

export class VoidTransaction {
  private readonly deps: TransactionDeps;

  constructor(deps: TransactionDeps) {
    this.deps = deps;
  }

  async execute(token: string | undefined, id: string): Promise<Transaction> {
    const usuario = await usuarioQue(this.deps, token, puedeAnularODevolver);
    const ahora = this.deps.clock.nowMs();
    const anulada = await this.deps.transactions.voidIfAllowed(usuario.merchantId, id, {
      eventId: this.deps.ids.id(),
      atMs: ahora,
      creadaDespuesDe: inicioVentanaAnulacion(ahora),
      byUserId: usuario.id,
    });
    if (anulada === null) return rechazarTransicion(this.deps, usuario.merchantId, id);
    await registrarTransaccion(this.deps, usuario, ahora, 'transaction.voided', anulada, anulada.amount);
    await alertarAnulacion(this.deps, usuario.merchantId, anulada, ahora);
    return aTransaccion(anulada);
  }
}

export class RefundTransaction {
  private readonly deps: TransactionDeps;

  constructor(deps: TransactionDeps) {
    this.deps = deps;
  }

  async execute(token: string | undefined, id: string, entrada: RefundTransactionInput): Promise<Transaction> {
    const usuario = await usuarioQue(this.deps, token, puedeAnularODevolver);
    const pedido = exigirMonto(entrada.amount);
    const ahora = this.deps.clock.nowMs();
    const devuelta = await this.deps.transactions.refundIfAllowed(usuario.merchantId, id, {
      eventId: this.deps.ids.id(),
      pedido,
      atMs: ahora,
      byUserId: usuario.id,
    });
    if (devuelta === null) return rechazarTransicion(this.deps, usuario.merchantId, id);
    // El importe de la bitácora es el devuelto en esta operación, no el acumulado.
    await registrarTransaccion(this.deps, usuario, ahora, 'transaction.refunded', devuelta, pedido);
    return aTransaccion(devuelta);
  }
}

export class GetReceipt {
  private readonly deps: TransactionDeps;

  constructor(deps: TransactionDeps) {
    this.deps = deps;
  }

  async execute(token: string | undefined, id: string): Promise<Receipt> {
    const usuario = await usuarioQue(this.deps, token, puedeLeerTransacciones);
    const registro = await registroVisible(this.deps, usuario, id);
    if (!tieneComprobante(registro.status)) throw new AppError('CONFLICT');
    const terminal = await this.deps.terminals.findById(usuario.merchantId, registro.terminalId);
    if (terminal === null) throw new AppError('NOT_FOUND');
    return {
      folio: registro.folio,
      merchantName: usuario.merchantName,
      terminalAlias: terminal.alias,
      amount: registro.amount.toString(),
      refundedAmount: registro.refunded.toString(),
      method: registro.method,
      brand: registro.brand,
      last4: registro.last4,
      status: registro.status,
      authCode: registro.authCode,
      createdAt: registro.createdAtMs,
    };
  }
}

// Costura de prueba: inserta una transacción ya resuelta, con el mismo cierre que daría el switch.
export class InjectTransaction {
  private readonly deps: Pick<TransactionDeps, 'transactions' | 'terminals' | 'ids'>;

  constructor(deps: Pick<TransactionDeps, 'transactions' | 'terminals' | 'ids'>) {
    this.deps = deps;
  }

  async execute(entrada: InjectTransactionInput): Promise<Transaction> {
    const merchantId = await this.deps.terminals.merchantIdOf(entrada.terminalId);
    if (merchantId === null) throw new AppError('NOT_FOUND');
    const monto = exigirMonto(entrada.amount);
    const devuelto = BigInt(entrada.refundedAmount ?? '0');
    if (devuelto > monto) throw new AppError('VALIDATION_ERROR');

    const id = this.deps.ids.id();
    const cierre = cierreDeEstado(entrada.status, codigoDeAutorizacion(id));
    const eventos: EventoConId[] = [
      { id: this.deps.ids.id(), kind: 'created', amount: monto, atMs: entrada.createdAt, byUserId: entrada.cashierId },
    ];
    if (entrada.status === 'voided') {
      eventos.push({ id: this.deps.ids.id(), kind: 'voided', amount: monto, atMs: entrada.createdAt, byUserId: entrada.cashierId });
    }
    if (devuelto > 0n) {
      eventos.push({ id: this.deps.ids.id(), kind: 'refunded', amount: devuelto, atMs: entrada.createdAt, byUserId: entrada.cashierId });
    }
    const resultado = await this.deps.transactions.insert(merchantId, {
      id,
      requestId: null,
      terminalId: entrada.terminalId,
      cashierId: entrada.cashierId,
      amount: monto,
      refunded: devuelto,
      method: entrada.method,
      brand: entrada.brand,
      last4: entrada.last4,
      ...cierre,
      createdAtMs: entrada.createdAt,
      voidedAtMs: entrada.status === 'voided' ? entrada.createdAt : null,
      eventos,
    });
    return aTransaccion(resultado.creada ? resultado.registro : resultado.existente);
  }
}
