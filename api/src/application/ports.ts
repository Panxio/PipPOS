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
  TransactionStatus,
} from '@pippos/shared';
import type { Umbrales } from '../domain/alerta';
import type { CambiosTerminal } from '../domain/terminal';
import type { EventoTransaccion, RespuestaSwitch, TransaccionRegistro } from '../domain/transaccion';
import type { FilaVenta, NombresReporte } from '../domain/reporte';

export interface Clock {
  nowMs(): number;
}

export interface IdGenerator {
  id(): string;
  token(): string;
}

// Con hash null se compara contra un hash falso: mismo costo que un usuario real.
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string | null): Promise<boolean>;
}

export interface UserRecord {
  id: string;
  merchantId: string;
  merchantName: string;
  name: string;
  email: string;
  role: Role;
  // Cadena vacía = contraseña no fijada (invitación pendiente).
  passwordHash: string;
  preferences: Preferences;
  branchId: string | null;
  active: boolean;
  lockedUntilMs: number;
}

export interface NewUser {
  id: string;
  merchantId: string;
  name: string;
  email: string;
  role: Role;
  branchId: string | null;
}

// El token va en claro; el repositorio guarda solo su hash y el mensaje de la bandeja.
export interface NewInvitation {
  token: string;
  createdAtMs: number;
  expiresAtMs: number;
  message: { id: string; to: string; link: string };
}

export interface UserChanges {
  active?: boolean;
  role?: Role;
  branchId?: string | null;
}

// Todas las consultas reciben el comercio: un id de otro comercio no se encuentra (404).
export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  findInMerchant(merchantId: string, id: string): Promise<UserRecord | null>;
  listByMerchant(merchantId: string): Promise<UserRecord[]>;
  savePreferences(userId: string, p: Preferences): Promise<void>;
  // Alta y primera invitación en una sola transacción.
  insertInvited(user: NewUser, invitation: NewInvitation): Promise<void>;
  update(merchantId: string, id: string, cambios: UserChanges): Promise<void>;
  // Un solo UPDATE: suma el fallo y, al llegar al máximo, pone el contador a 0 y fija el bloqueo.
  registerFailedLogin(userId: string, politica: { maxAttempts: number; lockedUntilMs: number }): Promise<void>;
  resetFailedLogins(userId: string): Promise<void>;
  changePasswordHash(userId: string, passwordHash: string): Promise<void>;
}

export interface SessionRecord {
  userId: string;
  expiresAtMs: number;
}

// El vencimiento lo decide isSessionActive en la aplicación, no el repositorio.
export interface SessionRepository {
  create(s: { token: string } & SessionRecord): Promise<void>;
  find(token: string): Promise<SessionRecord | null>;
  delete(token: string): Promise<void>;
  deleteByUser(userId: string): Promise<void>;
}

export interface BranchRepository {
  listByMerchant(merchantId: string): Promise<Branch[]>;
  findInMerchant(merchantId: string, id: string): Promise<Branch | null>;
  insertBranch(merchantId: string, sucursal: { id: string; name: string }): Promise<void>;
  insertTill(branchId: string, caja: { id: string; name: string }): Promise<void>;
}

export interface InvitationRepository {
  // Borra las invitaciones anteriores del usuario y guarda la nueva con su mensaje (una transacción).
  replaceFor(merchantId: string, userId: string, invitation: NewInvitation): Promise<void>;
  // Comprueba token, fija la contraseña y consume el token en una sola operación síncrona.
  accept(token: string, nowMs: number, passwordHash: string): Promise<boolean>;
}

export interface MailboxRepository {
  listByMerchant(merchantId: string): Promise<MailboxMessage[]>;
}

export interface TerminalRepository {
  listByMerchant(merchantId: string): Promise<Terminal[]>;
  findById(merchantId: string, id: string): Promise<Terminal | null>;
  // Solo para las costuras de prueba: el comercio al que pertenece un terminal, o null si no existe.
  merchantIdOf(terminalId: string): Promise<string | null>;
  // Una sola transacción: si una fila falla (serial repetido -> CONFLICT), no se crea ninguna.
  insertMany(merchantId: string, terminals: Terminal[]): Promise<void>;
  update(merchantId: string, id: string, cambios: CambiosTerminal): Promise<Terminal | null>;
  // Solo para las costuras de prueba: fija la conexión y/o la batería de un terminal; null si no existe.
  setTelemetry(id: string, cambios: { connection?: TerminalConnection; batteryPct?: number }): Promise<Terminal | null>;
}

