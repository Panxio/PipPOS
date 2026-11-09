import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  ApiKeyScope,
  AlertType,
  AuditAction,
  Branch,
  CardBrand,
  MailboxMessage,
  PaymentMethod,
  Preferences,
  Role,
  Terminal,
  TerminalConnection,
  TransactionEventKind,
  TransactionStatus,
} from '@pippos/shared';
import { AppError } from '../../application/errors';
import type {
  AlertRepository,
  AlertaRegistro,
  ApiKeyRecord,
  ApiKeyRepository,
  AuditLog,
  AuditQuery,
  BranchRepository,
  EntradaAuditoria,
  FiltroAuditoria,
  NuevaAlerta,
  NuevaEntradaAuditoria,
  FilasReporte,
  FiltroTransacciones,
  InvitationRepository,
  MailboxRepository,
  NewInvitation,
  NewUser,
  NuevaLlave,
  Paginacion,
  PosicionCursor,
  ReportRepository,
  ResultadoInsercion,
  NuevaTransaccion,
  SessionRecord,
  SessionRepository,
  TerminalRepository,
  TransactionRepository,
  TransicionAnulacion,
  TransicionDevolucion,
  UserChanges,
  UserRecord,
  UserRepository,
} from '../../application/ports';
import type { Umbrales } from '../../domain/alerta';
import type { CambiosTerminal } from '../../domain/terminal';
import type { FilaVenta } from '../../domain/reporte';
import type { EventoTransaccion, TransaccionRegistro } from '../../domain/transaccion';

// El token nunca se guarda en claro: sesiones e invitaciones guardan sha256 en hex.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// La restricción UNIQUE es la última barrera: un duplicado llega aquí como CONFLICT.
function traducirError(error: unknown): unknown {
  if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) return new AppError('CONFLICT');
  return error;
}

function traduciendoErrores(operacion: () => void): void {
  try {
    operacion();
  } catch (error) {
    throw traducirError(error);
  }
}

// Varias escrituras como una sola transacción: si una falla, no queda nada a medias.
function enTransaccion<T>(db: DatabaseSync, operacion: () => T): T {
  db.exec('BEGIN');
  try {
    const resultado = operacion();
    db.exec('COMMIT');
    return resultado;
  } catch (error) {
    db.exec('ROLLBACK');
    throw traducirError(error);
  }
}

// La invitación y su mensaje en la bandeja se escriben siempre juntos.
function insertarInvitacion(db: DatabaseSync, userId: string, merchantId: string, invitacion: NewInvitation): void {
  db.prepare('INSERT INTO invitations (token_hash, user_id, created_at_ms, expires_at_ms) VALUES (?, ?, ?, ?)').run(
    hashToken(invitacion.token),
    userId,
    invitacion.createdAtMs,
    invitacion.expiresAtMs,
  );
  db.prepare('INSERT INTO mailbox (id, merchant_id, to_email, kind, link, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)').run(
    invitacion.message.id,
    merchantId,
    invitacion.message.to,
    'invitation',
    invitacion.message.link,
    invitacion.createdAtMs,
  );
}

type UserRow = {
  id: string;
  merchantId: string;
  merchantName: string;
  name: string;
  email: string;
  role: string;
  passwordHash: string;
  language: string;
  theme: string;
  branchId: string | null;
  active: number;
  lockedUntilMs: number;
};

type SessionRow = { userId: string; expiresAtMs: number };

const SELECT_USER = `
  SELECT u.id AS id, u.merchant_id AS merchantId, m.name AS merchantName, u.name AS name,
         u.email AS email, u.role AS role, u.password_hash AS passwordHash,
         u.language AS language, u.theme AS theme, u.branch_id AS branchId,
         u.active AS active, u.locked_until_ms AS lockedUntilMs
  FROM users u JOIN merchants m ON m.id = u.merchant_id`;

// Los valores vienen de columnas con CHECK, así que el cast es seguro.
function toUserRecord(row: UserRow): UserRecord {
  const preferences: Preferences = {
    language: row.language as Preferences['language'],
    theme: row.theme as Preferences['theme'],
  };
  return {
    id: row.id,
    merchantId: row.merchantId,
    merchantName: row.merchantName,
    name: row.name,
    email: row.email,
    role: row.role as Role,
    passwordHash: row.passwordHash,
    preferences,
    branchId: row.branchId,
    active: row.active === 1,
    lockedUntilMs: row.lockedUntilMs,
  };
}

