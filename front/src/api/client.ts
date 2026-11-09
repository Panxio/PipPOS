import {
  ERROR_CODES,
  type AcceptInvitationInput,
  type AlertList,
  type AlertSettings,
  type AuditAction,
  type AuditPage,
  type Branch,
  type ChangePasswordInput,
  type CreateBranchInput,
  type CreateTerminalInput,
  type CreateTillInput,
  type CreateTransactionInput,
  type CreateUserInput,
  type ErrorCode,
  type ImportResult,
  type ListTerminalsQuery,
  type ListTransactionsQuery,
  type MailboxMessage,
  type Preferences,
  type Receipt,
  type RefundTransactionInput,
  type ReportGroupBy,
  type SalesResponse,
  type SessionUser,
  type SummaryResponse,
  type Terminal,
  type TerminalPage,
  type TerminalStatus,
  type Transaction,
  type TransactionDetail,
  type TransactionPage,
  type UpdateTerminalInput,
  type UpdateUserInput,
  type User,
} from '@pippos/shared';

const API = '/api/v1';
const JSON_HEADERS = { 'content-type': 'application/json' };

interface Lista<T> {
  items: T[];
}

export class ApiError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
  }
}

export function codigoDe(fallo: unknown): ErrorCode {
  return fallo instanceof ApiError ? fallo.code : 'INTERNAL_ERROR';
}

function esCodigo(valor: unknown): valor is ErrorCode {
  return typeof valor === 'string' && (ERROR_CODES as readonly string[]).includes(valor);
}

function codigoDelCuerpo(cuerpo: unknown): ErrorCode {
  if (typeof cuerpo !== 'object' || cuerpo === null || !('error' in cuerpo)) return 'INTERNAL_ERROR';
  const error = cuerpo.error;
  if (typeof error !== 'object' || error === null || !('code' in error)) return 'INTERNAL_ERROR';
  return esCodigo(error.code) ? error.code : 'INTERNAL_ERROR';
}

async function errorDe(respuesta: Response): Promise<ApiError> {
  const cuerpo: unknown = await respuesta.json().catch(() => undefined);
  return new ApiError(codigoDelCuerpo(cuerpo));
}

type EscuchaExpiracion = () => void;
const escuchasExpiracion = new Set<EscuchaExpiracion>();

// Avisa cuando una petición responde 401 UNAUTHENTICATED. Quien se suscribe decide si tiene sesión abierta.
export function alExpirarSesion(escucha: EscuchaExpiracion): () => void {
  escuchasExpiracion.add(escucha);
  return () => {
    escuchasExpiracion.delete(escucha);
  };
}

async function peticion(ruta: string, init: RequestInit = {}): Promise<Response> {
  const respuesta = await fetch(`${API}${ruta}`, { credentials: 'same-origin', ...init });
  if (respuesta.ok) return respuesta;
  const fallo = await errorDe(respuesta);
  if (fallo.code === 'UNAUTHENTICATED') [...escuchasExpiracion].forEach((escucha) => escucha());
  throw fallo;
}

// Las respuestas 204 no tienen cuerpo: devuelven undefined (quien las pide usa tipo void).
async function pedir<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const respuesta = await peticion(ruta, init);
  if (respuesta.status === 204) return undefined as T;
  return (await respuesta.json()) as T;
}

export function login(email: string, password: string): Promise<SessionUser> {
  return pedir<SessionUser>('/auth/login', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(): Promise<void> {
  const respuesta = await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'same-origin' });
  if (!respuesta.ok) throw await errorDe(respuesta);
}

export function getMe(): Promise<SessionUser> {
  return pedir<SessionUser>('/me');
}

export function savePreferences(preferencias: Preferences): Promise<SessionUser> {
  return pedir<SessionUser>('/me/preferences', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ language: preferencias.language, theme: preferencias.theme }),
  });
}

export function cambiarContrasena(datos: ChangePasswordInput): Promise<void> {
  return pedir<void>('/me/password', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(datos) });
}

export function listarTerminales(consulta: ListTerminalsQuery): Promise<TerminalPage> {
  const parametros = new URLSearchParams({
    sort: consulta.sort,
    order: consulta.order,
    page: String(consulta.page),
    pageSize: String(consulta.pageSize),
  });
  if (consulta.status) parametros.set('status', consulta.status);
  if (consulta.q) parametros.set('q', consulta.q);
  return pedir<TerminalPage>(`/terminals?${parametros.toString()}`);
}