export interface PeticionSwitch {
  amount: bigint;
  method: PaymentMethod;
  brand: CardBrand;
  last4: string;
}

// Frontera con el switch de autorización. El adaptador simulado decide solo por last4 (C3).
export interface Switch {
  authorize(peticion: PeticionSwitch): Promise<RespuestaSwitch>;
}

export type EventoConId = EventoTransaccion & { id: string };

// Una transacción lista para guardar: el folio lo asigna el repositorio en la misma inserción.
export interface NuevaTransaccion {
  id: string;
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
  eventos: EventoConId[];
}

export type ResultadoInsercion = { creada: true; registro: TransaccionRegistro } | { creada: false; existente: TransaccionRegistro };

export interface FiltroTransacciones {
  cashierId?: string;
  status?: TransactionStatus;
  method?: PaymentMethod;
  brand?: CardBrand;
  terminalId?: string;
  desdeMs?: number;
  hastaMs?: number;
  minimo?: bigint;
  maximo?: bigint;
}

export interface Paginacion {
  page: number;
  pageSize: number;
}

// Posición de un folio en el orden de la lista (createdAt desc, folio desc): el cursor continúa desde ella.
export interface PosicionCursor {
  createdAtMs: number;
  folio: number;
}

export interface TransicionAnulacion {
  eventId: string;
  atMs: number;
  creadaDespuesDe: number;
  byUserId: string;
}

export interface TransicionDevolucion {
  eventId: string;
  pedido: bigint;
  atMs: number;
  byUserId: string;
}

// Todas las consultas reciben el comercio. Anular y devolver son una sentencia condicionada cada una
// (C9): si no se cumplen las condiciones, no cambian nada y devuelven null.
export interface TransactionRepository {
  findInMerchant(merchantId: string, id: string): Promise<TransaccionRegistro | null>;
  findByRequestId(merchantId: string, requestId: string): Promise<TransaccionRegistro | null>;
  // Folio correlativo y eventos en una sola transacción SQLite. Si otra petición con el mismo requestId
  // ganó la carrera, devuelve la transacción que ya existe en vez de fallar.
  insert(merchantId: string, nueva: NuevaTransaccion): Promise<ResultadoInsercion>;
  list(merchantId: string, filtro: FiltroTransacciones, pagina: Paginacion): Promise<{ items: TransaccionRegistro[]; total: number }>;
  events(transactionId: string): Promise<EventoTransaccion[]>;
  // Keyset (API pública): como mucho `limite` filas más recientes primero, estrictamente después de `despuesDe`.
  listDespues(merchantId: string, filtro: FiltroTransacciones, pagina: { limite: number; despuesDe: PosicionCursor | null }): Promise<TransaccionRegistro[]>;
  posicionDeFolio(merchantId: string, folio: number): Promise<PosicionCursor | null>;
  voidIfAllowed(merchantId: string, id: string, transicion: TransicionAnulacion): Promise<TransaccionRegistro | null>;
  refundIfAllowed(merchantId: string, id: string, devolucion: TransicionDevolucion): Promise<TransaccionRegistro | null>;
}

// Filas mínimas del comercio con createdAt entre from y to (ambos inclusive), todos los estados, sin agregar en SQL.
// Junto a ellas, los nombres actuales de sus terminales y usuarios.
export interface FilasReporte {
  filas: FilaVenta[];
  nombres: NombresReporte;
}

export interface ReportRepository {
  salesRows(merchantId: string, from: number, to: number): Promise<FilasReporte>;
}

export interface ApiKeyRecord {
  id: string;
  merchantId: string;
  userId: string;
  name: string;
  scope: ApiKeyScope;
  prefix: string;
  createdAtMs: number;
  revokedAtMs: number | null;
  lastUsedAtMs: number | null;
}