export class SqliteUserRepository implements UserRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const fila = this.db.prepare(`${SELECT_USER} WHERE u.email = ?`).get(email) as UserRow | undefined;
    return fila ? toUserRecord(fila) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const fila = this.db.prepare(`${SELECT_USER} WHERE u.id = ?`).get(id) as UserRow | undefined;
    return fila ? toUserRecord(fila) : null;
  }

  async findInMerchant(merchantId: string, id: string): Promise<UserRecord | null> {
    const fila = this.db.prepare(`${SELECT_USER} WHERE u.merchant_id = ? AND u.id = ?`).get(merchantId, id) as UserRow | undefined;
    return fila ? toUserRecord(fila) : null;
  }

  async listByMerchant(merchantId: string): Promise<UserRecord[]> {
    const filas = this.db
      .prepare(`${SELECT_USER} WHERE u.merchant_id = ? ORDER BY u.name COLLATE NOCASE, u.email`)
      .all(merchantId) as UserRow[];
    return filas.map(toUserRecord);
  }

  async savePreferences(userId: string, p: Preferences): Promise<void> {
    this.db.prepare('UPDATE users SET language = ?, theme = ? WHERE id = ?').run(p.language, p.theme, userId);
  }

  // Contraseña vacía = invitación pendiente; preferencias por defecto como en la semilla.
  async insertInvited(usuario: NewUser, invitacion: NewInvitation): Promise<void> {
    enTransaccion(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO users (id, merchant_id, name, email, role, password_hash, language, theme, branch_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(usuario.id, usuario.merchantId, usuario.name, usuario.email, usuario.role, '', 'es', 'light', usuario.branchId);
      insertarInvitacion(this.db, usuario.id, usuario.merchantId, invitacion);
    });
  }

  async update(merchantId: string, id: string, cambios: UserChanges): Promise<void> {
    const asignaciones: string[] = [];
    const valores: Array<string | number | null> = [];
    if (cambios.active !== undefined) {
      asignaciones.push('active = ?');
      valores.push(cambios.active ? 1 : 0);
    }
    if (cambios.role !== undefined) {
      asignaciones.push('role = ?');
      valores.push(cambios.role);
    }
    if (cambios.branchId !== undefined) {
      asignaciones.push('branch_id = ?');
      valores.push(cambios.branchId);
    }
    if (asignaciones.length === 0) return;
    this.db.prepare(`UPDATE users SET ${asignaciones.join(', ')} WHERE merchant_id = ? AND id = ?`).run(...valores, merchantId, id);
  }

  // Una sola sentencia: las expresiones del SET leen los valores antiguos, así que el 3.er fallo
  // bloquea aunque lleguen varios a la vez.
  async registerFailedLogin(userId: string, politica: { maxAttempts: number; lockedUntilMs: number }): Promise<void> {
    this.db
      .prepare(
        `UPDATE users SET
           failed_attempts = CASE WHEN failed_attempts + 1 >= ? THEN 0 ELSE failed_attempts + 1 END,
           locked_until_ms = CASE WHEN failed_attempts + 1 >= ? THEN ? ELSE locked_until_ms END
         WHERE id = ?`,
      )
      .run(politica.maxAttempts, politica.maxAttempts, politica.lockedUntilMs, userId);
  }

  async resetFailedLogins(userId: string): Promise<void> {
    this.db.prepare('UPDATE users SET failed_attempts = 0 WHERE id = ?').run(userId);
  }

  async changePasswordHash(userId: string, passwordHash: string): Promise<void> {
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  }
}

export class SqliteSessionRepository implements SessionRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async create(s: { token: string } & SessionRecord): Promise<void> {
    this.db
      .prepare('INSERT INTO sessions (token_hash, user_id, expires_at_ms) VALUES (?, ?, ?)')
      .run(hashToken(s.token), s.userId, s.expiresAtMs);
  }

  async find(token: string): Promise<SessionRecord | null> {
    const fila = this.db
      .prepare('SELECT user_id AS userId, expires_at_ms AS expiresAtMs FROM sessions WHERE token_hash = ?')
      .get(hashToken(token)) as SessionRow | undefined;
    return fila ? { userId: fila.userId, expiresAtMs: fila.expiresAtMs } : null;
  }

  async delete(token: string): Promise<void> {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }

  async deleteByUser(userId: string): Promise<void> {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}

export class SqliteInvitationRepository implements InvitationRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async replaceFor(merchantId: string, userId: string, invitacion: NewInvitation): Promise<void> {
    enTransaccion(this.db, () => {
      this.db.prepare('DELETE FROM invitations WHERE user_id = ?').run(userId);
      insertarInvitacion(this.db, userId, merchantId, invitacion);
    });
  }

  // Sin await dentro: la comprobación y la escritura ocurren en una misma llamada síncrona,
  // así que dos aceptaciones simultáneas no pueden ganar las dos.
  async accept(token: string, nowMs: number, passwordHash: string): Promise<boolean> {
    const fila = this.db
      .prepare(
        `SELECT i.user_id AS userId FROM invitations i JOIN users u ON u.id = i.user_id
         WHERE i.token_hash = ? AND i.expires_at_ms > ? AND u.active = 1 AND u.password_hash = ''`,
      )
      .get(hashToken(token), nowMs) as { userId: string } | undefined;
    if (fila === undefined) return false;
    enTransaccion(this.db, () => {
      this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, fila.userId);
      this.db.prepare('DELETE FROM invitations WHERE user_id = ?').run(fila.userId);
    });
    return true;
  }
}

export class SqliteMailboxRepository implements MailboxRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async listByMerchant(merchantId: string): Promise<MailboxMessage[]> {
    const filas = this.db
      .prepare(
        `SELECT id, to_email AS toEmail, link, created_at_ms AS createdAt FROM mailbox
         WHERE merchant_id = ? ORDER BY created_at_ms DESC, rowid DESC`,
      )
      .all(merchantId) as Array<{ id: string; toEmail: string; link: string; createdAt: number }>;
    return filas.map((f) => ({ id: f.id, to: f.toEmail, kind: 'invitation' as const, link: f.link, createdAt: f.createdAt }));
  }
}