export function obtenerTerminal(id: string): Promise<Terminal> {
  return pedir<Terminal>(`/terminals/${encodeURIComponent(id)}`);
}

export function crearTerminal(datos: CreateTerminalInput): Promise<Terminal> {
  return pedir<Terminal>('/terminals', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(datos) });
}

// Manda solo los campos que se pasan: quien llama decide cuáles cambiaron.
export function editarTerminal(id: string, cambios: UpdateTerminalInput): Promise<Terminal> {
  return pedir<Terminal>(`/terminals/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(cambios),
  });
}

export function cambiarEstadoTerminal(id: string, status: TerminalStatus): Promise<Terminal> {
  return editarTerminal(id, { status });
}

export function importarTerminales(csv: string): Promise<ImportResult> {
  return pedir<ImportResult>('/terminals/import', {
    method: 'POST',
    headers: { 'content-type': 'text/csv' },
    body: csv,
  });
}

export async function listarUsuarios(): Promise<User[]> {
  return (await pedir<Lista<User>>('/users')).items;
}

export function crearUsuario(datos: CreateUserInput): Promise<User> {
  return pedir<User>('/users', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(datos) });
}

// Manda solo los campos que se pasan (p. ej. `{ status }`).
export function editarUsuario(id: string, cambios: UpdateUserInput): Promise<User> {
  return pedir<User>(`/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(cambios),
  });
}

export function reenviarInvitacion(id: string): Promise<void> {
  return pedir<void>(`/users/${encodeURIComponent(id)}/invitation`, { method: 'POST' });
}

export async function listarSucursales(): Promise<Branch[]> {
  return (await pedir<Lista<Branch>>('/branches')).items;
}

export function crearSucursal(datos: CreateBranchInput): Promise<Branch> {
  return pedir<Branch>('/branches', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(datos) });
}

export function crearCaja(sucursalId: string, datos: CreateTillInput): Promise<Branch> {
  return pedir<Branch>(`/branches/${encodeURIComponent(sucursalId)}/tills`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(datos),
  });
}

export async function listarBandeja(): Promise<MailboxMessage[]> {
  return (await pedir<Lista<MailboxMessage>>('/mailbox')).items;
}

export function aceptarInvitacion(datos: AcceptInvitationInput): Promise<void> {
  return pedir<void>('/invitations/accept', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(datos) });
}

export function cobrar(datos: CreateTransactionInput): Promise<Transaction> {
  return pedir<Transaction>('/transactions', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(datos) });
}

// Solo viajan los filtros con valor; página y tamaño siempre.
export function listarTransacciones(consulta: ListTransactionsQuery): Promise<TransactionPage> {
  const parametros = new URLSearchParams({ page: String(consulta.page), pageSize: String(consulta.pageSize) });
  if (consulta.status) parametros.set('status', consulta.status);
  if (consulta.method) parametros.set('method', consulta.method);
  if (consulta.brand) parametros.set('brand', consulta.brand);
  if (consulta.terminalId) parametros.set('terminalId', consulta.terminalId);
  if (consulta.from !== undefined) parametros.set('from', String(consulta.from));
  if (consulta.to !== undefined) parametros.set('to', String(consulta.to));
  if (consulta.min) parametros.set('min', consulta.min);
  if (consulta.max) parametros.set('max', consulta.max);
  return pedir<TransactionPage>(`/transactions?${parametros.toString()}`);
}

export function obtenerTransaccion(id: string): Promise<TransactionDetail> {
  return pedir<TransactionDetail>(`/transactions/${encodeURIComponent(id)}`);
}

// Anular no lleva campos: el cuerpo es un objeto vacío.
export function anularTransaccion(id: string): Promise<void> {
  return pedir<void>(`/transactions/${encodeURIComponent(id)}/void`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({}),
  });
}

// Rango de una consulta de reportes: ms inclusivos y el desfase local (fijo en todo el rango).
export interface RangoReporte {
  from: number;
  to: number;
  tzOffsetMin: number;
}

export interface ConsultaVentas extends RangoReporte {
  groupBy: ReportGroupBy;
}

function parametrosDeRango(rango: RangoReporte): URLSearchParams {
  return new URLSearchParams({
    from: String(rango.from),
    to: String(rango.to),
    tzOffsetMin: String(rango.tzOffsetMin),
  });
}

