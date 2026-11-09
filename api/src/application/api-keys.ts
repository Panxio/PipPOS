import type { ApiKey, ApiKeyList, ApiKeyScope, CreateApiKeyInput, CreatedApiKey } from '@pippos/shared';
import { puedeGestionarLlaves } from '../domain/access';
import { formatoLlave, prefijoDe } from '../domain/apikey';
import { AppError } from './errors';
import type { Acceso, SessionDeps } from './get-session';
import type {
  ApiKeyRecord,
  ApiKeyRepository,
  AuditLog,
  Clock,
  IdGenerator,
  NuevaLlave,
  UserRecord,
  UserRepository,
} from './ports';
import { usuarioQue } from './terminal-deps';

export interface ApiKeyDeps extends SessionDeps {
  apiKeys: ApiKeyRepository;
  ids: IdGenerator;
  audit: AuditLog;
}

export interface AuthDeps {
  apiKeys: ApiKeyRepository;
  users: UserRepository;
  clock: Clock;
}

// Lo que la API pública necesita de una llave válida: su alcance y el usuario efectivo con el que actúa.
export interface AccesoPublico {
  alcance: ApiKeyScope;
  usuario: UserRecord;
}

function aVista(registro: ApiKeyRecord): ApiKey {
  return {
    id: registro.id,
    name: registro.name,
    scope: registro.scope,
    prefix: registro.prefix,
    createdAt: registro.createdAtMs,
    revokedAt: registro.revokedAtMs,
    lastUsedAt: registro.lastUsedAtMs,
  };
}

// La llave en claro solo sale de aquí, hacia la respuesta de crear o rotar. El repositorio guarda su hash.
function generarLlave(
  deps: ApiKeyDeps,
  creadorId: string,
  datos: CreateApiKeyInput,
): { nueva: NuevaLlave; respuesta: CreatedApiKey } {
  const llave = formatoLlave(deps.ids.token());
  const id = deps.ids.id();
  const prefix = prefijoDe(llave);
  const createdAt = deps.clock.nowMs();
  return {
    nueva: { id, userId: creadorId, name: datos.name, scope: datos.scope, prefix, llave, createdAtMs: createdAt },
    respuesta: { id, name: datos.name, scope: datos.scope, prefix, createdAt, key: llave },
  };
}

export class CreateApiKey {
  private readonly deps: ApiKeyDeps;

  constructor(deps: ApiKeyDeps) {
    this.deps = deps;
  }

  async execute(acceso: Acceso, entrada: CreateApiKeyInput): Promise<CreatedApiKey> {
    const usuario = await usuarioQue(this.deps, acceso, puedeGestionarLlaves);
    const { nueva, respuesta } = generarLlave(this.deps, usuario.id, entrada);
    await this.deps.apiKeys.insert(usuario.merchantId, nueva);
    await registrar(this.deps, usuario, 'apikey.created', nueva.id, { prefix: nueva.prefix, scope: nueva.scope });
    return respuesta;
  }
}

export class ListApiKeys {
  private readonly deps: ApiKeyDeps;

  constructor(deps: ApiKeyDeps) {
    this.deps = deps;
  }

  async execute(acceso: Acceso): Promise<ApiKeyList> {
    const usuario = await usuarioQue(this.deps, acceso, puedeGestionarLlaves);
    const registros = await this.deps.apiKeys.listByMerchant(usuario.merchantId);
    return { items: registros.map(aVista) };
  }
}

export class RevokeApiKey {
  private readonly deps: ApiKeyDeps;

  constructor(deps: ApiKeyDeps) {
    this.deps = deps;
  }

  async execute(acceso: Acceso, id: string): Promise<ApiKey> {
    const usuario = await usuarioQue(this.deps, acceso, puedeGestionarLlaves);
    const previa = await this.deps.apiKeys.findInMerchant(usuario.merchantId, id);
    if (previa === null) throw new AppError('NOT_FOUND');
    const registro = await this.deps.apiKeys.revoke(usuario.merchantId, id, this.deps.clock.nowMs());
    if (registro === null) throw new AppError('NOT_FOUND');
    // Revocar una llave ya revocada no cambia nada: no deja entrada.
    if (previa.revokedAtMs === null) {
      await registrar(this.deps, usuario, 'apikey.revoked', registro.id, { prefix: registro.prefix, scope: registro.scope });
    }
    return aVista(registro);
  }
}

// Rotar = crear una llave nueva con el mismo nombre y alcance y revocar la vieja en una sola operación (sin periodo de gracia).
export class RotateApiKey {
  private readonly deps: ApiKeyDeps;

  constructor(deps: ApiKeyDeps) {
    this.deps = deps;
  }

  async execute(acceso: Acceso, id: string): Promise<CreatedApiKey> {
    const usuario = await usuarioQue(this.deps, acceso, puedeGestionarLlaves);
    const vieja = await this.deps.apiKeys.findInMerchant(usuario.merchantId, id);
    if (vieja === null) throw new AppError('NOT_FOUND');
    if (vieja.revokedAtMs !== null) throw new AppError('CONFLICT');
    const { nueva, respuesta } = generarLlave(this.deps, usuario.id, { name: vieja.name, scope: vieja.scope });
    const rotada = await this.deps.apiKeys.rotate(usuario.merchantId, vieja.id, nueva, this.deps.clock.nowMs());
    // Si otra petición revocó la vieja entre la lectura y la escritura, no se crea nada.
    if (!rotada) throw new AppError('CONFLICT');
    await registrar(this.deps, usuario, 'apikey.rotated', nueva.id, {
      prefix: nueva.prefix,
      scope: nueva.scope,
      previousId: vieja.id,
    });
    return respuesta;
  }
}

// Bitácora de llaves: solo prefijo y alcance, nunca la llave ni su hash.
async function registrar(
  deps: ApiKeyDeps,
  usuario: UserRecord,
  action: 'apikey.created' | 'apikey.revoked' | 'apikey.rotated',
  entityId: string,
  detail: Record<string, string>,
): Promise<void> {
  await deps.audit.record({
    merchantId: usuario.merchantId,
    atMs: deps.clock.nowMs(),
    actorId: usuario.id,
    actorName: usuario.name,
    action,
    entityType: 'apikey',
    entityId,
    detail,
  });
}

// Autenticación de la API pública (K2). Todo fallo es el mismo UNAUTHENTICATED, sin decir cuál fue.
export class AuthenticateApiKey {
  private readonly deps: AuthDeps;

  constructor(deps: AuthDeps) {
    this.deps = deps;
  }

  async execute(llave: string | undefined): Promise<AccesoPublico> {
    if (!llave) throw new AppError('UNAUTHENTICATED');
    const registro = await this.deps.apiKeys.findByLlave(llave);
    if (registro === null || registro.revokedAtMs !== null) throw new AppError('UNAUTHENTICATED');
    const creador = await this.deps.users.findById(registro.userId);
    if (creador === null || !creador.active || creador.merchantId !== registro.merchantId) {
      throw new AppError('UNAUTHENTICATED');
    }
    await this.deps.apiKeys.touch(registro.id, this.deps.clock.nowMs());
    // El creador actúa con rol supervisor: ve todo el comercio y puede cobrar; el cobro queda a su nombre (cashierId).
    return { alcance: registro.scope, usuario: { ...creador, role: 'supervisor' } };
  }
}