type FilaSucursal = { id: string; name: string };
type FilaCaja = { id: string; name: string; branchId: string };

function aSucursal(sucursal: FilaSucursal, cajas: readonly FilaCaja[]): Branch {
  return { id: sucursal.id, name: sucursal.name, tills: cajas.map((c) => ({ id: c.id, name: c.name })) };
}

export class SqliteBranchRepository implements BranchRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async listByMerchant(merchantId: string): Promise<Branch[]> {
    const sucursales = this.db
      .prepare('SELECT id, name FROM branches WHERE merchant_id = ? ORDER BY name COLLATE NOCASE')
      .all(merchantId) as FilaSucursal[];
    const cajas = this.db
      .prepare(
        `SELECT t.id AS id, t.name AS name, t.branch_id AS branchId FROM tills t
         JOIN branches b ON b.id = t.branch_id WHERE b.merchant_id = ? ORDER BY t.name COLLATE NOCASE`,
      )
      .all(merchantId) as FilaCaja[];
    return sucursales.map((s) => aSucursal(s, cajas.filter((c) => c.branchId === s.id)));
  }

  async findInMerchant(merchantId: string, id: string): Promise<Branch | null> {
    const fila = this.db.prepare('SELECT id, name FROM branches WHERE merchant_id = ? AND id = ?').get(merchantId, id) as
      | FilaSucursal
      | undefined;
    if (fila === undefined) return null;
    const cajas = this.db
      .prepare('SELECT id, name, branch_id AS branchId FROM tills WHERE branch_id = ? ORDER BY name COLLATE NOCASE')
      .all(id) as FilaCaja[];
    return aSucursal(fila, cajas);
  }

  async insertBranch(merchantId: string, sucursal: { id: string; name: string }): Promise<void> {
    traduciendoErrores(() => {
      this.db.prepare('INSERT INTO branches (id, merchant_id, name) VALUES (?, ?, ?)').run(sucursal.id, merchantId, sucursal.name);
    });
  }

  async insertTill(branchId: string, caja: { id: string; name: string }): Promise<void> {
    traduciendoErrores(() => {
      this.db.prepare('INSERT INTO tills (id, branch_id, name) VALUES (?, ?, ?)').run(caja.id, branchId, caja.name);
    });
  }
}

const COLUMNAS_TERMINAL = `id, serial, alias, model, branch, till, status, firmware,
  battery_pct AS batteryPct, connection, created_at_ms AS createdAt`;