function parametrosDeVentas(consulta: ConsultaVentas): URLSearchParams {
  const parametros = parametrosDeRango(consulta);
  parametros.set('groupBy', consulta.groupBy);
  return parametros;
}

// El resumen siempre pide el período anterior para las variaciones.
export function obtenerResumen(rango: RangoReporte): Promise<SummaryResponse> {
  const parametros = parametrosDeRango(rango);
  parametros.set('compare', 'true');
  return pedir<SummaryResponse>(`/reports/summary?${parametros.toString()}`);
}

export function obtenerVentas(consulta: ConsultaVentas): Promise<SalesResponse> {
  return pedir<SalesResponse>(`/reports/sales?${parametrosDeVentas(consulta).toString()}`);
}

// El CSV llega como Blob: quien lo pide lo convierte en archivo. Un fallo HTTP lanza ApiError como el resto.
export async function descargarVentasCsv(consulta: ConsultaVentas): Promise<Blob> {
  const respuesta = await peticion(`/reports/sales.csv?${parametrosDeVentas(consulta).toString()}`);
  return respuesta.blob();
}

export function devolverTransaccion(id: string, datos: RefundTransactionInput): Promise<void> {
  return pedir<void>(`/transactions/${encodeURIComponent(id)}/refund`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(datos),
  });
}

export function obtenerComprobante(id: string): Promise<Receipt> {
  return pedir<Receipt>(`/transactions/${encodeURIComponent(id)}/receipt`);
}

// Alertas: `unread` solo viaja si es true (la lista de no leídas); el resto de la consulta es el límite.
export function obtenerAlertas(consulta: { limit: number; unread?: boolean }): Promise<AlertList> {
  const parametros = new URLSearchParams({ limit: String(consulta.limit) });
  if (consulta.unread) parametros.set('unread', 'true');
  return pedir<AlertList>(`/alerts?${parametros.toString()}`);
}

// Las respuestas de marcar no se usan: quien llama vuelve a pedir la lista para ver el cambio.
export async function marcarAlertaLeida(id: string): Promise<void> {
  await peticion(`/alerts/${encodeURIComponent(id)}/read`, { method: 'POST' });
}

export async function marcarTodasLeidas(): Promise<void> {
  await peticion('/alerts/read-all', { method: 'POST' });
}

export function obtenerUmbrales(): Promise<AlertSettings> {
  return pedir<AlertSettings>('/alert-settings');
}

export function guardarUmbrales(datos: AlertSettings): Promise<AlertSettings> {
  return pedir<AlertSettings>('/alert-settings', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ batteryBelowPct: datos.batteryBelowPct, voidAtLeastAmount: datos.voidAtLeastAmount }),
  });
}

// Filtros de la bitácora: el importe de fecha son milisegundos inclusivos. Solo viajan los que tienen valor.
export interface FiltrosAuditoria {
  action?: AuditAction;
  actorId?: string;
  from?: number;
  to?: number;
}

export interface ConsultaAuditoria extends FiltrosAuditoria {
  page: number;
  pageSize: number;
}

function parametrosDeAuditoria(filtros: FiltrosAuditoria): URLSearchParams {
  const parametros = new URLSearchParams();
  if (filtros.action) parametros.set('action', filtros.action);
  if (filtros.actorId) parametros.set('actorId', filtros.actorId);
  if (filtros.from !== undefined) parametros.set('from', String(filtros.from));
  if (filtros.to !== undefined) parametros.set('to', String(filtros.to));
  return parametros;
}

export function obtenerAuditoria(consulta: ConsultaAuditoria): Promise<AuditPage> {
  const parametros = parametrosDeAuditoria(consulta);
  parametros.set('page', String(consulta.page));
  parametros.set('pageSize', String(consulta.pageSize));
  return pedir<AuditPage>(`/audit?${parametros.toString()}`);
}

// La exportación no pagina: lleva los mismos filtros que la lista y nada más. Un fallo HTTP lanza ApiError.
export async function descargarAuditoriaCsv(filtros: FiltrosAuditoria): Promise<Blob> {
  const cadena = parametrosDeAuditoria(filtros).toString();
  const respuesta = await peticion(`/audit.csv${cadena ? `?${cadena}` : ''}`);
  return respuesta.blob();
}