// La llave en claro entra al repositorio, que guarda solo su hash (igual que las sesiones).
export interface NuevaLlave {
  id: string;
  userId: string;
  name: string;
  scope: ApiKeyScope;
  prefix: string;
  llave: string;
  createdAtMs: number;
}

// Todas las consultas de gestión reciben el comercio. La búsqueda por llave es la autenticación: la propia llave fija el comercio.
export interface ApiKeyRepository {
  insert(merchantId: string, nueva: NuevaLlave): Promise<void>;
  listByMerchant(merchantId: string): Promise<ApiKeyRecord[]>;
  findInMerchant(merchantId: string, id: string): Promise<ApiKeyRecord | null>;
  findByLlave(llave: string): Promise<ApiKeyRecord | null>;
  // Idempotente: conserva la primera fecha de revocación. Devuelve la llave, o null si no es del comercio.
  revoke(merchantId: string, id: string, atMs: number): Promise<ApiKeyRecord | null>;
  // Una sola transacción: revoca la vieja (si sigue activa) y guarda la nueva. false si la vieja ya no estaba activa.
  rotate(merchantId: string, idVieja: string, nueva: NuevaLlave, atMs: number): Promise<boolean>;
  touch(id: string, atMs: number): Promise<void>;
}

// Bitácora. Una entrada se escribe solo tras un éxito real; `detail` nunca lleva secretos.
export type NuevaEntradaAuditoria = {
  merchantId: string;
  atMs: number;
  actorId: string | null;
  actorName: string;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  detail: Record<string, string>;
};

export interface AuditLog {
  record(entrada: NuevaEntradaAuditoria): Promise<void>;
}

export type EntradaAuditoria = {
  seq: number;
  atMs: number;
  actorId: string | null;
  actorName: string;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  detail: Record<string, string>;
};

// Filtros de la bitácora (A9): iguales para la lista y la exportación; el tiempo es inclusivo en ambos extremos.
export type FiltroAuditoria = {
  action?: AuditAction;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  desdeMs?: number;
  hastaMs?: number;
};

// Lectura de la bitácora, aparte de la escritura. Siempre filtrada por comercio.
export interface AuditQuery {
  list(merchantId: string, filtro: FiltroAuditoria, pagina: Paginacion): Promise<{ items: EntradaAuditoria[]; total: number }>;
}

// Alertas: una alerta nueva, su registro, y los umbrales del comercio.
export type NuevaAlerta = {
  id: string;
  type: AlertType;
  dedupeKey: string;
  params: Record<string, string | number>;
  createdAtMs: number;
};

export type AlertaRegistro = {
  id: string;
  type: AlertType;
  createdAtMs: number;
  resolvedAtMs: number | null;
  read: boolean;
  params: Record<string, string | number>;
};

// Todas las consultas reciben el comercio. Las lecturas (leída, no leída) son por usuario.
export interface AlertRepository {
  // Claves de las alertas abiertas (sin resolver) del comercio.
  abiertas(merchantId: string): Promise<{ dedupeKey: string }[]>;
  resolver(merchantId: string, claves: readonly string[], atMs: number): Promise<void>;
  // El índice único parcial manda: una clave ya abierta no se duplica (INSERT OR IGNORE).
  insertarAbiertas(merchantId: string, nuevas: readonly NuevaAlerta[]): Promise<void>;
  listar(merchantId: string, userId: string, filtro: { soloNoLeidas: boolean; limite: number }): Promise<AlertaRegistro[]>;
  contarNoLeidas(merchantId: string, userId: string): Promise<number>;
  // false si la alerta no existe en el comercio.
  marcarLeida(merchantId: string, userId: string, id: string, atMs: number): Promise<boolean>;
  // Cuántas abiertas no leídas marcó.
  marcarTodas(merchantId: string, userId: string, atMs: number): Promise<number>;
  // null si el comercio no ha guardado umbrales (rigen los de por defecto).
  umbrales(merchantId: string): Promise<Umbrales | null>;
  guardarUmbrales(merchantId: string, umbrales: Umbrales): Promise<void>;
}