const INSERTAR_TERMINAL = `INSERT INTO terminals (id, merchant_id, serial, alias, model, branch, till, status,
  firmware, battery_pct, connection, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export class SqliteTerminalRepository implements TerminalRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async listByMerchant(merchantId: string): Promise<Terminal[]> {
    return this.db.prepare(`SELECT ${COLUMNAS_TERMINAL} FROM terminals WHERE merchant_id = ?`).all(merchantId) as Terminal[];
  }

  async findById(merchantId: string, id: string): Promise<Terminal | null> {
    return this.buscar(merchantId, id);
  }

  async merchantIdOf(terminalId: string): Promise<string | null> {
    const fila = this.db.prepare('SELECT merchant_id AS merchantId FROM terminals WHERE id = ?').get(terminalId) as
      | { merchantId: string }
      | undefined;
    return fila?.merchantId ?? null;
  }

  async insertMany(merchantId: string, terminals: Terminal[]): Promise<void> {
    this.db.exec('BEGIN');
    try {
      for (const t of terminals) this.insertarFila(merchantId, t);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw traducirError(error);
    }
  }

  // Lectura y escritura dentro de una misma llamada síncrona: no hay huecos entre ellas.
  async update(merchantId: string, id: string, cambios: CambiosTerminal): Promise<Terminal | null> {
    const actual = this.buscar(merchantId, id);
    if (actual === null) return null;
    const nuevo: Terminal = { ...actual, ...cambios };
    this.db
      .prepare('UPDATE terminals SET alias = ?, branch = ?, till = ?, status = ? WHERE merchant_id = ? AND id = ?')
      .run(nuevo.alias, nuevo.branch, nuevo.till, nuevo.status, merchantId, id);
    return nuevo;
  }

  async setTelemetry(id: string, cambios: { connection?: TerminalConnection; batteryPct?: number }): Promise<Terminal | null> {
    const cambiadas = this.db
      .prepare('UPDATE terminals SET connection = COALESCE(?, connection), battery_pct = COALESCE(?, battery_pct) WHERE id = ?')
      .run(cambios.connection ?? null, cambios.batteryPct ?? null, id).changes;
    if (Number(cambiadas) === 0) return null;
    return (this.db.prepare(`SELECT ${COLUMNAS_TERMINAL} FROM terminals WHERE id = ?`).get(id) as Terminal | undefined) ?? null;
  }

  private buscar(merchantId: string, id: string): Terminal | null {
    const fila = this.db
      .prepare(`SELECT ${COLUMNAS_TERMINAL} FROM terminals WHERE merchant_id = ? AND id = ?`)
      .get(merchantId, id) as Terminal | undefined;
    return fila ?? null;
  }

  private insertarFila(merchantId: string, t: Terminal): void {
    this.db
      .prepare(INSERTAR_TERMINAL)
      .run(t.id, merchantId, t.serial, t.alias, t.model, t.branch, t.till, t.status, t.firmware, t.batteryPct, t.connection, t.createdAt);
  }
}

type Valor = string | number | bigint | null;

const COLUMNAS_TRANSACCION = `id, folio, merchant_id AS merchantId, request_id AS requestId, terminal_id AS terminalId,
  cashier_id AS cashierId, amount, refunded, method, brand, last4, status, response_code AS responseCode,
  auth_code AS authCode, created_at_ms AS createdAtMs, voided_at_ms AS voidedAtMs`;

// El folio se calcula dentro de la misma sentencia: no hay huecos ni repetidos aunque haya concurrencia.
const INSERTAR_TRANSACCION = `INSERT INTO transactions (id, merchant_id, folio, request_id, terminal_id, cashier_id, amount,
  refunded, method, brand, last4, status, response_code, auth_code, created_at_ms, voided_at_ms)
  SELECT ?, ?, COALESCE(MAX(folio), 0) + 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  FROM transactions WHERE merchant_id = ?`;

const INSERTAR_EVENTO = `INSERT INTO transaction_events (id, transaction_id, kind, amount, at_ms, by_user_id)
  VALUES (?, ?, ?, ?, ?, ?)`;

// Con setReadBigInts los INTEGER llegan como bigint; folio y marcas de tiempo se convierten a number al salir.
type FilaTransaccion = {
  id: string;
  folio: bigint;
  merchantId: string;
  requestId: string | null;
  terminalId: string;
  cashierId: string;
  amount: bigint;
  refunded: bigint;
  method: string;
  brand: string;
  last4: string;
  status: string;
  responseCode: string | null;
  authCode: string | null;
  createdAtMs: bigint;
  voidedAtMs: bigint | null;
};

type FilaEvento = { kind: string; amount: bigint; atMs: bigint; byUserId: string };

// Los valores vienen de columnas con CHECK, así que los cast a la unión son seguros.
function aRegistro(fila: FilaTransaccion): TransaccionRegistro {
  return {
    id: fila.id,
    folio: Number(fila.folio),
    merchantId: fila.merchantId,
    requestId: fila.requestId,
    terminalId: fila.terminalId,
    cashierId: fila.cashierId,
    amount: fila.amount,
    refunded: fila.refunded,
    method: fila.method as PaymentMethod,
    brand: fila.brand as CardBrand,
    last4: fila.last4,
    status: fila.status as TransactionStatus,
    responseCode: fila.responseCode,
    authCode: fila.authCode,
    createdAtMs: Number(fila.createdAtMs),
    voidedAtMs: fila.voidedAtMs === null ? null : Number(fila.voidedAtMs),
  };
}

function valoresDeInsercion(merchantId: string, n: NuevaTransaccion): Valor[] {
  return [
    n.id,
    merchantId,
    n.requestId,
    n.terminalId,
    n.cashierId,
    n.amount,
    n.refunded,
    n.method,
    n.brand,
    n.last4,
    n.status,
    n.responseCode,
    n.authCode,
    n.createdAtMs,
    n.voidedAtMs,
    merchantId,
  ];
}

function condiciones(merchantId: string, filtro: FiltroTransacciones): { where: string; params: Valor[] } {
  const clausulas = ['merchant_id = ?'];
  const params: Valor[] = [merchantId];
  const agregar = (clausula: string, valor: Valor): void => {
    clausulas.push(clausula);
    params.push(valor);
  };
  if (filtro.cashierId !== undefined) agregar('cashier_id = ?', filtro.cashierId);
  if (filtro.status !== undefined) agregar('status = ?', filtro.status);
  if (filtro.method !== undefined) agregar('method = ?', filtro.method);
  if (filtro.brand !== undefined) agregar('brand = ?', filtro.brand);
  if (filtro.terminalId !== undefined) agregar('terminal_id = ?', filtro.terminalId);
  if (filtro.desdeMs !== undefined) agregar('created_at_ms >= ?', filtro.desdeMs);
  if (filtro.hastaMs !== undefined) agregar('created_at_ms <= ?', filtro.hastaMs);
  if (filtro.minimo !== undefined) agregar('amount >= ?', filtro.minimo);
  if (filtro.maximo !== undefined) agregar('amount <= ?', filtro.maximo);
  return { where: clausulas.join(' AND '), params };
}

// Un requestId repetido dentro del comercio: la restricción UNIQUE(merchant_id, request_id).
function esConflictoDeRequest(error: unknown): boolean {
  return error instanceof Error && error.message.includes('transactions.request_id');
}

// Anular y devolver son una sola sentencia condicionada (C9): sin leer antes y escribir después.
export class SqliteTransactionRepository implements TransactionRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async findInMerchant(merchantId: string, id: string): Promise<TransaccionRegistro | null> {
    return this.leerUna('merchant_id = ? AND id = ?', [merchantId, id]);
  }

  async findByRequestId(merchantId: string, requestId: string): Promise<TransaccionRegistro | null> {
    return this.leerUna('merchant_id = ? AND request_id = ?', [merchantId, requestId]);
  }

  // Sin await dentro: el folio, la transacción y sus eventos se escriben en una misma llamada síncrona.
  async insert(merchantId: string, nueva: NuevaTransaccion): Promise<ResultadoInsercion> {
    this.db.exec('BEGIN');
    try {
      this.db.prepare(INSERTAR_TRANSACCION).run(...valoresDeInsercion(merchantId, nueva));
      for (const evento of nueva.eventos) {
        this.db.prepare(INSERTAR_EVENTO).run(evento.id, nueva.id, evento.kind, evento.amount, evento.atMs, evento.byUserId);
      }
      const registro = this.leerUna('merchant_id = ? AND id = ?', [merchantId, nueva.id]);
      if (registro === null) throw new Error('la transacción insertada no aparece');
      this.db.exec('COMMIT');
      return { creada: true, registro };
    } catch (error) {
      this.db.exec('ROLLBACK');
      // Perdió la carrera contra otra petición con el mismo requestId: se devuelve la que ganó.
      const existente =
        nueva.requestId !== null && esConflictoDeRequest(error)
          ? this.leerUna('merchant_id = ? AND request_id = ?', [merchantId, nueva.requestId])
          : null;
      if (existente !== null) return { creada: false, existente };
      throw traducirError(error);
    }
  }

  async list(
    merchantId: string,
    filtro: FiltroTransacciones,
    pagina: Paginacion,
  ): Promise<{ items: TransaccionRegistro[]; total: number }> {
    const { where, params } = condiciones(merchantId, filtro);
    const conteo = this.db.prepare(`SELECT COUNT(*) AS total FROM transactions WHERE ${where}`);
    conteo.setReadBigInts(true);
    const total = Number((conteo.get(...params) as { total: bigint }).total);
    const filas = this.consulta(
      `SELECT ${COLUMNAS_TRANSACCION} FROM transactions WHERE ${where} ORDER BY created_at_ms DESC, folio DESC LIMIT ? OFFSET ?`,
      [...params, pagina.pageSize, (pagina.page - 1) * pagina.pageSize],
    );
    return { items: filas.map(aRegistro), total };
  }

  async events(transactionId: string): Promise<EventoTransaccion[]> {
    const sentencia = this.db.prepare(
      'SELECT kind, amount, at_ms AS atMs, by_user_id AS byUserId FROM transaction_events WHERE transaction_id = ? ORDER BY rowid',
    );
    sentencia.setReadBigInts(true);
    const filas = sentencia.all(transactionId) as FilaEvento[];
    return filas.map((f) => ({
      kind: f.kind as TransactionEventKind,
      amount: f.amount,
      atMs: Number(f.atMs),
      byUserId: f.byUserId,
    }));
  }

  // Keyset: el orden y el corte son (createdAt, folio) descendentes; el folio desempata y es único por comercio.
  async listDespues(
    merchantId: string,
    filtro: FiltroTransacciones,
    pagina: { limite: number; despuesDe: PosicionCursor | null },
  ): Promise<TransaccionRegistro[]> {
    const { where, params } = condiciones(merchantId, filtro);
    const valores: Valor[] = [...params];
    let clausula = where;
    if (pagina.despuesDe !== null) {
      clausula += ' AND (created_at_ms < ? OR (created_at_ms = ? AND folio < ?))';
      valores.push(pagina.despuesDe.createdAtMs, pagina.despuesDe.createdAtMs, pagina.despuesDe.folio);
    }
    const filas = this.consulta(
      `SELECT ${COLUMNAS_TRANSACCION} FROM transactions WHERE ${clausula} ORDER BY created_at_ms DESC, folio DESC LIMIT ?`,
      [...valores, pagina.limite],
    );
    return filas.map(aRegistro);
  }

  async posicionDeFolio(merchantId: string, folio: number): Promise<PosicionCursor | null> {
    const fila = this.db
      .prepare('SELECT created_at_ms AS createdAtMs, folio FROM transactions WHERE merchant_id = ? AND folio = ?')
      .get(merchantId, folio) as { createdAtMs: number; folio: number } | undefined;
    return fila === undefined ? null : { createdAtMs: fila.createdAtMs, folio: fila.folio };
  }

  async voidIfAllowed(merchantId: string, id: string, transicion: TransicionAnulacion): Promise<TransaccionRegistro | null> {
    return enTransaccion(this.db, () => {
      const cambios = this.db
        .prepare(
          `UPDATE transactions SET status = 'voided', voided_at_ms = ?
           WHERE id = ? AND merchant_id = ? AND status = 'approved' AND refunded = 0 AND created_at_ms > ?`,
        )
        .run(transicion.atMs, id, merchantId, transicion.creadaDespuesDe).changes;
      if (Number(cambios) === 0) return null;
      this.db
        .prepare(
          `INSERT INTO transaction_events (id, transaction_id, kind, amount, at_ms, by_user_id)
           SELECT ?, id, 'voided', amount, ?, ? FROM transactions WHERE id = ?`,
        )
        .run(transicion.eventId, transicion.atMs, transicion.byUserId, id);
      return this.leerUna('merchant_id = ? AND id = ?', [merchantId, id]);
    });
  }

  async refundIfAllowed(merchantId: string, id: string, devolucion: TransicionDevolucion): Promise<TransaccionRegistro | null> {
    return enTransaccion(this.db, () => {
      const cambios = this.db
        .prepare(
          `UPDATE transactions SET
             refunded = refunded + ?,
             status = CASE WHEN refunded + ? = amount THEN 'refunded' ELSE 'partially_refunded' END
           WHERE id = ? AND merchant_id = ? AND status IN ('approved', 'partially_refunded') AND refunded + ? <= amount`,
        )
        .run(devolucion.pedido, devolucion.pedido, id, merchantId, devolucion.pedido).changes;
      if (Number(cambios) === 0) return null;
      this.db
        .prepare(INSERTAR_EVENTO)
        .run(devolucion.eventId, id, 'refunded', devolucion.pedido, devolucion.atMs, devolucion.byUserId);
      return this.leerUna('merchant_id = ? AND id = ?', [merchantId, id]);
    });
  }

  private leerUna(where: string, params: Valor[]): TransaccionRegistro | null {
    const [fila] = this.consulta(`SELECT ${COLUMNAS_TRANSACCION} FROM transactions WHERE ${where}`, params);
    return fila === undefined ? null : aRegistro(fila);
  }

  private consulta(sql: string, params: Valor[]): FilaTransaccion[] {
    const sentencia = this.db.prepare(sql);
    sentencia.setReadBigInts(true);
    return sentencia.all(...params) as FilaTransaccion[];
  }
}

// Llaves de la API pública (B4). La llave en claro nunca llega a la BD: solo su hash, como las sesiones.
const COLUMNAS_LLAVE = `id, merchant_id AS merchantId, user_id AS userId, name, scope, prefix,
  created_at_ms AS createdAtMs, revoked_at_ms AS revokedAtMs, last_used_at_ms AS lastUsedAtMs`;

type FilaLlave = {
  id: string;
  merchantId: string;
  userId: string;
  name: string;
  scope: string;
  prefix: string;
  createdAtMs: number;
  revokedAtMs: number | null;
  lastUsedAtMs: number | null;
};

function aLlave(fila: FilaLlave): ApiKeyRecord {
  return {
    id: fila.id,
    merchantId: fila.merchantId,
    userId: fila.userId,
    name: fila.name,
    scope: fila.scope as ApiKeyScope,
    prefix: fila.prefix,
    createdAtMs: fila.createdAtMs,
    revokedAtMs: fila.revokedAtMs,
    lastUsedAtMs: fila.lastUsedAtMs,
  };
}

export class SqliteApiKeyRepository implements ApiKeyRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async insert(merchantId: string, nueva: NuevaLlave): Promise<void> {
    this.insertar(merchantId, nueva);
  }

  async listByMerchant(merchantId: string): Promise<ApiKeyRecord[]> {
    const filas = this.db
      .prepare(`SELECT ${COLUMNAS_LLAVE} FROM api_keys WHERE merchant_id = ? ORDER BY created_at_ms DESC, rowid DESC`)
      .all(merchantId) as FilaLlave[];
    return filas.map(aLlave);
  }

  async findInMerchant(merchantId: string, id: string): Promise<ApiKeyRecord | null> {
    return this.leerUna('merchant_id = ? AND id = ?', [merchantId, id]);
  }

  async findByLlave(llave: string): Promise<ApiKeyRecord | null> {
    return this.leerUna('key_hash = ?', [hashToken(llave)]);
  }

  // COALESCE: si ya estaba revocada, la fecha original se conserva.
  async revoke(merchantId: string, id: string, atMs: number): Promise<ApiKeyRecord | null> {
    this.db
      .prepare('UPDATE api_keys SET revoked_at_ms = COALESCE(revoked_at_ms, ?) WHERE merchant_id = ? AND id = ?')
      .run(atMs, merchantId, id);
    return this.findInMerchant(merchantId, id);
  }

  // La revocación condicionada (revoked_at_ms IS NULL) y la inserción van juntas: no quedan dos llaves nuevas a la vez.
  async rotate(merchantId: string, idVieja: string, nueva: NuevaLlave, atMs: number): Promise<boolean> {
    return enTransaccion(this.db, () => {
      const cambios = this.db
        .prepare('UPDATE api_keys SET revoked_at_ms = ? WHERE merchant_id = ? AND id = ? AND revoked_at_ms IS NULL')
        .run(atMs, merchantId, idVieja).changes;
      if (Number(cambios) === 0) return false;
      this.insertar(merchantId, nueva);
      return true;
    });
  }

  async touch(id: string, atMs: number): Promise<void> {
    this.db.prepare('UPDATE api_keys SET last_used_at_ms = ? WHERE id = ?').run(atMs, id);
  }

  private insertar(merchantId: string, nueva: NuevaLlave): void {
    this.db
      .prepare(
        `INSERT INTO api_keys (id, merchant_id, user_id, name, scope, prefix, key_hash, created_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(nueva.id, merchantId, nueva.userId, nueva.name, nueva.scope, nueva.prefix, hashToken(nueva.llave), nueva.createdAtMs);
  }

  private leerUna(where: string, params: string[]): ApiKeyRecord | null {
    const fila = this.db.prepare(`SELECT ${COLUMNAS_LLAVE} FROM api_keys WHERE ${where}`).get(...params) as FilaLlave | undefined;
    return fila === undefined ? null : aLlave(fila);
  }
}

// Filas mínimas del comercio entre from y to, ambos inclusive. Sin agregar en SQL: la agregación vive en domain/reporte.ts.
export class SqliteReportRepository implements ReportRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async salesRows(merchantId: string, from: number, to: number): Promise<FilasReporte> {
    const sentencia = this.db.prepare(
      `SELECT created_at_ms AS createdAtMs, terminal_id AS terminalId, cashier_id AS cashierId, amount, refunded,
         method, brand, status
       FROM transactions WHERE merchant_id = ? AND created_at_ms >= ? AND created_at_ms <= ?`,
    );
    sentencia.setReadBigInts(true);
    const filas = (sentencia.all(merchantId, from, to) as FilaReporteSql[]).map(aFilaVenta);
    const terminales = this.db.prepare('SELECT id, alias FROM terminals WHERE merchant_id = ?').all(merchantId) as Array<{ id: string; alias: string }>;
    const cajeros = this.db.prepare('SELECT id, name FROM users WHERE merchant_id = ?').all(merchantId) as Array<{ id: string; name: string }>;
    return {
      filas,
      nombres: {
        terminal: Object.fromEntries(terminales.map((t) => [t.id, t.alias])),
        cashier: Object.fromEntries(cajeros.map((c) => [c.id, c.name])),
      },
    };
  }
}

// Con setReadBigInts los INTEGER llegan como bigint; los instantes se pasan a number al salir.
type FilaReporteSql = {
  createdAtMs: bigint;
  terminalId: string;
  cashierId: string;
  amount: bigint;
  refunded: bigint;
  method: string;
  brand: string;
  status: string;
};

function aFilaVenta(fila: FilaReporteSql): FilaVenta {
  return {
    createdAtMs: Number(fila.createdAtMs),
    terminalId: fila.terminalId,
    cashierId: fila.cashierId,
    amount: fila.amount,
    refunded: fila.refunded,
    method: fila.method as PaymentMethod,
    brand: fila.brand as CardBrand,
    status: fila.status as TransactionStatus,
  };
}

// R5: alertas, umbrales y lecturas por usuario. Todo filtrado por comercio; el SQL va parametrizado.
type FilaAlerta = {
  id: string;
  type: AlertType;
  createdAtMs: number;
  resolvedAtMs: number | null;
  paramsJson: string;
  read: number;
};

function aRegistroAlerta(fila: FilaAlerta): AlertaRegistro {
  return {
    id: fila.id,
    type: fila.type,
    createdAtMs: fila.createdAtMs,
    resolvedAtMs: fila.resolvedAtMs,
    read: fila.read === 1,
    params: JSON.parse(fila.paramsJson) as Record<string, string | number>,
  };
}

export class SqliteAlertRepository implements AlertRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async abiertas(merchantId: string): Promise<{ dedupeKey: string }[]> {
    return this.db
      .prepare('SELECT dedupe_key AS dedupeKey FROM alerts WHERE merchant_id = ? AND resolved_at_ms IS NULL')
      .all(merchantId) as { dedupeKey: string }[];
  }

  async resolver(merchantId: string, claves: readonly string[], atMs: number): Promise<void> {
    enTransaccion(this.db, () => {
      const sentencia = this.db.prepare(
        'UPDATE alerts SET resolved_at_ms = ? WHERE merchant_id = ? AND dedupe_key = ? AND resolved_at_ms IS NULL',
      );
      for (const clave of claves) sentencia.run(atMs, merchantId, clave);
    });
  }

  // El índice único parcial es la barrera: una clave ya abierta no se repite, aunque dos peticiones lleguen a la vez.
  async insertarAbiertas(merchantId: string, nuevas: readonly NuevaAlerta[]): Promise<void> {
    enTransaccion(this.db, () => {
      const sentencia = this.db.prepare(
        `INSERT INTO alerts (id, merchant_id, type, dedupe_key, params_json, created_at_ms, resolved_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT (merchant_id, dedupe_key) WHERE resolved_at_ms IS NULL DO NOTHING`,
      );
      for (const nueva of nuevas) {
        sentencia.run(nueva.id, merchantId, nueva.type, nueva.dedupeKey, JSON.stringify(nueva.params), nueva.createdAtMs);
      }
    });
  }

  // Más reciente primero (createdAt desc, id desc). Con soloNoLeidas: no resueltas y no leídas por este usuario.
  async listar(merchantId: string, userId: string, filtro: { soloNoLeidas: boolean; limite: number }): Promise<AlertaRegistro[]> {
    const condicion = filtro.soloNoLeidas ? 'AND a.resolved_at_ms IS NULL AND r.user_id IS NULL' : '';
    const filas = this.db
      .prepare(
        `SELECT a.id, a.type, a.created_at_ms AS createdAtMs, a.resolved_at_ms AS resolvedAtMs,
                a.params_json AS paramsJson, (r.user_id IS NOT NULL) AS read
         FROM alerts a LEFT JOIN alert_reads r ON r.alert_id = a.id AND r.user_id = ?
         WHERE a.merchant_id = ? ${condicion}
         ORDER BY a.created_at_ms DESC, a.id DESC LIMIT ?`,
      )
      .all(userId, merchantId, filtro.limite) as FilaAlerta[];
    return filas.map(aRegistroAlerta);
  }

  async contarNoLeidas(merchantId: string, userId: string): Promise<number> {
    const fila = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM alerts a
         WHERE a.merchant_id = ? AND a.resolved_at_ms IS NULL
           AND NOT EXISTS (SELECT 1 FROM alert_reads r WHERE r.alert_id = a.id AND r.user_id = ?)`,
      )
      .get(merchantId, userId) as { n: number };
    return fila.n;
  }

  async marcarLeida(merchantId: string, userId: string, id: string, atMs: number): Promise<boolean> {
    const existe = this.db.prepare('SELECT 1 AS existe FROM alerts WHERE id = ? AND merchant_id = ?').get(id, merchantId);
    if (existe === undefined) return false;
    this.db
      .prepare('INSERT INTO alert_reads (alert_id, user_id, read_at_ms) VALUES (?, ?, ?) ON CONFLICT DO NOTHING')
      .run(id, userId, atMs);
    return true;
  }

  async marcarTodas(merchantId: string, userId: string, atMs: number): Promise<number> {
    const cambios = this.db
      .prepare(
        `INSERT INTO alert_reads (alert_id, user_id, read_at_ms)
         SELECT a.id, ?, ? FROM alerts a
         WHERE a.merchant_id = ? AND a.resolved_at_ms IS NULL
           AND NOT EXISTS (SELECT 1 FROM alert_reads r WHERE r.alert_id = a.id AND r.user_id = ?)`,
      )
      .run(userId, atMs, merchantId, userId).changes;
    return Number(cambios);
  }

  async umbrales(merchantId: string): Promise<Umbrales | null> {
    const fila = this.db
      .prepare('SELECT battery_below_pct AS batteryBelowPct, void_at_least_amount AS voidAtLeastAmount FROM alert_settings WHERE merchant_id = ?')
      .get(merchantId) as { batteryBelowPct: number; voidAtLeastAmount: string } | undefined;
    if (fila === undefined) return null;
    return { batteryBelowPct: fila.batteryBelowPct, voidAtLeastAmount: BigInt(fila.voidAtLeastAmount) };
  }

  async guardarUmbrales(merchantId: string, umbrales: Umbrales): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO alert_settings (merchant_id, battery_below_pct, void_at_least_amount) VALUES (?, ?, ?)
         ON CONFLICT (merchant_id) DO UPDATE SET
           battery_below_pct = excluded.battery_below_pct, void_at_least_amount = excluded.void_at_least_amount`,
      )
      .run(merchantId, umbrales.batteryBelowPct, umbrales.voidAtLeastAmount.toString());
  }
}

// Solo INSERT: la bitácora no tiene más operaciones (los disparadores lo impiden de todos modos).
export class SqliteAuditLog implements AuditLog {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async record(entrada: NuevaEntradaAuditoria): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO audit_log (merchant_id, at_ms, actor_id, actor_name, action, entity_type, entity_id, detail_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entrada.merchantId,
        entrada.atMs,
        entrada.actorId,
        entrada.actorName,
        entrada.action,
        entrada.entityType,
        entrada.entityId,
        JSON.stringify(entrada.detail),
      );
  }
}

type FilaAuditoriaSql = {
  seq: number;
  atMs: number;
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  detailJson: string;
};

export class SqliteAuditQuery implements AuditQuery {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async list(merchantId: string, filtro: FiltroAuditoria, pagina: { page: number; pageSize: number }): Promise<{ items: EntradaAuditoria[]; total: number }> {
    const condiciones: string[] = ['merchant_id = ?'];
    const valores: Valor[] = [merchantId];
    const agregar = (clausula: string, valor: Valor): void => {
      condiciones.push(clausula);
      valores.push(valor);
    };
    if (filtro.action !== undefined) agregar('action = ?', filtro.action);
    if (filtro.actorId !== undefined) agregar('actor_id = ?', filtro.actorId);
    if (filtro.entityType !== undefined) agregar('entity_type = ?', filtro.entityType);
    if (filtro.entityId !== undefined) agregar('entity_id = ?', filtro.entityId);
    if (filtro.desdeMs !== undefined) agregar('at_ms >= ?', filtro.desdeMs);
    if (filtro.hastaMs !== undefined) agregar('at_ms <= ?', filtro.hastaMs);
    const where = condiciones.join(' AND ');
    const { n: total } = this.db.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE ${where}`).get(...valores) as { n: number };
    const filas = this.db
      .prepare(
        `SELECT seq, at_ms AS atMs, actor_id AS actorId, actor_name AS actorName, action,
                entity_type AS entityType, entity_id AS entityId, detail_json AS detailJson
         FROM audit_log WHERE ${where} ORDER BY seq DESC LIMIT ? OFFSET ?`,
      )
      .all(...valores, pagina.pageSize, (pagina.page - 1) * pagina.pageSize) as FilaAuditoriaSql[];
    return { items: filas.map(aEntradaAuditoria), total };
  }
}

function aEntradaAuditoria(fila: FilaAuditoriaSql): EntradaAuditoria {
  return {
    seq: fila.seq,
    atMs: fila.atMs,
    actorId: fila.actorId,
    actorName: fila.actorName,
    action: fila.action as AuditAction,
    entityType: fila.entityType,
    entityId: fila.entityId,
    detail: JSON.parse(fila.detailJson) as Record<string, string>,
  };
}
